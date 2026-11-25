# 17-02（Issue #25）出典参照・確認状態・矛盾保持の未カバー境界 独立検証記録

## 共通証跡サマリー

- 親Issue: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/17 （#17）
- 子Issue URL / 設計ID / 読取日時: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/25 （`17-02` / #25） / 2026-11-25T12:07:42+09:00
- 担当（人間） / 独立レビュー者（別の人間）: `ryo-tanaka-phys`（所有者。注: 推奨レーンBだが A/B は権限制限ではないため先行実装） / 独立レビュー者: 未確定（別の人間による要求照合・追試待ち）
- G0承認根拠 / 必要なG18・G19承認URL: G0承認済み（2026-11-18 所有者の「共同開発Issue再構成の実装指示」、PR #20 `7159a8a07de6690407aec51e7726d566d804ec57`）。G18・G19は本Issueでは対象外（未承認維持）。
- source SHA / guide SHA / 依存成果SHA:
  - `source SHA`: `fea96c2305a1ddfda2a291312c98bf21a5894432`（PR #12 `codex/m1-05-provenance` head）
  - `guide SHA`: `7159a8a07de6690407aec51e7726d566d804ec57`（PR #20 `refs/pull/20/head` を読取専用 ref で参照）
  - 参照固定SHA（PR #10 ADR 0002）: `8aba5a1566d0890c6c33794f97b2a2f0fc2d70c5`
  - `依存成果SHA`: なし
- 作業ブランチ / 提出PR base: `codex/issue-25-17-02` / `codex/m1-05-provenance`
- 許可ファイル / 非対象:
  - 許可ファイル: `tests/quality/17-02-source-integrity.test.ts`・`docs/quality/17-02-source-integrity.md` のみ
  - 非対象: `packages/domain/src/{provenance.ts,actor-provenance.ts}`・既存テスト・`package.json`・`pnpm-lock.yaml`・実URLアクセス/実在出典収集・公開ポリシー確定・一般訂正機能・DB制約（#8）・版追加操作（17-03）・カタログ出力検証（17-04）・既存PR更新・`main`への直接push/merge・Issue自動close
- OS・Node・pnpm・必要なDockerの版:
  - OS: Windows (`Microsoft Windows NT 10.0.26300.0`) / Shell: Windows PowerShell `5.1.26100.10068`（`pnpm.cmd` で実行）
  - Node.js: `v24.22.0` / pnpm: `11.25.0` / Vitest: `5.1.0` / TypeScript: `5.9.3` / Next.js: `16.4.6`
  - Docker: ローカル本検証では対象外（純粋ドメイン単体テスト。実URLへのネットワークアクセスなし）
- 提出head SHA: 本コミット確定後に Draft PR 本文へ記録
- CI URL / event / run.head_sha / 実際のcheckout SHA: 未実施（push・Draft PR作成前）
- 未実施・skip・不合格・残存リスク: 後述「未実施・検証限界・残存リスク」に記載
- AI補助確認（使用の有無・範囲）: 使用あり（原典・既存コード/テスト読取、未カバー境界抽出、テスト実装・実行、本記録作成補助）。人間の独立レビュー・所有者の成果受領を代替しない。
- 人間の独立レビューURL / 対象head / 判定: 未実施（Draft PR提出・第三者追試待ち）
- 所有者の成果受領URL: 未受領

---

## 要求 → 既存テスト → 追加検証（17-02）→ 結果の対応表

