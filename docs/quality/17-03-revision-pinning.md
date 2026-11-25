# 17-03（Issue #26）Activity・Actor 改訂の不変性と参照版固定 独立検証記録

## 共通証跡サマリー

- 親Issue: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/17 （#17）
- 子Issue URL / 設計ID / 読取日時: https://github.com/ryo-tanaka-phys/satoyama-nexus/issues/26 （`17-03` / #26） / 2026-11-25T12:07:42+09:00
- 担当（人間） / 独立レビュー者（別の人間）: `ryo-tanaka-phys`（所有者、推奨レーンA） / 独立レビュー者: 未確定（別の人間による要求照合・追試待ち）
- G0承認根拠 / 必要なG18・G19承認URL: G0承認済み（2026-11-18 所有者の「共同開発Issue再構成の実装指示」、PR #20 `7159a8a07de6690407aec51e7726d566d804ec57`）。G18・G19は本Issueでは対象外（未承認維持）。
- source SHA / guide SHA / 依存成果SHA:
  - `source SHA`: `fea96c2305a1ddfda2a291312c98bf21a5894432`（PR #12 `codex/m1-05-provenance` head）
  - `guide SHA`: `7159a8a07de6690407aec51e7726d566d804ec57`（PR #20 `refs/pull/20/head` を読取専用 ref `refs/remotes/origin/c0-guide` で参照）
  - 参照固定SHA（PR #10 ADR 0002）: `8aba5a1566d0890c6c33794f97b2a2f0fc2d70c5`
  - `依存成果SHA`: なし
- 作業ブランチ / 提出PR base: `codex/issue-26-17-03` / `codex/m1-05-provenance`
- 許可ファイル / 非対象:
  - 許可ファイル: `tests/quality/17-03-revision-pinning.test.ts`・`docs/quality/17-03-revision-pinning.md` のみ
  - 非対象: `packages/domain/**`・既存テスト（`tests/m1-*.test.ts`・`tests/foundation.test.ts`）・`package.json`・`pnpm-lock.yaml`・DB永続化（#8）・Actor参照の新たな版固定仕様追加・一般訂正ルール・17-02 の出典確認状態試験・17-04 のカタログ出力 allowlist 試験・既存PR更新・`main`への直接push/merge・Issue自動close
- OS・Node・pnpm・必要なDockerの版:
  - OS: Windows (`Microsoft Windows NT 10.0.26300.0`) / Shell: Windows PowerShell `5.1.26100.10068`（`ExecutionPolicy=AllSigned`、`pnpm.cmd` で実行）
  - Node.js: `v24.22.0` / pnpm: `11.25.0` / Vitest: `5.1.0` / TypeScript: `5.9.3` / Next.js: `16.4.6`
  - Docker: ローカル本検証では対象外（純粋ドメイン単体テスト。通常CIでは独立 PostGIS スモークを含む verify ジョブを実行）
- 提出head SHA: 本コミット確定後に Draft PR 本文へ記録
- CI URL / event / run.head_sha / 実際のcheckout SHA: 未実施（push・Draft PR作成前。push/Draft PR作成後に通常CIの最終head結果をPR本文へ記録）
- 未実施・skip・不合格・残存リスク: 後述「資料と実装の非対称性・未実施・検証限界」に記載
- AI補助確認（使用の有無・範囲）: 使用あり（原典・既存コード/テスト読取、未カバー境界の抽出、`tests/quality/17-03-revision-pinning.test.ts` 実装・実行、本記録作成補助）。人間の独立レビュー・所有者の成果受領を代替しない。
- 人間の独立レビューURL / 対象head / 判定: 未実施（Draft PR提出・第三者追試待ち）
- 所有者の成果受領URL: 未受領

---

## 読取済み正本

