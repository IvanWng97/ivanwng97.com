// The site's dynamic routes, all about Spotify; every other path is a static asset, served before
// this code runs (run_worker_first in wrangler.toml).
//   /api/now-playing      the track Ivan is playing, else the last one he played, for the turntable
//   /api/now-playing.svg  the same as a card, ?theme=light|dark, for his GitHub profile README
//   /api/spotify/login    starts Spotify's consent (open it on any device signed in to Spotify)
//   /api/spotify/callback where the consent returns: stores the account's refresh token
//   /api/spotify/status   whether the token still works and when it must be renewed, which the
//                         profile repo's daily check reads so a lapse never goes unnoticed
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
// A refresh token dies six months after its consent, and refreshing never extends it:
// https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
const CONSENT_LIFETIME_DAYS = 182;
const DAY_MS = 86_400_000;

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
  await env.SPOTIFY.put("consented_at", new Date().toISOString());
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

async function status(env) {
  const consentedAt = await env.SPOTIFY.get("consented_at");
  let healthy = true;
  try {
    await accessToken(env);
  } catch (error) {
    healthy = false;
    console.error("spotify status unhealthy", { error: String(error) });
  }
  const renewBy = consentedAt && new Date(Date.parse(consentedAt) + CONSENT_LIFETIME_DAYS * DAY_MS).toISOString();
  return Response.json({ healthy, consentedAt, renewBy }, { headers: { "cache-control": "no-store" } });
}

// The README card's colours are read from the site's own theme.css (its first :root block is the
// light theme, its second the dark), so the card can't drift from the page.
async function palette(env, url, theme) {
  const css = await (await env.ASSETS.fetch(new URL("/theme.css", url))).text();
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)];
  const vars = Object.fromEntries([...blocks[theme === "dark" ? 1 : 0][1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
  return { bg: vars["sky-low"], text: vars.text, muted: vars.muted, accent: vars.accent, line: vars.line };
}
const xml = (s) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
// Cut to a width counted in half-em columns, a CJK character or an emoji taking two, and never
// inside a grapheme, so a long Chinese title stays on the card and no emoji breaks in half.
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|\p{Extended_Pictographic}/u;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
function clip(s, columns) {
  let used = 0, out = "";
  for (const { segment } of graphemes.segment(s)) {
    used += WIDE.test(segment) ? 2 : 1;
    if (used > columns - 1) return `${out}…`;
    out += segment;
  }
  return s;
}

// An image in a README can't fetch anything, so the cover rides inside as a data URI.
async function coverData(url) {
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:${res.headers.get("content-type") ?? "image/jpeg"};base64,${btoa(binary)}`;
}

// Drawn at the GitHub stats card's height, borderless with its corner radius, so the README can
// show both at one height and they scale alike. Columns are the text width left beside the cover.
const CARD = { width: 420, height: 195, radius: 18, cover: 131, inset: 32, textX: 190, titleColumns: 18, artistColumns: 24 };

async function card(track, c) {
  const { width, height, radius, cover: side, inset, textX } = CARD;
  const cover = await coverData(track?.cover);
  const said = !track ? "Not listening right now" : track.playing ? "Listening to" : "Last played";
  // Three bars that dance only while a song is actually playing.
  const bars = [0, 1, 2].map((i) => {
    const dance = track?.playing ? `<animate attributeName="height" values="5;14;5" dur="0.9s" begin="-${i * 0.3}s" repeatCount="indefinite"/><animate attributeName="y" values="64;55;64" dur="0.9s" begin="-${i * 0.3}s" repeatCount="indefinite"/>` : "";
    return `<rect x="${textX + i * 6}" y="64" width="4" height="5" rx="1" fill="${c.accent}">${dance}</rect>`;
  }).join("");
  const art = cover
    ? `<clipPath id="r"><rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="14"/></clipPath><image href="${cover}" x="${inset}" y="${inset}" width="${side}" height="${side}" clip-path="url(#r)"/>`
    : `<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="14" fill="${c.line}"/>`;
  const lines = track
    ? `<text x="${textX}" y="108" fill="${c.text}" font-size="22" font-weight="600">${xml(clip(track.title, CARD.titleColumns))}</text><text x="${textX}" y="138" fill="${c.muted}" font-size="17">${xml(clip(track.artist, CARD.artistColumns))}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans', sans-serif"><title>${xml(track ? `${said} ${track.title} by ${track.artist}` : said)}</title><rect width="${width}" height="${height}" rx="${radius}" fill="${c.bg}"/>${art}${track ? bars : ""}<text x="${track ? textX + 24 : textX}" y="${track ? 69 : 104}" fill="${c.muted}" font-size="15">${said}</text>${lines}</svg>`;
}

async function route(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/spotify/login") return login(url, env);
    if (url.pathname === CALLBACK_PATH) return callback(request, url, env);
    if (url.pathname === "/api/spotify/status") return status(env);
    const svg = url.pathname === "/api/now-playing.svg";
    if (!svg && url.pathname !== "/api/now-playing") return text("Not found", 404);
    const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
    const key = new Request(url.origin + url.pathname + (svg ? `?theme=${theme}` : ""));
    const hit = await caches.default.match(key);
    if (hit) return hit;
    // A failure reads as nothing playing and is cached like an answer, so a lapsed token isn't
    // sent to Spotify again by every visitor; /api/spotify/status is where a failure shows.
    let track = null;
    try {
      track = await listening(env);
    } catch (error) {
      console.error("now-playing failed", { error: String(error) });
    }
    const headers = { "cache-control": `public, max-age=${FRESH_SECONDS}` };
    const res = svg
      ? new Response(await card(track, await palette(env, url, theme)), { headers: { ...headers, "content-type": "image/svg+xml; charset=utf-8" } })
      : Response.json(track, { headers });
    ctx.waitUntil(caches.default.put(key, res.clone()));
    return res;
}

export default {
  // HEAD answers as GET does, without the body (RFC 9110 §9.1: servers support GET and HEAD).
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }
    const res = await route(request, env, ctx);
    return request.method === "HEAD" ? new Response(null, res) : res;
  },
};
