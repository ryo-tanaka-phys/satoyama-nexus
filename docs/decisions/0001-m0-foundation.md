# ADR 0001：M0の責務境界
状態：M0実装方針。事業上の未確定事項を確定しない。
日付：2026-11-14

## 背景
承認済みのNext.js/TypeScript・PostgreSQL/PostGISを使い、M1以降を安全に追加できる初期構成が必要。
## 判断
pnpmでwebと3つの責務別パッケージを管理する。内部パッケージはTypeScriptソースを公開し、Next.jsが変換する。CIで型検査・Vitest・本番ビルド・PostGISスモーク確認を行う。
DBの起動にはローカルComposeを用意し、外部AI・連絡サービス・ORMは未導入とする。公開情報は出典付き、模擬主体は明示的なkindで分離する。
## 影響
実証画面はDBなしでも起動可能。独立パッケージ配布、永続化、認証、実AI、地図は後続工程。実AIを使わずとも人間審査前に依頼を開始できない境界を検証する。
## 参照
../product/requirements.md、../architecture/README.md
