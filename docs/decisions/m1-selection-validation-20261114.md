# M1 #3 選定候補の検証記録 2026-11-14
状態：限定動作検証。採用確定ではない。ADR 0002、Q02を維持。PR #13、base PR #10。

## 実行した証跡
- 対象コード：c5f98838113eab92c0d4d6162c3c08fe52346bb4
- CI：https://github.com/ryo-tanaka-phys/satoyama-nexus/actions/runs/43570214950
- 試験用の固定候補：drizzle-orm 0.44.7、@auth/core 0.41.1、pg 8.16.3。最新版や本番推奨版という意味ではない。
- Node 24、独立PostGISサービス、ランダムな試験用schema/NOLOGIN role。終了時に試験領域を削除。
- 実行環境の一時ディレクトリへ導入し、製品のpackage.json/pnpm-lock.yamlは変更しない。推移依存はCI時解決であり完全な依存固定は未実施。
- ローカルではregistryへの名前解決とDockerサービス接続が利用できず未実行。CIで動作を検証した。

## 確認済みの結果
|候補|実際に確認したこと|証明していないこと|
|---|---|---|
|Drizzle|db.executeのSQL透過実行でgeography(Point,4326)、SRID、距離0m、GiSTを確認。DDL反復、DBロールのUPDATE/DELETE拒否、simulation CHECK/FK、不正参照拒否、例外時のトランザクションロールバック|Drizzleスキーマによるgeography表現、Kitの生成/版管理マイグレーション、M1 Repository全体、実監査との原子性|
|Auth.js core|DB戦略の試験用メモリアダプターでセッション読取と偽造・削除済み・期限切れ・未認証を検証。CSRFなしsignoutが拒否されセッションが残る|next-auth/Next.js統合、DBアダプター永続化、実ログイン、OAuth/メール、アカウント紐付け、権限/自己審査、全CSRF経路|

MissingCSRFは否定例で期待する結果。必要なDBセッション用アダプターメソッドを備えた試験fixtureを使用するが、アカウント作成・更新・紐付けは呼出し時に拒否する。外部への認証通信や通知は発生させない。

## 比較・未確定事項
- Drizzleは第一候補を維持。SQLに近い境界とトランザクションは今回実動確認したが、生成スキーマ・移行履歴の検証前に採用確定しない。
- pg + 明示SQLは比較候補。今回もDrizzleの下層ドライバーに使用した。これだけでDrizzleの代替採用は決めない。
- Auth.jsのDB戦略はサーバーで失効を扱いやすい候補と推論できる。ただし永続化とNext.js統合の証跡が必要。JWT方式は失効リスト等の別管理を比較する。
- Supabase Authは比較候補を維持。今回SDK/ホスト環境の動作試験なし。SSRのCookie/セッション処理とサーバー検証、外部依存、費用・保管場所を評価してから判断する。
- SDK認証と案件権限は別管理。今回の成功はサーバー側認可や自己審査拒否の保証ではない。
- 固定候補のセキュリティ・保守性・最新版適合性の評価は未完了。本番導入に流用しない。

## 次の具体的検証
1. DrizzleでM1候補スキーマを表現し、版付き移行・再適用・旧DB移行を独立DBで検証。
2. Auth.js候補をNext.jsと永続セッションアダプターへ組み込み、失効・Cookie/CSRF・アカウント紐付けを試験。
3. SDK非依存の権限/操作主体と審査対象版を結び付け、自己審査・範囲外・失効権限を拒否する。
4. 比較結果と残リスクをレビューしてから採用を確定。#3はopen、実装PRは承認待ち。

## 公式根拠
- Drizzle PostGIS geometryの説明：https://orm.drizzle.team/docs/guides/postgis-geometry-point
  geometryの例であり、今回使ったgeographyを同じものとは扱わない。拡張と必要DDLは明示SQL。
- Auth.jsセッション戦略：https://authjs.dev/concepts/session-strategies
- Drizzleアダプター公式手順：https://authjs.dev/getting-started/adapters/drizzle
- 試験固定版の必要メソッド：https://github.com/nextauthjs/next-auth/blob/%40auth/core%400.41.1/packages/core/src/lib/utils/assert.ts
- Supabase SSRの注意点：https://supabase.com/docs/guides/auth/server-side/advanced-guide

既存要件1〜11、M0〜M6、D/Q番号を変更しない。実AI・外部連絡・実合意・本番公開は対象外。
