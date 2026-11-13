import { localizedMetadata } from "@/lib/i18n/server";

import { ListeningWorkspace } from "@/components/listening/ListeningWorkspace";
import { requireAppUser } from "@/lib/app-session";
export async function generateMetadata() { return localizedMetadata({ title: "听力学习" }); }
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const session = await requireAppUser("/listening");
  const { id } = await searchParams;
  return <main><ListeningWorkspace key={session.user.id} initialLessonId={typeof id === "string" ? id : undefined} /></main>;
}
