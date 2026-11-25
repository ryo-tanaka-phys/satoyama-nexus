# 16-01（Issue #21）Node・pnpm・Next.js のクリーン環境再現記録

## 共通証跡サマリー

- 親Issue: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/16 （#16）
- 子Issue URL / 設計ID / 読取日時: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/21 （`16-01` / #21） / 2026-11-25T10:41:49+09:00
- 担当（人間） / 独立レビュー者（別の人間）: `ryo-tanaka-phys`（所有者。注: C0計画では推奨レーンBだが、Issue #21 本文のとおりA/Bは推奨であり権限制限ではないため所有者が先行再現） / 独立レビュー者: 未確定（別の人間による追試・要求照合待ち）
- G0承認根拠 / 必要なG18・G19承認URL: G0承認済み（2026-11-18 所有者の「共同開発Issue再構成の実装指示」、PR #20 `7159a8a07de6690407aec51e7726d566d804ec57` に記録）。G18・G19は本Issueでは対象外（未承認を維持、具体版変更・隔離実験なし）。
- source SHA / guide SHA / 依存成果SHA:
  - `source SHA`: `36c352fbb503047f8240e7a87d617485609aa297`
  - `guide SHA`: `7159a8a07de6690407aec51e7726d566d804ec57`（`git fetch origin pull/20/head:refs/remotes/origin/c0-guide` で読取専用参照）
  - 参照固定SHA（PR #10 ADR 0002）: `8aba5a1566d0890c6c33794f97b2a2f0fc2d70c5`
  - `依存成果SHA`: なし
- 作業ブランチ / 提出PR base: `codex/issue-21-16-01` / `main`
- 許可ファイル / 非対象:
  - 許可ファイル: `docs/quality/16-01-web-environment.md` のみ
  - 非対象: `README.md`・`package.json`・`pnpm-lock.yaml`・`apps/web/**`・`packages/**`・`compose.yaml`・DBセットアップ・依存更新・Playwright導入・既存PR更新・`main`への直接push/merge・Drizzle/Auth.js本採用・Issue自動close
- OS・Node・pnpm・必要なDockerの版:
  - OS: Windows (`Microsoft Windows NT 10.0.26300.0`)
  - Shell: Windows PowerShell `5.1.26100.10068`（`LocalMachine` ExecutionPolicy=`AllSigned`）
  - Node.js: `v24.22.0`
  - pnpm: `11.25.0`（PowerShell上では `pnpm.cmd` で実行）
  - Next.js: `16.4.6`（Turbopack、lockfile固定版） / Vitest: `5.1.0` / TypeScript: `5.9.3`
  - Docker: 対象外（DB接続・Docker不要の検証。実行時はポート5432にリスナーなし・`.env`未作成）
- 提出head SHA: 本コミット確定後に Draft PR 本文へ記録（コミット自身に自身のSHAは埋め込めないため）
- CI URL / event / run.head_sha / 実際のcheckout SHA: 未実施（push・Draft PR作成前。push/Draft PR作成後に通常CIの最終head結果をPR本文へ記録）
- 未実施・skip・不合格・残存リスク: 後述「未実施・検証限界・残存リスク」に記載
- AI補助確認（使用の有無・範囲）: 使用あり（正本読取・コマンド実行・ブラウザ画面確認・本記録の作成補助）。AIによる確認は人間の独立レビューや所有者の成果受領を代替しない。
- 人間の独立レビューURL / 対象head / 判定: 未実施（Draft PR提出・別担当者による追試待ち）
- 所有者の成果受領URL: 未受領

---

## 読取済み正本と承認区分の整理

作業開始前に以下を全文確認した。

