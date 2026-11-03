// The site's dynamic routes, all about Spotify; every other path is a static asset, served before
// this code runs (run_worker_first in wrangler.toml).
//   /api/now-playing      the track Ivan is playing, else the last one he played, for the turntable
//   /api/spotify/login    starts Spotify's consent (open it on any device signed in to Spotify)
//   /api/spotify/callback where the consent returns: stores the account's refresh token
//
// The flow is PKCE, so no client secret exists. The refresh token lives in KV rather than in a
// secret because Spotify may answer a refresh with a new one, and the Worker has to keep the
// newest. The first account to consent owns the page, so no later visitor can swap in their own.
// A consent in flight keeps its state and verifier in a cookie scoped to the callback, not in KV,
// so a stranger hitting the login route spends none of KV's daily write allowance.

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const ME_URL = "https://api.spotify.com/v1/me";
const PLAYER_URL = "https://api.spotify.com/v1/me/player";
const SCOPES = "user-read-currently-playing user-read-recently-played";
// A consent has this long to come back before its cookie lapses.
const CONSENT_SECONDS = 600;
const CONSENT_COOKIE = "spotify_consent";
// One answer per edge location for this long, so visitors never spend Spotify's request quota.
const FRESH_SECONDS = 30;
// KV refuses a TTL under 60 s; the margin keeps a cached token from expiring mid-request.
const KV_MIN_TTL = 60;
const COVER_MAX_PX = 300;

const FORM = { "content-type": "application/x-www-form-urlencoded" };
const text = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const CALLBACK_PATH = "/api/spotify/callback";
const callbackUrl = (url) => url.origin + CALLBACK_PATH;
const cookie = (request, name) => request.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

async function keepToken(env, token) {
  if (token.refresh_token) await env.SPOTIFY.put("refresh_token", token.refresh_token);
  await env.SPOTIFY.put("access_token", token.access_token, { expirationTtl: Math.max(KV_MIN_TTL, token.expires_in - KV_MIN_TTL) });
}

async function login(url, env) {
  const state = crypto.randomUUID();
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const consent = new URL(AUTHORIZE_URL);
  consent.search = new URLSearchParams({
    client_id: env.SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: callbackUrl(url),
    scope: SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  return new Response(null, {
    status: 302,
    headers: {
      location: consent.href,
      "set-cookie": `${CONSENT_COOKIE}=${state}.${verifier}; Path=${CALLBACK_PATH}; Max-Age=${CONSENT_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

async function callback(request, url, env) {
  const [state, verifier] = cookie(request, CONSENT_COOKIE)?.split(".") ?? [];
  const code = url.searchParams.get("code");
  if (!state || state !== url.searchParams.get("state") || !verifier || !code) {
    return text("This consent has expired or was not started at /api/spotify/login, on this browser.", 400);
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: FORM,
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackUrl(url), client_id: env.SPOTIFY_CLIENT_ID, code_verifier: verifier }),
  });
  if (!res.ok) return text("Spotify refused the consent.", 502);
  const token = await res.json();
  const me = await fetch(ME_URL, { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!me.ok) return text("Spotify would not say who consented.", 502);
  const { id } = await me.json();
  const owner = await env.SPOTIFY.get("owner");
  if (owner && owner !== id) return text("This page already shows another Spotify account.", 403);
  if (!owner) await env.SPOTIFY.put("owner", id);
  await keepToken(env, token);
  return text("Done. The turntable now plays what you play.");
}

async function accessToken(env) {
  const cached = await env.SPOTIFY.get("access_token");
  if (cached) return cached;
  const refresh = await env.SPOTIFY.get("refresh_token");
  if (!refresh) throw new Error("no refresh token in KV; consent at /api/spotify/login");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: FORM,
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: env.SPOTIFY_CLIENT_ID }),
  });
  if (!res.ok) throw new Error(`token refresh answered ${res.status}`);
  const token = await res.json();
  await keepToken(env, token);
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
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
    if (url.pathname === "/api/spotify/login") return login(url, env);
    if (url.pathname === CALLBACK_PATH) return callback(request, url, env);
    if (url.pathname !== "/api/now-playing") return text("Not found", 404);
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