| 要求・制約（D04 / `provenance.ts` / `actor-provenance.ts`） | 既存テスト被覆（`m1-provenance` / `m1-actor-provenance`） | 17-02 追加検証（`17-02-source-integrity.test.ts`） | 結果 |
|---|---|---|---|
| 欠損出典・不正 URL・`accessedOn` 暦日付・`confirmed` 確認者必須・`permitted` 根拠必須 | 両既存テストで検証済み | 重複追加せず再利用 | 既存被覆 |
| `checkedBy` / `checkedAt` の片側欠損・時刻書式不正・`conflicting` の確認者必須（Activity / Actor 双方） | **未カバー**（既存は `confirmed` で両側 null のみ） | `unverified` での片側欠損（`checkedBy` のみ・`checkedAt` のみ）、`conflicting` での両側 null、日付のみ `'2026-11-25'`・不正 ISO `'2026-11-25T99:99:99Z'`・空白 `checkedBy` の拒否を Activity/Actor 双方で検証 | **追加 PASS** |
| 同一項目に対する複数出典・`conflicting` 保持・未確認状態の非変換 | 既存は 1 件矛盾追加のみ | 同一 Activity `title` に対する `confirmed` 1件＋`conflicting` 2件（計3出典）と `recruitment: 'unknown'` (`unverified`)、同一 Actor `displayName`/`expertise` の `conflicting` 併存が削除・単一値化されず、`urlStatus`/`usage.status` の `unchecked` も変換されないことを検証 | **追加 PASS** |
| 別対象（模擬領域）・別版・値不一致・Activity/Actor 項目名交差の拒否 | Actor の未知版 `9` のみ検証済み | 模擬 Activity / 模擬 Actor を指す Assertion、Activity の未知版、タイトル/専門性の値不一致、空白 `value`、Activity に `'displayName'`・Actor に `'title'` を渡す交差エラーの拒否を検証 | **追加 PASS** |
| `SourceDocument` ID 重複・`publishedOn`/`updatedOn` 不正日・`restricted` 根拠必須・空白 metadata・Activity/Actor 項目出典独立性 | `appendActivityRevision` 経由の ID 重複のみ | `validateProvenanceGraph` 直接での `SourceDocument`/`SourceAssertion`/`ActorSourceAssertion` ID 重複、`publishedOn`/`updatedOn` 不正暦日、`usage.status: 'restricted'` 根拠欠損、`unchecked` の空白根拠、空白 `publisher`、および Activity 出典では Actor 必須項目（`kind`）を代替できないことを検証 | **追加 PASS** |

---

## 実行手順と実測結果

実行日: 2026-11-25（JST）。新規 clone ディレクトリ `satoyama-issue25`（`codex/issue-25-17-02` @ 基点 `fea96c2`）で実行した。

| # | コマンド | 期待結果 | 実測結果 | 終了コード | 所要時間 |
|---|---|---|---|---:|---:|
| 1 | `pnpm.cmd install --frozen-lockfile` | lockfile 無変更で依存導入 | 完了（lockfile 無変更） | 0 | 6.6s |
| 2 | `pnpm.cmd exec vitest run tests/quality/17-02-source-integrity.test.ts` | 追加 4 テスト全件成功 | `Test Files 1 passed (1)`、`Tests 4 passed (4)` | 0 | 1,751 ms |
| 3 | `pnpm.cmd typecheck` | 全パッケージ・root エラー 0 | `domain` / `matching` / `ai-review` / `apps/web` / root すべて成功 | 0 | 10,080 ms |
| 4 | `pnpm.cmd test` | 全 6 ファイル 23 テスト成功 | `Test Files 6 passed (6)`、`Tests 23 passed (23)` | 0 | 1,873 ms |
| 5 | `pnpm.cmd build` | Next.js 本番ビルド成功 | ビルド・静的生成成功 | 0 | 11,185 ms |

---

## 受け入れ条件との対応表（子Issue #25 / `17-02`）

| 条件 | 状態 | 根拠・備考 |
|---|---|---|
| Activity/Actor双方の出典整合を対象にし、17-03の版追加操作や17-04の出力検証と重複しない | 確認済み | `validateProvenanceGraph` / `validateActorProvenanceGraph` の出典・確認状態・矛盾保持のみを対象とし、版追加や export は対象外 |
| 未確認状態を確認済み・公開許可・連絡同意へ変換しない | 確認済み | `unverified`・`urlStatus: 'unchecked'`・`usage.status: 'unchecked'` が検証前後で保持されることを確認 |
| 既存被覆・追加検証・仕様未定・不具合を区別し証跡を残す | 確認済み | 上表に分類記録。なお、`urlStatus: 'checked'` 時に確認根拠項目を要求しない現行仕様は `SourceDocument` 型上未定・将来判断事項として記録 |
| 基点/提出head/実行SHA、正確なコマンド、期待/実測、終了コード、残課題を記録し、別担当者が追試・要求照合した | 一部未完了（提出head・第三者追試待ち） | ローカル実測記載済み。提出head記録・第三者追試待ち |
| 必要CIの最終head結果を記録し、未実施/skip/失敗を合格にしない | 未実施（push・Draft PR作成待ち） | push・Draft PR作成後に通常CI結果を PR 本文へ記録予定 |

---

## 未実施・検証限界・残存リスク

- テスト用 URL はすべて `https://example.invalid/...` の合成値であり、実 URL への HTTP 到達確認・実在出典収集は行っていない。
- `checkedBy` の本人確認・操作権限（#7）、DB 制約による永続整合（#8）、一般訂正機能・公開ポリシー確定は本 Issue 非対象のまま未実装。
- `urlStatus: 'checked'` に伴う証跡項目（確認日時・確認者等）の有無は現行 `SourceDocument` 契約に未定義（仕様未定）。
