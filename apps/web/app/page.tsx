import { getActiveWorkbench } from '../lib/workbench-runtime';
import { SimulationWorkbenchClient } from './workbench';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const initialSnapshot = await getActiveWorkbench().getSnapshot();
  return <SimulationWorkbenchClient initialSnapshot={initialSnapshot} />;
}
