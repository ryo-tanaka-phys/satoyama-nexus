# #4 最小契約とM0互換境界

ADR 0002の確定事項に従う。M0のSimulationCase/advanceSimulationは変更しない。
M1はm1.tsに分離し、domainの入口から公開。既存UI/matching/ai-reviewはM0を継続使用する。

M0からの写像はactivityIdを出典確認済みActivityのID・領域・版へ明示解決し、profileIdをsimulation Actorへ明示解決した後、CasePartyに登録する。自動変換は今回実装しない。M0 reviewは認証・版が不足するためM1承認へ変換しない。非draft案件は#7の審査移行方針が必要であり自動昇格しない。

#4の最小段階：Actor、記述上のMembership、Activity、ActivityParty、Case/CaseParty、Interest、Needとグラフ参照検証。複数活動横断Case、認可、出典履歴、条件、DB保存、状態遷移は含まない。stageの保存型は承認の証明ではない。書込APIは追加しない。

このグラフ検証は現在参照する単一活動版の整合を検証する最小契約。複数の過去版保持・参照は#5で拡張する。認証アカウントはActorから生成せず、所属から操作権限を返す関数はない。

#3の未確定選定は未解決。#4はSDK非依存の最小部分のみ先行。#5〜#9の着手前に依存PRをレビューし、DB/認証選定の検証を完了する。

## 2026-11-14 追記：#4補完
createCollaborationDraftを追加し、団体未所属個人も模擬案件候補にできる。migrateM0Draftは明示写像を受け取りdraftのみ変換。reviewを引き継がず、非draft・活動不一致・模擬Actor不在を拒否する。上記の「自動変換は実装しない」は維持し、明示変換のみ追加した。これは認証・代理権限の付与ではない。
