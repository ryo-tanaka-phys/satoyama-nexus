import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = { title: 'Satoyama Nexus | M0', description: '里山協働の実証用プラットフォーム' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="ja"><body>{children}</body></html>;
}
