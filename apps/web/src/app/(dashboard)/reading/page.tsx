import { localizedMetadata } from "@/lib/i18n/server";
import { ReadingWorkspace } from "@/components/reading/ReadingWorkspace";
import { requireAppUser } from "@/lib/app-session";
export async function generateMetadata() { return localizedMetadata({ title: "阅读学习" }); }
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const session = await requireAppUser("/reading"); const { id } = await searchParams;
  return <ReadingWorkspace key={session.user.id} initialLessonId={typeof id === "string" ? id : undefined} />;
}
