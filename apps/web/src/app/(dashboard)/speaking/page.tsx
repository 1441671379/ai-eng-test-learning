import { requireAppUser } from "@/lib/app-session";
import { experimentDatabase } from "@/lib/experiments/server";
import { listExperiments } from "@/lib/experiments/database";
import { ExperimentOverview } from "@/components/experiments/ExperimentOverview";
export default async function Page() {
  const { user } = await requireAppUser("/speaking");
  const sessions = await experimentDatabase(user.id, db => listExperiments(db).filter(item => item.kind !== "time-alignment"));
  return <ExperimentOverview key={user.id} initialSessions={sessions} />;
}
