// One-time, and again whenever Spotify stops honouring the stored token: let the site read what
// Ivan plays. It opens Spotify's consent page, catches the redirect on 127.0.0.1, trades the code
// for a refresh token by PKCE, and writes that token into the Worker's KV through wrangler without
// ever printing it. Run from the repo root, signed in with `npx wrangler login`:
//
//   node scripts/spotify-auth.mjs

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const clientId = config.match(/^SPOTIFY_CLIENT_ID\s*=\s*"([^"]+)"/m)?.[1];
if (!clientId) throw new Error("set SPOTIFY_CLIENT_ID in wrangler.toml's [vars] first");

// Registered in the Spotify app. Spotify allows plain http only on a loopback IP literal, never
// on "localhost": https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
const REDIRECT = new URL("http://127.0.0.1:8888/callback");
const SCOPES = "user-read-currently-playing user-read-recently-played";

const verifier = randomBytes(64).toString("base64url");
const state = randomBytes(16).toString("hex");
const consent = new URL("https://accounts.spotify.com/authorize");
consent.search = new URLSearchParams({
  client_id: clientId,
  response_type: "code",
  redirect_uri: REDIRECT.href,
  scope: SCOPES,
  state,
  code_challenge_method: "S256",
  code_challenge: createHash("sha256").update(verifier).digest("base64url"),
});

async function store(code) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT.href, client_id: clientId, code_verifier: verifier }),
  });
  if (!res.ok) throw new Error(`Spotify's token exchange answered ${res.status}`);
  const { refresh_token: refreshToken } = await res.json();
  // Through a private file, so the token never sits in a process list or a terminal.
  const dir = mkdtempSync(join(tmpdir(), "spotify-auth-"));
  try {
    const file = join(dir, "refresh_token");
    writeFileSync(file, refreshToken, { mode: 0o600 });
    execFileSync("npx", ["wrangler", "kv", "key", "put", "refresh_token", "--binding", "SPOTIFY", "--remote", "--path", file], { stdio: "inherit" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (url.pathname !== REDIRECT.pathname) return res.writeHead(404).end();
  const code = url.searchParams.get("code");
  if (url.searchParams.get("state") !== state || !code) {
    res.writeHead(400).end(`Not authorized: ${url.searchParams.get("error") ?? "state mismatch"}`);
    return server.close();
  }
  try {
    await store(code);
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Done. The site can read what you play; close this tab.");
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
    res.writeHead(502).end("Failed; see the terminal.");
  }
  server.close();
});

server.listen(Number(REDIRECT.port), REDIRECT.hostname, () => {
  process.stdout.write(`Approve the site in your browser. If nothing opened, visit:\n${consent}\n`);
  spawn("open", [consent.href], { stdio: "ignore" }).on("error", () => {});
});
