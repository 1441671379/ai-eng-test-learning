import { localizedMetadata } from "@/lib/i18n/server";

import { UiText } from "@/components/i18n/UiLocale";
import { requireAppUser } from "@/lib/app-session";
import { LearningRecords } from "@/components/learning/LearningRecords";
export async function generateMetadata() { return localizedMetadata({ title: "学习记录" }); }
export default async function Page() {
  const session = await requireAppUser("/records");
  return <main className="utility-page records-page"><header className="utility-heading"><h1><UiText text="学习记录" /></h1><p>{session.user.displayName} <UiText text="的练习历史" /></p></header><LearningRecords /></main>;
}
