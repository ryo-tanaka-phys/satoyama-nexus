# AIツールに依存しない共同開発手順

GitHub上のIssue・PR・リポジトリ文書を唯一の共同開発上の正本にする。[AGENTS](../../AGENTS.md)は入口、[CONTRIBUTING](../../CONTRIBUTING.md)は運用規則、[オンボーディング](onboarding.md)はアクセスと初回準備の案内である。ここで製品仕様や承認状態を再定義しない。過去チャットや個人端末のファイルは不要。

## AIがGitHubへ接続できる場合
1. 対象子Issueの最新本文・コメント、親、Depends on、関連PRを取得し、URL・取得日・状態・承認根拠を確認する。
2. AGENTSと参照先の要件/ADR/修正履歴/対象契約を全文読む。AIごとに自動認識の有無が異なるので、読んだファイルとSHAを明示させる。
3. source SHA、依存成果SHA、PR base、作業ブランチ、許可ファイル、非対象を固定する。Readyだけで担当確定と扱わず、担当と別の人間レビュー者の開始コメントを残す。
4. AIに変更計画・検証方法・停止条件を先に示させ、人間がIssueの範囲と照合する。計画の作成はG18/G19や範囲外変更の承認ではない。
5. 許可された変更だけを行う。既存の他人の編集・ブランチを保持し、追加権限や秘密をAIへ渡さない。
6. 対象Issueの試験を実行し、終了コード・期待/実測・未実施を記録する。失敗を期待値変更やskipで隠さない。
7. 人間が差分・変更ファイル・秘密情報・依存/lockfile・公開/模擬境界を確認する。
8. 子単位のDraft PRを指定baseへ提出し、`Refs #実番号`と証跡を記載する。自動closeキーワードや無断マージを使わない。
9. 相手の人間レビューへ対応し、更新headのCIを確認する。所有者の成果受領、PRマージ、本採用、Issue closeは別判断で記録する。

## AIがGitHubへ接続できない場合
本人がアクセスできる端末でclone/fetchし、GitHubのIssue本文・コメント・関連PR/承認記録を保存してAIに読ませる。保存物にURL、取得日時、対象Issue番号、source/guide/依存成果SHAを付ける。これはGitHubの読取スナップショットであり、第二の仕様書ではない。
AIの作業前と提出前に人間が最新GitHubとの差を照合する。承認・仕様が不明なら推測せず保留する。AIがpush/PR操作をできなければ人間が差分確認後に実行する。
privateコードを処理するAIサービスの利用条件・保持/共有範囲を所有者が確認する。資格情報や.envは貼り付けず、AI用の特別な共有アカウント/PATを作らない。

## 古い基点にAGENTSがない場合
#21/#22のsourceはC0文書より古く、mainにPR #20は未マージ。ガイドを入れるためにsourceを変えたり、AGENTSやCONTRIBUTINGを#21/#22の提出差分へ追加しない。
以下でPR #20のheadを**読み取り用の別ref**として取得し、表示した40桁SHAをguide SHAとして開始コメントに固定する。

```sh
git fetch origin
git fetch origin pull/20/head:refs/remotes/origin/c0-guide
git rev-parse refs/remotes/origin/c0-guide
git show refs/remotes/origin/c0-guide:AGENTS.md
git show refs/remotes/origin/c0-guide:CONTRIBUTING.md
git show refs/remotes/origin/c0-guide:docs/collaboration/ai-workflow.md
git show refs/remotes/origin/c0-guide:docs/collaboration/onboarding.md
```

以後は記録した40桁guide SHAを使って読む。作業途中のref更新を自動採用しない。GitHubへ接続できないAIには、人間がこの固定SHAの全文を読取専用で渡す。AGENTSからの参照はguide SHA側とsource SHA側を区別する。
ADR 0002等がsourceにないときもIssue指定のGitHub固定SHAを読む。ローカルGitなら`git show 8aba5a1566d0890c6c33794f97b2a2f0fc2d70c5:docs/decisions/0002-m1-domain.md`で確認できる。取得できなければ所有者へ同じ固定資料の共有を依頼し、過去チャットで代用しない。

## 証跡の共通形式
Issueが指定する専用結果文書へ次を記録する。文書PRで不要な項目は「対象外＋理由」、未実行は「未実施」とする。

