#!/usr/bin/env bash
# Re-renders the images derived from the live room, so they never drift from it: og.jpg (dark)
# and og-light.jpg, the share cards that the GitHub profile README also shows, and room.jpg, the
# no-WebGL fallback. Run it after any change to how the room or the hero looks:
#
#   scripts/render-images.sh
#
# Needs macOS's Google Chrome and Python 3 with Pillow. The shots hide what can't be clicked in an
# image (the links, the song line, the motion button), and the server listens on loopback only.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
public="$repo/public"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
port=8199
# The hero at 1280x960, shot at 2x: the share cards take its top band, the fallback its room.
width=1280
height=960

work=$(mktemp -d)
server=""
cleanup() {
  if [ -n "$server" ]; then kill "$server" 2>/dev/null || true; fi
  rm -rf "$work"
}
trap cleanup EXIT

cp -R "$public/." "$work/site/"
python3 -I - "$work/site/index.html" <<'PY'
import sys
path = sys.argv[1]
page = open(path).read()
page = page.replace("</style>", "  .social, .listening, .motion { visibility: hidden; }\n</style>", 1)
open(path, "w").write(page)
PY

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$work/site" >/dev/null 2>&1 &
server=$!
# Out of the job table, so the kill at exit prints no "Terminated" line.
disown "$server"
sleep 1

shoot() {
  "$chrome" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars \
    --window-size="$width,$height" --force-device-scale-factor=2 --virtual-time-budget=15000 \
    "$@" "http://127.0.0.1:$port/" >/dev/null 2>&1
}
shoot --screenshot="$work/light.png"
shoot --force-dark-mode --blink-settings=preferredColorScheme=0 --screenshot="$work/dark.png"

python3 -I - "$work" "$public" <<'PY'
import sys
from PIL import Image
work, public = sys.argv[1], sys.argv[2]
# Crops in the 2x shot: the hero band at 1.91:1 for the share cards, and the room's square.
HERO = (0, 60, 2560, 1400)
ROOM = (1186, 100, 2448, 1362)
for theme, name in (("dark", "og.jpg"), ("light", "og-light.jpg")):
    shot = Image.open(f"{work}/{theme}.png").convert("RGB")
    shot.crop(HERO).resize((1200, 628), Image.LANCZOS).save(f"{public}/{name}", quality=88)
dark = Image.open(f"{work}/dark.png").convert("RGB")
dark.crop(ROOM).resize((1200, 1200), Image.LANCZOS).save(f"{public}/room.jpg", quality=86)
PY

echo "Rendered og.jpg, og-light.jpg and room.jpg into $public"
