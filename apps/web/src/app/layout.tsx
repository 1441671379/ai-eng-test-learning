import { localizedMetadata } from "@/lib/i18n/server";

import { UiText } from "@/components/i18n/UiLocale";
// FILE: src/app/layout.tsx
import { Funnel_Display, Sour_Gummy } from "next/font/google";
import "./globals.css";
import "./learning.css";
import "./listening.css";
import "./speaking.css";
import "./vocabulary.css";
import "./phrases.css";
import "./writing.css";
import "./utilities.css";
import "./motion.css";
import "lenis/dist/lenis.css";
import { UiLocaleProvider } from "@/components/i18n/UiLocale";
import { getUiLocale } from "@/lib/i18n/server";
import { AppShell } from "@/components/ui/app-shell";
import { getRequestRuntime } from "@/lib/services/runtime";

const funnelDisplay = Funnel_Display({
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-funnel-display",
});

const sourGummy = Sour_Gummy({
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-sour-gummy",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function generateMetadata() { return localizedMetadata({
  metadataBase: new URL(appUrl), applicationName: "English Learning",
  title: { template: "%s | 英语学习空间", default: "英语学习空间" },
  description: "在本机练习英语听力、阅读、写作、单词与口语练习，连接学习记录和词汇积累。",
  robots: { index: false, follow: false },
}); }

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtime = await getRequestRuntime();
  const locale = await getUiLocale();

  return (
    <html lang={locale} className={`${funnelDisplay.variable} ${sourGummy.variable}`} suppressHydrationWarning>
      <body
        className={`${funnelDisplay.className} min-h-screen bg-vanilla-cream`}
      >
        <UiLocaleProvider locale={locale}><AppShell runtime={runtime}><UiText text={children} /></AppShell></UiLocaleProvider>
      </body>
    </html>
  );
}
