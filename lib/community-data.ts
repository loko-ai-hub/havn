import { createAdminClient } from "@/lib/supabase/admin";

/** Fetch fields from the single most recent OCR doc (backward compat) */
export async function getCommunityFields(
  communityId: string
): Promise<Record<string, string | null> | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("community_documents")
    .select("storage_path_json")
    .eq("community_id", communityId)
    .eq("ocr_status", "complete")
    .not("storage_path_json", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.storage_path_json) return null;

  const { data: fileData, error: fileError } = await supabase.storage
    .from("community-documents")
    .download(data.storage_path_json);

  if (fileError || !fileData) return null;

  try {
    const text = await fileData.text();
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === null || v === undefined) out[k] = null;
      else if (typeof v === "string") out[k] = v;
      else out[k] = String(v);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Fetch and merge fields from ALL completed OCR docs for a community.
 * Newer documents override older ones for the same field key.
 */
export async function getAllCommunityOcrFields(
  communityId: string
): Promise<Record<string, string | null>> {
  const supabase = createAdminClient();

  const { data: docs, error } = await supabase
    .from("community_documents")
    .select("storage_path_json")
    .eq("community_id", communityId)
    .eq("ocr_status", "complete")
    .not("storage_path_json", "is", null)
    .order("created_at", { ascending: true }); // oldest first so newest overrides

  if (error || !docs || docs.length === 0) return {};

  const merged: Record<string, string | null> = {};

  for (const doc of docs) {
    const path = doc.storage_path_json as string;
    try {
      const { data: fileData } = await supabase.storage
        .from("community-documents")
        .download(path);
      if (!fileData) continue;
      const text = await fileData.text();
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const strVal = v === null || v === undefined ? null : typeof v === "string" ? v : String(v);
        // Only override if new value is non-empty
        if (strVal && strVal.trim()) {
          merged[k] = strVal;
        } else if (!(k in merged)) {
          merged[k] = strVal;
        }
      }
    } catch {
      // Skip docs that fail to parse
    }
  }

  return merged;
}
