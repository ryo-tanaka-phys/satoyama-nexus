# M1 Domain 受け入れ検証記録と M2〜M4 への引継ぎ（Issue #9 / M1-07）

作成日: 2026-11-25 / 基準: `docs/product/requirements.md` v0.1、ADR 0001、ADR 0002、`docs/architecture/m1-domain-design.md`、`#4`〜`#9`。
本記録は M1（Domain 層・PostgreSQL/PostGIS 永続化・契約テスト）の受け入れ証跡であり、M2 推薦・M3 審査 UI・M4 模擬協働 UI の完成や `main` 統合承認を主張しない。

## 1. M1 受け入れ条件との対応表

| 受け入れ条件（`m1-domain-design.md` / `#9`） | 対応実装・PR | 検証テスト | 判定 |
|---|---|---|---|
| 一活動に二案件、各案件に複数主体、一主体の複数案件、個人・団体・専門家役割・行政を往復保存できる | `m1.ts` (PR #11), `db/repository.ts` (PR #47) | `tests/m1-domain.test.ts`, `tests/m1-postgis-persistence.test.ts`, `tests/m1-acceptance.test.ts` | PASS（実 PostGIS 往復確認済み） |
| 公開ActorのCaseParty指定、模擬履歴の公開混入、出典なし公開データ、欠損位置の偽装を拒否する | `m1.ts`, `provenance.ts` (PR #12), `location-conditions.ts` (PR #45), `db/migrations/0001〜0002` (PR #47) | `tests/m1-provenance.test.ts`, `tests/m1-location-conditions.test.ts`, `tests/m1-postgis-persistence.test.ts`, `tests/m1-acceptance.test.ts` | PASS（アプリ境界＋DB `23503`/`23514` 両層で拒否） |
| 出典改訂・不明条件・位置精度を保持し、公開情報から参加/合意を推定しない | `provenance.ts`, `actor-provenance.ts`, `location-conditions.ts` | `tests/m1-actor-provenance.test.ts`, `tests/m1-location-conditions.test.ts`, `tests/m1-acceptance.test.ts` | PASS（`not-stated`/`unknown`/`no-restriction`/`specified` 分離、`canParticipate: null`） |
| 未認証/範囲外の審査・承認なし遷移・変更後の旧承認利用・自己審査を拒否し、履歴と拒否監査を確認できる | `auth-review-audit.ts` (PR #46), `db/repository.ts` (PR #47) | `tests/m1-auth-review-audit.test.ts`, `tests/m1-postgis-persistence.test.ts`, `tests/m1-acceptance.test.ts` | PASS（追記型履歴・拒否監査分離・`42501` ロール拒否） |
| 同時更新と再送で履歴欠落・重複が起きず、監査保存失敗時に業務更新をロールバックする | `auth-review-audit.ts`, `db/repository.ts` | `tests/m1-auth-review-audit.test.ts`, `tests/m1-postgis-persistence.test.ts` | PASS（`expectedVersion` 競合・`operationId` 冪等・注入障害ロールバック確認） |
| 独立PostGIS DBで移行・制約・権限・往復・空間型検証、既存型検査/テスト/ビルドがCI成功する | `db/migrator.ts`, `db/repository.ts`, `.github/workflows/ci.yml` | `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm db:check` | PASS（ローカル専用 PostGIS および GitHub Actions CI） |
| 既存 M0 回帰が維持され、外部連絡・実依頼/合意・実AIが発生しない | `packages/domain/src/index.ts`, `packages/ai-review`, `packages/matching` | `tests/foundation.test.ts`, `tests/m1-acceptance.test.ts` | PASS（合成 fixture・`example.invalid` のみ） |

## 2. M1 積み上げ PR 構成（すべて未マージ・所有者承認待ち）

`main` (`36c352f`)
→ PR #10 (`codex/m1-03-decisions`, ADR 0002)
→ PR #11 (`codex/m1-04-domain`, #4 最小契約)
→ PR #12 (`codex/m1-05-provenance`, #5 出典・改訂・模擬分離)
→ PR #45 (`codex/m1-06-location-conditions`, #6 地理・参加条件・資源)
→ PR #46 (`codex/m1-07-auth-review-audit`, #7 認証/認可・追記型審査・監査)
→ PR #47 (`codex/m1-08-postgis-persistence`, #8 `pg` + 明示版付き SQL 永続化)
→ **本 PR (`codex/m1-09-domain-acceptance`, #9 M1 受け入れ・M2 引継ぎ)**

（並列検証・調査 PR 群: PR #20 共同開発ガイド / PR #37〜#38 #16環境再現 / PR #39 #28 Drizzle 調査 / PR #40 #31 Auth.js 調査 / PR #41〜#44 #17 独立境界検証）

## 3. 未確定事項と後続（M2 → M3 → M4）への引継ぎ

### 未確定事項（維持）
- **Q02（認証方式の本採用）**: DB 永続化は `pg` + 明示版付き SQL で M1 実装済み（Drizzle Kit 0.31.11 の `@esbuild-kit/esm-loader` 脆弱性を回避）。認証は `@auth/core@0.41.3` の G19 隔離検証（`#32`〜`#36`）を別途実施して本採用を判断する。
- **Q03（実在データ・公開ポリシー）**: 実在活動の調査対象・転載条件・自由文機微情報ポリシー・監査保存期間は未確定。実在データ収集は行わない。
- **Q04（面表現・推薦閾値）**: 行政区域ポリゴン・距離/移動時間の閾値・必須条件は M2 で具体化する。

### M2〜M4 実装への引継ぎ（機能確認可能段階までの最短手順）
1. **M2 Matching (`packages/matching`)**:
   - `PgM1Repository.queryLocationsByDistance`（PostGIS メートル距離＋精度＋欠損 `NULL` 保持）と `ParticipationCondition` / `ActorSkillDeclaration` を入力とし、距離・位置精度・欠損・技能・参加意欲を根拠付きで提示する推薦ロジックを実装する（距離だけで参加可能と断定しない）。
2. **M3 AI Review (`packages/ai-review` + `apps/web`) — ★最初のブラウザ操作確認段階**:
   - 構造化一次推薦（模擬/プロバイダ境界維持）と、`recordHumanReview`（自己審査禁止・理由必須・追記履歴）をサーバー側検証付き API として接続し、運営者向け審査 UI を構築する。
3. **M4 Collaboration (`apps/web`) — ★Phase 1 E2E 機能確認可能段階**:
   - `applyMaterialCaseChange`（変更時承認失効）と `transitionSimulationCase`（`draft → requested → coordinating → agreed → preparing`）を操作できる模擬協働 UI を構築し、公開情報と模擬案件を視覚的に分離した状態で「活動提案から模擬協働成立まで」を画面＋PostGIS で通し検証する。
