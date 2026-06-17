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
      <body className="min-h-full flex flex-col bg-cyber-black text-gray-100 antialiased relative selection:bg-neon-cyan selection:text-black overflow-x-hidden">
        {/* Background Grids */}
        <div className="fixed inset-0 cyber-grid -z-20 pointer-events-none" />
        <div className="fixed inset-0 cyber-grid-radial -z-10 pointer-events-none" />
        
        {/* 3D Esports Arena perspective floor */}
        <div className="cyber-arena-floor" />
        
        {/* Sweeping diagonal laser spotlights */}
        <div className="cyber-spotlight spotlight-1" />
        <div className="cyber-spotlight spotlight-2" />

        {/* Floating cyber ambient sparks */}
        <div className="cyber-sparks-container">
          <div className="cyber-spark left-[8%] [animation-delay:0s] [animation-duration:11s]" />
          <div className="cyber-spark left-[22%] [animation-delay:2s] [animation-duration:8s] bg-[#ff007f] shadow-[#ff007f]" />
          <div className="cyber-spark left-[38%] [animation-delay:4s] [animation-duration:14s] bg-[#fffb00] shadow-[#fffb00]" />
          <div className="cyber-spark left-[55%] [animation-delay:1s] [animation-duration:9s]" />
          <div className="cyber-spark left-[72%] [animation-delay:5s] [animation-duration:13s] bg-[#8a2be2] shadow-[#8a2be2]" />
          <div className="cyber-spark left-[88%] [animation-delay:3s] [animation-duration:10s]" />
        </div>

        {/* Animated glowing mesh blobs */}
        <div className="fixed inset-0 overflow-hidden -z-15 pointer-events-none">
          <div className="neon-blob blob-cyan -top-[10%] -left-[10%]" />
          <div className="neon-blob blob-magenta -bottom-[15%] -right-[10%]" />
          <div className="neon-blob blob-yellow top-[20%] right-[10%]" />
          <div className="neon-blob blob-purple bottom-[30%] left-[20%]" />
        </div>

        {/* CRT Scanline effect */}
        <div className="scanline" />
        
        {children}
      </body>
    </html>
  );
}
