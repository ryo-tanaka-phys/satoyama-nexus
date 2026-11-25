# 17-04（Issue #27）カタログ出力の許可項目と模擬情報漏出 独立検証記録

## 共通証跡サマリー

- 親Issue: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/17 （#17）
- 子Issue URL / 設計ID / 読取日時: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/27 （`17-04` / #27） / 2026-11-25T12:07:42+09:00
- 担当（人間） / 独立レビュー者（別の人間）: `ryo-tanaka-phys`（所有者。注: 推奨レーンBだが A/B は権限制限ではないため先行実装） / 独立レビュー者: 未確定（別の人間による要求照合・追試待ち）
- G0承認根拠 / 必要なG18・G19承認URL: G0承認済み（2026-11-18 所有者の「共同開発Issue再構成の実装指示」、PR #20 `7159a8a07de6690407aec51e7726d566d804ec57`）。G18・G19は本Issueでは対象外（未承認維持）。
- source SHA / guide SHA / 依存成果SHA:
  - `source SHA`: `fea96c2305a1ddfda2a291312c98bf21a5894432`（PR #12 `codex/m1-05-provenance` head）
  - `guide SHA`: `7159a8a07de6690407aec51e7726d566d804ec57`（PR #20 `refs/pull/20/head` を読取専用 ref で参照）
  - 参照固定SHA（PR #10 ADR 0002）: `8aba5a1566d0890c6c33794f97b2a2f0fc2d70c5`
  - `依存成果SHA`: なし
- 作業ブランチ / 提出PR base: `codex/issue-27-17-04` / `codex/m1-05-provenance`
- 許可ファイル / 非対象:
  - 許可ファイル: `tests/quality/17-04-catalog-output.test.ts`・`docs/quality/17-04-catalog-output.md` のみ
  - 非対象: `packages/domain/src/{provenance.ts,actor-provenance.ts}`・既存テスト・`package.json`・`pnpm-lock.yaml`・公開API/認証/XSS全般/自由文機微情報ポリシー実装・実データ投入・既存PR更新・`main`への直接push/merge・Issue自動close
- OS・Node・pnpm・必要なDockerの版:
  - OS: Windows (`Microsoft Windows NT 10.0.26300.0`) / Shell: Windows PowerShell `5.1.26100.10068`（`pnpm.cmd` で実行）
  - Node.js: `v24.22.0` / pnpm: `11.25.0` / Vitest: `5.1.0` / TypeScript: `5.9.3` / Next.js: `16.4.6`
  - Docker: ローカル本検証では対象外（純粋ドメイン単体テスト）
- 提出head SHA: 本コミット確定後に Draft PR 本文へ記録
- CI URL / event / run.head_sha / 実際のcheckout SHA: 未実施（push・Draft PR作成前）
- 未実施・skip・不合格・残存リスク: 後述「未実施・検証限界・残存リスク」に記載
- AI補助確認（使用の有無・範囲）: 使用あり（原典・既存コード/テスト読取、許可キー整理、再帰漏出テスト実装・実行、本記録作成補助）。人間の独立レビュー・所有者の成果受領を代替しない。
- 人間の独立レビューURL / 対象head / 判定: 未実施（Draft PR提出・第三者追試待ち）
- 所有者の成果受領URL: 未受領

---

## 各出力関数の許可キーと禁止領域の対応表

| 出力関数 | トップレベル許可キー | ネスト許可キー | 禁止・除外領域 |
|---|---|---|---|
| `exportPublicCatalog(graph)` | `kind`, `notice`, `activities`, `sources`, `assertions` | `activities[]`: `id`, `domain` (`'public-catalog'` のみ), `revision`, `title` / `sources[]`・`assertions[]`: 検証済み構造の `structuredClone` | `actors`, `actorRevisions`, `actorAssertions`, `memberships`, `activityParties`, `cases`, `interests`, `needs`, `parties`, `accounts`, `permissions`, および `domain: 'simulation'` の活動 |
| `exportCatalogWithActors(graph)` | `kind`, `notice`, `activities`, `sources`, `assertions`, `actors`, `actorAssertions` | `actors[]`: `revision`, `actor`（`domain === 'public-catalog'` のみ） / `actor`: `id`, `domain`, `kind`, `displayName`, `expertise` / `expertise[]`: `label`, `evidence` | `memberships`（公開・模擬とも）, `activityParties`, `cases`, `interests`, `needs`, `parties`, `accounts`, `permissions`, および `domain: 'simulation'` の Actor・活動 |
| `exportSimulationCase(graph, id)` | `mode`, `notice`, `case` | `case`: `mode` (`'simulation'`), `id`, `activity`, `revision`, `stage`, `parties` / `activity`: `id`, `domain`, `revision` / `parties[]`: `actorId`, `role` | `review`, `consent`, 未知の `CaseParty` 拡張プロパティ。`mode` は `'simulation'`・`notice` は `'模擬検討。実在主体の参加・応答・合意を示さない。'` 固定 |

---

## 入力拒否・出力除外・公開ポリシー未定の区別（重要判定）

