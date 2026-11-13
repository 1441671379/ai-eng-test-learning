import { notFound } from "next/navigation";
import { requireAppUser } from "@/lib/app-session";
import { experimentDatabase } from "@/lib/experiments/server";
import { listExperiments, readExperiment } from "@/lib/experiments/database";
import { ExperimentError } from "@/lib/experiments/types";
import { ExperimentCoach } from "@/components/experiments/ExperimentCoach";
export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const { user } = await requireAppUser("/speaking/coach"), { session: id } = await searchParams;
  const initial = id ? await experimentDatabase(user.id, db => readExperiment(db, id)).catch(error => { if (error instanceof ExperimentError) notFound(); throw error; }) : null;
  if (initial && initial.kind !== "coach") notFound();
  const recent = await experimentDatabase(user.id, db => listExperiments(db).filter(item => item.kind === "coach"));
  return <ExperimentCoach key={`${user.id}:${initial?.id || "new"}`} initialSession={initial} recentSessions={recent} />;
}
