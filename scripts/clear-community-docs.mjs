import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
for (const line of env.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
  if (key) process.env[key] = val;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COMMUNITY_NAME = "Greenfield Park";
const BUCKET = "community-documents";

async function run() {
  // Find the community
  const { data: communities, error: findError } = await supabase
    .from("communities")
    .select("id, legal_name")
    .ilike("legal_name", `%${COMMUNITY_NAME}%`);

  if (findError) { console.error("Error finding community:", findError.message); return; }
  if (!communities?.length) { console.log(`No community found matching "${COMMUNITY_NAME}"`); return; }

  console.log("Found communities:");
  communities.forEach(c => console.log(`  ${c.id} — ${c.legal_name}`));

  const community = communities[0];
  console.log(`\nTargeting: ${community.legal_name} (${community.id})`);

  // Delete storage files for this community
  const prefix = community.id;
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000 });

  if (listError) {
    console.error("Error listing files:", listError.message);
  } else if (files?.length) {
    const paths = files.map(f => `${prefix}/${f.name}`);
    const { error: delError } = await supabase.storage.from(BUCKET).remove(paths);
    if (delError) console.error("Error deleting files:", delError.message);
    else console.log(`Deleted ${paths.length} storage files`);
  } else {
    console.log("No storage files found");
  }

  // Delete DB records
  const { error: dbError, count } = await supabase
    .from("community_documents")
    .delete({ count: "exact" })
    .eq("community_id", community.id);

  if (dbError) console.error("Error deleting DB records:", dbError.message);
  else console.log(`Deleted ${count ?? 0} document records from DB`);

  console.log("\nDone.");
}

run().catch(console.error);
