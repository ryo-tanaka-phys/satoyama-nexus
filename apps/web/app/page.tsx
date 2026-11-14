import profiles from '../../../data/fixtures/simulated-profiles.json';
export default function Home() {
  return <main><p className="eyebrow">SATOYAMA NEXUS / M0 FOUNDATION</p>
    <h1>里山の協働を、<br />確かな一歩から。</h1>
    <p>市民・団体・専門家をつなぐ実証用プラットフォームです。</p>
    <aside aria-label="実証環境の注意">Phase 1：すべての依頼・調整・合意は模擬処理です。外部への連絡は行いません。</aside>
    <section><h2>実在する活動の公開情報</h2><p>未登録。出典と参照日を確認した公開情報を、模擬プロフィールと区別して追加します。</p></section>
    <section><h2>模擬プロフィール</h2>{profiles.map(p => <article key={p.id}><strong>{p.displayName}</strong><p>架空の参加者 · {p.skills.join('、')}</p></article>)}</section>
    <section><h2>協働までの流れ</h2><ol><li>AI一次推薦（M0は未接続）</li><li>人間による二次審査</li><li>模擬依頼 → 調整 → 合意 → 実施準備</li></ol><p>地理的適合性・推薦・審査画面は今後実装します。</p></section>
  </main>;
}
