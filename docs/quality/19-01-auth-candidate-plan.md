# 19-01（Issue #31）Auth.js 全 Advisory・互換候補・後続 suite 契約 調査記録

> **重要（実行未検証・承認未取得の明示）**: 本記録は公式 Advisory・npm Registry メタデータ・GitHub Release 情報・PR #15 資料に基づく**資料調査および 19-02〜19-06 の試験契約・承認依頼案のみ**であり、候補版のインストール・動作確認・隔離実験は一切実施していない。また、G19（具体版・隔離実装の承認）、Auth.js の本採用、本番認証有効化はいずれも**未承認**である。

## 共通証跡サマリー

- 親Issue: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/19 （#19）
- 子Issue URL / 設計ID / 読取日時: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/31 （`19-01` / #31） / 2026-11-25T11:10:13+09:00
- 担当（人間） / 独立レビュー者（別の人間）: `ryo-tanaka-phys`（所有者、推奨レーンA） / 独立レビュー者: 未確定（別の人間による公式URL・版互換・suite契約の突合レビュー待ち）
- G0承認根拠 / 必要なG18・G19承認URL:
  - G0: 承認済み（2026-11-18 所有者の「共同開発Issue再構成の実装指示」、PR #20 `7159a8a07de6690407aec51e7726d566d804ec57`）。
  - G19: **未承認**（本調査 19-01 は資料調査のみのため G19 不要。後続の 19-02 `#32`〜19-06 `#36` の具体版固定・隔離実装には所有者の明示的な G19 承認 URL が必須）。
  - G18: 本Issue対象外（未承認維持）。
- source SHA / guide SHA / 依存成果SHA:
  - `source SHA`: `b1d56f7b76a6fe80448320e463edf3293ffdbf57`（PR #15 `codex/m1-auth` head）
  - `guide SHA`: `7159a8a07de6690407aec51e7726d566d804ec57`（PR #20 `refs/pull/20/head` を読取専用 ref `refs/remotes/origin/c0-guide` で参照）
  - 参照固定SHA（PR #10 ADR 0002）: `8aba5a1566d0890c6c33794f97b2a2f0fc2d70c5`
  - `依存成果SHA`: なし
- 作業ブランチ / 提出PR base: `codex/issue-31-19-01` / `codex/m1-auth`
- 許可ファイル / 非対象:
  - 許可ファイル: `docs/quality/19-01-auth-candidate-plan.md` のみ
  - 非対象: `experiments/m1-auth/**`・`.github/workflows/m1-auth.yml`・`package.json`・`pnpm-lock.yaml`・製品コード・候補版の導入/実行・実OAuth/メール/本人確認・`next-auth` ラッパー導入・既存PR更新・`main`への直接push/merge・本採用・本番認証有効化
- 調査環境（資料取得のみ）: Windows (`Microsoft Windows NT 10.0.26300.0`) / PowerShell `5.1.26100.10068` / GitHub REST API・npm Registry API 読取のみ（候補パッケージの install・Next build/start・DB 実行は未実施）
- 提出head SHA: 本コミット確定後に Draft PR 本文へ記録
- CI URL / event / run.head_sha / 実際のcheckout SHA: 未実施（push・Draft PR作成前。push/Draft PR作成後に通常CIの最終head結果をPR本文へ記録）
- 未実施・skip・不合格・残存リスク: 後述「未確認事項・残存リスク・非保証範囲」に記載
- AI補助確認（使用の有無・範囲）: 使用あり（原典読取・GitHub Advisory API/npm Registry 照会・後続 #32〜#36 整合確認・本文書作成補助）。人間の独立レビュー・所有者の成果受領・G19承認を代替しない。
- 人間の独立レビューURL / 対象head / 判定: 未実施（Draft PR提出・第三者突合待ち）
- 所有者の成果受領URL: 未受領

---

## 読取済み正本と PR #15 現状の整理

