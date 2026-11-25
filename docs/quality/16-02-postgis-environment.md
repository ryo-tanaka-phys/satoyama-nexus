# 16-02（Issue #22）専用PostGIS環境の起動・接続・再起動 再現記録

## 共通証跡サマリー

- 親Issue: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/16 （#16）
- 子Issue URL / 設計ID / 読取日時: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/22 （`16-02` / #22） / 2026-11-25T10:19:18+09:00
- 担当（人間） / 独立レビュー者（別の人間）: `ryo-tanaka-phys`（所有者、C0役割計画レーンA） / 独立レビュー者: 未確定（協力者のユーザー名確認・招待承認後に確定予定）
- G0承認根拠 / 必要なG18・G19承認URL: G0承認済み（2026-11-18 所有者の「共同開発Issue再構成の実装指示」、PR #20 `7159a8a07de6690407aec51e7726d566d804ec57` に記録）。G18・G19は本Issueでは対象外（未承認を維持、具体版変更・隔離実験なし）。
- source SHA / guide SHA / 依存成果SHA:
  - `source SHA`: `36c352fbb503047f8240e7a87d617485609aa297`
  - `guide SHA`: `7159a8a07de6690407aec51e7726d566d804ec57`（`git fetch origin pull/20/head:refs/remotes/origin/c0-guide` で読取専用参照）
  - 参照固定SHA（PR #10 ADR 0002）: `8aba5a1566d0890c6c33794f97b2a2f0fc2d70c5`
  - `依存成果SHA`: なし
- 作業ブランチ / 提出PR base: `codex/issue-22-16-02` / `main`
- 許可ファイル / 非対象:
  - 許可ファイル: `docs/quality/16-02-postgis-environment.md` のみ
  - 非対象: `compose.yaml`・`.env.example`・`scripts/check-db.mjs`・`db/init/001-postgis.sql`・`package.json`・`pnpm-lock.yaml`・製品コード・製品DDL・マイグレーション・共有DB操作・既存PR更新・`main`への直接push/merge・Drizzle/Auth.js本採用・Issue自動close
- OS・Node・pnpm・必要なDockerの版:
  - OS: Windows (`Microsoft Windows NT 10.0.26300.0`)
  - Shell: Windows PowerShell `5.1.26100.10068`（`LocalMachine` ExecutionPolicy=`AllSigned`）
  - Node.js: `v24.22.0`
  - pnpm: `11.25.0`（`npm.cmd install --global pnpm@11.25.0` で導入、PowerShell上は `pnpm.cmd` で実行）
  - Docker CLI / Engine: `Docker version 29.9.2, build a82e528` / Server `29.9.2`（`linux` / `Docker Desktop` WSL2）
  - Docker Compose: `v5.6.0`
  - PostGIS Image: `postgis/postgis:17-3.5`（digest: `postgis/postgis@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6`）
  - 実測DB/拡張版: PostgreSQL `17.5 (Debian 17.5-1.pgdg110+1)` / PostGIS `3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`
- 提出head SHA: 本コミット確定後に Draft PR 本文へ記録（コミット自身に自身のSHAは埋め込めないため）
- CI URL / event / run.head_sha / 実際のcheckout SHA: 未実施（push・Draft PR作成前。push/Draft PR作成後に通常CIの最終head結果をPR本文へ記録）
- 未実施・skip・不合格・残存リスク: 後述「未実施・検証限界・残存リスク」に記載
- AI補助確認（使用の有無・範囲）: 使用あり（正本読取・環境確認・検証コマンド実行・本記録の作成補助）。AIによる確認は人間の独立レビューや所有者の成果受領を代替しない。
- 人間の独立レビューURL / 対象head / 判定: 未実施（Draft PR提出・協力者確定待ち）
- 所有者の成果受領URL: 未受領

---

## 読取済み正本と承認区分の整理

作業開始前に以下を全文確認した。

