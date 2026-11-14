# A: M1 Kit候補試験（採用未確定）
base: PR #13 head dd4be84。#10→#13の依存を継承。#11/#12の製品コードは統合しない。D01-D08/ADR 0002を参照し、部分スキーマを隔離して検証する。#8/M1全体の完了ではない。

## 再現と受け入れ
専用WorkflowがNode 24 / PostGIS 17-3.5 / drizzle-orm 0.44.7 / drizzle-kit 0.31.7 / pg 8.16.3を一時領域に導入する。run.mjsはKit generate --customで2版のjournal/SQL枠を生成し、版管理された0000/0001のSQLを格納し、Kit migrateで適用する。生成物/journalはCI artifactに保存する。スキーマ差分からの自動SQL生成は未検証。geography・権限等を明示SQLにするcustom migration経路である。
PR #13のdb.execute/CREATE IF NOT EXISTS反復とは別試験。移行履歴はKitに記録させ、試験ラッパーが適用前後のSHA256/順序/時刻を検査する。Kit自身が改ざんを検出するという主張ではない。

空DB/M0相当DB/障害DBをそれぞれ新規作成する。M0はPostGIS拡張のみで永続ドメイン表がない（db/init/001-postgis.sql）。既存データ保護は追加sentinelでも確認する。M0 fixture/旧承認のM1変換は行わない。
0000適用後、0001のDDL直後に故障を注入。0000履歴保持、0001表と履歴のロールバック、未適用SQLを元に戻した再適用を確認する。DROP/TRUNCATE/resetは行わない。失敗した未適用版のみ修正し、適用済み版は編集禁止。試験の履歴改ざんは専用DBの否定例だけで行う。

## 境界と残課題
候補表は公開活動版、模擬Actor/Case/Party、監査と位置の最小部分。#12の全項目出典・Actor改訂、完全架空Activity、Need/条件、審査/認可、M0データ写像は未実装。公開Actorは参照先に存在せずPartyへ投入できない。認証や実同意を生成しない。
制約/権限の確認は専用NOLOGINロールのSELECT/INSERT許可、履歴UPDATE/DELETEとcatalog書込拒否。製品用ロール設計や管理者改変防止の証明ではない。
本番バックアップ復元、複数同時migrator、ロック/大規模データ、非トランザクションDDL、PostGIS更新、既存M1表のbaselineは未検証。Kit生成journalの順序/tag/区切り設定を検査後、版管理済みmeta/_journal.jsonの固定ID/時刻を使用する。全DBで同じSQLと履歴IDを適用する。本採用時にはSQL/journal全体のレビューが必要。

製品コード、package.json、pnpm-lock.yamlの変更なし。直接候補版は固定、推移依存は実行時解決でartifactにlock/treeを保存。auditは結果を保存するが成功扱いで安全性を保証しない。古い0.x候補/Kitの版互換、推移依存、保守変更を本採用前に再評価する。
ローカルはネットワーク/Docker利用不可。CI結果はPR本文に記録する。

公式: https://orm.drizzle.team/docs/drizzle-kit-generate / https://orm.drizzle.team/docs/drizzle-kit-migrate
既定要件・番号・Q02の未確定状態を変更しない。
