# 17-01（Issue #24）Actor 参照・参加制約の未カバー境界 独立検証記録

## 共通証跡サマリー

- 親Issue: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/17 （#17）
- 子Issue URL / 設計ID / 読取日時: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/24 （`17-01` / #24） / 2026-11-25T12:07:42+09:00
- 担当（人間） / 独立レビュー者（別の人間）: `ryo-tanaka-phys`（所有者。注: 推奨レーンBだが A/B は権限制限ではないため先行実装） / 独立レビュー者: 未確定（別の人間による要求照合・追試待ち）
- G0承認根拠 / 必要なG18・G19承認URL: G0承認済み（2026-11-18 所有者の「共同開発Issue再構成の実装指示」、PR #20 `7159a8a07de6690407aec51e7726d566d804ec57`）。G18・G19は本Issueでは対象外（未承認維持）。
- source SHA / guide SHA / 依存成果SHA:
  - `source SHA`: `fea96c2305a1ddfda2a291312c98bf21a5894432`（PR #12 `codex/m1-05-provenance` head）
  - `guide SHA`: `7159a8a07de6690407aec51e7726d566d804ec57`（PR #20 `refs/pull/20/head` を読取専用 ref で参照）
  - 参照固定SHA（PR #10 ADR 0002）: `8aba5a1566d0890c6c33794f97b2a2f0fc2d70c5`
  - `依存成果SHA`: なし
- 作業ブランチ / 提出PR base: `codex/issue-24-17-01` / `codex/m1-05-provenance`
- 許可ファイル / 非対象:
  - 許可ファイル: `tests/quality/17-01-actor-boundaries.test.ts`・`docs/quality/17-01-actor-boundaries.md` のみ
  - 非対象: `packages/domain/src/m1.ts`・既存テスト・`package.json`・`pnpm-lock.yaml`・認可/権限 API 実装（#7）・DB制約（#8）・出典整合（17-02）・改訂版固定（17-03）・カタログ出力（17-04）・既存PR更新・`main`への直接push/merge・Issue自動close
- OS・Node・pnpm・必要なDockerの版:
  - OS: Windows (`Microsoft Windows NT 10.0.26300.0`) / Shell: Windows PowerShell `5.1.26100.10068`（`pnpm.cmd` で実行）
  - Node.js: `v24.22.0` / pnpm: `11.25.0` / Vitest: `5.1.0` / TypeScript: `5.9.3` / Next.js: `16.4.6`
  - Docker: ローカル本検証では対象外（純粋ドメイン単体テスト。通常CIで独立 PostGIS スモークを含む verify ジョブを実行）
- 提出head SHA: 本コミット確定後に Draft PR 本文へ記録
- CI URL / event / run.head_sha / 実際のcheckout SHA: 未実施（push・Draft PR作成前）
- 未実施・skip・不合格・残存リスク: 後述「未実施・検証限界・残存リスク」に記載
- AI補助確認（使用の有無・範囲）: 使用あり（原典・既存コード/テスト読取、未カバー境界抽出、テスト実装・実行、本記録作成補助）。人間の独立レビュー・所有者の成果受領を代替しない。
- 人間の独立レビューURL / 対象head / 判定: 未実施（Draft PR提出・第三者追試待ち）
- 所有者の成果受領URL: 未受領

---

## 要求 → 既存テスト → 追加候補（17-01）→ 結果の対応表

