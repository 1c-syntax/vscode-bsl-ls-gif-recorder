#!/usr/bin/env bash
# (Re)create the code-server container the recorders drive.
#
#   scripts/start-codeserver.sh          # http://127.0.0.1:8090 (override: PORT=xxxx)
#
# Mounts (host -> container):
#   work/                  -> /work                      jar + JRE 25 (ro)
#   workspace/             -> /home/coder/project        demo fixtures, the recorders write here
#   vendor/ssl_3_2/src     -> /home/coder/project/src    SSL configuration (pinned submodule, ro)
#   v8bin/                 -> /home/coder/v8bin          1C platform help *.hbk (ro)
#   config/                -> ~/.local/share/code-server settings (config/User/settings.json)
#   extensions/            -> /ext                       language-1c-bsl + One Dark Pro theme
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="${CONTAINER_NAME:-bsl-codeserver}"
PORT="${PORT:-8090}"

for p in work/bsl-ls.jar work/jre25/bin/java vendor/ssl_3_2/src/cf extensions; do
  [[ -e "$ROOT/$p" ]] || { echo "missing $p — run scripts/setup.sh first" >&2; exit 1; }
done
mkdir -p "$ROOT/v8bin" "$ROOT/config" "$ROOT/workspace/src"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" \
  -p "127.0.0.1:${PORT}:8080" \
  -v "$ROOT/work:/work:ro" \
  -v "$ROOT/workspace:/home/coder/project" \
  -v "$ROOT/vendor/ssl_3_2/src:/home/coder/project/src:ro" \
  -v "$ROOT/v8bin:/home/coder/v8bin:ro" \
  -v "$ROOT/config:/home/coder/.local/share/code-server" \
  -v "$ROOT/extensions:/ext" \
  codercom/code-server:latest \
  --auth none --bind-addr 0.0.0.0:8080 --extensions-dir /ext --disable-telemetry \
  /home/coder/project

echo "waiting for code-server on :${PORT}…"
for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" || true)"
  [[ "$code" == "302" || "$code" == "200" ]] && { echo "ready: http://127.0.0.1:${PORT}/"; exit 0; }
  sleep 1
done
echo "code-server did not answer in 60s — see: docker logs $NAME" >&2
exit 1
