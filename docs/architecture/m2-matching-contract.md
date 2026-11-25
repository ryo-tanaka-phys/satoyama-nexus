# M2 Matching 設計・契約記録

基準: `docs/product/requirements.md` v0.1（要件 3・4・6、M2 Matching、未確定事項 Q04）、ADR 0001、ADR 0002、M1 受け入れ引継ぎ（`docs/decisions/m1-acceptance-handoff.md`）。

## 到達範囲（`packages/matching/src/m2.ts`）
- **既存 M0 互換維持**: `geographicFit(...)` は変更せず維持。
- **依存境界**: `@satoyama/matching` は `@satoyama/domain` のみに依存し、DB ドライバ・UI・AI SDK へ依存しない。PostGIS 距離は `SpatialDistanceQueryResult` を経由して注入可能。
- **地理適合性評価（`evaluateGeographicSuitability`）**:
  - SRID 4326 距離（メートル）を算出または PostGIS 計算値を受領。
  - 欠損位置（`coordinates: null` / `precision: 'unknown'`）は `distanceMeters: null` のまま保持し、原点補完・近接断定を行わない。
  - 粗精度（`approximate` / `administrative-area`）には `coarsePrecisionCaveat: true` を付与し、移動手段の一致/不一致/未確定を併記。`travelFeasibilityConfirmed` は常に `false`。
- **技能・資格・参加意欲の統合（`evaluateSkillAlignment` / `evaluateInterestSignal` / `recommendSimulationCandidates`）**:
  - 公開主体（`domain: 'public-catalog'`）は候補プールから除外し、明示指定時は拒否する。
  - 専門家属性や技能申告だけで `qualificationVerified: true` にしない（常に `false`）。
  - すべての推薦は `status: 'requires-ai-and-human-review'`・`canParticipate: null`・`impliesAgreement: false` とし、暫定スコア（設定可能な `MatchingPolicyConfig`）と不確実性一覧・要確認事項を併記する。

## 未確定・次工程（M3 / M4）へ残す範囲
- 本番の距離/移動時間閾値・重み付け・行政区域ポリゴン評価（Q04）。
- 実際の公共交通経路・所要時間計算。
- AI 一次推薦と人間二次審査 UI（M3）、模擬協働遷移 UI（M4）。
