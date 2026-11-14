# A 受け入れ・保守リスク記録 2026-11-14
状態：限定マイグレーション機能受け入れPASS。本採用は未承認/保留。

## 証跡
対象コード d79b0c6b8567fc0061ef5455ccbc47fbcdfc49c3
- 専用CI成功: https://github.com/ryo-tanaka-phys/satoyama-nexus/actions/runs/43572888598
- 通常CI成功: https://github.com/ryo-tanaka-phys/satoyama-nexus/actions/runs/43572888644
- Node 24.22.2 / 独立PostGIS 17-3.5 / drizzle-orm 0.44.7 / drizzle-kit 0.31.7 / pg 8.16.3。
- Kit generate --customで枠/journal生成、版管理SQLと固定journalを検査・格納、Kit migrateで適用。db.executeによるSQL透過実行の反復とは別。
- PASS: 空DB、M0相当（PostGISのみ）＋既存sentinel、再実行後の履歴不変、SQLとDB履歴のSHA256/時刻順整合、ファイル/DB履歴改ざん拒否、CHECK/FK/版/出典、geography/SRID/GiST、専用ロールの監査INSERT許可とUPDATE/DELETE/catalog書込拒否。
- PASS: 0000と既存Actor行を保持したまま0001のDDL途中で故障。0001表/履歴はrollback。未適用SQL修正後に前進し、DROP/TRUNCATE/resetなしで復旧。
- 既存製品ソース/package.json/pnpm-lock.yamlの変更なし。CI artifactに生成SQL/journalと一時依存lock/tree/audit。
- READMEの未検証範囲を維持。custom SQL経路の試験でありDrizzle宣言からの自動差分生成は未検証。M1の全契約/#12の永続化、同時migrator/大規模ロック/本番backup復元は未検証。

## セキュリティ・保守
npm auditで脆弱パッケージ5件（high 1、moderate 4、critical 0）。同一問題の依存伝播を含み、独立した5脆弱性ではない。
- drizzle-orm: high、GHSA-gpj5-g38j-94v9（識別子エスケープによるSQL injection、0.45.2未満）。今回は版管理された静的SQLと生成済み英数字DB/role名だけを使い、非信頼入力を識別子にしない。この経路での危険低減はコードに基づく推論で、安全な依存版の認定ではない。
- Kit→@esbuild-kit/esm-loader→core-utils→旧esbuild: moderate、GHSA-67mh-4wv8-2f99。dev serverは使用しない。古いloader系の保守リスクが残る。
- npmはKit 0.18.1への変更をfixとして示したが、互換性不明のdowngradeを実施しない。npm audit fix --forceも行わない。
- 直接候補固定、推移依存はCI時解決。lock/treeを保存するが、本採用前には推移依存の固定・再評価が必要。

上流根拠:
https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9
https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99

## 変更提案（未承認、未実施）
|項目|内容|
|---|---|
|変更対象|Drizzle/Kit比較候補の検証版|
|変更前|ORM 0.44.7 / Kit 0.31.7固定|
|変更後案|ORM 0.45.2以上と互換Kitを別途選び、生成/履歴/失敗復旧/依存検査を再実行。Kit推移依存の解消手段も調査|
|変更理由|既知の識別子SQL injectionと古いloader依存を本採用候補へ持ち越さないため|
|影響範囲|隔離候補版・生成物・結果資料。製品依存/main統合は別承認|
要件/ADR/番号、候補未確定状態、実AI・外部連絡なしを維持。