| 資料 | 参照元 / SHA | 区分 |
|---|---|---|
| `docs/product/requirements.md`（要件v0.1と変更履歴） | `source` `36c352f` | 確定事項（要件1〜11、M0〜M6維持） |
| `docs/decisions/0001-m0-foundation.md`（ADR 0001） | `source` `36c352f` | M0実装方針（承認済み） |
| `docs/architecture/README.md` | `source` `36c352f` | M0構成・依存方向の正本 |
| `docs/architecture/m1-domain-design.md` | `source` `36c352f` | M1設計案（D01〜D08、Q01〜Q04）。古い未確定表記はADR 0002の承認判断と区別 |
| `data/fixtures/README.md` | `source` `36c352f` | 公開情報・模擬データの分離境界 |
| `README.md`・`package.json`・`compose.yaml`・`.env.example`・`scripts/check-db.mjs`・`db/init/001-postgis.sql`・`.github/workflows/ci.yml` | `source` `36c352f` | 読取のみ（変更対象外） |
| `docs/decisions/0002-m1-domain.md`（ADR 0002） | PR #10 `8aba5a1` | M1確定事項と未確定候補の記録（main統合は別承認待ち） |
| `AGENTS.md`・`CONTRIBUTING.md`・`docs/collaboration/ai-workflow.md`・`docs/collaboration/onboarding.md` | PR #20 `7159a8a` | G0承認済みの共同開発手順（Draft PR、作業ブランチへコピーしない） |
| 親Issue #16・子Issue #22 本文およびコメント（各0件） | GitHub API（2026-11-25取得） | 状態: Ready（未割当・未着手） |

---

## 専用環境の分離条件と事前確認

- **作業ディレクトリ**: `satoyama-issue22`（新規clone。既存の別checkoutやDBを流用しない）
- **専用Compose project名**: `satoyama-issue22`（`-p satoyama-issue22` を明示指定）
- **作成されたコンテナ / ボリューム / ネットワーク**:
  - コンテナ: `satoyama-issue22-db-1`（`127.0.0.1:5432->5432/tcp`）
  - ボリューム: `satoyama-issue22_db-data`（他プロジェクトの既存ボリュームと非共有）
  - ネットワーク: `satoyama-issue22_default`
- **事前ポート5432確認**: `Get-NetTCPConnection -LocalPort 5432` の結果は0件（競合なし）。
- **既存コンテナ・ボリューム確認**: 既存のDockerコンテナ群（`canmatch-*`・`hexycle-*`・`laratter-*`・`axiom-os`）はすべて停止中（`Exited`）であり、5432番ポート使用や `satoyama-issue22` 名称の競合はなかった。既存コンテナ・既存ボリュームには一切触れず、削除・停止操作も行っていない。
- **資格情報・秘密の取り扱い**:
  - ローカル作業ディレクトリ内でのみ `.env.example` を `.env` へコピーして使用した。`.env` は `.gitignore` 対象であり、ステージ・コミット・本文・出力へ一切含めていない。
  - `.env.example` の値はローカル開発専用の例（placeholder）であり、本番設定ではない。本記録には接続文字列やパスワードを記載しない。

---

## 実行手順と実測結果

実行日: 2026-11-25（JST）。すべてのコマンドは新規cloneした `satoyama-issue22` ディレクトリ上で実行した。

