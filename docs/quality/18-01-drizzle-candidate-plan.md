# 18-01（Issue #28）Drizzle/Kit の Advisory・互換候補・再試験計画 調査記録

> **重要（実行未検証・承認未取得の明示）**: 本記録は公式 Advisory・npm Registry メタデータ・GitHub Release 情報・PR #14 記録に基づく**資料調査および再試験計画の提案のみ**であり、候補版のインストール・動作確認・隔離実験は一切実施していない。また、G18（具体版・隔離再試験の承認）および Drizzle/Kit の本採用は**未承認**である。

## 共通証跡サマリー

- 親Issue: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/18 （#18）
- 子Issue URL / 設計ID / 読取日時: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/28 （`18-01` / #28） / 2026-11-25T10:50:28+09:00
- 担当（人間） / 独立レビュー者（別の人間）: `ryo-tanaka-phys`（所有者。注: 推奨レーンBだが、Issue #28 本文のとおりA/Bは推奨であり権限制限ではないため所有者が先行調査） / 独立レビュー者: 未確定（別の人間による公式URL・版対応・計画内容の突合レビュー待ち）
- G0承認根拠 / 必要なG18・G19承認URL:
  - G0: 承認済み（2026-11-18 所有者の「共同開発Issue再構成の実装指示」、PR #20 `7159a8a07de6690407aec51e7726d566d804ec57`）。
  - G18: **未承認**（本調査 18-01 は資料調査のみのため G18 不要。後続の 18-02 `#29` / 18-03 `#30` の具体版固定・隔離実装には所有者の明示的な G18 承認 URL が必須）。
  - G19: 本Issue対象外（未承認維持）。
- source SHA / guide SHA / 依存成果SHA:
  - `source SHA`: `3c50a7ffeac001aa1089983685a7997b5c1152e7`（PR #14 `codex/m1-migrations` head）
  - `guide SHA`: `7159a8a07de6690407aec51e7726d566d804ec57`（PR #20 `refs/pull/20/head` を読取専用 ref `refs/remotes/origin/c0-guide` で参照）
  - 参照固定SHA（PR #10 ADR 0002）: `8aba5a1566d0890c6c33794f97b2a2f0fc2d70c5`
  - `依存成果SHA`: なし
- 作業ブランチ / 提出PR base: `codex/issue-28-18-01` / `codex/m1-migrations`
- 許可ファイル / 非対象:
  - 許可ファイル: `docs/quality/18-01-drizzle-candidate-plan.md` のみ
  - 非対象: `experiments/m1-migrations/**`・`.github/workflows/m1-migrations.yml`・`package.json`・`pnpm-lock.yaml`・製品コード・候補版の導入/実行・`npm audit fix --force`・Kit の無承認ダウングレード・既存PR更新・`main`への直接push/merge・Drizzle本採用
- 調査環境（資料取得のみ）: Windows (`Microsoft Windows NT 10.0.26300.0`) / PowerShell `5.1.26100.10068` / GitHub REST API・npm Registry API 読取のみ（候補パッケージの install・Node 実行・Docker/DB 実行は未実施）
- 提出head SHA: 本コミット確定後に Draft PR 本文へ記録
- CI URL / event / run.head_sha / 実際のcheckout SHA: 未実施（push・Draft PR作成前。push/Draft PR作成後に通常CIの最終head結果をPR本文へ記録）
- 未実施・skip・不合格・残存リスク: 後述「未確認事項・残存リスク・非保証範囲」に記載
- AI補助確認（使用の有無・範囲）: 使用あり（原典読取・GitHub Advisory API/npm Registry 照会・本調査文書作成補助）。人間の独立レビューや所有者の成果受領・G18承認を代替しない。
- 人間の独立レビューURL / 対象head / 判定: 未実施（Draft PR提出・第三者突合待ち）
- 所有者の成果受領URL: 未受領

---

## 読取済み正本と PR #14 現状の整理

