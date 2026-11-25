import { getWorkbench } from '../lib/simulation-store';
import { SimulationWorkbenchClient } from './workbench';

export const dynamic = 'force-dynamic';

export default function Home() {
  const initialSnapshot = getWorkbench().getSnapshot();
  return <SimulationWorkbenchClient initialSnapshot={initialSnapshot} />;
}
