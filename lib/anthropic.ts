// Shared Anthropic utility — model resolution + reusable fetch helpers

const SONNET_FALLBACK = "claude-sonnet-4-6";
let _modelCache: { model: string; ts: number } | null = null;
const MODEL_TTL_MS = 60 * 60 * 1000;

export async function getLatestSonnetModel(): Promise<string> {
  if (_modelCache && Date.now() - _modelCache.ts < MODEL_TTL_MS) return _modelCache.model;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return SONNET_FALLBACK;
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) return SONNET_FALLBACK;
    const payload = (await res.json()) as { data?: Array<{ id: string; created_at: number }> };
    const sonnet = (payload.data ?? [])
      .filter((m) => m.id.toLowerCase().includes("sonnet"))
      .sort((a, b) => b.created_at - a.created_at)[0];
    const model = sonnet?.id ?? SONNET_FALLBACK;
    _modelCache = { model, ts: Date.now() };
    console.log("[MODEL] latest Sonnet:", model);
    return model;
  } catch {
    return SONNET_FALLBACK;
  }
}