| 資料 | 参照元 / SHA | 区分 |
|---|---|---|
| `docs/product/requirements.md`（要件v0.1と変更履歴） | `source` `3c50a7f`（`main`継承） | 確定事項（要件1〜11、M0〜M6維持） |
| `docs/decisions/0001-m0-foundation.md`（ADR 0001） | `source` `3c50a7f` | M0実装方針 |
| `docs/architecture/m1-domain-design.md`（D01〜D08、Q01〜Q04） | `source` `3c50a7f` | M1設計案（D08/Q02参照） |
| `docs/decisions/0002-m1-domain.md`（ADR 0002） | PR #10 `8aba5a1` | M1確定事項と未確定候補（ORM選定 Q02 は未確定、Drizzle と `pg` + 明示SQL の比較継続） |
| `experiments/m1-migrations/README.md`・`run.mjs`・`0000_domains.sql`・`0001_audit.sql`・`meta/_journal.json` | PR #14 `3c50a7f` | 保存対象の参照元（変更禁止） |
| `docs/decisions/m1-kit-acceptance-20261114.md`・`.github/workflows/m1-migrations.yml` | PR #14 `3c50a7f` | PR #14 受け入れ記録（機能PASS・security/本採用保留） |
| `AGENTS.md`・`CONTRIBUTING.md`・`docs/collaboration/ai-workflow.md`・`onboarding.md` | PR #20 `7159a8a` | G0承認済みの共同開発手順 |
| 親Issue #18・子Issue #28 本文およびコメント（0件） | GitHub API（2026-11-25取得） | 状態: Ready（G18未承認） |

### PR #14（`3c50a7f`）のベースライン事実
- 固定直接候補: `drizzle-orm@0.44.7` / `drizzle-kit@0.31.7` / `pg@8.16.3`（`.github/workflows/m1-migrations.yml` にて一時ディレクトリへ `npm install --ignore-scripts --save-exact`）。
- 移行方式: `drizzle-kit generate --custom` で枠生成後、版管理 SQL（`0000_domains.sql` / `0001_audit.sql`）と固定 `meta/_journal.json`（`version: "7"`, `dialect: "postgresql"`, `entries[0]: 0000_domains (when: 1794642000000)`, `entries[1]: 0001_audit (when: 1794642000001)`）を格納し、`drizzle-kit migrate` で適用。
- PR #14 記録上の `npm audit`: 脆弱パッケージ計5件（high 1 / moderate 4 / critical 0、同一 Advisory の依存伝播を含む）。

---

## 公式 Advisory・依存メタデータ調査結果（参照日: 2026-11-25）

### 1. 関連 Advisory 一覧（GitHub Advisory Database / npm ecosystem）

| Advisory / CVE | 対象パッケージ | 重大度 | 影響範囲 | 初回修正版 | 公開日 | 公式URL |
|---|---|---|---|---|---|---|
| `GHSA-gpj5-g38j-94v9` / `CVE-2026-39356` | `drizzle-orm` | High | `< 0.45.2` および `>= 1.0.0-beta.2, < 1.0.0-beta.20` | `0.45.2`（0.x系） / `1.0.0-beta.20`（1.0-beta系） | 2026-04-08 | https://github.com/advisories/GHSA-gpj5-g38j-94v9 / https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9 |
| `GHSA-67mh-4wv8-2f99` / (CVEなし) | `esbuild` | Moderate (`medium`) | `<= 0.24.2` | `0.25.0` | 2025-02-10 | https://github.com/advisories/GHSA-67mh-4wv8-2f99 / https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99 |
| `GHSA-g7r4-m6w7-qqqr` / (CVEなし) | `esbuild` | Low | `>= 0.27.3, < 0.28.1` | `0.28.1` | — | https://github.com/advisories/GHSA-g7r4-m6w7-qqqr |
| `GHSA-gv7w-rqvm-qjhr` | `esbuild` | Withdrawn | （取り下げ済み：Deno モジュール対象） | `0.28.1` | — | https://github.com/advisories/GHSA-gv7w-rqvm-qjhr |
| `GHSA-wc9v-mj63-m9g5` / `CVE-2017-16082` | `pg` | Critical | `< 7.1.2`（旧メジャー系） | `7.1.2` | — | https://github.com/advisories/GHSA-wc9v-mj63-m9g5 |

