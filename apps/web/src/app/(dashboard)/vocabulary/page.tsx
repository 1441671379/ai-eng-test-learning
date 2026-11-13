import { localizedMetadata } from "@/lib/i18n/server";

import { requireAppUser } from "@/lib/app-session";
import { VocabularyWorkspace } from "@/components/vocabulary/VocabularyWorkspace";
export async function generateMetadata() { return localizedMetadata({ title: "单词记忆" }); }
export default async function Page() {
  await requireAppUser("/vocabulary");
  return <VocabularyWorkspace />;
}
