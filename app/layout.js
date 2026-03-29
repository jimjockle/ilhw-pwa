import './globals.css';

export const metadata = {
  title: 'I Live Here Westchester',
  description: 'Your AI guide to Westchester County',
  themeColor: '#1B3A4B',
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ILHW" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1B3A4B" />
      </head>
      <body className="bg-brand-dark text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