- **パッケージ別 Advisory 件数（2026-11-25 照会時点）**:
  - `drizzle-orm`: 1件（`GHSA-gpj5-g38j-94v9` のみ）
  - `drizzle-kit`: 直接パッケージ対象 0件（問題は推移依存 `esbuild` 経由）
  - `tsx` / `jiti` / `@esbuild-kit/esm-loader` / `@esbuild-kit/core-utils`: 各 0件
  - `pg`: 1件（`8.x` 系は対象外。PR #14 の `8.16.3`・最新 `8.23.1` とも非該当）

### 2. 脆弱性の内容と伝播経路の精査

1. **`GHSA-gpj5-g38j-94v9`（`CVE-2026-39356`、`drizzle-orm` High / CWE-89）**:
   - `sql.identifier()` や `sql.as()` など識別子エスケープ処理の不備により、非信頼入力を識別子へ渡す経路で SQL Injection の恐れがある。
   - `drizzle-orm@0.45.2`（2026-03-27公開）で修正済み。ただし過去資料（#18本文・PR #14記録）にある「`0.45.2` 以上」は過去の調査起点であり、それ単体で現在の安全推奨版と断定しない。
2. **`GHSA-67mh-4wv8-2f99`（`esbuild <= 0.24.2` Moderate）と `drizzle-kit` 推移依存の追跡結果**:
   - npm Registry の実メタデータ（2026-11-25 照会）を確認したところ、**安定系最新の `drizzle-kit@0.31.11`（2026-09-21公開）であっても、依然として非推奨の `@esbuild-kit/esm-loader` を直接依存に残している**ことが判明した。
   - 版ごとの `drizzle-kit` 直接依存の推移:
     - `drizzle-kit@0.31.7`（PR #14旧版）: `esbuild@^0.25.4`, `esbuild-register@^3.5.0`, `@drizzle-team/brocli@^0.10.2`, **`@esbuild-kit/esm-loader@^2.5.5`**
     - `drizzle-kit@0.31.8` / `0.31.9`: 同上
     - `drizzle-kit@0.31.10` / **`0.31.11`（安定最新 `latest`）**: `esbuild-register` を `tsx@^4.21.0` へ置換したが、**`@esbuild-kit/esm-loader@^2.5.5` は残存**（`dependencies`: `{"tsx":"^4.21.0","esbuild":"^0.25.4","@drizzle-team/brocli":"^0.10.2","@esbuild-kit/esm-loader":"^2.5.5"}`）
     - 推移依存チェーン（`0.31.11` でも発生）:
       `drizzle-kit@0.31.11` → `@esbuild-kit/esm-loader@2.6.5`（deprecated: `Merged into tsx`）→ `@esbuild-kit/core-utils@3.3.2`（deprecated: `Merged into tsx`）→ **`esbuild@~0.18.20`**（`<= 0.24.2` のため `GHSA-67mh-4wv8-2f99` に該当）
     - この結果、`npm audit` 上は 1件の独立 Advisory（`GHSA-67mh-4wv8-2f99`）が `esbuild` → `@esbuild-kit/core-utils` → `@esbuild-kit/esm-loader` → `drizzle-kit` の 4 パッケージへ伝播し、件数集計では Moderate 4 件として検出され続ける見込み（実測は G18 承認後の 18-02 / 18-03 で確認）。
   - さらに、`drizzle-kit@0.31.11` の直接依存 `esbuild@^0.25.4` は、未固定のままだと `0.27.3`〜`0.28.0` に解決された場合に `GHSA-g7r4-m6w7-qqqr`（Low）へ該当し得る（2026-11-25 時点の `esbuild` 最新は `0.28.2`）。したがって推移依存も含めた lock 固定と解決版の記録が必須である。