| 要求・制約（D01〜D03 / ADR 0002 / `m1.ts`） | 既存テスト被覆（`m1-domain` / `m1-migration`） | 17-01 追加検証（`17-01-actor-boundaries.test.ts`） | 結果 |
|---|---|---|---|
| 公開 Actor の `CaseParty` 投入拒否 | `m1-domain.test.ts`: 検証済み (`Simulation actors only`) | 重複追加せず再利用。加えて、参照中模擬 Actor の `domain` を `public-catalog` へ差し替えた場合・空白 role・欠損 Actor・`createCollaborationDraft`/`migrateM0Draft` 経由の拒否を追加 | **既存被覆＋追加 PASS** |
| 公開 Actor の `ParticipationInterest` 投入・不正参照・重複拒否 | **未カバー** | 公開 Actor 指定・存在しない Actor・存在しない `caseId`・不正 `mode`/`kind`・重複 `[caseId, actorId]` の拒否、および模擬 Actor の正常対照を検証 | **追加 PASS** |
| `ActivityParty` の公開/模擬領域一致・参照整合・重複拒否 | **未カバー** | 公開活動×模擬Actor・模擬活動×公開Actor・欠損活動/Actor・空白 role・重複の拒否、および公開活動×公開Actor・模擬活動×模擬Actor の正常対照を検証 | **追加 PASS** |
| `ActorMembership` の種別・参照・重複制約 | `m1-domain.test.ts`: 領域跨ぎ（`Cross-domain`）のみ検証済み | `personId` に団体/行政を指定、`organizationId` に個人を指定、欠損参照、重複の拒否、および個人→行政・公開個人→公開団体の正常対照を検証 | **追加 PASS** |
| Actor ID/表示名欠損・不正 `domain`/`kind`（`expert` 種別混入含む） | `m1-domain.test.ts`: ID 重複のみ検証済み | 空白 `id` (`Empty actor`)・空白 `displayName` (`Empty display name`)・不正 `domain` (`Invalid actor domain`)・ADR 0002 で排他種別としない `kind: 'expert'` (`Invalid actor kind`) の拒否を検証 | **追加 PASS** |
| 公開所属（`ActorMembership`）から参加/代理操作権限を推定しない | `m1-domain.test.ts`: `permissions` 非保持のみ確認 | 記述上の公開 `ActorMembership` を持つ公開個人・公開団体でも `createCollaborationDraft` / `ParticipationInterest` で拒否されること、および `migrateM0Draft` の空白 `profileId` / 公開 Actor 拒否を検証（**本格認可 API 未実装とは明確に区別**） | **追加 PASS** |

---

## 実行手順と実測結果

実行日: 2026-11-25（JST）。新規 clone ディレクトリ `satoyama-issue24`（`codex/issue-24-17-01` @ 基点 `fea96c2`）で実行した。

| # | コマンド | 期待結果 | 実測結果 | 終了コード | 所要時間 |
|---|---|---|---|---:|---:|
| 1 | `pnpm.cmd install --frozen-lockfile` | lockfile 無変更で依存導入 | 完了（lockfile 無変更） | 0 | 6.4s |
| 2 | `pnpm.cmd exec vitest run tests/quality/17-01-actor-boundaries.test.ts` | 追加 6 テスト全件成功 | `Test Files 1 passed (1)`、`Tests 6 passed (6)` | 0 | 1,660 ms |
| 3 | `pnpm.cmd typecheck` | 全パッケージ・root エラー 0 | `domain` / `matching` / `ai-review` / `apps/web` / root すべて成功 | 0 | 10,843 ms |
| 4 | `pnpm.cmd test` | 全 6 ファイル 25 テスト成功 | `Test Files 6 passed (6)`、`Tests 25 passed (25)` | 0 | 2,482 ms |
| 5 | `pnpm.cmd build` | Next.js 本番ビルド成功 | ビルド・静的生成成功 | 0 | 10,357 ms |

---

## 受け入れ条件との対応表（子Issue #24 / `17-01`）

| 条件 | 状態 | 根拠・備考 |
|---|---|---|
| 要求→既存テスト→追加候補→結果の対応表がある | 記載済み | 上表に全項目を対応付け済み |
| 追加したテストは正常対照を通し、選択した不正参照を拒否するか、不具合の再現として明示される | 確認済み | `17-01-actor-boundaries.test.ts` 全 6 テスト（正常対照＋否定例）PASS、不具合未検出 |
| 権限API未実装を認可合格と誤認せず、重複テストを増やさない | 確認済み | 公開 `ActorMembership` が参加権限を与えない制約確認にとどめ、サーバー側認証・RBAC・自己審査禁止（#7）は未実装として明示分離 |
| 基点/提出head/実行SHA、正確なコマンド、期待/実測、終了コード、残課題を記録し、別担当者が追試・要求照合した | 一部未完了（提出head・第三者追試待ち） | ローカル実測記載済み。提出head記録・第三者追試待ち |
| 必要CIの最終head結果を記録し、未実施/skip/失敗を合格にしない | 未実施（push・Draft PR作成待ち） | push・Draft PR作成後に通常CI結果を PR 本文へ記録予定 |

---

## 未実施・検証限界・残存リスク

- `m1.ts` の純粋グラフ検証はサーバー側の認証（`UserAccount`）・案件単位の認可・職務分離/自己審査禁止（#7）や DB 外部キー/ロール制約（#8）を代替しない。
- `validateDomainGraph` の既存検証に不具合は発見されなかったが、第三者レビューおよび通常 CI 確認・所有者受領は未完了。