| 資料 | 参照元 / SHA | 区分 |
|---|---|---|
| `docs/product/requirements.md`（要件v0.1と変更履歴） | `source` `36c352f` | 確定事項（要件1〜11、M0〜M6維持） |
| `docs/decisions/0001-m0-foundation.md`（ADR 0001） | `source` `36c352f` | M0実装方針（承認済み） |
| `docs/architecture/README.md` | `source` `36c352f` | M0構成・依存方向の正本 |
| `docs/architecture/m1-domain-design.md` | `source` `36c352f` | M1設計案（D01〜D08、Q01〜Q04） |
| `data/fixtures/README.md`・`public-activities.json`・`simulated-profiles.json` | `source` `36c352f` | 公開情報・模擬データの分離境界 |
| `README.md`・`package.json`・`compose.yaml`・`.github/workflows/ci.yml`・`apps/web/app/page.tsx`・`layout.tsx`・`tests/foundation.test.ts` | `source` `36c352f` | 読取のみ（変更対象外） |
| `docs/decisions/0002-m1-domain.md`（ADR 0002） | PR #10 `8aba5a1` | M1確定事項と未確定候補の記録（main統合は別承認待ち） |
| `AGENTS.md`・`CONTRIBUTING.md`・`docs/collaboration/ai-workflow.md`・`docs/collaboration/onboarding.md` | PR #20 `7159a8a` | G0承認済みの共同開発手順（Draft PR、作業ブランチへコピーしない） |
| 親Issue #16・子Issue #21 本文およびコメント（0件） | GitHub API（2026-11-25取得） | 状態: Ready（未割当・未着手） |

---

## DBなし・秘密情報なしの事前確認

- **作業ディレクトリ**: `satoyama-issue21`（新規clone。既存checkout・DBを流用しない）
- **`.env` ファイル**: 存在しない（`Test-Path .env` = `False`）
- **環境変数 `DATABASE_URL`**: 未設定（`[bool]($env:DATABASE_URL)` = `False`）
- **ポート事前確認**: `3000` 空き、`5432` 空き（PostgreSQL/PostGIS 未起動）

---

## 実行手順と実測結果

実行日: 2026-11-25（JST）。すべてのコマンドは新規cloneした `satoyama-issue21` 上で実行した。

### 1. 環境準備・依存導入・自動検証コマンド

| # | コマンド | 期待結果 | 実測結果 | 終了コード | 所要時間 |
|---|---|---|---|---:|---:|
| 1 | `git clone git@github.com:ryo-tanaka-phys/satoyama-nexus.git satoyama-issue21` | 新規ディレクトリへclone成功 | `satoyama-issue21` へclone完了 | 0 | 計測外 |
| 2 | `git fetch origin pull/20/head:refs/remotes/origin/c0-guide` / `git rev-parse refs/remotes/origin/c0-guide` | PR #20 の固定guide SHAを取得 | `7159a8a07de6690407aec51e7726d566d804ec57` | 0 | 計測外 |
| 3 | `git switch --create codex/issue-21-16-01 36c352fbb503047f8240e7a87d617485609aa297` / `git rev-parse HEAD` | 固定基点から専用ブランチ作成 | `36c352fbb503047f8240e7a87d617485609aa297` | 0 | 計測外 |
| 4 | `node --version` | Node.js 24系 | `v24.22.0` | 0 | 計測外 |
| 5 | `pnpm --version`（PowerShell直接呼び出し） | `11.25.0` 表示 | ExecutionPolicy=`AllSigned` により `pnpm.ps1` 未署名エラー（`PSSecurityException`）で失敗（環境差異1） | 失敗（PS例外） | 計測外 |
| 6 | `pnpm.cmd --version` | `11.25.0` 表示 | `11.25.0` | 0 | 計測外 |
| 7 | `pnpm.cmd install --frozen-lockfile` | lockfile更新なしで全依存を導入 | `Scope: all 5 workspace projects`、`Packages: +72`、lockfile無変更で完了 | 0 | 6,118 ms |
| 8 | `pnpm.cmd typecheck`（`pnpm -r typecheck && tsc -p tsconfig.json`） | 全パッケージ・rootの型検査がエラー0 | `packages/domain`・`packages/matching`・`packages/ai-review`・`apps/web`・root すべて成功 | 0 | 9,257 ms |
| 9 | `pnpm.cmd test`（`vitest run`） | 境界テスト全件成功 | `Test Files 1 passed (1)`、`Tests 4 passed (4)`（`tests/foundation.test.ts`） | 0 | 2,690 ms |
| 10 | `pnpm.cmd build`（`pnpm --filter @satoyama/web build`） | Next.js 本番ビルド成功 | `Next.js 16.4.6 (Turbopack)` ビルド・型検査・静的生成（`/`・`/_not-found`）すべて成功 | 0 | 12,937 ms |