| # | コマンド | 期待結果 | 実測結果 | 終了コード | 所要時間 |
|---|---|---|---|---:|---:|
| 1 | `git clone git@github.com:ryo-tanaka-phys/satoyama-nexus.git satoyama-issue22` | 新規ディレクトリへclone成功 | `satoyama-issue22` へclone完了 | 0 | 計測外 |
| 2 | `git fetch origin pull/20/head:refs/remotes/origin/c0-guide` / `git rev-parse refs/remotes/origin/c0-guide` | PR #20 の固定guide SHAを取得 | `7159a8a07de6690407aec51e7726d566d804ec57` | 0 | 計測外 |
| 3 | `git switch --create codex/issue-22-16-02 36c352fbb503047f8240e7a87d617485609aa297` / `git rev-parse HEAD` | 固定基点から専用ブランチ作成 | `36c352fbb503047f8240e7a87d617485609aa297` | 0 | 計測外 |
| 4 | `npm install --global pnpm@11.25.0`（PowerShell直接呼び出し） | `pnpm@11.25.0` 導入 | ExecutionPolicy=`AllSigned` により `npm.ps1` 未署名エラー（`PSSecurityException`）で失敗（環境差異1） | 1 | 計測外 |
| 5 | `npm.cmd install --global pnpm@11.25.0` → `pnpm.cmd --version` | `pnpm 11.25.0` 導入・版表示 | `added 1 package in 5s`、`11.25.0` を確認 | 0 | 約5s |
| 6 | `pnpm.cmd install --frozen-lockfile` | lockfile更新なしで依存導入（`pg`含む） | `Packages: +72`、`pg 8.23.1` 含む5 workspace導入完了（lockfile無変更） | 0 | 4,373 ms |
| 7 | `docker info`（Docker Desktop起動前） | Docker Engine接続確認 | `npipe:////./pipe/dockerDesktopLinuxEngine` 接続不可（Docker Desktop未起動、環境差異2） | 1 | 計測外 |
| 8 | `docker desktop start` → `docker --version` / `docker compose version` | Docker Engine起動・版確認 | `✓ Starting Docker Desktop`、`Docker version 29.9.2, build a82e528`、`Docker Compose version v5.6.0` | 0 | 3,546 ms |
| 9 | `Get-NetTCPConnection -LocalPort 5432` / `docker ps -a` / `docker volume ls` | 5432空き・`satoyama-issue22`競合なし | 5432接続なし、`satoyama-issue22` コンテナ/ボリュームなし | 0 | 計測外 |
| 10 | `Copy-Item .env.example .env` | ローカル専用 `.env` 作成 | `Test-Path .env` = `True`（内容・接続文字列は非出力） | 成功 (`$?=True`) | 計測外 |
| 11 | `docker compose -p satoyama-issue22 up -d --wait`（初回・新規ボリューム） | `postgis/postgis:17-3.5` 起動・Healthy到達・初期化SQL実行 | イメージ取得後 `satoyama-issue22_db-data` 作成、`satoyama-issue22-db-1` が `Healthy` 到達。ログに `running /docker-entrypoint-initdb.d/001-postgis.sql` および `CREATE EXTENSION` を確認 | 0 | 30,247 ms |
| 12 | `node --env-file=.env scripts/check-db.mjs`（初回接続） | 接続・PostGIS版・geography距離0mスモーク成功 | `PostgreSQL connection and PostGIS geography check passed` | 0 | 493 ms |
| 13 | `docker compose -p satoyama-issue22 stop`（1回目停止） | コンテナ停止・ボリューム保持 | `satoyama-issue22-db-1` 停止、`satoyama-issue22_db-data` 残存を確認 | 0 | 571 ms |
| 14 | `docker compose -p satoyama-issue22 up -d --wait`（同一ボリューム再起動） | 既存ボリュームのまま再起動・Healthy到達・初期化SQLはスキップ | `satoyama-issue22-db-1` が `Healthy` 到達。再起動ログに `PostgreSQL Database directory appears to contain a database; Skipping initialization` と `database system is ready to accept connections` を確認 | 0 | 5,927 ms |
| 15 | `node --env-file=.env scripts/check-db.mjs`（再起動後の再接続） | 同一ボリュームで再接続・スモーク成功 | `PostgreSQL connection and PostGIS geography check passed` | 0 | 170 ms |
| 16 | `docker compose -p satoyama-issue22 stop`（最終停止） | コンテナ停止・ボリューム保持 | `satoyama-issue22-db-1` (`Exited (0)`)、`satoyama-issue22_db-data` 残存を確認 | 0 | 482 ms |
| 17 | 補助確認（読取専用クエリ）: 同一ボリュームを再起動し `node --env-file=.env --input-type=module` で `current_setting('server_version')`・`PostGIS_Version()`・`ST_Distance(ST_SetSRID(ST_MakePoint(135,35),4326)::geography, ...)` を取得後、`docker compose -p satoyama-issue22 stop` | PostgreSQL版・PostGIS版・距離`0`の実測値取得と再停止 | `{"pg_version":"17.5 (Debian 17.5-1.pgdg110+1)","postgis_version":"3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1","distance_m":0}`、最終状態 `satoyama-issue22-db-1 \| Exited (0)`・`satoyama-issue22_db-data` 保持 | 0（クエリ・停止とも） | 計測外 |

