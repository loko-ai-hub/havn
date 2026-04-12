import { createAdminClient } from "@/lib/supabase/admin";

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
