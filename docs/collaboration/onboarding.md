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