3. **プレリリース系 `1.0.0-rc.6` での変化（参考調査）**:
   - `drizzle-orm@1.0.0-rc.6` / `drizzle-kit@1.0.0-rc.6`（2026-11-20公開、`v1.0.0-rc.6`）。
   - `drizzle-kit@1.0.0-rc.6` の npm メタデータは `dependencies` 空（バンドル済み）・`peerDependencies: {"oxc-parser":"^0.157.0","drizzle-orm":">=1.0.0-rc.5"}` となっており、`@esbuild-kit/esm-loader` 系への依存は除去されている。
   - 一方で `v1.0.0-rc.6` はプレリリース（RC）であり、リリースノートにドライバ出力デコード等の破壊的変更（Breaking changes）が明記されているほか、`drizzle-kit` 1.0 系でのマイグレーション互換性は未確認である。

### 3. 公式リリース参照 URL（2026-11-25確認）
- `drizzle-orm@0.45.2`（2026-03-27、`sql.identifier()`/`sql.as()` 修正）: https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.2
- `drizzle-orm@0.45.3`（2026-09-21、Netlify DB driver 追加）: https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.3
- `drizzle-orm@0.45.4`（2026-10-08、`postgres-js` `.prepare(name)` 修正、安定最新 `latest`）: https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.4
- `drizzle-kit@0.31.11`（2026-09-21、silent migration skips 警告追加、安定最新 `latest`）: https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit%400.31.11
- `v1.0.0-rc.6`（2026-11-20、プレリリース・破壊的変更あり）: https://github.com/drizzle-team/drizzle-orm/releases/tag/v1.0.0-rc.6
- npm Registry メタデータ参照先: `https://registry.npmjs.org/drizzle-orm/latest`、`https://registry.npmjs.org/drizzle-kit/latest`、`https://registry.npmjs.org/drizzle-kit/0.31.11`、`https://registry.npmjs.org/drizzle-kit/1.0.0-rc.6`、`https://registry.npmjs.org/@esbuild-kit/esm-loader/latest`、`https://registry.npmjs.org/@esbuild-kit/core-utils/latest`、`https://registry.npmjs.org/pg/latest`

---

## 候補版の組と変更提案（未承認・G18承認依頼案）

### 候補の比較表

| 候補 | 正確な版の組 | `GHSA-gpj5-g38j-94v9` (High) | `GHSA-67mh-4wv8-2f99` (Moderate / 旧loader) | 既存 `0.31.7` 履歴互換リスク | 位置づけ |
|---|---|---|---|---|---|
| ベースライン（PR #14） | `drizzle-orm@0.44.7` / `drizzle-kit@0.31.7` / `pg@8.16.3` | 該当（未修正） | 該当（4伝播・1独立Advisory） | 基準 | 保存する参照元 |
| **候補A（第一提案・安定最新組）** | **`drizzle-orm@0.45.4` / `drizzle-kit@0.31.11` / `pg@8.23.1`**（注: `pg` は root `pnpm-lock.yaml` の実解決版 `8.23.1` に揃える案。差分最小化を優先する場合は `pg@8.16.3` 固定も選択可） | **修正済み範囲**（`>= 0.45.2`、実行未検証） | **残存見込み**（`0.31.11` に `@esbuild-kit/esm-loader@^2.5.5` 残存） | 低（同 `0.31.x` 系列・`_journal.json` v7 維持見込み、18-02で実DB検証） | **G18承認依頼の第一候補** |
| 候補A'（最小パッチ比較） | `drizzle-orm@0.45.2` / `drizzle-kit@0.31.11` / `pg@8.16.3` | 修正済み範囲 | 残存見込み | 低 | `0.45.4` との差分は `0.45.3`（Netlify driver）・`0.45.4`（postgres-js修正）のみであり、`latest` である候補Aが合理的 |
| 候補B（プレリリース参考案） | `drizzle-orm@1.0.0-rc.6` / `drizzle-kit@1.0.0-rc.6` / `pg@8.23.1` | 修正済み範囲（`>= 1.0.0-beta.20`） | `@esbuild-kit/esm-loader` 除去済み（別推移依存の有無は実行未検証） | 高（RC・破壊的変更あり・`oxc-parser` peer 必要） | 参考のみ。G18で明示的にRC検証を承認しない限り 18-02 の主対象にしない |

