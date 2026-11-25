# #6（M1-04）地理情報・参加条件・必要資源のドメイン契約

基準: `docs/product/requirements.md` v0.1 と変更履歴、ADR 0001、ADR 0002、M1 設計 D01/D03/D05。既存 M0・#4・#5 の型と検証関数は変更せず、`packages/domain/src/location-conditions.ts` に SDK 非依存・DB 非依存の純粋ドメイン契約として追加する。

## 到達範囲（M1-04）
- **位置情報（`ActivityLocation` / `GeoPoint4326`）**:
  - SRID 4326 を固定し、緯度 `[-90, 90]`・経度 `[-180, 180]` の有限値検証を行う。
  - 欠損・不明位置は `coordinates: null` として保持し、`precision: 'unknown'` に対して `(0, 0)` 等の推定座標・原点補完を拒否する。
  - 精度（`venue` / `approximate` / `administrative-area` / `unknown`）、公開粒度（`venue` / `district` / `municipality` / `prefecture` / `withheld`）、取得根拠、確認日、出典（公開活動は必須）を保持し、1 活動改訂に対する複数拠点を別レコードで表現する。
- **参加条件（`ParticipationCondition` / `ConditionFieldState<T>`）**:
  - 各条件項目で `not-stated`（未記載）・`unknown`（不明）・`no-restriction`（制約なし）・`specified`（指定あり）を型と実行時検証の双方で明確に区別する。
  - IANA タイムゾーン（例: `Asia/Tokyo`）とオフセット付き ISO 日程（`endAt >= startAt`）、技能、資格、定員、費用、持参物、移動手段、年齢等制約、要確認事項、出典を活動改訂 `(activityId, activityRevision)` に紐付けて保持する。
- **必要資源・技能申告（`ResourceRequirement` / `ActorSkillDeclaration`）**:
  - 必要資源（人手・技能・道具・資材・拠点等）を活動改訂または案件改訂へ紐付け、公開活動所有時は出典を必須とする。
  - 技能申告は `qualificationStatus: 'unverified'` に固定し、専門家属性や技能申告だけで資格確認済みとしない。
- **非断定サマリー（`summarizeParticipationReadiness`）**:
  - 距離 `0m` や専門家属性・技能申告があっても、`canParticipate: null`・`qualificationVerified: false`・`status: 'requires-matching-and-human-review'` を返し、距離だけで参加可能と断定しない。

## 未確定・後続工程へ残す範囲
- 面表現・行政区域ポリゴン（Q04）、距離・移動時間閾値、推薦スコア計算と経路計算（M2）。
- 機微情報の収集範囲・公開ポリシー（Q03）、資格確認や審査操作の権限保証（#7 / M3）。
- PostGIS `geography(Point, 4326)`・GiST 索引による DB 永続化と空間検索（#8）。
- 外部連絡・実在データ収集・実 AI は一切導入しない。
