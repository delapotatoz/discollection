// Discollection : cherche le tempo et la tonalité d'un titre sur GetSongBPM.
// La clé reste ici, côté serveur : ajoute-la dans Supabase › Edge Functions › Secrets
// sous le nom GETSONGBPM_KEY. Seuls les utilisateurs connectés peuvent appeler cette fonction.

const KEY = Deno.env.get("GETSONGBPM_KEY") ?? "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!KEY) return json({ error: "Clé GetSongBPM absente des secrets" }, 500);
  try {
    const { title, artist } = await req.json();
    if (!title || typeof title !== "string") return json({ error: "Titre manquant" }, 400);
    const lookup = `song:${title.slice(0, 120)} artist:${String(artist ?? "").slice(0, 120)}`;
    const url = `https://api.getsong.co/search/?api_key=${encodeURIComponent(KEY)}&type=both&lookup=${encodeURIComponent(lookup)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Discollection/1.0 (+https://delapotatoz.github.io/discollection/)" } });
    if (!res.ok) return json({ error: `GetSongBPM a répondu ${res.status}` }, 502);
    const data = await res.json();
    const list = Array.isArray(data.search) ? data.search : [];
    const hit = list.find((x: { tempo?: string }) => x && x.tempo);
    if (!hit) return json({ found: false });
    return json({
      found: true,
      bpm: Math.round(parseFloat(hit.tempo)),
      key: hit.key_of ?? "",
      title: hit.title ?? "",
      artist: hit.artist?.name ?? "",
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
