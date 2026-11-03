// The site's one dynamic route, /api/now-playing: the track Ivan is playing on Spotify, else the
// last one he played, for the turntable. Every other path is a static asset, served before this
// code runs (run_worker_first in wrangler.toml).
//
// The refresh token lives in KV rather than in a secret because Spotify may answer a refresh with
// a new one, and the Worker has to keep the newest. scripts/spotify-auth.mjs stores the first.
// The flow is PKCE, so no client secret exists anywhere.

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const PLAYER_URL = "https://api.spotify.com/v1/me/player";
// One answer per edge location for this long, so visitors never spend Spotify's request quota.
const FRESH_SECONDS = 30;
// KV refuses a TTL under 60 s; the margin keeps a cached token from expiring mid-request.
const KV_MIN_TTL = 60;
const COVER_MAX_PX = 300;

async function accessToken(env) {
  const cached = await env.SPOTIFY.get("access_token");
  if (cached) return cached;
  const refresh = await env.SPOTIFY.get("refresh_token");
  if (!refresh) throw new Error("no refresh token in KV; run scripts/spotify-auth.mjs");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: env.SPOTIFY_CLIENT_ID }),
  });
  if (!res.ok) throw new Error(`token refresh answered ${res.status}`);
  const token = await res.json();
  if (token.refresh_token) await env.SPOTIFY.put("refresh_token", token.refresh_token);
  await env.SPOTIFY.put("access_token", token.access_token, { expirationTtl: Math.max(KV_MIN_TTL, token.expires_in - KV_MIN_TTL) });
  return token.access_token;
}

// Spotify lists a cover's sizes largest first.
function describe(item, playing) {
  if (item?.type !== "track") return null;
  const cover = item.album.images.find((image) => image.width <= COVER_MAX_PX) ?? item.album.images.at(-1);
  return {
    playing,
    title: item.name,
    artist: item.artists.map((artist) => artist.name).join(", "),
    url: item.external_urls.spotify,
    cover: cover?.url ?? null,
  };
}

async function listening(env) {
  const headers = { authorization: `Bearer ${await accessToken(env)}` };
  const now = await fetch(`${PLAYER_URL}/currently-playing`, { headers });
  if (now.status === 200) {
    const body = await now.json();
    const track = describe(body.item, body.is_playing);
    if (track) return track;
  } else if (now.status !== 204) {
    throw new Error(`currently-playing answered ${now.status}`);
  }
  const recent = await fetch(`${PLAYER_URL}/recently-played?limit=1`, { headers });
  if (!recent.ok) throw new Error(`recently-played answered ${recent.status}`);
  return describe((await recent.json()).items?.[0]?.track, false);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/now-playing") return new Response("Not found", { status: 404 });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
    const key = new Request(url.origin + url.pathname);
    const hit = await caches.default.match(key);
    if (hit) return hit;
    try {
      const res = Response.json(await listening(env), { headers: { "cache-control": `public, max-age=${FRESH_SECONDS}` } });
      ctx.waitUntil(caches.default.put(key, res.clone()));
      return res;
    } catch (error) {
      console.error("now-playing failed", { error: String(error) });
      return Response.json(null, { status: 502, headers: { "cache-control": "no-store" } });
    }
  },
};
