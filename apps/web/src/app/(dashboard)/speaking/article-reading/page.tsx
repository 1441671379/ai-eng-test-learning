import { localizedMetadata } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { requireAppUser } from "@/lib/app-session";
import { experimentDatabase } from "@/lib/experiments/server";
import { listExperiments, readExperiment } from "@/lib/experiments/database";
import { readReading } from "@/lib/reading-store";
import { ArticleReadingExperiment } from "@/components/experiments/ArticleReadingExperiment";

export async function generateMetadata() { return localizedMetadata({ title: "文章朗读评测" }); }
export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string; lesson?: string }> }) {
  const { user } = await requireAppUser("/speaking/article-reading"), query = await searchParams;
  const initial = query.session ? await experimentDatabase(user.id, db => readExperiment(db, query.session!)).catch(() => notFound()) : null;
  if (initial && (initial.kind !== "article-reading" || !initial.articleReading)) notFound();
  const lesson = !initial && query.lesson ? await readReading(user.id, query.lesson).catch(() => notFound()) : null;
  const initialSource = lesson ? { id: lesson.id, title: lesson.title, text: lesson.paragraphs.join("\n\n") } : null;
  const history = await experimentDatabase(user.id, db => listExperiments(db).filter(item => item.kind === "article-reading").slice(0, 10));
  return <ArticleReadingExperiment key={`${user.id}:${initial?.id || initialSource?.id || "new"}`} initialSession={initial} initialSource={initialSource} initialSessions={history} />;
}