Issue #27 の受け入れ条件に従い、以下の 3 区分を厳格に分けて検証・記録した。

1. **未知フィールドの入力拒否（Validation Rejection）**:
   - `validateProvenanceGraph` / `validateActorProvenanceGraph` が `keys(...)` で明示拒否する対象（`SourceDocument`, `SourceDocument.usage`, `SourceAssertion`, `SourceAssertion.target`, `CollaborationCase`, `CollaborationCase.activity`, `Activity` in `activityRevisions`, `ActorRevision`, `ActorRevision.actor`, `Actor.expertise[]`, `ActorSourceAssertion`, `ActorSourceAssertion.target`）は、未知フィールド混入時に **出力前に例外で拒否**されることを検証済み。
2. **出力時の許可キー再構成による除外（Output Allowlist Exclusion）**:
   - `CaseParty` 要素は `validateProvenanceGraph` 側で `keys(...)` 検査を行っていないため、未知フィールド付き `CaseParty` 自体は `validateProvenanceGraph` を通過する。
   - 一方で `exportSimulationCase` は `{ actorId: p.actorId, role: p.role }` のみを明示再構成して出力するため、未知プロパティは出力から除外される。同様に、混在グラフ上の `memberships`・`activityParties`・`cases`・`interests`・`needs`・模擬 Actor/活動は `exportPublicCatalog` / `exportCatalogWithActors` の出力から完全に除外される（13種の識別用センチネル値で再帰スキャン 0 件を確認）。
3. **自由文公開ポリシー未定（未実装・本Issue非対象）**:
   - 公開 `SourceDocument.summary` や公開活動 `title` の自由文の中に機微情報や誤記が書かれた場合の自動フィルタリング・検閲・公開ポリシー判定は未実装（Q03 / 将来工程）。また、`exportPublicCatalog` が `graph.sources` 配列全体を出力する点（どの公開対象からも参照されていない `SourceDocument` が `graph.sources` に含まれている場合の扱い）は現行転送契約の挙動として記録する。

---

## 実行手順と実測結果

実行日: 2026-11-25（JST）。新規 clone ディレクトリ `satoyama-issue27`（`codex/issue-27-17-04` @ 基点 `fea96c2`）で実行した。

| # | コマンド | 期待結果 | 実測結果 | 終了コード | 所要時間 |
|---|---|---|---|---:|---:|
| 1 | `pnpm.cmd install --frozen-lockfile` | lockfile 無変更で依存導入 | 完了（lockfile 無変更） | 0 | 5.2s |
| 2 | `pnpm.cmd exec vitest run tests/quality/17-04-catalog-output.test.ts` | 追加 4 テスト全件成功 | `Test Files 1 passed (1)`、`Tests 4 passed (4)` | 0 | 1,783 ms |
| 3 | `pnpm.cmd typecheck` | 全パッケージ・root エラー 0 | `domain` / `matching` / `ai-review` / `apps/web` / root すべて成功 | 0 | 8,884 ms |
| 4 | `pnpm.cmd test` | 全 6 ファイル 23 テスト成功 | `Test Files 6 passed (6)`、`Tests 23 passed (23)` | 0 | 2,415 ms |
| 5 | `pnpm.cmd build` | Next.js 本番ビルド成功 | ビルド・静的生成成功 | 0 | 11,453 ms |

---

## 受け入れ条件との対応表（子Issue #27 / `17-04`）

| 条件 | 状態 | 根拠・備考 |
|---|---|---|
| 各出力関数の許可キーと禁止領域の対応表がある | 記載済み | 上表に全3関数のトップレベル・ネスト許可キーと禁止領域を明記 |
| 有効な混在fixtureから模擬案件/所属権限/アカウントが漏れないか具体的に確認する | 確認済み | 13種のセンチネル値を配置した有効混在グラフに対し、`exportPublicCatalog`・`exportCatalogWithActors` 出力全体のキーと文字列を再帰走査し漏出 0 件を確認 |
| 未知フィールドの入力拒否、出力除外、公開ポリシー未定を別判定にする | 確認済み | テスト 3 および本文「入力拒否・出力除外・公開ポリシー未定の区別」で 3 区分を分離検証 |
| 基点/提出head/実行SHA、正確なコマンド、期待/実測、終了コード、残課題を記録し、別担当者が追試・要求照合した | 一部未完了（提出head・第三者追試待ち） | ローカル実測記載済み。提出head記録・第三者追試待ち |
| 必要CIの最終head結果を記録し、未実施/skip/失敗を合格にしない | 未実施（push・Draft PR作成待ち） | push・Draft PR作成後に通常CI結果を PR 本文へ記録予定 |

---

## 未実施・検証限界・残存リスク

- 本テストは転送オブジェクト生成関数の純粋単体検証であり、公開 HTTP API・認証/認可（#7）・XSS 全般対策・自由文の機微情報公開ポリシー（Q03）を保証しない。
- 実在活動データ・実個人情報は一切使用していない（すべて合成値と `example.invalid`）。
- 第三者レビュー・通常 CI 確認・所有者受領は未完了。
