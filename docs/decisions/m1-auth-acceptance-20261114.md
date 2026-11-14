# B 受け入れ・保守リスク記録 2026-11-14
状態：限定機能受け入れPASS、セキュリティ採用判定は未承認/保留。

## 証跡
対象コード c34e6779bd157ee08c76651539bcd2addaab7a9b
- 専用CI成功: https://github.com/ryo-tanaka-phys/satoyama-nexus/actions/runs/43572783550
- 通常CI成功: https://github.com/ryo-tanaka-phys/satoyama-nexus/actions/runs/43572783577
- 実行: Node 24.22.2、独立PostGIS、Next 16.4.6本番build/start、@auth/core 0.41.1、React 19.3.1、pg 8.16.3。
- PASS: PostgreSQL保存/HTTP読取/Nextプロセス再起動後保持、DB失効/signout/期限切れ/偽造/再利用拒否、Cookie属性と削除、CSRFなし/不一致拒否と一致signout、account link/get/unlinkと所有者一意/FK、認証401とgrantなし403。
- 初回のNext ESM設定不足を修正。adapterメソッドはAuth.jsによる非束縛呼出しにも対応。
- 既存製品ソース/package.json/pnpm-lock.yamlは変更なし。証跡artifactに一時npm lock/依存tree/audit/server log。
- README記載の未検証範囲を維持。外部ログイン/本人確認/ブラウザTLS/proxy/next-auth wrapper/実案件認可は未検証。

## セキュリティ検査（機能CI成功とは別）
npm auditは脆弱パッケージ1件（critical集計）、@auth/coreに3 advisoryを報告した。
|対象|検出|この隔離試験との関係|
|---|---|---|
|GHSA-7rqj-j65f-68wh|メール識別子のUnicode正規化順序。audit critical、上流advisory表示はHigh（分類差あり）|email provider/送信機能なし。該当経路は実行しない|
|GHSA-xmf8-cvqr-rfgj|getTokenの不正Bearer例外、high|JWT getTokenを使わずDB戦略。該当経路は実行しない|
|GHSA-x445-f3h2-j279|複数OAuth provider間のcheck cookie混同、moderate|providers空、callbackなし。DB adapter直接link試験でOAuth安全性を証明しない|
auditでは0.41.3を修正版として提示。今回の経路から未使用との判定はコード/設定に基づく推論であり、依存版を安全と認定しない。固定0.41.1は過去候補との比較用に維持した。無断で版を変更しない。本番候補としてこの版を受け入れる判断は保留。
資料: https://github.com/nextauthjs/next-auth/security/advisories/GHSA-7rqj-j65f-68wh
https://github.com/advisories/GHSA-xmf8-cvqr-rfgj
https://github.com/advisories/GHSA-x445-f3h2-j279

## 変更提案（未承認、未実施）
|項目|内容|
|---|---|
|変更対象|Auth.js比較候補の検証版|
|変更前|@auth/core 0.41.1固定の隔離試験|
|変更後案|修正版0.41.3以上から互換版を選び、同じ受け入れとsecurity再検査を追加|
|変更理由|既知advisoryがある版を本採用候補へ持ち越さないため|
|影響範囲|隔離試験依存と結果文書。製品採用・本番認証・既存PRの統合は別承認|
既定要件/ADR/番号を変更せず、本採用を確定しない。