| 資料 | 参照元 / SHA | 区分 |
|---|---|---|
| `docs/product/requirements.md`（要件v0.1と変更履歴） | `source` `b1d56f7`（`main`継承） | 確定事項（要件1〜11、M0〜M6維持） |
| `docs/decisions/0001-m0-foundation.md`（ADR 0001） | `source` `b1d56f7` | M0実装方針 |
| `docs/architecture/m1-domain-design.md`（D01〜D08、Q01〜Q04） | `source` `b1d56f7` | M1設計案（D02/D07/Q02参照） |
| `docs/decisions/0002-m1-domain.md`（ADR 0002） | PR #10 `8aba5a1` | M1確定事項と未確定候補（認証方式 Q02 は未確定、Auth.js と Supabase Auth の比較継続） |
| `experiments/m1-auth/README.md`・`auth.mjs`・`adapter.mjs`・`run.mjs`・`app/api/**` | PR #15 `b1d56f7` | 保存対象の参照元（変更禁止） |
| `docs/decisions/m1-auth-acceptance-20261114.md`・`.github/workflows/m1-auth.yml` | PR #15 `b1d56f7` | PR #15 受け入れ記録（機能PASS・security/本採用保留） |
| `AGENTS.md`・`CONTRIBUTING.md`・`docs/collaboration/ai-workflow.md`・`onboarding.md` | PR #20 `7159a8a` | G0承認済みの共同開発手順 |
| 親Issue #19・子Issue #31〜#36 本文 | GitHub API（2026-11-25取得） | #31: Ready / #32〜#36: Blocked（G19未承認） |

### PR #15（`b1d56f7`）のベースライン事実
- 固定直接候補: `next@16.4.6` / `react@19.3.1` / `react-dom@19.3.1` / `@auth/core@0.41.1` / `pg@8.16.3`（`next-auth` ラッパー未使用、独自最小 SQL DB アダプター `adapter.mjs` で `auth_spike` スキーマの `users` / `accounts` / `sessions` を操作）。
- 隔離設定: `M1_AUTH_SPIKE=1` ガード、`providers: []`、`session: { strategy: 'database', maxAge: 3600, updateAge: 0 }`、`basePath: '/api/auth'`、loopback `127.0.0.1:3107` 固定ポート。
- PR #15 記録上の `npm audit`: 脆弱パッケージ 1 件（`@auth/core`、critical 集計、内部に 3 Advisory）。

---

## 公式 Advisory・依存メタデータ調査結果（参照日: 2026-11-25）

### 1. `@auth/core` の全 Advisory（GitHub Advisory Database / npm ecosystem）

2026-11-25 時点の照会では、`@auth/core` に対する Advisory は以下の **3件**（すべて `0.41.3` で修正済み。`0.41.3` 以降の新規 Advisory は 0件）。

| Advisory / CVE | GitHub Advisory / npm audit 重大度 | 上流表記との差 | 影響範囲（`@auth/core`） | 初回修正版 | 公開日 / 更新日 | 公式URL |
|---|---|---|---|---|---|---|
| `GHSA-7rqj-j65f-68wh` / `CVE-2026-73420` | **Critical**（CVSS v4.0 `9.1`, `AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`） | PR #15 記録時点の上流リポジトリ表示は High、GitHub Advisory DB / `npm audit` は Critical（CVSS v4.0 9.1）として分類差あり | `>= 0.1.0, < 0.41.3` | `0.41.3` | 2026-07-23 / 2026-08-12 | https://github.com/advisories/GHSA-7rqj-j65f-68wh / https://github.com/nextauthjs/next-auth/security/advisories/GHSA-7rqj-j65f-68wh |
| `GHSA-xmf8-cvqr-rfgj` / `CVE-2026-73418` | **High** | 差なし（High） | `>= 0.1.0, < 0.41.3` | `0.41.3` | 2026-07-23 / 2026-08-13 | https://github.com/advisories/GHSA-xmf8-cvqr-rfgj |
| `GHSA-x445-f3h2-j279` / `CVE-2026-73419` | **Moderate**（`medium`） | 差なし（Moderate / medium） | `<= 0.41.2` | `0.41.3` | 2026-07-23 / 2026-08-13 | https://github.com/advisories/GHSA-x445-f3h2-j279 |

