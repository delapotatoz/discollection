// Discollection : cherche le tempo, la tonalité et la durée d'un titre.
// Tempo : GetSongBPM si le secret GETSONGBPM_KEY est défini, sinon Deezer (API publique, sans clé).
// Durée : Deezer, pour compléter les titres sans durée sur Discogs.
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
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type DzTrack = { id: number; title: string; duration: number; artist?: { name: string } };

async function deezerSearch(title: string, artist: string): Promise<DzTrack[]> {
  const queries = artist ? [`artist:"${artist}" track:"${title}"`, `${artist} ${title}`] : [title];
  for (const q of queries) {
    const res = await fetch(`https://api.deezer.com/search?limit=8&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA } });
    if (!res.ok) continue;
    const data = await res.json().catch(() => null);
    const list: DzTrack[] = data && Array.isArray(data.data) ? data.data : [];
    const t = norm(title);
    const good = list.filter((x) => { const n = norm(x.title || ""); return n && (n.includes(t) || t.includes(n)); });
    if (good.length) return good;
  }
  return [];
}

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

async function bpmFromDeezer(tracks: DzTrack[]) {
  for (const t of tracks.slice(0, 3)) {
    const r = await fetch(`https://api.deezer.com/track/${t.id}`, { headers: { "User-Agent": UA } });
    if (!r.ok) continue;
    const d = await r.json().catch(() => null);
    if (d && d.bpm && d.bpm > 0) return { bpm: Math.round(d.bpm), key: "", source: "Deezer" };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const title = clean(String(body.title ?? "").slice(0, 120));
    const artist = clean(String(body.artist ?? "").slice(0, 120));
    const want: string[] = Array.isArray(body.want) ? body.want : ["bpm", "duration"];
    if (!title) return json({ error: "Titre manquant" }, 400);
    const dz = await deezerSearch(title, artist).catch(() => []);
    const duration = want.includes("duration") ? (dz.find((t) => t.duration > 0)?.duration ?? 0) : 0;
    let hit = null;
    if (want.includes("bpm")) {
      hit = (await fromGetSongBpm(title, artist).catch(() => null)) ?? (await bpmFromDeezer(dz).catch(() => null));
    }
    return json(hit ? { found: true, ...hit, duration } : { found: false, duration });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