### 2. DBなし画面起動確認（自動検証とは区別）

- **起動コマンド**: `$env:NEXT_TELEMETRY_DISABLED='1'; pnpm.cmd dev`（`.env` なし・`DATABASE_URL` 未設定・DB 停止状態）
- **起動実測**: `Next.js 16.4.6 (Turbopack)` が `http://localhost:3000` で `Ready in 1372ms`（`Running next.config.ts took 278ms`）
- **ブラウザ確認結果（`http://localhost:3000`）**:
  - HTTP ステータス: `200 OK`（失敗リクエスト `0` 件、コンソールエラー・未処理例外 `0` 件）
  - ページタイトル: `Satoyama Nexus | M0`
  - 見出し・導入表示: `SATOYAMA NEXUS / M0 FOUNDATION` / `里山の協働を、確かな一歩から。` / `市民・団体・専門家をつなぐ実証用プラットフォームです。`
  - 実証・模擬表示（`aside`）: `Phase 1：すべての依頼・調整・合意は模擬処理です。外部への連絡は行いません。`
  - 実在活動の未登録表示: `実在する活動の公開情報` → `未登録。出典と参照日を確認した公開情報を、模擬プロフィールと区別して追加します。`
  - 架空プロフィール表示: `模擬プロフィール` → `模擬参加者 A` / `架空の参加者 · 植生観察`
  - 協働までの流れ表示: `協働までの流れ` → `AI一次推薦（M0は未接続）` / `人間による二次審査` / `模擬依頼 → 調整 → 合意 → 実施準備` / `地理的適合性・推薦・審査画面は今後実装します。`
- **停止**: 画面確認後に開発サーバープロセスを停止し、続けて上記 `typecheck` / `test` / `build` を実行した。

---

## 観測した環境差異（#23 への引継ぎ事項）

本Issueでは `README.md`・`package.json`・`apps/web/**` を変更せず、以下を観測事実として記録する（改善案の統合は #23 で扱う）。

1. **Windows PowerShell の ExecutionPolicy (`AllSigned`) と `.ps1` シム**:
   - PowerShell から `pnpm` を直接実行すると `pnpm.ps1` が未署名スクリプトとして拒否される（`PSSecurityException`）。
   - システムポリシーを変更せず `pnpm.cmd` を明示呼び出しすることで `version`・`install`・`dev`・`typecheck`・`test`・`build` の全手順が再現できた。
2. **Next.js 16.4.6 の `next dev` による自動生成ファイル副作用**:
   - `pnpm.cmd dev` 実行時に `✓ Generated AGENTS.md for AI agents. Set 'agentRules: false' in next.config to disable.` と出力され、未追跡ファイル `apps/web/AGENTS.md` が自動生成された。また、`apps/web/next-env.d.ts` が一時的に変更された（後続の `pnpm.cmd build` 実行後に `next-env.d.ts` の差分は解消した）。
   - 本Issueの許可ファイル外であるため、コミット前に自動生成された未追跡の `apps/web/AGENTS.md` を削除し、提出差分が `docs/quality/16-01-web-environment.md` のみであることを確認した。
   - **改善案メモ（#23 検討材料）**: 協力者が `pnpm dev` 実行後に誤って `apps/web/AGENTS.md` をコミットしないよう、手順書への注意書き追加、または別合意のもとで `next.config.ts` / `.gitignore` 対応を検討する余地がある。

