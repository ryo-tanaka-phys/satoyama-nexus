import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function WerewolfModePage() {
  return (
    <>
      <nav className="venue-topnav">
        <div className="venue-topnav-inner">
          <Link href="/" className="venue-brand">
            Satoyama Nexus
          </Link>
          <div className="venue-nav-links">
            <Link href="/" className="nav-pill">
              通常モード（本体）
            </Link>
            <span className="nav-pill nav-pill-active">人狼モード（体験デモ専用・本体分離）</span>
            <Link href="/workbench" className="nav-pill">
              裏方検証ワークベンチ
            </Link>
          </div>
        </div>
      </nav>
      <main>
        <p className="eyebrow">SEPARATED DEMO WRAPPER · WEREWOLF ROLEPLAY MODE</p>
        <h1>人狼モード（第2部・参加型ロールプレイ入口）</h1>
        <aside className="phase-banner">
          この画面は体験デモ専用の分離ラッパーです。大本のシステム制約（M1 認証境界・自己審査禁止・公開／模擬分離・企業分離）を保ったまま、運営役を据え置いて参加者へ役柄を抽選割り当てします。
        </aside>

        <section className="card">
          <h2>抽選ロビー（P7 でリアルタイム抽選・自動セッション割当を接続予定）</h2>
          <p>
            第2部の参加型体験では、運営役（1名）を据え置いた状態で、参加端末へ以下の4役をランダムに抽選配布します。
          </p>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div className="card card-muted">
              <h3>抽選対象の4役</h3>
              <ul>
                <li>一般市民（能動マッチング／宛てがない人の紹介希望）</li>
                <li>専門家候補（一般市民枠＋運営からの資格認証）</li>
                <li>市民団体（未認証スタート → 運営の団体認証で機能解放）</li>
                <li>自治体窓口（要望・レポート受け皿＋各アカウントへのオファー発信）</li>
              </ul>
            </div>
            <div className="card card-muted">
              <h3>本体システムとの分離方針</h3>
              <p>
                抽選・ルーム管理は <code>simulation.demo_werewolf_room</code> / <code>demo_werewolf_assignment</code> に分離保持し、割当後は通常モードと同じサーバー管理 HttpOnly Cookie セッションへ接続します。
              </p>
              <div style={{ marginTop: 12 }}>
                <Link href="/" className="btn-link">
                  ← 通常モード（第1部 5人実演・新規登録）へ戻る
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
