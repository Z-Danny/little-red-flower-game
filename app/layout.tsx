import type { Metadata, Viewport } from 'next';
import './globals.css';
// Shared game-surface overrides must follow every legacy player stylesheet.
import './game-viewport.css';

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export const metadata: Metadata = {
  title: '小红花应急行动｜把正确的选择练成反应',
  description: '一款面向手机端的公益应急科普闯关游戏。',
  openGraph: {
    title: '小红花应急行动',
    description: '把正确的选择练成第一反应。六个可交互的公益应急训练关卡。',
    type: 'website',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: '小红花应急行动' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '小红花应急行动',
    description: '把正确的选择练成第一反应。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
