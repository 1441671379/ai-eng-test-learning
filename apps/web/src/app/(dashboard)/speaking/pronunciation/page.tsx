import { notFound } from "next/navigation";
import { requireAppUser } from "@/lib/app-session";
import { experimentDatabase } from "@/lib/experiments/server";
import { readExperiment } from "@/lib/experiments/database";
import { ExperimentError } from "@/lib/experiments/types";
import { ExperimentPronunciation } from "@/components/experiments/ExperimentPronunciation";
export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const { user } = await requireAppUser("/speaking/pronunciation"), { session: id } = await searchParams;
  const initial = id ? await experimentDatabase(user.id, db => readExperiment(db, id)).catch(error => { if (error instanceof ExperimentError) notFound(); throw error; }) : null;
  if (initial && initial.kind !== "pronunciation") notFound();
  return <ExperimentPronunciation key={`${user.id}:${initial?.id || "new"}`} initialSession={initial} />;
}
