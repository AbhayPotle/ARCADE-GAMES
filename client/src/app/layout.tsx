import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArcadeVerse | Cyberpunk Gaming Platform",
  description: "Next-generation real-time multiplayer gaming platform. Connect, compete, climb leaderboards and win challenges in Chess, Carrom, Typing Speed, Racing, and Endless Runner.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#030209",
};

export default function RootLayout({
  children,
  ...props
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#030209" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-full flex flex-col bg-cyber-black text-gray-100 antialiased relative selection:bg-neon-cyan selection:text-black">
        {/* Background Grids */}
        <div className="fixed inset-0 cyber-grid -z-20 pointer-events-none" />
        <div className="fixed inset-0 cyber-grid-radial -z-10 pointer-events-none" />
        {/* CRT Scanline effect */}
        <div className="scanline" />
        
        {children}
      </body>
    </html>
  );
}
