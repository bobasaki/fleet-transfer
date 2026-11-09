import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import SplashScreen from "./components/SplashScreen";
import "./globals.css";

const font = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono-var",
  display: "swap",
});

export const metadata = {
  title: "Fleet Transfer",
  description: "Transfer log za vozače",
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('fleet-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.setAttribute('data-theme','dark');}else{document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hr" className={`${font.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)" />

        {/* Flash-free theme init — must run before first paint */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />

        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* iOS Safari installability */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Transfer" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>
        <SplashScreen />
        {children}

        {/* Register service worker after page is interactive */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(function(err) {
              console.warn('SW registration failed:', err);
            });
          }
        `}</Script>
      </body>
    </html>
  );
}