| 資料 | 参照元 / SHA | 区分 |
|---|---|---|
| `docs/product/requirements.md`（要件v0.1と変更履歴） | `source` `fea96c2` | 確定事項（要件1〜11、M0〜M6維持） |
| `docs/decisions/0001-m0-foundation.md`（ADR 0001） | `source` `fea96c2` | M0実装方針 |
| `docs/decisions/0002-m1-domain.md`（ADR 0002） | `source` `fea96c2` / PR #10 `8aba5a1` | M1確定事項・未確定事項 |
| `docs/architecture/m1-domain-design.md`・`m1-minimum-contract.md`・`m1-provenance-contract.md` | `source` `fea96c2` | D01〜D08・#4最小契約・#5出典/活動改訂・公開Actor補完契約 |
| `packages/domain/src/{index.ts,m1.ts,provenance.ts,actor-provenance.ts}` | `source` `fea96c2` | 読取のみ（変更禁止） |
| `tests/{foundation,m1-domain,m1-migration,m1-provenance,m1-actor-provenance}.test.ts` | `source` `fea96c2` | 既存19テスト（読取のみ・重複回避の基準） |
| `AGENTS.md`・`CONTRIBUTING.md`・`docs/collaboration/ai-workflow.md`・`onboarding.md` | PR #20 `7159a8a` | G0承認済みの共同開発手順 |
| 親Issue #17・子Issue #26（および隣接 #24/#25/#27 の境界） | GitHub API（2026-11-25取得） | 状態: Ready |

---

## Activity 版固定と Actor 履歴保持の区別

Issue #26 の要件に従い、現行契約における Activity と Actor の扱いを明確に区別して検証した。

1. **Activity の参照版固定（`Case` / `Need`）**:
   - `CollaborationCase.activity` は `{ id, domain, revision }` を持ち、`Need.owner`（`kind: 'activity'`）も `{ kind, id, revision }` を持つ。
   - `validateDomainGraph` は `activityRevisions` から該当 `(id, revision)` を解決し、`appendActivityRevision` で活動を `1 → 2 → 3` と改訂しても、既存の `Case`（rev 1・rev 2 参照）および Activity 所有 `Need`（rev 1・rev 2 参照）の参照版は書き換わらない。
2. **Actor の改訂履歴保持（`actorRevisions`）**:
   - `ActorProvenanceGraph` は `actorRevisions` と `actorAssertions` により、Actor の `1 → 2 → 3` の過去スナップショットと項目根拠を追記保持する。
   - 一方で `CaseParty` は `{ actorId, role }` のみを保持し、Actor の版番号（`actorRevision` 等）を固定する契約は存在しない。本検証では `CaseParty` に未承認の新規版固定仕様を要求せず、現行契約どおり `actorRevisions` による履歴保持と `CaseParty` の非版固定を区別して確認した。

---

## 要求 → 既存被覆 → 追加検証（17-03）→ 結果の対応表

既存 19 テスト（特に `tests/m1-provenance.test.ts`・`tests/m1-actor-provenance.test.ts`）と重複させず、未カバー境界のみを `tests/quality/17-03-revision-pinning.test.ts` に追加した。