```text
親Issue / 子Issue URL / 読取日時:
担当（人間） / 独立レビュー者（別の人間）:
G0承認根拠 / 必要なG18・G19承認URL:
source SHA / guide SHA / 依存成果SHA:
作業ブランチ / 提出PR base:
許可ファイル / 非対象:
OS・Node・pnpm・必要なDockerの版:
コマンド / 期待結果 / 実測結果 / 終了コード / 所要時間:
提出head SHA:
CI URL / event / run.head_sha / 実際のcheckout SHA:
未実施・skip・不合格・残存リスク:
AI補助確認（使用の有無・範囲）:
人間の独立レビューURL / 対象head / 判定:
所有者の成果受領URL（未受領なら未受領）:
```

GitHub ActionsのPR実行は合成merge refをcheckoutする場合がある。submit head、run.head_sha、実checkout SHAを混同しない。ログ・artifactに秘密を残さず、必要なlock/tree/auditは許可された隔離実験だけで扱う。

## #21の最小実行経路（後日、担当確定後）
Node.js 24とpackageManager指定pnpmを準備する。Nodeの導入元は[公式配布](https://nodejs.org/en/download)。pnpmはREADME指定を確認する。作業ディレクトリが既にある場合は上書きせず別名を使う。

```sh
git clone https://github.com/ryo-tanaka-phys/satoyama-nexus.git satoyama-issue21
cd satoyama-issue21
git fetch origin
git fetch origin pull/20/head:refs/remotes/origin/c0-guide
git rev-parse refs/remotes/origin/c0-guide
```

先の固定ガイドとIssue/原典を読んでから:

```sh
git switch --create codex/issue-21-16-01 36c352fbb503047f8240e7a87d617485609aa297
git rev-parse HEAD
node --version
npm install --global pnpm@11.25.0
pnpm --version
pnpm install --frozen-lockfile
pnpm dev
```

localhost:3000でPhase 1の模擬表示・公開活動未登録・架空プロフィールを確認し、Ctrl+Cで停止する。DBの起動や.envは不要。その後:

```sh
pnpm typecheck
pnpm test
pnpm build
git diff --check
git status --short
git diff
```

期待はNode 24、pnpm 11.25.0、install/typecheck/test/buildの終了コード0と指定表示。差異・失敗は実測として記録する。変更可能なのはIssue指定の`docs/quality/16-01-web-environment.md`のみ。
その文書を明示的にstageしてcommitし、本人が差分を確認したうえで作業ブランチだけをpushする。

```sh
git add docs/quality/16-01-web-environment.md
git commit -m "docs: record issue 21 clean web environment"
git push -u origin codex/issue-21-16-01
```

GitHubでNew pull requestを開き、base=main、compare=この作業ブランチを確認し、Draftを選択する。本文は既存テンプレートと上の証跡形式に従う。`Refs #21`を使い、自動closeしない。通常CIと所有者による人間レビューを待つ。AIが直接接続できなくても、この操作は人間がブラウザで行える。
今回C0ではこの経路や#22の環境再現は実行していない。

## 汎用AI作業開始プロンプト
山括弧の欄を、GitHubから確認した値で埋めて使う。GitHub接続のないツールには同じ固定資料の全文も添える。

```text
Satoyama Nexusの子Issue <URL/実番号> だけを担当してください。
正本はGitHubのAGENTS.md、CONTRIBUTING.md、関連要件/ADR/修正履歴、
対象Issue/親Issue/関連PR/承認コメントです。過去の会話や個人のローカル資料は不要です。
source SHA=<値>、guide SHA=<値>、依存成果SHA=<値またはなし>、
作業ブランチ=<値>、提出base=<値>、許可ファイル=<一覧>、非対象=<一覧>。
担当（人間）=<値>、別の人間レビュー者=<値>。
まず資料を全文確認し、読取済み資料/SHA、承認済み・未確定・提案の区別、
変更計画、試験と期待結果、停止条件を示してください。
本IssueがReadyで担当・開始条件が確定している場合のみ、許可範囲の変更へ進んでください。
G18/G19は必要なら別承認URLを確認し、未承認なら版の導入や隔離実験をしないでください。
公開/模擬分離と合成fixture・隔離DBを維持し、秘密の値を出力しないでください。
main/他人のブランチへのpush、無断マージ/依存更新/技術採用/設定変更はしないでください。
矛盾・不足仕様・範囲外変更の必要・秘密疑い・必須試験失敗は報告して該当作業を保留してください。
提出は子単位Draft PR。証跡形式に沿ってsource/submit/run SHAと未実施を分離してください。
AIによる点検は人間の第三者レビューや所有者の成果受領ではありません。
```