#### 到達経路の推論と修正版認定の明確な分離
- **到達経路の推論（PR #15 の限定構成に基づく事実）**:
  - `GHSA-7rqj-j65f-68wh`（メール正規化順序・ホモグリフ `@` バイパス）: PR #15 は `providers: []` でメールプロバイダ・送信経路を持たない。
  - `GHSA-xmf8-cvqr-rfgj`（`getToken()` の不正 Bearer ヘッダー未捕捉例外）: PR #15 は `session.strategy: 'database'` を採用し `getToken()` を呼ばない。
  - `GHSA-x445-f3h2-j279`（OAuth `state`/`nonce`/PKCE チェック Cookie のプロバイダ未紐付け）: PR #15 は `providers: []` で OAuth コールバックを持たない。
- **修正版認定との分離**:
  - 上記「該当経路を実行しない」は設定とコードの静的分析に基づく**推論**であり、`@auth/core@0.41.1` を安全と認定する根拠にはならない。
  - 同様に、`@auth/core@0.41.3` が 3 件の修正範囲にあることも「2026-11-25 時点の既知 3 Advisory の対象外」という資料事実であり、**無条件に安全な版や本番認証の採用可と認定するものではない**（`0.x` 系であり、実ランタイム検証・lock/audit 実測・将来の OAuth/メール有効化時の再評価が別途必要）。

### 2. `@auth/core@0.41.3` および直接・推移依存の互換性・Advisory 調査（2026-11-25）

| パッケージ | PR #15 旧版 | 2026-11-25 npm `latest` | 互換性・変更点 | 調査時点の該当 Advisory |
|---|---|---|---|---|
| `@auth/core` | `0.41.1` | **`0.41.3`**（2026-07-20公開） | `dependencies` は `0.41.1` と完全同一（`jose@^6.0.6`, `preact@10.24.3`, `@panva/hkdf@^1.2.1`, `oauth4webapi@^3.3.0`, `preact-render-to-string@6.5.11`）。`peerDependencies` は任意 peer の `nodemailer` が `^7.0.7 \|\| ^8.0.5` へ拡大のみ。リリースノート（`@auth/core@0.41.3`）に上記 3 脆弱性の修正を明記 | `0.41.3` で既知 3 件すべて修正済み（新規 0 件） |
| `next` | `16.4.6` | **`16.4.6`** | PR #15 および root `apps/web` と同一版。`engines.node >= 20.9.0`（Node 24 適合）、`peerDependencies` は `react ^19.0.0` 適合 | 直近の 16.4 系 Advisory（`GHSA-f3mh-rxg3-f5g2`, `GHSA-7qx7-33qx-rqx2`, `GHSA-pc58-hwjq-p385`, `GHSA-rhh4-g77r-r9qj`, `GHSA-vvgp-ww4w-46vf`, `GHSA-vc7v-qv4w-wrv8`, `GHSA-mfr8-8qww-v76h` 等 `<= 16.4.4 -> 16.4.5` および `<= 16.4.0 -> 16.4.1`）はすべて `16.4.6` で修正済み |
| `react` / `react-dom` | `19.3.1` / `19.3.1` | **`19.3.1`** / **`19.3.1`** | PR #15 と同一版、`next@16.4.6` と整合 | `19.3.1` 該当 0 件（過去 Advisory は `react < 0.14`・`react-dom 16.x` のみ） |
| `pg` | `8.16.3` | **`8.23.1`** | root `pnpm-lock.yaml` の実解決版は `8.23.1`。`8.16.3` 維持と `8.23.1` 揃いの双方とも API 互換見込み（別変更として承認時に選択） | `8.16.3`・`8.23.1` とも該当 0 件（`GHSA-wc9v-mj63-m9g5` は `< 7.1.2` のみ） |
| `jose`（`@auth/core` 推移依存） | `^6.0.6` | 6.x 系 | `@auth/core@0.41.3` が `^6.0.6` 指定 | `6.x` 該当 0 件（過去 3 件は `<= 4.15.4` のみ） |
| `preact`（`@auth/core` 推移依存） | `10.24.3`（固定） | — | `@auth/core@0.41.3` が `10.24.3` を exact 指定 | `10.24.3` は `GHSA-36hm-qxxp-pg3m`（`CVE-2026-22028`, High: `>= 10.26.5, < 10.26.10` 等）および `GHSA-cg48-9hh2-x6mx`（`10.0.0-alpha/beta`）の**影響範囲外**。19-06 で lock 実解決版が `10.24.3` であることを確認する |
| `@panva/hkdf` / `oauth4webapi` / `preact-render-to-string` | `^1.2.1` / `^3.3.0` / `6.5.11` | — | `@auth/core@0.41.3` 推移依存 | 各 0 件 |