| 検証領域 | 既存テスト被覆（PR #12 `fea96c2`） | 17-03 追加検証（`17-03-revision-pinning.test.ts`） | 判定・分類 |
|---|---|---|---|
| Activity 1→2 改訂・Case 1件の rev 1 固定 | `m1-provenance.test.ts`: 1→2 と `case.activity.revision === 1` を検証済み | 重複追加せず、**2→3 改訂時に `case-r1`/`case-r2` および Activity 所有 `need-r1`/`need-r2` の双方が rev 1・rev 2 に固定され続けること**を検証 | **追加・PASS** |
| `appendActivityRevision` の深い不変性 | `m1-provenance.test.ts`: `next.sources[0].summary` の変更のみ検証済み | 呼出し後に**入力引数（`revision.title`・`source.usage`・`assertion.target`/`value`）および返却値（`activityRevisions[0]`・`cases[0].activity`・`needs[0].owner`・`assertions[0].target`・`sources[0].usage`）を深く改変**し、事前 `structuredClone` スナップショットと値一致を比較 | **追加・PASS** |
| Activity 改訂時の上書き・版飛ばし・domain変更 | `m1-provenance.test.ts`: `appendActivityRevision` の rev 1 上書き・1→3 飛ばし・domain 変更を検証済み | 既存被覆として再利用（重複テスト追加なし） | 既存被覆 |
| Activity 履歴の head 不一致・未来版・孤立・重複・Need 不正版 | **未カバー**（`validateDomainGraph`/`validateProvenanceGraph` の履歴整合経路はテストなし） | head title 不一致 (`Missing current activity revision`)、head 版欠落 (`Missing current activity revision`)、未来版 (`Invalid activity history`)、孤立活動 (`Invalid activity history`)、重複版 (`Duplicate activity revision`)、Activity 所有 Need の存在しない版 (`Invalid need owner`) を検証 | **追加・PASS** |
| Activity 履歴の連続性欠損（`[1, 3]`、rev 2 欠損） | **未カバー** | 外部構築された `activityRevisions: [rev 1, rev 3]`（head=rev 3）が `validateProvenanceGraph` で**拒否されず通過する**現行挙動を観測・記録（下記「資料と実装の非対称性」参照） | **仕様未定・非対称性として報告** |
| Actor 改訂履歴保持（2→3）と `CaseParty` 区別 | `m1-actor-provenance.test.ts`: 1→2 のみ検証済み | 公開 Actor の **1→2→3 改訂**（3版全スナップショット・全9件の `actorAssertions` 保持）と、模擬 Actor の 1→2 改訂時に `CaseParty` が `actorId` のみ参照し `actorRevision` を持たないことを確認 | **追加・PASS** |
| `appendActorRevision` の深い不変性 | `m1-actor-provenance.test.ts`: `g.actors[0].displayName` の浅い比較のみ | 呼出し後に**入力引数（`updatedActor.displayName`・`expertise[0].label`/`evidence`・`assertions[0].target`/`value`）および返却値（過去版 `expertise`・`actorAssertions`）を深く改変**し、事前 `structuredClone` と値一致を比較 | **追加・PASS** |
| Actor 上書き・domain変更・空履歴・`displayName` head不一致 | `m1-actor-provenance.test.ts`: rev 1 上書き、`domain` 変更、空 `actorRevisions`、`displayName` head 不一致を検証済み | 既存被覆として再利用（重複テスト追加なし） | 既存被覆 |
| Actor 版飛ばし・`kind` 変更・履歴欠損・重複・孤立・旧版不整合・`expertise` head 不一致 | **未カバー** | `appendActorRevision`: 1→3 飛ばし・新規 rev 2 (`Invalid next actor revision`)、`kind` 変更 (`Actor classification change requires review`)。`validateActorProvenanceGraph`: `[1, 3]` 欠損・`[2]` 開始 (`Missing actor history`)、重複 (`Duplicate actor revision`)、孤立 (`Invalid actor history`)、旧版 `kind` 不一致 (`Invalid actor history`)、`expertise` のみの head 不一致 (`Actor head mismatch`) を検証 | **追加・PASS** |

---

## 資料と実装の非対称性（未確定・報告事項）

製品コードは変更せず、以下の差異を所有者・レビュー者判断用の報告事項として記録する。

- **現象（Activity vs Actor の履歴連続性検証の非対称性）**:
  - `packages/domain/src/actor-provenance.ts`（`validateActorProvenanceGraph`）は `history.every((r, i) => r.revision === i + 1)` を検査しており、外部から構築された Actor 履歴に中間欠損（`[1, 3]`）や `2` 開始（`[2]`）があると `'Missing actor history'` で拒否する。
  - 一方、`packages/domain/src/m1.ts`（`validateDomainGraph`、`validateProvenanceGraph` から呼出）は各版が `r.revision <= head.revision` であること・重複がないこと・`head` 自身が `activityRevisions` に含まれることのみを検査し、`1..head.revision` の連続性は検査していない。
  - なお、`appendActivityRevision` 経由で追加する限りは `head ? head.revision + 1 : 1` を強制するため欠損は生じないが、永続化復元後や外部構築グラフを `validateProvenanceGraph` へ渡した際に `[1, 3]` のような欠損履歴が通過する。
- **再現手順**: `tests/quality/17-03-revision-pinning.test.ts` の 3 件目テスト内 `gappedActivityGraph`（`activities: [rev 3]`, `activityRevisions: [rev 1, rev 3]`, rev 1/rev 3 の title 出典付き）に対して `validateProvenanceGraph(gappedActivityGraph)` が例外を送出しない。
- **分類**: 契約文書（`m1-provenance-contract.md`）には `validateDomainGraph` へ渡す `activityRevisions` が部分スナップショットを許容するのか、Actor 同様に `1..N` 連続履歴を必須とするのか明記がないため、**仕様未定・非対称性**として報告する（無断で新仕様を追加しない）。

