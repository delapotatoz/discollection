// Discollection : cherche le tempo, la tonalité et la durée d'un titre.
// Tempo : GetSongBPM si le secret GETSONGBPM_KEY est défini, sinon Deezer (API publique, sans clé).
// Durée : Deezer, pour compléter les titres sans durée sur Discogs.
// L'artiste est obligatoire : sur une compilation, c'est l'artiste du morceau (pas « Various »).
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
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type DzTrack = { id: number; title: string; duration: number; artist?: { name: string } };

const artistOk = (want: string, got: string) => {
  const a = norm(want), g = norm(got);
  if (!a) return true;
  if (!g) return false;
  return g.includes(a) || a.includes(g) || a.split(" ").filter((w) => w.length > 2).some((w) => g.split(" ").includes(w));
};

// Ne garde que les résultats dont le titre ET l'artiste correspondent ; titres exacts en priorité.
async function deezerSearch(title: string, artist: string): Promise<DzTrack[]> {
  if (!artist) return [];
  const t = norm(title);
  const queries = [`artist:"${artist}" track:"${title}"`, `${artist} ${title}`];
  for (const q of queries) {
    const res = await fetch(`https://api.deezer.com/search?limit=15&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA } });
    if (!res.ok) continue;
    const data = await res.json().catch(() => null);
    const list: DzTrack[] = data && Array.isArray(data.data) ? data.data : [];
    const good = list.filter((x) => {
      const n = norm(clean(x.title || ""));
      return n && (n === t || n.includes(t) || t.includes(n)) && artistOk(artist, x.artist?.name ?? "");
    });
    const exact = good.filter((x) => norm(clean(x.title || "")) === t);
    if (exact.length) return exact;
    if (good.length) return good;
  }
  return [];
}

// Durée la plus représentative parmi les versions trouvées (on écarte extraits et intros < 1 min).
function pickDuration(list: DzTrack[]) {
  const d = list.map((x) => x.duration).filter((x) => x >= 60).sort((a, b) => a - b);
  return d.length ? d[Math.floor((d.length - 1) / 2)] : 0;
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
    const rawArtist = clean(String(body.artist ?? "").slice(0, 120));
    const artist = /^(various|divers)\b/i.test(rawArtist) ? "" : rawArtist;
    const want: string[] = Array.isArray(body.want) ? body.want : ["bpm", "duration"];
    if (!title) return json({ error: "Titre manquant" }, 400);
    const dz = await deezerSearch(title, artist).catch(() => []);
    const duration = want.includes("duration") ? pickDuration(dz) : 0;
    let hit = null;
    if (want.includes("bpm")) {
      hit = artist ? ((await fromGetSongBpm(title, artist).catch(() => null)) ?? (await bpmFromDeezer(dz).catch(() => null))) : null;
    }
    return json(hit ? { found: true, ...hit, duration } : { found: false, duration });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
