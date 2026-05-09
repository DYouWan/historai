import { AppShell } from "@/components/AppShell";
import type { Metadata } from "next";
import { DM_Sans, Noto_Serif_SC } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const display = Noto_Serif_SC({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "HistorAI · 历史人物创作",
  description: "历史人物向创作：人物向系列与人物、AI 辅助、文案与分镜、轻剪辑",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${sans.variable} ${display.variable} min-h-screen bg-zinc-950 font-sans antialiased`}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
