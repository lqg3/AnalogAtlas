import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AnalogAtlas',
  description: 'Multi-dimensional planetary analog search',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