### 3. 公式参照 URL（2026-11-25 確認）
- `@auth/core@0.41.3` リリースノート: https://github.com/nextauthjs/next-auth/releases/tag/%40auth/core%400.41.3
- `GHSA-7rqj-j65f-68wh`（`CVE-2026-73420`）: https://github.com/advisories/GHSA-7rqj-j65f-68wh
- `GHSA-xmf8-cvqr-rfgj`（`CVE-2026-73418`）: https://github.com/advisories/GHSA-xmf8-cvqr-rfgj
- `GHSA-x445-f3h2-j279`（`CVE-2026-73419`）: https://github.com/advisories/GHSA-x445-f3h2-j279
- `GHSA-36hm-qxxp-pg3m`（`preact` 確認用）: https://github.com/advisories/GHSA-36hm-qxxp-pg3m
- `Auth.js` 公式リファレンス: https://authjs.dev/reference/core / https://authjs.dev/reference/core/adapters / https://authjs.dev/concepts/session-strategies
- npm Registry メタデータ: `https://registry.npmjs.org/@auth/core/0.41.3`、`https://registry.npmjs.org/next/latest`、`https://registry.npmjs.org/react/latest`、`https://registry.npmjs.org/react-dom/latest`、`https://registry.npmjs.org/pg/latest`

---

## 変更管理表（G19 承認依頼用・未承認）

### 主提案（`@auth/core` の修正版更新）

| 項目 | 内容 |
|---|---|
| 変更対象 | 隔離認証検証（新規 `experiments/quality/19-auth`）で使用する `@auth/core` 候補版および隔離実行基盤 |
| 変更前 | PR #15（`experiments/m1-auth`）の `@auth/core@0.41.1` / `next@16.4.6` / `react@19.3.1` / `react-dom@19.3.1` / `pg@8.16.3`（旧ディレクトリは変更せず保存） |
| 変更後案 | `@auth/core@0.41.3` / `next@16.4.6` / `react@19.3.1` / `react-dom@19.3.1` / `pg@8.16.3`（`pg` のみ更新する場合は下表の別変更として明示選択）を新規隔離領域 `experiments/quality/19-auth` へ固定 lock（`package-lock.json`）付きで配置し、旧基準 `run.mjs` と 3 つの独立 suite（19-03/04/05）を実行する |
| 変更理由 | `@auth/core@0.41.1` に存在する 3 件の既知 Advisory（`GHSA-7rqj-j65f-68wh` Critical / `GHSA-xmf8-cvqr-rfgj` High / `GHSA-x445-f3h2-j279` Moderate）を修正した `0.41.3` で、既存受け入れ全件・旧セッション互換性・推移依存 audit を再検証するため |
| 影響範囲 | 新規隔離ディレクトリ `experiments/quality/19-auth/**`・新規 workflow `.github/workflows/quality-19-auth.yml`・結果文書 `docs/quality/19-02〜19-06` のみ。`experiments/m1-auth/**`・製品コード・root `package.json`・root `pnpm-lock.yaml`・既存 PR #15 は変更しない。本採用・本番認証・`main` 統合は別承認 |

### 付随する別変更案（所有者選択項目・未承認）

