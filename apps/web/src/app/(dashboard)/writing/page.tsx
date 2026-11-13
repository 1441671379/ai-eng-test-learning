import { localizedMetadata } from "@/lib/i18n/server";

import { WritingWorkspace } from "@/components/writing/WritingWorkspace";
import { requireAppUser } from "@/lib/app-session";
export async function generateMetadata() { return localizedMetadata({ title: "写作练习" }); }
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const session = await requireAppUser("/writing"), { id } = await searchParams;
  return <WritingWorkspace key={session.user.id} userId={session.user.id} initialId={typeof id === "string" ? id : undefined} />;
}