---

## 受け入れ条件との対応表

### 子Issue #21（`16-01`）の受け入れ条件

| 条件 | 状態 | 根拠・備考 |
|---|---|---|
| DB接続・秘密情報なしでM0画面が起動する | ローカル実測済み（第三者追試待ち） | `.env` なし・`DATABASE_URL` 未設定・ポート5432未使用状態で `pnpm.cmd dev` が `Ready in 1372ms`、`http://localhost:3000` が HTTP `200 OK` で実証/模擬・公開活動未登録・模擬プロフィールを表示 |
| Node/pnpm/SHA/OSと4つの検証結果を再現可能に記録する（installを含む） | ローカル実測済み（第三者追試待ち） | Windows / Node `v24.22.0` / pnpm `11.25.0` / `source` `36c352f` と、`install`・`typecheck`・`test`・`build` すべて終了コード `0`・所要時間を記録 |
| 他者が同じ手順で追試でき、画面確認と自動検証を区別する | 記録済み（第三者追試待ち） | 画面起動確認（ブラウザ目視・HTTP 200）と自動検証コマンド4種を別節で明示分離。PowerShell `.cmd` 回避と `apps/web/AGENTS.md` 自動生成の注意点も記載 |
| 基点/提出head/実行SHA、正確なコマンド、期待/実測、終了コード、残課題を記録し、別担当者が追試・要求照合した | 一部未完了（提出head・第三者追試待ち） | ローカル実測・残課題は記載済み。提出head SHA記録および別担当者による追試・要求照合は未実施 |
| 必要CIの最終head結果を記録し、未実施/skip/失敗を合格にしない | 未実施（push・Draft PR作成待ち） | push・Draft PR作成後に通常CI URL・`event`・`run.head_sha`・実checkout SHAをPR本文へ記録予定 |

### 親Issue #16 の元受け入れ条件との対応（本子Issue担当分）

| 親#16 元条件 | 本子Issue（#21）での充足状況 |
|---|---|
| 1: OS/Node/pnpm/Docker版・対象SHA・実行手順・期待/実測・失敗箇所を秘密なしで記録 | Web検証分を記録済み（PowerShell `pnpm.ps1` 失敗および `next dev` による `apps/web/AGENTS.md` 自動生成も秘密なしで記録）。Docker/PostGIS分は #22 担当 |
| 2: DBなしの画面起動とDB検証を区別。未実施は未検証と明記 | DBなし画面起動と4自動コマンドのみを実施。PostGIS/Docker のローカル検証は本Issue対象外（#22 担当）として未実施を明記 |

---

## 未実施・検証限界・残存リスク

- **未実施（本Issue範囲外 / 別担当）**:
  - Docker / PostgreSQL / PostGIS のローカル起動・`scripts/check-db.mjs` 実行（子Issue `#22` (`16-02`) の担当範囲。本記録では未実施として区別する）。
  - macOS / Linux 環境でのクリーン環境再現（本記録は Windows PowerShell 環境のみ）。
- **未実施（提出・レビュー工程待ち）**:
  - 作業ブランチの push、Draft PR 作成、最終headに対する通常CI（`.github/workflows/ci.yml`）の実行結果確認。
  - 作成者以外の別の人間による追試・要求照合。
  - 所有者による成果受領（Accepted判定）。
- **検証の限界（保証しない範囲）**:
  - M0 静的画面の起動・境界テスト4件の成功は、M1以降のDB永続化・認証・認可・実AI・地理評価・本番運用安全性を保証しない。
  - G18・G19は未承認のまま維持しており、Drizzle/Auth.jsの具体版検証や本採用は行っていない。
