import type { Metadata } from 'next';
import './style.css';

export const metadata: Metadata = {
  title: 'Satoyama Nexus | 九州大学周辺 里山協働 模擬プラットフォーム',
  description: '里山保全を起点とする地域協働の模擬プラットフォーム（九州大学周辺デモ環境）'
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