| 項目 | 内容 |
|---|---|
| 変更対象 | ① 隔離認証検証の `pg` 版 / ② 19-03（`#33`）における旧 `@auth/core@0.41.1` によるテストデータ事前生成ステップの許容 |
| 変更前 | ① `pg@8.16.3` / ② 候補版単体での実行のみ |
| 変更後案 | ① `pg@8.16.3` を維持して `@auth/core` 変更差分を純粋比較する案（推奨）または root `pnpm-lock.yaml` と同一の `pg@8.23.1` へ揃える案を G19 で選択。② 19-03 の旧セッション互換試験では、隔離 CI 内の一時ディレクトリ（本番・共有サーバー外、loopback 専用 DB）でのみ旧 `0.41.1` 構成から初期 `users`/`accounts`/`sessions` を生成し、その後 `0.41.3` 側へ切り替えて読取・再起動・失効を検証する（`19-auth/package-lock.json` には `0.41.1` を混ぜない） |
| 変更理由 | ① 変更要因を分離するため。② 親 #19 受け入れ条件4および #33 の「旧 `0.41.1` 構成で作成した有効 session/account を候補構成で読取・再起動・失効する」を安全かつ再現可能に満たすため |
| 影響範囲 | 19-02 基盤の `package.json`/`package-lock.json` および 19-03 の専用一時 DB 初期化手順のみ。本番・製品コードへ影響なし |

---

## 後続 suite（19-02〜19-06）の境界と共有契約設計

`#32`〜`#36` の登録仕様に整合させ、後続者が共通ファイルを競合編集せずに並列提出できる最小契約を以下に定義する。

### 1. ファイル所有権とブランチ / base 構成

| 子ID / Issue | ブランチ名案 / PR base | 専有ファイル（変更可） | 責務境界 | 推定時間 |
|---|---|---|---|---:|
| `19-02` / `#32` | `codex/issue-32-19-02` / `codex/m1-auth` | `experiments/quality/19-auth/{support.mjs,runner.mjs,package.json,package-lock.json,README.md}`, `.github/workflows/quality-19-auth.yml`, `docs/quality/19-02-auth-harness.md` | 承認版の固定 lock・旧基準 `run.mjs` の一時コピー実行・共有 `support.mjs` / `runner.mjs` API 固定 | 2〜3h |
| `19-03` / `#33` | `codex/issue-33-19-03` / `19-02` 提出ブランチ | `experiments/quality/19-auth/suites/session.mjs`, `docs/quality/19-03-session.md` | 旧 `0.41.1` データ互換読取・Next 再起動後保持・DB 失効/期限切れ/偽造/再利用拒否 401・別有効セッション非破壊の正常対照（Cookie/CSRF 詳細は 19-04 へ委譲） | 2〜3h |
| `19-04` / `#34` | `codex/issue-34-19-04` / `19-02` 提出ブランチ | `experiments/quality/19-auth/suites/cookie-account.mjs`, `docs/quality/19-04-cookie-account.md` | Cookie 属性（`HttpOnly`/`Path`/`SameSite=Lax`/`__Secure-`・`Secure`/signout `Max-Age=0`）、CSRF 欠損/不一致/一致と DB 副作用対応、合成アカウント link/get/unlink・一意（`23505`）・FK（`23503`）と元データ保護（寿命・再起動は 19-03 へ委譲） | 2〜3h |
| `19-05` / `#35` | `codex/issue-35-19-05` / `19-02` 提出ブランチ | `experiments/quality/19-auth/suites/auth-boundary.mjs`, `docs/quality/19-05-auth-boundary.md` | `/api/protected`（未認証/偽造/失効 401・有効 200）と `/api/case`（未認証 401・有効 403）の状態マトリクス、自称 `reviewerId`/`role`（header/query/name）でも 403 かつ DB 副作用なしの確認（常時拒否 fixture であり #7 本格認可ではないことを明記） | 1〜2h |
| `19-06` / `#36` | `codex/issue-36-19-06` / `19-02` 提出ブランチ | 新規統合ブランチへ 19-03/04/05 専有ファイルを集約、`.github/workflows/quality-19-auth.yml` の suite 列挙のみ、`docs/quality/19-06-auth-security-review.md` | 同一統合 head で旧基準 run + 全 3 suite + 通常 CI を並列 matrix（各 job 専用 DB）実行。`package-lock.json`/`dependency-tree.txt`/`audit.json`＋終了コードを独立評価 | 2〜3h |

### 2. `support.mjs` の最小公開 API 契約（19-02 で実装・固定）

