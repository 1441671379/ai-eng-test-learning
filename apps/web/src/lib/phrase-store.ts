import "server-only";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveDataDir } from "./pairing/store";
import { openPhraseDatabase, type PhraseDatabase } from "./phrase-db";
import { phraseCatalog } from "./phrase-catalog";
import type { PhraseCatalog } from "./phrases";
export async function withPhrases<T>(userId:string, run:(db:PhraseDatabase,catalog:PhraseCatalog)=>T) {
  const catalog=phraseCatalog(), directory=join(resolveDataDir(),"phrases");await mkdir(directory,{recursive:true});
  const db=openPhraseDatabase(join(directory,createHash("sha256").update(userId).digest("hex")+".sqlite"));
  try{return run(db,catalog);}finally{db.close();}
}
