# 協力者オンボーディングと共有
2026-11-18 G0反映。Draft PR #20上の運用文書でmain未統合。招待・権限付与・設定変更は未実施。以下の保護/秘密情報設定の読取結果は2026-11-14時点の記録。

## 共有方法と最小権限
privateのまま、協力者本人のGitHubアカウントを招待する。アカウント・PAT・SSH秘密鍵・所有者パスワードの共用はしない。双方に2FA有効化を推奨し、復旧コードは各自で保管する。
個人所有private repoのcollaboratorはwrite権限を持ち、read-only/triageへ限定できない。今回の構成での最小単位は対象repoへのcollaboratorアクセス。read-onlyが必須ならOrganizationと権限構成への移行を別提案として所有者が判断する。自動移行しない。

招待は所有者がrepoの Settings → Access / Collaborators → Add people → 本人の正確なユーザー名を選択 → Add を行い、相手が招待を承認する。表示名だけで本人確認しない。
招待後はこのrepoへのアクセスだけを共有し、本番資格情報や外部サービス権限を渡さない。終了時はアクセスを削除するが、既にcloneしたコピーの回収まで保証されない。

## 招待前の所有者確認
- 全ブランチとGit履歴、PR/Issue添付・コメント、Actionsログ/artifactに秘密や実個人情報がないか確認する。
- .env、API/PAT/SSH鍵、DB接続文字列・dump、認証Cookie/トークン、外部サービス設定を確認。漏洩時は失効/更新を先に行う。
- Actions secrets / Environments / deploy keys / webhook / Appsの権限と実デプロイ先をSettingsで確認。writeアクセスとworkflow編集の影響を理解し、本番秘密を検証workflowへ渡さない。
- mainへの直接push/無承認merge禁止を共有し、利用プランで可能ならPR必須・他者承認・必要CI・force push/削除制限を有効にする案を検討する。設定変更は今回未実施。

今回読めたmainの.env.exampleはローカル例、.gitignoreは.env/鍵を除外、通常CIはテスト用DB資格情報とcontents: read。これは全履歴の秘密情報監査完了を意味しない。
API確認では全列挙ブランチがprotected:false、rulesetsは空。保護詳細APIはintegration権限で403。既存collaborator/招待、2FA、Actions secrets、Environment/deploy key設定はこの接続では未確認。所有者のSettings確認が必要。

## 現在の依存関係
|PR|base → head|確認head|状態|
|---|---|---|---|
|#10|main → codex/m1-03-decisions|8aba5a1|open|
|#11|#10 → codex/m1-04-domain|c7dfdcb|open|
|#12|#11 → codex/m1-05-provenance|fea96c2|Draft|
|#13|#10 → codex/m1-03-selection-spike|dd4be84|Draft|
|#14|#13 → codex/m1-migrations|3c50a7f|Draft|
|#15|#13 → codex/m1-auth|b1d56f7|Draft|

mainは36c352fbb503047f8240e7a87d617485609aa297。#10〜#15はすべて未マージ。#14/#15は相互非依存。#3〜#9の既存依存は変更しない。以後の着手時には最新headを再確認し、基点変更を記録する。
#14/#15は限定機能受け入れ成功の記録があるが、Drizzle/Auth.jsの既知脆弱性と未検証範囲が残り、本採用・本番認証は保留。既存検証版を本番採用しない。

