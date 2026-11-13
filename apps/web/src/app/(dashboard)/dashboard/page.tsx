import { localizedMetadata } from "@/lib/i18n/server";
import { requireAppUser } from "@/lib/app-session";
import { HomeWorkspace } from "@/components/learning/HomeWorkspace";
export async function generateMetadata() { return localizedMetadata({ title: "英语学习首页", robots: { index: false, follow: false } }); }
export default async function DashboardPage() { await requireAppUser("/dashboard"); return <HomeWorkspace />; }
