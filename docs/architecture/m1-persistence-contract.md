# #8（M1-06）PostgreSQL / PostGIS マイグレーションと永続化契約

基準: `docs/product/requirements.md` v0.1、ADR 0001、ADR 0002、M1 設計 D03/D05/D06/D08。

## 技術方針（`pg` + 明示版付き SQL）
- root `package.json` に導入済みの `pg` と、`db/migrations/*.sql` の明示版付き SQL・SHA-256 履歴テーブル `public.schema_migrations` を使用する（`package.json`・`pnpm-lock.yaml` に新規外部依存を追加しない）。
- `packages/domain/src/repository.ts` に DB/SDK 非依存の `M1DomainRepository` ポートを置き、`db/migrator.ts`・`db/repository.ts` に PostgreSQL/PostGIS 実装を分離する。

## スキーマ分離と DB 制約
1. **`public_catalog`**: 出典（`source_document`）・公開活動/改訂・公開主体/改訂・各項目の出典主張・位置情報（`geography(Point, 4326)` + GiST 索引 `idx_pub_activity_location_gist`、`precision = 'unknown'` 時は座標 `NULL` 強制）・参加条件・必要資源。
2. **`simulation`**: 模擬主体・模擬活動・模擬案件（`mode = 'simulation'` 固定、公開活動参照と模擬活動参照の排他 CHECK）・案件当事者（**`simulation.actor` のみを FK 参照し公開主体の混入を DB で物理拒否**）・案件ガバナンス・AI 一次推薦・追記型人間審査（`review_record`）。
3. **`ops_audit`**: 追記型監査イベント（`audit_event`）と冪等性管理（`processed_operation`）。
4. **アプリロール分離（`provisionSimulationAppRole`）**: 模擬アプリ用ロールは `public_catalog` へ読取専用、`simulation.review_record`・`ops_audit.audit_event` へ `SELECT, INSERT` のみ（`UPDATE`/`DELETE` 不可、`42501` 拒否）。

## 移行失敗・バックアップ・復元手順（破壊的リセット禁止）
- **通常適用**: `applyMigrations` が 1 ファイル 1 トランザクションで実行し、成功時のみ `public.schema_migrations` へ版と SHA-256 を記録する。
- **途中失敗時の前進復旧**: 失敗した未適用マイグレーションはトランザクションロールバックされ、既適用版と既存データは保持される。`DROP` / `TRUNCATE` / ボリューム削除を行わず、未適用 SQL の修正後に再実行して前進復旧する。適用済み SQL の改変は SHA-256 照合で拒否する。
- **バックアップと復元（運用手順指針）**:
  - 移行前バックアップ: `pg_dump --format=custom --no-owner --file=backup_<timestamp>.dump "$DATABASE_URL"`（バックアップファイルは秘密情報を含み得るためリポジトリへコミットしない）。
  - 復元検証: 新規の独立検証 DB へ `pg_restore --dbname="$VERIFY_DATABASE_URL" backup_<timestamp>.dump` を適用して検証する。本番のバックアップ保管・暗号化・権限運用は別途確定する。

## 未確定・後続範囲
- 認証セッション永続化および書込 API の公開は認証保護（G19 / M3）完了後。
- 複数同時 migrator ロック・大規模テーブルのオンライン DDL・本番運用バックアップ自動化は後続課題。