> **禁止事項の確認**: `npm audit fix --force` および `drizzle-kit@0.18.1` へのダウングレードは互換性破壊・無承認変更にあたるため採用しない。また、候補Aで `GHSA-67mh-4wv8-2f99` が残存する場合、それを安全認定せず 18-03 で残存リスク・到達経路（dev server 不使用）を独立評価して所有者へ戻す（ADR 0002 / Q02 の `pg` + 明示SQL 比較判断材料として保持する）。

### 変更管理表（G18 承認依頼用・未承認）

| 項目 | 内容 |
|---|---|
| 変更対象 | 隔離マイグレーション検証（新規 `experiments/quality/18-drizzle`）で使用する Drizzle / Kit / pg 候補版 |
| 変更前 | PR #14（`experiments/m1-migrations`）の `drizzle-orm@0.44.7` / `drizzle-kit@0.31.7` / `pg@8.16.3`（旧実験ディレクトリは変更せず保存） |
| 変更後案 | **候補A**: `drizzle-orm@0.45.4` / `drizzle-kit@0.31.11` / `pg@8.23.1`（または所有者が `pg@8.16.3` 維持を指定した場合はそちらに固定）を新規隔離領域 `experiments/quality/18-drizzle` と専用 workflow で再試験する |
| 変更理由 | `drizzle-orm < 0.45.2` の High 脆弱性 `GHSA-gpj5-g38j-94v9`（`CVE-2026-39356`）を解消した安定最新版で機能・旧履歴互換性を検証し、併せて `drizzle-kit@0.31.11` における `@esbuild-kit/esm-loader` / `esbuild` 推移依存の実測 audit 証跡を固定するため |
| 影響範囲 | 新規隔離ディレクトリ `experiments/quality/18-drizzle/**`・専用 CI workflow・結果文書（`docs/quality/18-02-*` / `18-03-*`）のみ。`experiments/m1-migrations/**`・製品コード・root `package.json`・root `pnpm-lock.yaml`・既存 PR #14 は変更しない。本採用・`main` 統合は別承認 |

---

## 18-02（Issue #29）再試験計画（G18 承認後に実行）

### 1. 隔離構成と所要時間見積もり
- **配置先**: 親 #18 追記に従い、`experiments/m1-migrations` は変更せず保存し、新規 `experiments/quality/18-drizzle/` と専用 workflow（例: `.github/workflows/quality-18-drizzle.yml`）へ隔離する。
- **推定実作業時間**: 2.5〜3.0時間（CI待ち・レビュー待ちを除く。超過見込みなら観測結果を残して再相談）。
- **前提条件**:
  1. 本 18-01（`#28`）の第三者レビューおよび所有者受領。
  2. 所有者による **G18 承認**（採用する候補版の組・`pg` 版・`overrides` 不使用方針の明示コメント URL を記録）。

### 2. 試験項目一覧（既存受け入れ全件 + 旧履歴互換性）

