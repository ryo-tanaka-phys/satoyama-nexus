# Satoyama Nexus
里山協働の実証用プラットフォーム。M0 Foundation。
Phase 1は模擬環境です。実際の外部連絡・依頼・合意は行いません。

## 開発
Node.js 24 / pnpm 11.25.0（packageManagerで固定）。

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```
http://localhost:3000 を開く。秘密情報やDB接続なしでM0画面が起動する。

## 検証
```sh
pnpm typecheck
pnpm test
pnpm build
```

## PostgreSQL/PostGIS（任意のローカル検証）
.env.exampleを.envにコピーする（PowerShell: Copy-Item .env.example .env）。値はローカル専用の例であり本番で利用しない。
```sh
docker compose up -d --wait
node --env-file=.env scripts/check-db.mjs
docker compose stop
```
PostGIS初期化SQLは新規DBボリューム作成時に実行される。既存DBにはSQLを明示適用する。データを保持するため通常はボリュームを削除しない。
CIでは独立したテストDBに初期化SQLを適用しpnpm db:checkを実行する。

## 構成
- apps/web：Next.js画面
- packages/domain：型・模擬遷移
- packages/matching：推薦・地理適合性の境界
- packages/ai-review：AI一次推薦の境界と模擬アダプター
- data/fixtures：実在活動の公開情報と架空プロフィールを別ファイルで管理
- docs/product/requirements.md：確定事項・未確定事項・将来工程
- docs/architecture、docs/decisions：設計とADR

## 開発方針・未実装
作業ブランチからPRを作成し、承認後にmainへ統合する。秘密情報をログ・Issue・コミットへ含めない。
実在活動データの収集、認証、永続化、実AI、審査UI、推薦・地理検索、模擬協働の操作UIは後続工程。
M0の型と検証関数は本番の権限管理を代替しない。
