# 協力者オンボーディングと共有
2026-11-14確認。共同作業の提案資料。招待・権限付与・設定変更は未実施。

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

## 最初の作業
- [#16](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/16)：初級、mainで環境/DB手順の再現。先行PRのmerge不要。
- [#17](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/17)：初中級、#12基点で出典履歴/公開模擬分離の独立レビューと必要な否定例。
- [#18](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/18)：中上級、#14基点のDrizzle/Kit修正版計画、承認後に隔離再試験。
- [#19](https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/19)：中上級、#15基点のAuth.js修正版計画、承認後に隔離再試験。

詳細な担当/PR/検証ルールは[CONTRIBUTING](../../CONTRIBUTING.md)。この一覧を理由に既存Issueを閉じたり、#6〜#9を無断着手しない。

## 公式操作資料
- [個人repoへの招待](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository)
- [個人repoの権限](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository)
