import { localizedMetadata } from "@/lib/i18n/server";
import { requireAppUser } from "@/lib/app-session";
import { KnowledgeWorkspace } from "@/components/knowledge/KnowledgeWorkspace";

export async function generateMetadata(){return localizedMetadata({title:"知识库"});}
export default async function Page(){await requireAppUser("/knowledge");return <KnowledgeWorkspace />;}
