import { localizedMetadata } from "@/lib/i18n/server";

import { UiText, UiElement } from "@/components/i18n/UiLocale";
import Link from "next/link";
import { LanguageSettings } from "@/components/i18n/LanguageSettings";
import { requireAppUser } from "@/lib/app-session";
import { PianoIcon } from "@/components/ui/piano-icon";
import { LearnerSettings } from "@/components/learning/LearnerSettings";
import { TtsVoiceSettings } from "@/components/speech/TtsVoiceSettings";
import { SpeakingDisplaySettings } from "@/components/experiments/SpeakingDisplaySettings";
import { parseSpeakingDisplay, SPEAKING_DISPLAY_COOKIE } from "@/lib/speaking-display";
import { cookies } from "next/headers";
export async function generateMetadata() { return localizedMetadata({ title: "用户与设置" }); }
export default async function Page() {
  const session = await requireAppUser("/settings");
  const speakingPreferences = parseSpeakingDisplay((await cookies()).get(SPEAKING_DISPLAY_COOKIE)?.value);
  return <main className="utility-page settings-page">
    <header className="utility-heading"><h1><UiText text="用户与设置" /></h1><p><UiText text="统一管理学习身份与各板块的设置。" /></p></header>
    <UiElement as="nav" className="settings-index" aria-label="设置分组"><a href="#learner"><UiText text="当前学习者" /></a><a href="#interface-language"><UiText text="界面语言" /></a><a href="#language-model"><UiText text="全局语言模型" /></a><a href="#speaking-feedback-display"><UiText text="口语反馈显示" /></a><a href="#voice-settings"><UiText text="全局语音音色" /></a></UiElement>
    <div className="settings-basics"><section id="learner" className="settings-section"><h2><UiText text="当前学习者" /></h2>{session.mode === "local" ? <LearnerSettings displayName={session.user.displayName} /> : <p>{session.user.displayName}</p>}<p className="settings-hint"><UiText text="学习记录按用户保存，修改名称保留原有记录与进度。本地用户数据保存在这台电脑。" /></p></section><LanguageSettings /></div>
    <section id="language-model" className="settings-section settings-model-link"><div><h2><UiText text="全局语言模型" /></h2><p className="settings-description"><UiText text="配置服务地址、模型名称和 API Key，统一用于各板块的语言模型功能。" /></p></div><Link href="/settings/models" className="piano-button"><UiText text="配置模型" /><PianoIcon name="arrow-right" /></Link></section>
    <SpeakingDisplaySettings initialPreferences={speakingPreferences} /><TtsVoiceSettings />
  </main>;
}