---

## 実行手順と実測結果

実行日: 2026-11-25（JST）。新規 clone ディレクトリ `satoyama-issue26`（`codex/issue-26-17-03` @ 基点 `fea96c2`）で実行した。

| # | コマンド | 期待結果 | 実測結果 | 終了コード | 所要時間 |
|---|---|---|---|---:|---:|
| 1 | `pnpm.cmd install --frozen-lockfile` | lockfile 無変更で依存導入 | `Packages: +72`、lockfile 無変更 | 0 | 5.8s |
| 2 | ベースライン `pnpm.cmd typecheck` / `test` / `build`（追加前） | 既存 5 ファイル 19 テスト・型検査・ビルド成功 | 19/19 passed、typecheck/build 成功 | 0 | — |
| 3 | `pnpm.cmd exec vitest run tests/quality/17-03-revision-pinning.test.ts` | 追加した 6 テスト全件成功 | `Test Files 1 passed (1)`、`Tests 6 passed (6)` | 0 | 2,652 ms |
| 4 | `pnpm.cmd typecheck` | 全パッケージ・root（追加テスト含む）エラー 0 | `domain` / `matching` / `ai-review` / `apps/web` / root すべて成功 | 0 | 10,251 ms |
| 5 | `pnpm.cmd test` | 全 6 ファイル 25 テスト成功 | `Test Files 6 passed (6)`、`Tests 25 passed (25)` | 0 | 2,080 ms |
| 6 | `pnpm.cmd build` | Next.js 本番ビルド成功 | `Next.js 16.4.6 (Turbopack)` ビルド・静的生成成功 | 0 | 7,881 ms |

---

## 受け入れ条件との対応表（子Issue #26 / `17-03`）

| 条件 | 状態 | 根拠・備考 |
|---|---|---|
| ActivityのCase/Need版固定とActorの改訂履歴保持を区別する | 確認済み | 文書「Activity 版固定と Actor 履歴保持の区別」およびテスト 1・4 で明確に分離し、未承認の `actorRevision` 仕様は追加していない |
| 入力・過去版・出典の不変性を値比較で確認する | 確認済み | テスト 2・5 で `structuredClone` スナップショットとの深い `toEqual` 比較を実施（入力改変・返却値改変の双方向） |
| 履歴連続性など資料と実装の差は不具合/未確定として報告し、無断で仕様を追加しない | 確認済み | `validateDomainGraph` vs `validateActorProvenanceGraph` の連続性検証非対称性を再現付きで報告し、`packages/domain/**` は未変更 |
| 基点/提出head/実行SHA、正確なコマンド、期待/実測、終了コード、残課題を記録し、別担当者が追試・要求照合した | 一部未完了（提出head・第三者追試待ち） | ローカル実測・残課題は記載済み。提出head SHA記録および別担当者による追試・要求照合は未実施 |
| 必要CIの最終head結果を記録し、未実施/skip/失敗を合格にしない | 未実施（push・Draft PR作成待ち） | push・Draft PR作成後に通常CI URL・`event`・`run.head_sha`・実 checkout SHA を PR 本文へ記録予定 |

---

## 未実施・検証限界・残存リスク

- **検証限界（本単体テストが保証しない範囲）**:
  - インメモリ純粋関数の単体テストであり、PostgreSQL/PostGIS 永続化・DB ロールによる履歴改ざん防止・トランザクション整合は保証しない（#8 範囲）。
  - 確認者（`checkedBy`）の本人確認・操作権限・自己審査禁止は保証しない（#7 範囲）。
  - 一般の訂正・補正ルール、機微項目の公開ポリシーは未実装のまま。
  - 出典確認状態の境界は 17-02（`#25`）、カタログ出力の allowlist/漏出検証は 17-04（`#27`）、Actor 参照・参加制約は 17-01（`#24`）の担当範囲として重複させていない。
- **未完了工程**:
  - 作業ブランチ `codex/issue-26-17-03` の push、Draft PR（base: `codex/m1-05-provenance`）作成、通常 CI 確認。
  - 作成者以外の別の人間による追試・要求照合。
  - 所有者による成果受領（Accepted）。
