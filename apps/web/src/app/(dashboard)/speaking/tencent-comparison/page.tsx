import { requireAppUser } from "@/lib/app-session";
import { TencentComparison } from "@/components/experiments/TencentComparison";
import { ComparisonExperimentOne } from "@/components/experiments/ComparisonExperimentOne";
import { comparisonDatabase } from "@/lib/experiments/tencent-comparison/server";
import { listComparisons, readComparison } from "@/lib/experiments/tencent-comparison/store";
import { publicTencentSettings } from "@/lib/experiments/tencent-comparison/credentials";
import { resolveDataDir } from "@/lib/pairing/store";

export default async function Page({ searchParams }: { searchParams: Promise<{ record?: string; view?: string }> }) {
  const { user } = await requireAppUser("/speaking/tencent-comparison");
  const records = await comparisonDatabase(user.id, listComparisons);
  const query = await searchParams, config = await publicTencentSettings(resolveDataDir(), user.id);
  if (query.view === "raw") return <TencentComparison key={user.id} initialRecords={records} initialConfig={config} />;
  const initialRecord = query.record ? await comparisonDatabase(user.id, db => readComparison(db, query.record!)).catch(() => null) : null;
  return <ComparisonExperimentOne key={`${user.id}:${initialRecord?.id || "new"}`} initialRecords={records} initialConfig={config} initialRecord={initialRecord} />;
}
