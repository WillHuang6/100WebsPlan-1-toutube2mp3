import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YouTube to MP3 Converter - Fast & Free",
  description: "Convert YouTube videos to high-quality MP3 audio files instantly. Fast, free, and secure online converter.",
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
      </body>
    </html>
  );
}
