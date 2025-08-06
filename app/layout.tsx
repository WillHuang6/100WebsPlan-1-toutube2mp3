import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Convert YouTube to MP3 - Free Online Converter",
  description: "Easily convert YouTube to MP3 with our free online YouTube to MP3 converter. Download high-quality audio from YouTube videos instantly. Fast, secure, and no registration required.",
  keywords: "convert youtube to mp3, youtube to mp3 converter, youtube mp3, download youtube audio, youtube to audio converter",
  metadataBase: new URL('https://www.ytb2mp3.site'),
  alternates: {
    canonical: 'https://www.ytb2mp3.site',
  },
  openGraph: {
    title: "Convert YouTube to MP3 - Free Online Converter",
    description: "The best way to convert YouTube to MP3. Fast, free, and high-quality audio conversion.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        
        {/* Google Analytics - 优化加载策略，避免被内容拦截器阻止 */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-26MD0VDQ2F"
          strategy="lazyOnload"
          onError={(e) => {
            console.log('GA加载被阻止，这是正常现象');
          }}
        />
        <Script id="google-analytics" strategy="lazyOnload">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){
              if (typeof dataLayer !== 'undefined') {
                dataLayer.push(arguments);
              }
            }
            
            // 检查GA是否可用
            if (typeof gtag !== 'undefined') {
              gtag('js', new Date());
              gtag('config', 'G-26MD0VDQ2F', {
                page_title: document.title,
                page_location: window.location.href
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
