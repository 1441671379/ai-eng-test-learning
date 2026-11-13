import { localizedMetadata } from "@/lib/i18n/server";

import { SpeakingFrame } from "@/components/experiments/SpeakingFrame";
import { requireAppUser } from "@/lib/app-session";
import { cookies } from "next/headers";
import { SpeakingDisplayProvider } from "@/components/experiments/SpeakingDisplay";
import { parseSpeakingDisplay, SPEAKING_DISPLAY_COOKIE } from "@/lib/speaking-display";
export async function generateMetadata() { return localizedMetadata({ title: "说", robots: { index: false, follow: false } }); }
export default async function ExperimentLayout({ children }: { children: React.ReactNode }) {
  await requireAppUser("/speaking");
  const preferences = parseSpeakingDisplay((await cookies()).get(SPEAKING_DISPLAY_COOKIE)?.value);
  return <SpeakingDisplayProvider preferences={preferences}><SpeakingFrame>{children}</SpeakingFrame></SpeakingDisplayProvider>;
}
