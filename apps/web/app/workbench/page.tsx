import Link from 'next/link';
import { getActiveWorkbench } from '../../lib/workbench-runtime';
import { SimulationWorkbenchClient } from '../workbench';

export const dynamic = 'force-dynamic';

export default async function WorkbenchPage() {
  const initialSnapshot = await getActiveWorkbench().getSnapshot();
  return (
    <>
      <nav className="venue-topnav">
        <div className="venue-topnav-inner">
          <Link href="/" className="venue-brand">
            Satoyama Nexus
          </Link>
          <div className="venue-nav-links">
            <Link href="/" className="nav-pill">
              SNS風 模擬の場へ戻る
            </Link>
            <Link href="/werewolf" className="nav-pill">
              人狼モード（体験用）
            </Link>
            <span className="nav-pill nav-pill-active">裏方検証ワークベンチ (M1-M4)</span>
          </div>
        </div>
      </nav>
      <SimulationWorkbenchClient initialSnapshot={initialSnapshot} />
    </>
  );
}