## 親Issue一覧
- [#16](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/16)：初級、mainで環境/DB手順の再現。先行PRのmerge不要。
- [#17](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/17)：初中級、#12基点で出典履歴/公開模擬分離の独立レビューと必要な否定例。
- [#18](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/18)：中上級、#14基点のDrizzle/Kit修正版計画、承認後に隔離再試験。
- [#19](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/19)：中上級、#15基点のAuth.js修正版計画、承認後に隔離再試験。

詳細な担当/PR/検証ルールは[CONTRIBUTING](../../CONTRIBUTING.md)。この一覧を理由に既存Issueを閉じたり、#6〜#9を無断着手しない。

## 公式操作資料
- [個人repoへの招待](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository)
- [個人repoの権限](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository)


## 親子作業と着手状態（G0承認済み）
#16配下3、#17配下4、#18配下3、#19配下6の計16件を登録済み。G0承認後Readyは8件、成果だけ待つ1件、具体版変更承認ゲート配下7件。既存PRのmergeを一律の前提にしない。
最初の並列例はWeb環境×PostGIS環境、Drizzle調査×Auth調査、Actor境界×改訂版固定。Authの3suiteは共有基盤の成果固定後に並列に進める。
親一覧は着手順の指示ではない。各子のDepends on/承認根拠/固定head/提出baseを確認する。新workflowの起動パスと同一headの全結果は最終評価で確認する。
親子APIのGETは4親とも成功したが、接続機能にSub-issuesの関連付け書込操作がなく、ブラウザは未ログイン。今回は親のMarkdownチェックリストと子からの相互リンクを採用した。技術採用・merge・既存Issue closeは別承認。

## 子Issueの登録一覧と作業依存
2026-11-18登録。包含関係は親欄、成果のDepends onは別欄。基点は子本文に固定。全件未割当・未着手。Blockedのうち#23だけが成果のみ待ち、#29/#30/#32〜#36の7件は具体版承認ゲート配下。

|親|設計ID → 実Issue|レーン|状態|必要な成果・ゲート|
|---|---|---|---|---|
|[#16](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/16)|[16-01 → #21](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/21) Node・pnpm・Next.jsのクリーン環境再現|B|Ready|なし|
|[#16](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/16)|[16-02 → #22](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/22) 専用PostGIS環境の起動・接続・再起動を再現する|A|Ready|なし|
|[#16](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/16)|[16-03 → #23](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/23) 環境差異を整理し開発手順の最小修正案を提出する|B|Blocked|[#21](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/21)、[#22](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/22)のレビュー済みSHA|
|[#17](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/17)|[17-01 → #24](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/24) Actor参照・参加制約の未カバー境界を独立検証する|B|Ready|なし|
|[#17](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/17)|[17-02 → #25](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/25) 出典参照・確認状態・矛盾保持の未カバー境界を検証する|B|Ready|なし|
|[#17](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/17)|[17-03 → #26](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/26) Activity・Actor改訂の不変性と参照版固定を検証する|A|Ready|なし|
|[#17](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/17)|[17-04 → #27](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/27) カタログ出力の許可項目と模擬情報漏出を検証する|B|Ready|なし|
|[#18](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/18)|[18-01 → #28](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/28) Drizzle/KitのAdvisoryと互換候補・再試験計画を調査する|B|Ready|なし|
|[#18](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/18)|[18-02 → #29](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/29) 承認候補で旧移行履歴・既存DBの互換性を検証する|A|Blocked|[#28](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/28)のレビュー済みSHA ＋ G18未承認|
|[#18](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/18)|[18-03 → #30](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/30) Drizzle修正版の最終CI・依存証跡を独立評価する|B|Blocked|[#29](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/29)のレビュー済みSHA ＋ G18未承認|
|[#19](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/19)|[19-01 → #31](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/31) Auth.jsの全Advisoryと互換候補・試験契約を調査する|A|Ready|なし|
|[#19](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/19)|[19-02 → #32](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/32) 承認版のAuth隔離実行基盤とsuite入出力契約を固定する|A|Blocked|[#31](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/31)のレビュー済みSHA ＋ G19未承認|
|[#19](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/19)|[19-03 → #33](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/33) 旧セッション互換・再起動・失効を独立検証する|B|Blocked|[#32](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/32)のレビュー済みSHA ＋ G19未承認|
|[#19](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/19)|[19-04 → #34](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/34) Cookie・signout CSRF・合成アカウント紐付けを検証する|B|Blocked|[#32](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/32)のレビュー済みSHA ＋ G19未承認|
|[#19](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/19)|[19-05 → #35](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/35) 認証401・認証済み200・案件権限なし403の境界を検証する|A|Blocked|[#32](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/32)のレビュー済みSHA ＋ G19未承認|
|[#19](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/19)|[19-06 → #36](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/36) Auth全suiteの統合headと脆弱性証跡を最終評価する|A|Blocked|[#33](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/33)、[#34](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/34)、[#35](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/35)のレビュー済みSHA ＋ G19未承認|

承認ゲート: G0は2026-11-18の所有者指示で登録/運用整備/開始準備まで承認済み。G18/G19は未承認、技術本採用・本番有効化・既存PRマージとは別。#28/#31は資料調査のみ着手可能で、候補版を導入/実行しない。

DAG（作業依存）:
- #21・#22 → #23。
- #24・#25・#26・#27は互いに独立。
- #28 → G18 → #29 → #30。
- #31 → G19 → #32 → (#33, #34, #35) → #36。
既存PRは固定コードの参照元であり、16子に対する既存PRのマージ待ちは0件。親番号順の直列化はしない。

## 最初の2レーン
|レーン|最初の子|source基点|作業ブランチ|提出PR base|変更可|
|---|---|---|---|---|---|
|A|[16-02 / #22](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/22)|36c352fbb503047f8240e7a87d617485609aa297|codex/issue-22-16-02|main|docs/quality/16-02-postgis-environment.md|
|B|[16-01 / #21](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/21)|36c352fbb503047f8240e7a87d617485609aa297|codex/issue-21-16-01|main|docs/quality/16-01-web-environment.md|

各Issueの「最初の作業指示」に新規cloneからのコマンド、期待結果、完了/レビュー条件を記載した。Node 24 / pnpm 11.25.0を準備し、担当と別レビュー者を所有者が確定して開始コメントを残す。2件は相手の完了や既存PRマージを待たない。WebはDBなしで起動確認、PostGISは独立Compose projectとボリュームを使い、既存DB/サービスを破壊しない。
今回の再構成作業ではこの環境再現は実行していない。協力者の招待・割当・アクセス権付与もしていない。

## 提出・進捗更新の最小手順
1. 親/子、担当/別レビュー者、固定基点/依存成果SHA、作業ブランチ/提出base、専有ファイル、予定検証、承認根拠を子Issueへ記載する。
2. 状態はProposed / Ready / In Progress / Review / Blocked / Acceptedから選び、子本文と親表を同期する。Blockedでは成果待ち/承認待ち/不合格を明示する。
3. 子ごとのDraft PRへ提出。source SHA、submit head、CIのcheckout/run SHAを分けて記録し、必要CIと第三者レビューを確認する。
4. 所有者の成果受領でAccepted。親のチェックを更新してもPRマージ/Issueクローズ/本採用を自動実行しない。
WIPは各担当者の実装・検証中1件、レビュー待ち1件を原則上限とする。Projectsなしでもこの親表で運用する。

## C0で確認した監査と未確認範囲
2026-11-18の[招待前監査](c0-audit-20261118.md)を参照する。前述の11月14日時点記録は履歴として残す。C0では10ブランチ・45到達可能コミット・98種類のtext blob、36 Issue/PR・コメント7件、105ジョブログ、18 artifact/112エントリを検査した。実秘密の確定検出はないが、未確認の管理設定は安全判定していない。
現在の契約プラン、既存アクセス/招待、Secrets/Variables、Apps/Webhooks/Environment/deploy keysは所有者確認が必要。AI監査を人間の第三者レビューや招待可の承認と解釈しない。

## 所有者が行う招待前確認・設定判断
1. GitHubのプロフィール→Settings→Billing & Licensing→LicensingでCurrent planを**閲覧だけ**して記録する。アップグレード/支払/移行は別判断。[公式案内](https://docs.github.com/en/billing/how-tos/manage-plan-and-licenses/upgrade-plan)
2. repoのSettings→Collaborators/Accessで既存アクセス・保留招待を確認。Secrets and variables→ActionsのSecrets/VariablesとEnvironments、Deploy keys、Webhooks、アカウントのApplicationsで対象repoへのInstalled/Authorized Appsの権限を確認する。秘密の値を共有せず、設定名/用途/権限/所有者確認日だけをGitHubへ記録する。
3. [監査の保護設定案](c0-audit-20261118.md#c0-04-推奨保護設定未設定別判断)を検討し、適用可能ならSettings→BranchesまたはRulesのmainルール、Actions→GeneralのWorkflow permissionsを所有者が別途設定判断する。個人privateで保護できるプランかを先に確認。無承認で設定しない。
4. 協力者のGitHubユーザー名を本人に確認し、所有者がこのrepoの範囲・write権限・AIサービスへのprivateコード取扱いを説明する。人間の判断後だけ招待する。ユーザー名が未確認の現時点では招待/割当をしない。
5. 相手はGitHub上の招待を受領し、repo名・所有者・privateを確認。所有者のアカウント/鍵/PATを共有しない。実アカウント運用禁止とは製品のログイン運用のことで、共同開発用に本人のGitHubアカウントを使うこととは区別する。
6. 相手の受領後に開始コメントと担当/レビュー者を確定し、#21/#22へ個別着手する。今回これらの操作はしていない。

## 他言語経験者向け最小導入
既存のプログラミング経験を前提に、まずGit/Node/pnpm/画面構成だけ確認する。Dockerは#21の前提ではない。
- Gitは変更履歴とブランチ、Draft PRはレビュー提出場所。source SHAは試すコード、guide SHAは読む規則、PR baseは差分の提出先であり別の値。
- Node.jsはJavaScriptの実行環境、pnpmはpackage.json/lockfileに従う依存管理、TypeScriptは型検査を加えたソース言語。新しいライブラリやlockfileを自分の判断で更新しない。
- Next.jsの画面はapps/web/app/page.tsx、共通枠はlayout.tsx、root package.jsonのdev/buildはwebへ転送する。packages/domain・matching・ai-reviewは責務の違うモジュール。#21は構成を読むだけで製品コードを変えない。
- Node 24 / pnpm 11.25.0を準備し、[AIガイドの#21手順](ai-workflow.md#21の最小実行経路後日担当確定後)でclone・固定規則の読取・sourceからの専用ブランチ・起動/型検査/試験/build・Draft PR提出を進める。
- 使用AIの種類は任意。AGENTSを明示的に読み込ませ、GitHub接続がない場合は人間が固定SHAの原典とIssue本文/コメントを渡す。[汎用開始プロンプト](ai-workflow.md#汎用ai作業開始プロンプト)を使用できる。

## C0初回サイクルと開始コメント案
今回の所有者指示で役割計画を固定する。実アカウントへの割当はまだ行わない。

|レーン|担当予定|作業|別の人間レビュー者|提出base|
|---|---|---|---|---|
|A|所有者|#22 PostGIS再現|協力者（ユーザー名確認後）|main|
|B|協力者（ユーザー名未確認）|#21 Web再現|所有者|main|

各自の実装・検証中WIP上限1件、Review待ち上限1件。独立ブランチ・独立Draft PRで進め、相手の完了や既存PRマージを待たない。#21/#22の検証自体はC0で実行しない。

所有者/#22用の開始コメント案（**投稿せず書式のみ**）:

```text
親 #16 / 子 #22（16-02）
担当予定: 所有者 / 人間レビュー者: 協力者（ユーザー名確認後に確定）
状態: Ready → 担当/レビュー者の確定と個別開始後にIn Progress
source: 36c352fbb503047f8240e7a87d617485609aa297
guide: <PR #20から取得し記録した40桁SHA> / 依存成果: なし
branch: codex/issue-22-16-02 / PR base: main
変更可: docs/quality/16-02-postgis-environment.mdのみ
検証: #22の専用Compose projectで起動/接続/停止/同じvolumeで再起動/再接続
期待: PostGISスモーク成功、既存DB・サービスを破壊しない
承認: G0/C0の運用準備承認。G18/G19対象の版変更はしない
WIP: 実装/検証中1件以下、Review待ち1件以下
```

協力者/#21用の開始コメント案（**投稿せず書式のみ**）:

```text
親 #16 / 子 #21（16-01）
担当予定: 協力者（本人のユーザー名確認後） / 人間レビュー者: 所有者
状態: Ready → 担当/レビュー者の確定と個別開始後にIn Progress
source: 36c352fbb503047f8240e7a87d617485609aa297
guide: <PR #20から取得し記録した40桁SHA> / 依存成果: なし
branch: codex/issue-21-16-01 / PR base: main
変更可: docs/quality/16-01-web-environment.mdのみ
検証: install --frozen-lockfile / devの模擬表示 / typecheck / test / build
期待: DBなしで起動し、4自動コマンド成功。失敗/未実施は区別して記録
承認: G0/C0の運用準備承認。G18/G19対象の版変更はしない
WIP: 実装/検証中1件以下、Review待ち1件以下
```

## 協力者による#22レビューと#23判定
#22のsource/guide/submit/run SHA、専用Compose project・非共有volume、初期化SQLの新規volume条件、接続/PostGIS版/距離0m、停止→同じvolumeの再起動→再接続、終了コードを確認する。既存DBの削除や秘密値が証跡にないかも確認する。距離0mのスモークを一般の空間精度やM1永続化の保証としない。
可能な範囲で自分の独立環境から同じ手順を追試する。Dockerを用意できなければ「文書/コード照合のみ、追試未実施」と記録し、追試必須条件を満たしたと承認しない。AIの点検結果は補助として別記する。
所有者は#21を同様に別人レビューし、必要CI・期待表示・未実施を照合する。両成果が第三者照合を満たし、所有者がAcceptedとして受領してから#23の着手可否を判断する。PRのマージは#23の前提にしない。未解決の必須失敗がある場合はBlockedを維持し、範囲縮小や期待値緩和で合わせない。