---

## 初期化SQLの適用条件（新規ボリューム vs 既存DB）

実測ログから、PostgreSQL公式イメージ（`postgis/postgis:17-3.5`）における `db/init/001-postgis.sql`（`CREATE EXTENSION IF NOT EXISTS postgis;`）の挙動を以下のとおり確認した。

1. **新規ボリューム作成時（初回 `up`）**:
   - データディレクトリが空のため、エントリポイントが `/docker-entrypoint-initdb.d/001-postgis.sql` を自動実行し、`CREATE EXTENSION` が適用された。
   - 観測ログ抜粋:
     - `/usr/local/bin/docker-entrypoint.sh: running /docker-entrypoint-initdb.d/001-postgis.sql`
     - `CREATE EXTENSION`
     - `PostgreSQL init process complete; ready for start up.`
2. **既存ボリューム再利用時（`stop` → 再 `up`）**:
   - データディレクトリに既存DBが存在するため、初期化ディレクトリ `/docker-entrypoint-initdb.d` のSQLは自動実行されない。
   - 観測ログ抜粋:
     - `PostgreSQL Database directory appears to contain a database; Skipping initialization`
     - `database system is ready to accept connections`
3. **既存DBへの明示適用との関係**:
   - すでに作成済みで PostGIS 拡張が入っていない既存DBボリュームに対しては、`compose.yaml` で `./db/init` をマウントして再起動しても `001-postgis.sql` は実行されない。
   - 既存DBに対しては、`README.md` および `.github/workflows/ci.yml`（`docker exec -i ... psql ... < db/init/001-postgis.sql`）のとおり初期化SQLを明示適用する必要があり、ボリューム削除や `DROP`/`TRUNCATE`/`reset` で復旧してはならない。

---

## 観測した環境差異（#23 への引継ぎ事項）

本Issueでは `README.md` や `compose.yaml` を変更せず、以下を環境差異として記録する。

1. **Windows PowerShell の ExecutionPolicy (`AllSigned`) と `.ps1` シム**:
   - `README.md` / Issue #22 の例どおり PowerShell から `npm install --global pnpm@11.25.0` を実行すると、`C:\Program Files\nodejs\npm.ps1` が未署名スクリプトとして拒否され失敗した（`PSSecurityException`）。
   - システムの ExecutionPolicy を変更せず、`npm.cmd` および `pnpm.cmd` を明示呼び出しすることで手順を再現できた。
2. **Docker Desktop の手動起動が必要**:
   - Docker Desktop 導入済み環境でも、初期状態では `com.docker.service` / `docker-desktop` が停止しており `docker compose` が名前付きパイプ接続エラーになった。`docker desktop start` でエンジンを起動してから実行する必要があった。
3. **専用 Compose project 名の指定**:
   - `README.md` の手順は `docker compose up -d --wait`（ディレクトリ名ベース）だが、他作業・既存DBとボリュームを確実に分離するため Issue #22 指示どおり `-p satoyama-issue22` を付与して検証した。
4. **`scripts/check-db.mjs` の出力内容**:
   - `scripts/check-db.mjs` は `PostGIS_Version()` と `ST_Distance(...) === 0` を内部検証するが、標準出力は `PostgreSQL connection and PostGIS geography check passed` のみである。PostGIS版の具体文字列を証跡へ残すため、本検証では読取専用の補助クエリを別途実行した。

