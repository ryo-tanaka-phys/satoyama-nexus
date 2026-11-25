# #7（M1-05）認証・認可・追記型審査と監査のドメイン契約

基準: `docs/product/requirements.md` v0.1 と変更履歴、ADR 0001、ADR 0002、M1 設計 D06/D07。認証 SDK（Auth.js 等）や DB ドライバに依存しない純粋ドメイン契約として `packages/domain/src/auth-review-audit.ts` を追加する。

## 到達範囲（M1-05）
- **サーバー側認証コンテキストと権限表（`ServerAuthContext` / `authorizeServerAction`）**:
  - 5 ロール（`catalog-reader` / `catalog-curator` / `simulation-editor` / `reviewer` / `auditor`）とスコープ（`global` / `case:<id>`）、失効日時・有効期限をサーバー側で検証する。
  - クライアント入力に含まれる `reviewerId`・`role`・`permissions`・`userAccountId` 等のなりすまし項目を明示拒否し、`ActorMembership` から操作権限を推定しない。
- **追記型人間審査・自己審査禁止・重要変更時の承認失効（`recordHumanReview` / `applyMaterialCaseChange` / `transitionSimulationCase`）**:
  - `AIRecommendationRecord`（`status: 'requires-human-review'`）と `ReviewRecord`（承認/却下/再審査の追記履歴）を分離し、AI 推薦のみでの遷移を拒否する。
  - ADR 0002 に従い、案件作成者・直近重要変更者・案件当事者 Actor の操作アカウントによる自己審査を原則禁止（M1 に例外経路なし）。
  - 当事者・参加条件・必要資源・活動参照の重要変更、および重要度未分類（`unknown`）の変更はいずれも `case.revision` をインクリメントして旧版の承認を無効化し、再審査を要求する。
  - M0 段階語彙（`draft` → `requested` → `coordinating` → `agreed` → `preparing`）と `mode: 'simulation'` を維持する。
    - 2026-11-25 更新（オーナー判断）：`requested` と `coordinating` の間に模擬応答段階 `responded` を追加。
  - 2026-11-25 更新（要件4）：人間審査（承認・却下とも）は現行 `case.revision` に紐づく `AIRecommendationRecord` の参照を必須とし、未参照は `AI_RECOMMENDATION_REQUIRED`、別改訂の参照は `UNKNOWN_AI_RECOMMENDATION` で拒否する。
- **競合制御・冪等性・原子的監査と秘匿（`executeWithAtomicAudit` / `sanitizeAuditDiffSummary` / `APP_ROLE_HISTORY_PRIVILEGES`）**:
  - `expectedVersion` 不一致を `VERSION_CONFLICT` で拒否し、同一 `operationId` の再送は履歴重複なしで冪等応答する。
  - 拒否イベントは業務状態を変更せず `persistDeniedAudit` へ分離記録し、許可更新では業務状態保存と監査追記を同一トランザクション契約内で実行して監査失敗時にロールバックする。
  - アプリ用 DB ロールに対する履歴表（`review_record` / `audit_event`）の `UPDATE`/`DELETE` 不可契約と、秘密情報・不要個人情報（`password`/`token`/`cookie`/`email`/接続文字列等）の監査除外・マスキングを定義する。

## 未確定・後続工程へ残す範囲
- 認証方式/セッション実装の本採用（Q02 / G19 `@auth/core@0.41.3` 隔離検証待ち）。
- PostgreSQL 実トランザクション・DB ロール `REVOKE UPDATE, DELETE` の物理実装（#8）。
- 審査 UI・実 AI アダプター（M3）、模擬協働操作 UI（M4）、管理者監査・保存期間・ロール兼任運用（Q02/Q03）。