旧 `experiments/m1-auth/adapter.mjs` の共有 `auth_spike` スキーマや固定ポート `3107` による競合を防ぐため、`support.mjs` は以下の最小インターフェースのみを公開する。

- **隔離前提**:
  - 各 suite 実行ごとに一意な専用 DB（`CREATE DATABASE auth_q_<suite>_<rand>`）と空き loopback ポート（`127.0.0.1:0` 事前確保または suite 固有ポート）を割り当て、他 suite や共有 DB へ干渉しない。
  - `M1_AUTH_SPIKE=1` ガードおよび `localhost`/`127.0.0.1` 限定チェックを維持する。
  - 合成アカウント・合成メール（`@example.invalid`）・ランダム合成トークンのみを使用し、**生トークン・Cookie 値・`AUTH_SECRET`・`DATABASE_URL` を標準出力・結果 JSON・CI ログ・artifact へ出力しない**（ログ出力時はハッシュ先頭や `<redacted>` のみ）。
- **公開関数（最小案）**:
  - `createIsolatedContext(suiteName)`: 専用 DB 作成・最小テーブル初期化・`adapter` インスタンス・一時作業ディレクトリへの Next アプリ準備を返す。
  - `ctx.buildNext()` / `ctx.startNext({ secure?: boolean })` / `ctx.stopNext()` / `ctx.restartNext({ secure?: boolean })`: 本番 `next build` / `next start` の起動・停止・再起動を管理（終了時は `finally` で確実に停止・DB プールクローズ）。
  - `ctx.httpGet(path, { token?, secure?, headers? })` / `ctx.httpPostForm(path, formBody, { cookieHeader?, headers? })`: `redirect: 'manual'` の HTTP 呼出し補助。
  - `ctx.seedLegacyFixture?`（19-03 用・G19 で許可された場合のみ）: 一時隔離ディレクトリで旧 `0.41.1` 構成から専用 DB へ有効 `users`/`accounts`/`sessions` を投入し、そのまま候補版 `ctx` で読取検証へ引き渡す。
  - `ctx.cleanup()`: Next プロセス停止・DB 接続終了（破壊的 `DROP`/`TRUNCATE`/`reset` で他DBへ触れない。使い捨て CI サービス破棄を前提とする）。

### 3. `runner.mjs` 実行契約と結果 JSON スキーマ

- **単体実行コマンド**:
  - `node runner.mjs --suite <baseline|session|cookie-account|auth-boundary> --out <path/to/result.json>`
- **終了コード規則**:
  - 指定された suite ファイルが未存在・未実装の場合は **必ず非ゼロ終了**し、未実装/skip を成功扱いしない。
  - 全ステップ合格時のみ終了コード `0`。1 件でも失敗があれば非ゼロ終了しつつ結果 JSON を出力する。
- **結果 JSON スキーマ（秘密非含有）**:
  ```json
  {
    "suite": "session",
    "sourceSha": "<40-hex>",
    "candidateVersions": {
      "@auth/core": "0.41.3",
      "next": "16.4.6",
      "react": "19.3.1",
      "react-dom": "19.3.1",
      "pg": "8.16.3"
    },
    "startedAt": "<ISO-8601>",
    "finishedAt": "<ISO-8601>",
    "durationMs": 0,
    "status": "pass",
    "steps": [
      {
        "id": "S01",
        "name": "legacy-session-read",
        "expected": "HTTP 200 and DB session preserved",
        "actual": "HTTP 200",
        "status": "pass",
        "durationMs": 0
      }
    ],
    "limits": [
      "synthetic adapter-seeded fixtures only; no OAuth, email, browser TLS, or real case authorization"
    ]
  }
  ```

### 4. CI・固定 lock・audit 採取契約（19-02 構築 → 19-06 評価）
- `.github/workflows/quality-19-auth.yml` は `experiments/quality/19-auth/**` および同 workflow 変更で起動し、各 suite を独立 job（各 job ごとに独立 PostGIS サービス）で実行する。
- `npm ci --ignore-scripts` によりコミット済み固定 `package-lock.json` から再現導入し、`npm ls --all > dependency-tree.txt`、`npm audit --json > audit.json` と**生の終了コード**（`audit-exit-code.txt`）を保存する（`|| true` で終了コードを隠さない、`npm audit fix --force` 禁止）。
- 全 artifact（`package-lock.json`・`dependency-tree.txt`・`audit.json`・`audit-exit-code.txt`・suite 結果 JSON・`server.log`）に秘密・生トークンが含まれないことを検査する。

