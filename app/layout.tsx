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
        
        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-26MD0VDQ2F"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-26MD0VDQ2F');
          `}
        </Script>
      </body>
    </html>
  );
}
