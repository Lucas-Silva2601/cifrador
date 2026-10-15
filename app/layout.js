import './globals.css';

export const metadata = {
  title: 'Cifrador — seu repertório, no seu tom',
  description: 'Crie, organize, transponha e imprima suas cifras.',
};

export const viewport = {
  themeColor: '#151a17',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
