import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Painel BI - Konica Minolta',
  description: 'Dashboard corporativo para monitoramento de frotas de impressoras',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}
