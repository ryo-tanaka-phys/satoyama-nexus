# B: Next.js + Auth.js DBセッション候補（採用未確定）
base PR #13。Aには依存しない。既存apps/web・domain・lockfileを変更しない。独立NextアプリをCI一時領域でbuild/startし、loopback HTTPで実際のApp Router→Auth.js core→PostgreSQLを検証する。next-authラッパーの採用・互換性は未検証。Next 16.4.6/React 19.3.1/@auth/core 0.41.1/pg 8.16.3を固定し、独自の最小SQL DBアダプターを使用する。

## 受け入れ
専用CIからrun.mjs。DB保存後のsession HTTP読取、Next停止/再起動後保持、期限切れ削除、DB直接失効、signout後のCookie再利用拒否、偽造/未認証401。Cookie HttpOnly/Path/SameSite、Secureモードの接頭辞/属性、signoutの消去ヘッダー。CSRF tokenなし/不一致は拒否してDB保持、一致時はDB削除。アカウントの明示link/get/unlink、一意provider+ID、他userへの再link拒否、存在しないuserのFK拒否を実DBで確認。
アカウント紐付けはアダプターを直接呼ぶ合成fixture。メール一致での自動紐付け、OAuth callback/本人確認は行わず証明しない。providersは空で外部ログイン経路・送信経路はない。セッションもテスト実行器が生成・保存し、ログインAPIは追加しない。

認証済み/api/protectedは200でも/api/caseは403。案件grantのないfixtureで認証と認可の別境界を確認するだけで、職務分離/自己審査/認可実装は後続#7。UserとActorは紐付けない。公開所属情報から権限を与えない。

## リスク・未検証
独自adapterは候補試験の最小実装で、完全なAuth.js conformance・ユーザー削除/アカウント更新/競合・アカウント回復・鍵ローテーション・レート制限・監査は未検証。トークンは専用DB内のみ。テスト値/秘密を外部に送信しない。CSRF試験はsignout経路のみ。ブラウザ実行、TLS終端、proxy/host信頼設定、Cookieのブラウザ強制は未検証（SecureヘッダーをHTTP試験で手動送信して検査）。本番にtrustHost設定を流用しない。
Nextの本番build/startを実行するが本番デプロイではない。M1_AUTH_SPIKE=1の隔離ガードあり。候補core 0.xとNext版の保守・security更新を採用前に再確認する。
推移依存は実行時解決。artifactにlock/tree/npm audit/server logを保存する。auditの終了を安全性の保証としない。既存pnpm依存/lockfileへの影響なし。本番認証・候補本採用・main mergeは追加承認まで行わない。
ローカルはDocker/ネットワーク利用不可、結果はCI/PR本文に記録。

公式: https://authjs.dev/reference/core/adapters / https://authjs.dev/concepts/session-strategies / https://authjs.dev/reference/core
既定要件・ADR 0002・番号を維持。