---

## 受け入れ条件との対応表

### 子Issue #22（`16-02`）の受け入れ条件

| 条件 | 状態 | 根拠・備考 |
|---|---|---|
| 接続・PostGIS版・geography距離0mのスモーク成功を記録する | ローカル実測済み（第三者追試待ち） | `check-db.mjs` 2回とも終了コード0・成功メッセージ確認。補助クエリで `PostgreSQL 17.5`・`PostGIS 3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`・`distance_m=0` を確認 |
| stop/start後も接続でき、ボリューム削除・DROP/TRUNCATE/resetを行わない | ローカル実測済み（第三者追試待ち） | `stop` → 同一ボリューム `satoyama-issue22_db-data` で再 `up` → `check-db.mjs` 成功（終了コード0）→ 最終 `stop` 後もボリューム残存を確認。破壊操作なし |
| ローカル例の資格情報を本番設定と誤記せず、接続文字列や.envを成果物に載せない | 確認済み | `.env` は `.gitignore` で除外・未コミット。本文にパスワード・接続文字列の記載なし。`.env.example` はローカル例専用と明記 |
| 基点/提出head/実行SHA、正確なコマンド、期待/実測、終了コード、残課題を記録し、別担当者が追試・要求照合した | 一部未完了（提出head・第三者追試待ち） | ローカルコマンド・期待/実測・終了コード・残課題は本記録に記載済み。提出head SHA記録および別担当者による追試・要求照合は未実施 |
| 必要CIの最終head結果を記録し、未実施/skip/失敗を合格にしない | 未実施（push・Draft PR作成待ち） | push・Draft PR作成後に通常CI URL・`event`・`run.head_sha`・実checkout SHAをPR本文へ記録予定 |

### 親Issue #16 の元受け入れ条件との対応（本子Issue担当分）

| 親#16 元条件 | 本子Issue（#22）での充足状況 |
|---|---|
| 1: OS/Node/pnpm/Docker版・対象SHA・実行手順・期待/実測・失敗箇所を秘密なしで記録 | DB検証分を記録済み（PowerShell `npm.ps1` 失敗および Docker Desktop 未起動の失敗実測も含め秘密なしで記録）。Web環境分は #21 担当 |
| 2: DBなしの画面起動とDB検証を区別。未実施は未検証と明記 | 本記録は専用PostGIS DB検証のみを実施。DBなしの画面起動（`pnpm dev`）・`typecheck`・`test`・`build` のローカル実行は #21 担当かつ本作業では未実施として明記 |

---

## 未実施・検証限界・残存リスク

- **未実施（本Issue範囲外 / 別担当）**:
  - `pnpm dev`（`localhost:3000` の模擬表示・公開活動未登録確認）、`pnpm typecheck`、`pnpm test`、`pnpm build` のローカル実行（子Issue `#21` (`16-01`) の担当範囲。本記録では未検証として区別する）。
  - 既存DB（PostGIS未適用状態の既存ボリューム）に対する `db/init/001-postgis.sql` の明示適用コマンドの実機再現。
- **未実施（提出・レビュー工程待ち）**:
  - 作業ブランチの push、Draft PR 作成、最終headに対する通常CI（`.github/workflows/ci.yml`）の実行結果確認。
  - 作成者以外の別の人間による追試・要求照合。
  - 所有者による成果受領（Accepted判定）。
- **検証の限界（保証しない範囲）**:
  - `scripts/check-db.mjs` の同一座標距離 `0m` スモーク成功は、M1のドメイン永続化・版付きマイグレーション・非ゼロ距離の空間精度・ロール/認可境界・本番DBの安全性を保証しない。
  - G18・G19は未承認のまま維持しており、Drizzle/Auth.jsの具体版検証や本採用は行っていない。