| ID | 試験ケース | 期待結果 |
|---|---|---|
| T01 | 空DBでの `generate --custom` 枠生成・固定 `meta/_journal.json` 検査・`migrate` 適用 | `0000_domains`・`0001_audit` が適用され、`drizzle.__drizzle_migrations` に 2 行（SHA256・`created_at` 順序一致）が記録される |
| T02 | M0相当DB（`postgis` 拡張 + `public.m0_sentinel`）への適用 | 既存 `m0_sentinel` 行が改変・消失せず保持される |
| T03 | 同一候補版での `migrate` 再実行（冪等性） | 履歴テーブル `drizzle.__drizzle_migrations` の行数・`hash`・`created_at` が不変 |
| T04 | 制約・PostGIS・ロール権限検証 | 公開Actorの `case_party` 投入拒否（`23503`）、`mode != 'simulation'` / 不正版 / 空出典拒否（`23514` / `23503`）、SRID 4326・距離 `0m`・GiST 1件、専用 `NOLOGIN` ロールの `audit_event` INSERT 許可と UPDATE/DELETE/`m1_catalog` 書込拒否（`42501`） |
| T05 | 途中失敗ロールバック・前進復旧 | `0000` 適用・`survivor` 行投入後、`0001` 後半で意図的失敗 → `0001` 表と履歴はロールバック、`0000` 履歴と `survivor` 行は保持 → 未適用 `0001` SQL 修正後の再実行で `DROP`/`TRUNCATE`/`reset` なし復旧 |
| T06 | ファイル・DB履歴改ざん検出（試験ラッパー否定例） | 適用済み SQL ファイル追記および `drizzle.__drizzle_migrations.hash` 改ざんを検出・拒否 |
| **T07（新規必須・旧版→候補版 履歴互換性①: 既適用DBでの再実行）** | 隔離DB1に対し旧版（`0.44.7`/`0.31.7`）で `0000`+`0001` を適用・テストデータ投入後、承認候補版（`0.45.4`/`0.31.11`）へ切り替えて `migrate` 再実行 | 既存データ・`drizzle.__drizzle_migrations` 2行（`hash`・`created_at`）が不変、二重適用・エラーなし |
| **T08（新規必須・旧版→候補版 履歴互換性②: 段階前進）** | 隔離DB2に対し旧版（`0.44.7`/`0.31.7`）で `0000` のみ適用・`survivor` 行投入後、承認候補版（`0.45.4`/`0.31.11`）へ切り替えて `0001` を追加適用 | 旧版が記録した `0000` 履歴と `survivor` 行を保持したまま `0001` のみ前進適用され、全2行の `hash`・`created_at` 整合が成立 |

### 3. 固定 lock・依存ツリー・audit 取得方針（18-02 採取 → 18-03 独立評価）
- **依存導入方針**:
  - 隔離ディレクトリ内に明示的な `package.json` と承認版で固定した `package-lock.json` を管理（または `npm install --ignore-scripts --save-exact` で生成し、`npm ci --ignore-scripts` 再現可能な lock を artifact 保存する。推移依存まで固定するため、lockfile をリポジトリ隔離ディレクトリへ保存するか CI 実行時に完全 lock を採取するかは G18 承認時に固定する）。
  - `npm audit fix --force`、無承認 `overrides`、Kit ダウングレードは禁止。
- **必須採取証跡（CI artifact へ保存、秘密非含有）**:
  1. `package-lock.json`（全推移依存の解決版・integrity）
  2. `dependency-tree.txt`（`npm ls --all` 出力 + 終了コード）
  3. `audit.json`（`npm audit --json` 生出力 + 元の終了コードを別ファイル `audit-exit-code.txt` へ保存し、`|| true` で終了コードを隠さない）
  4. `migrations/` 生成物・`_journal.json`・実行ログ（接続文字列・パスワードはマスキング/非出力）
- **18-03（`#30`）への引き継ぎ項目**:
  - 同一最終 head での通常 CI + 隔離 CI 成功確認（`submit head` / `run.head_sha` / 実 checkout SHA 分離）。
  - `audit.json` からの件数・重大度集計と独立 Advisory 数の区別（`GHSA-gpj5-g38j-94v9` 解消確認、`GHSA-67mh-4wv8-2f99` 伝播確認、`GHSA-g7r4-m6w7-qqqr` 非該当確認、新規 Advisory の有無）。
  - 機能 CI 成功と security 採用判断の分離（脆弱性残存時は安全認定せず所有者へ戻す）。

