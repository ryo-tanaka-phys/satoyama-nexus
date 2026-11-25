import type { Metadata } from 'next';
import './style.css';

export const metadata: Metadata = {
  title: 'Satoyama Nexus | Phase 1 実証ワークベンチ (M2-M4)',
  description: '里山保全を起点とする地域協働の実証用プラットフォーム（Phase 1 模擬環境）'
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
