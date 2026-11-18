# AI開発エージェント共通規則

このファイルは入口であり、要件・ADR・Issueの代替仕様ではない。人間にもAIにも共通する詳細は[CONTRIBUTING](CONTRIBUTING.md)、実行手順は[AI共同開発ガイド](docs/collaboration/ai-workflow.md)を参照する。ツールが本ファイルを自動認識しない場合も、作業者が明示的に読み込ませる。

## 目的と構成
里山保全を起点とする協働の実証用プラットフォーム。Phase 1の外部連絡・依頼・合意は模擬。構成と依存方向の正本は[アーキテクチャ](docs/architecture/README.md)。apps/web、domain、matching、ai-reviewを分離し、domainへUI・DB・AI SDKを持ち込まない。

## 作業前に読む正本
毎回、対象資料とその修正履歴・追記を全文確認する。
- [要件v0.1と変更履歴](docs/product/requirements.md)、[ADR 0001](docs/decisions/0001-m0-foundation.md)、[M1設計](docs/architecture/m1-domain-design.md)、[fixture境界](data/fixtures/README.md)。
- [PR #10の固定ADR 0002](https://github.com/ryo-tanaka-phys/satoyama-nexus/blob/8aba5a1566d0890c6c33794f97b2a2f0fc2d70c5/docs/decisions/0002-m1-domain.md)と対象Issue・親Issue・関連PRの本文、コメント、変更資料。
- 作業対象SHA上の追加契約・修正記録。採用済み判断、未承認提案、検討候補、未検証を区別する。古い未確定表記でADR記録の承認判断を戻さず、日付だけで提案を承認へ昇格させない。

共同開発の正本はこのGitHubリポジトリの文書・Issue・PR・明示的な所有者判断。過去のChatGPT会話、個人のメモリ、特定端末のファイルを前提にしない。必要な判断がGitHub上で確認できなければ作業範囲を保留して所有者へ確認する。既存要件1〜11、M0〜M6、ADR・D/Q番号を維持する。

## 変更と承認の境界
対象の子Issueを1件に固定し、開始コメントでsource SHA、依存成果SHA、PR base、専用ブランチ、許可ファイル、検証計画を記録する。親子の包含、成果のDepends on、積み上げPRのbase依存は別物。既存PRのマージを不要な着手条件にしない。
WIP、担当と別レビュー者、DoD、状態とG0/G18/G19はCONTRIBUTINGとIssueに従う。G18/G19は未承認。調査のReadyは具体版導入・隔離実験・技術本採用の承認ではない。
mainへの直接push、無断マージ・close、他人のブランチ更新、依存/root lockfile更新、技術採用、本番認証、招待・権限/設定変更を行わない。承認された範囲変更が必要なら「変更対象／変更前／変更後案／変更理由／影響範囲」を提示する。

## データと秘密
公開情報と模擬プロフィール・案件・合意を分離し、合成fixtureと専用ローカルDB/CIだけを使う。実在情報収集・実在団体への連絡・製品からの実AI/外部OAuth/メール/実アカウント運用はしない。開発支援AIの利用は製品の実AI接続と別。
秘密の値、.env、実接続先、トークン、Cookie、個人情報を出力・コミット・Issue・PR・artifactへ転記しない。秘密疑いは値を伏せ、位置・種別・影響・失効/ローテーション案だけを所有者へ報告する。履歴・資格情報・設定を自動変更しない。DBのDROP/TRUNCATE/resetや既存ボリューム削除で復旧しない。

## 検証と証跡
[README](README.md)と対象Issueのコマンドが正本。通常はNode 24 / packageManager指定pnpmで次を使い、対象Issueが許す検証のみ実行する。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

DB検証はIssue指定の独立環境でのみ実施する。証跡は[ガイドの共通形式](docs/collaboration/ai-workflow.md#証跡の共通形式)で、期待/実測、終了コード、未実施、source/guide/submit/run SHAを分離する。提出は子単位のDraft PR。AIの自己確認・別AIの点検・CI成功を人間の第三者レビューや所有者の成果受領に置換しない。

## 停止条件
仕様/原典の矛盾、承認根拠不足、必要資料欠落、範囲外ファイルや依存変更の必要、基点/baseの予期しない移動、秘密疑い、必須試験失敗を発見したら、該当変更を止める。再現と影響を残し、未実施/skip/失敗を合格にしない。無関係な安全な読取と報告は続けてよい。

本ファイルはDraft PR #20上で整備中。指定の古い作業基点に存在しない場合は、ガイドの固定SHA参照手順で読み、許可外のファイルを作業ブランチへコピーしない。