---

## 受け入れ条件との対応表（子Issue #28 / `18-01`）

| 条件 | 状態 | 根拠・備考 |
|---|---|---|
| 影響範囲・修正範囲・版互換の公式根拠と未確認事項がある | 記載済み（第三者突合待ち） | `GHSA-gpj5-g38j-94v9`・`GHSA-67mh-4wv8-2f99`・`GHSA-g7r4-m6w7-qqqr`・`drizzle-orm@0.45.2〜0.45.4`・`drizzle-kit@0.31.11`・`v1.0.0-rc.6`・`@esbuild-kit/*` の公式URLと一次メタデータを参照日付きで記載。未確認事項を後節に分離 |
| 正確な候補組と18-02の試験項目・所要時間・承認依頼がレビュー可能 | 記載済み（第三者突合・G18判断待ち） | 候補A（`0.45.4`/`0.31.11`/`8.23.1`）・候補B（RC参考）・変更管理表・T01〜T08試験計画・2.5〜3.0h見積もり・lock/audit方針を記載 |
| 資料調査を動作試験や採用承認と扱わない | 確認済み | 冒頭・各節・末節で「実行未検証・G18未承認・本採用未承認」を明示。候補版のインストール・実行を一切行っていない |
| 基点/提出head/実行SHA、正確なコマンド、期待/実測、終了コード、残課題を記録し、別担当者が追試・要求照合した | 一部未完了（提出head・第三者突合待ち） | 基点 `3c50a7f`・guide `7159a8a`・照会対象・残課題を記載済み。提出headおよび別担当者による公式URL突合レビューは未実施 |
| 必要CIの最終head結果を記録し、未実施/skip/失敗を合格にしない | 未実施（push・Draft PR作成待ち） | push・Draft PR作成後に通常CIの URL・`event`・`run.head_sha`・実 checkout SHA を PR 本文へ記録予定 |

---

## 未確認事項・残存リスク・非保証範囲

- **未実施（G18 未承認・18-01 非対象）**:
  - 候補A（`drizzle-orm@0.45.4` / `drizzle-kit@0.31.11`）および候補B（`1.0.0-rc.6`）の実際のインストール、`npm ls --all`、`npm audit --json`、PostGIS 上での `generate --custom` / `migrate` / 旧履歴互換テスト（T01〜T08）の実行。
  - `drizzle-kit@0.31.11` で `tsx@^4.21.0` 導入に伴い追加される推移依存全体（`esbuild`・`get-tsconfig` 等）の実解決版と audit 結果の確認（18-02 の実解決 lock/audit で確定する）。
  - `drizzle-kit@0.31.11` で導入された「silent migration skips 警告」が、既存 `run.mjs` の標準出力・終了コードまたは T07/T08 の互換手順へ影響するかどうかの実機確認。
- **残存リスク**:
  - **安定版候補Aでも `GHSA-67mh-4wv8-2f99` は残存する見込み**: `drizzle-kit@0.31.11` が `@esbuild-kit/esm-loader@^2.5.5` への依存を残しているため、0.31系のままでは `esbuild@~0.18.20` 経由の Moderate 検出が解消しない。これを解決するには上流 `drizzle-kit` 安定版（0.31.x後続または 1.0 GA）での依存除去を待つか、ADR 0002 / Q02 の比較候補である `pg` + 明示 SQL を採るかの判断が必要になる。
  - 2026-11-25 以降の新たな Advisory 公開や npm パッケージ更新は、18-02 / 18-03 実行時点で必ず再照会する必要がある。
- **未完了工程**:
  - 作業ブランチ `codex/issue-28-18-01` の push、Draft PR（base: `codex/m1-migrations`）作成、通常 CI 確認。
  - 作成者以外の別の人間による公式 URL・版対応の突合レビュー。
  - 所有者による 18-01 成果受領（Accepted）および後続 18-02 向けの G18 明示承認。
