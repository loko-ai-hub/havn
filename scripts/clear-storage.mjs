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

const BUCKET = "community-documents";

async function listAll(prefix = "") {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return [];

  const files = [];
  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) {
      // It's a file
      files.push(fullPath);
    } else {
      // It's a folder — recurse
      const nested = await listAll(fullPath);
      files.push(...nested);
    }
  }
  return files;
}

async function run() {
  console.log("Listing all files in bucket...");
  const files = await listAll();
  console.log(`Found ${files.length} files.`);

  if (files.length === 0) {
    console.log("Bucket is already empty.");
    return;
  }

  // Delete in batches of 100
  const BATCH = 100;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) {
      console.error(`Batch ${i / BATCH + 1} error:`, error.message);
    } else {
      console.log(`Deleted batch ${i / BATCH + 1} (${batch.length} files)`);
    }
  }

  console.log("Done.");
}

run().catch(console.error);