---

## 受け入れ条件との対応表（子Issue #31 / `19-01`）

| 条件 | 状態 | 根拠・備考 |
|---|---|---|
| 3件だけでなく調査時点の関連Advisoryを確認し根拠URL/日付を残す | 記載済み（第三者突合待ち） | `@auth/core` 3件（`GHSA-7rqj-j65f-68wh` / `GHSA-xmf8-cvqr-rfgj` / `GHSA-x445-f3h2-j279`、audit Critical vs 上流 High の分類差と CVSS v4.0 9.1 を含む）に加え、`next`・`react`・`react-dom`・`pg`・`jose`・`preact`（`GHSA-36hm-qxxp-pg3m` の影響範囲外確認）・`@panva/hkdf`・`oauth4webapi`・`preact-render-to-string` を 2026-11-25 時点で全照会し URL 付きで記載 |
| providers空/DB strategyという到達経路の推論と修正版認定を分離する | 記載済み | 「到達経路の推論と修正版認定の明確な分離」節で、`0.41.1` 未使用経路の静的推論と `0.41.3` の修正範囲確認・本番安全認定を明示分離 |
| 19-02の具体版と隔離実装範囲が承認可能な文書になっている | 記載済み（第三者突合・G19判断待ち） | 変更管理5項目（主提案＋`pg`版/旧`0.41.1`シードの別変更案）、`support.mjs`/`runner.mjs` 最小API、結果JSONスキーマ、19-02〜19-06 のファイル所有権・base・所要時間・lock/audit 採取契約を明記 |
| 基点/提出head/実行SHA、正確なコマンド、期待/実測、終了コード、残課題を記録し、別担当者が追試・要求照合した | 一部未完了（提出head・第三者突合待ち） | 基点 `b1d56f7`・guide `7159a8a`・残課題を記載済み。提出headおよび別担当者による公式URL・契約突合レビューは未実施 |
| 必要CIの最終head結果を記録し、未実施/skip/失敗を合格にしない | 未実施（push・Draft PR作成待ち） | push・Draft PR作成後に通常CIの URL・`event`・`run.head_sha`・実 checkout SHA を PR 本文へ記録予定 |

---

## 未確認事項・残存リスク・非保証範囲

- **未実施（G19 未承認・19-01 非対象）**:
  - `@auth/core@0.41.3` の実際のインストール、`npm ls --all`、`npm audit --json`、`next build`/`start`、DB アダプター結合および 19-02〜19-06 の全試験。
  - `next@16.4.6` の推移依存全体（`postcss`・`@swc/helpers`・`caniuse-lite` 等）を含めた `npm audit --json` の実測結果（19-02 実行時の lock/audit で確定する）。
  - `next-auth` ラッパーの採用可否・互換性（本検証は引き続き `@auth/core` 直接利用の範囲のみ）。
- **残存リスク・非保証**:
  - `@auth/core` は `0.x` 系であり、将来の破壊的変更や新規 Advisory 発生リスクが残る。ADR 0002 / Q02 の認証方式選定（Auth.js vs Supabase Auth 等）は依然未確定。
  - PR #15 / 19-02〜19-05 の隔離試験は合成 fixture・`providers: []`・loopback HTTP の限定確認であり、外部 OAuth/メール送信、本人確認、ブラウザでの Cookie 強制・TLS 終端・リバースプロキシ/Host 信頼設定、#7 の実案件認可・自己審査禁止を証明しない。
- **未完了工程**:
  - 作業ブランチ `codex/issue-31-19-01` の push、Draft PR（base: `codex/m1-auth`）作成、通常 CI 確認。
  - 作成者以外の別の人間による公式 URL・版対応・契約の突合レビュー。
  - 所有者による 19-01 成果受領（Accepted）および後続 19-02〜19-06 向けの G19 明示承認。
