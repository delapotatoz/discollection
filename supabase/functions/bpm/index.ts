// Discollection : cherche le tempo (et la tonalité si possible) d'un titre.
// 1. GetSongBPM, si le secret GETSONGBPM_KEY est défini (Edge Functions › Secrets).
// 2. Sinon, ou si le titre n'y est pas : l'API publique de Deezer, sans clé.
// Seuls les utilisateurs connectés peuvent appeler cette fonction (vérification JWT).

const KEY = Deno.env.get("GETSONGBPM_KEY") ?? "";
const UA = "Discollection/1.0 (+https://delapotatoz.github.io/discollection/)";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const clean = (s: string) => s.replace(/\s*[\(\[].*?[\)\]]\s*/g, " ").replace(/\s+/g, " ").trim();

async function fromGetSongBpm(title: string, artist: string) {
  if (!KEY) return null;
  const lookup = `song:${title} artist:${artist}`;
  const url = `https://api.getsong.co/search/?api_key=${encodeURIComponent(KEY)}&type=both&lookup=${encodeURIComponent(lookup)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const list = data && Array.isArray(data.search) ? data.search : [];
  const hit = list.find((x: { tempo?: string }) => x && x.tempo && parseFloat(x.tempo) > 0);
  return hit ? { bpm: Math.round(parseFloat(hit.tempo)), key: hit.key_of ?? "", source: "GetSongBPM" } : null;
}

async function fromDeezer(title: string, artist: string) {
  const q = artist ? `artist:"${artist}" track:"${title}"` : title;
  const res = await fetch(`https://api.deezer.com/search?limit=5&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const ids: number[] = (data && Array.isArray(data.data) ? data.data : []).map((t: { id: number }) => t.id).slice(0, 3);
  for (const id of ids) {
    const r = await fetch(`https://api.deezer.com/track/${id}`, { headers: { "User-Agent": UA } });
    if (!r.ok) continue;
    const t = await r.json().catch(() => null);
    if (t && t.bpm && t.bpm > 0) return { bpm: Math.round(t.bpm), key: "", source: "Deezer" };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const title = clean(String(body.title ?? "").slice(0, 120));
    const artist = clean(String(body.artist ?? "").slice(0, 120));
    if (!title) return json({ error: "Titre manquant" }, 400);
    const hit = (await fromGetSongBpm(title, artist).catch(() => null)) ?? (await fromDeezer(title, artist).catch(() => null));
    return json(hit ? { found: true, ...hit } : { found: false });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
