// What Ivan is playing on Spotify, asked again each minute while the tab is shown. It fills the
// song line; anything else subscribes for the track (the room puts its cover on the record).
const REFRESH_MS = 60_000;
const line = document.querySelector(".listening");
const listeners = new Set();
let current = null;

export function onTrack(listener) {
  listeners.add(listener);
  if (current) listener(current);
}

async function listen() {
  if (document.hidden) return;
  const track = await fetch("/api/now-playing").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  line.hidden = !track;
  if (track) {
    line.classList.toggle("live", track.playing);
    line.querySelector(".said").textContent = track.playing ? "Listening to" : "Last played";
    const link = line.querySelector(".track");
    link.textContent = track.title;
    link.href = track.url;
    line.querySelector(".by").textContent = ` by ${track.artist}`;
  }
  current = track;
  for (const listener of listeners) listener(track);
}

listen();
setInterval(listen, REFRESH_MS);
document.addEventListener("visibilitychange", listen);
