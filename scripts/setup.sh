#!/usr/bin/env bash
# One-time setup of the recording stand. Idempotent: re-running skips what is already there.
#
#   scripts/setup.sh
#
# Environment overrides:
#   BSL_LS_JAR=/path/to/bsl-language-server-*-exec.jar   use a local build (e.g. develop) instead
#                                                        of the latest GitHub release
#   V8_BIN=/opt/1cv8/x86_64/8.3.xx.yyyy                  1C platform folder with sh*.hbk
#                                                        (default: newest under /opt/1cv8/x86_64)
#   SKIP_EXTENSIONS=1 / SKIP_PLAYWRIGHT=1                skip the corresponding step
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n==> %s\n' "$*"; }
need() { command -v "$1" >/dev/null || { echo "missing required tool: $1" >&2; exit 1; }; }
need git; need curl; need tar; need docker; need node; need ffmpeg

case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=aarch64 ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

say "SSL configuration (submodule vendor/ssl_3_2, pinned — do not update, scenarios use line:col)"
git submodule update --init vendor/ssl_3_2

say "Temurin JRE 25 -> work/jre25 (Java 25 is required to read the SSL configuration)"
mkdir -p work
if [[ -x work/jre25/bin/java ]]; then
  echo "already present: $(work/jre25/bin/java -version 2>&1 | head -1)"
else
  tmp="$(mktemp -d)"
  curl -fL "https://api.adoptium.net/v3/binary/latest/25/ga/linux/${ARCH}/jre/hotspot/normal/eclipse" -o "$tmp/jre.tar.gz"
  mkdir -p work/jre25
  tar -xzf "$tmp/jre.tar.gz" -C work/jre25 --strip-components=1
  rm -rf "$tmp"
  work/jre25/bin/java -version 2>&1 | head -1
fi

say "bsl-language-server -> work/bsl-ls.jar"
if [[ -n "${BSL_LS_JAR:-}" ]]; then
  cp "$BSL_LS_JAR" work/bsl-ls.jar
elif [[ ! -f work/bsl-ls.jar ]]; then
  url="$(curl -fsSL https://api.github.com/repos/1c-syntax/bsl-language-server/releases/latest \
    | grep -o '"browser_download_url": *"[^"]*-exec\.jar"' | head -1 | cut -d'"' -f4)"
  [[ -n "$url" ]] || { echo "could not find an -exec.jar in the latest release" >&2; exit 1; }
  curl -fL "$url" -o work/bsl-ls.jar
fi
work/jre25/bin/java -jar work/bsl-ls.jar --version || true

say "1C platform help (HBK) -> v8bin/  (optional: platform methods in completion/hover)"
mkdir -p v8bin
if compgen -G "v8bin/sh*.hbk" >/dev/null; then
  echo "already present: $(ls v8bin | wc -l) files"
else
  src="${V8_BIN:-$(ls -d /opt/1cv8/x86_64/*/ 2>/dev/null | sort -V | tail -1)}"
  if [[ -n "$src" ]] && compgen -G "${src%/}/sh*.hbk" >/dev/null; then
    cp "${src%/}"/sh*.hbk v8bin/
    echo "copied from $src"
  else
    echo "WARNING: no 1C platform found (set V8_BIN). The LS will fall back to its builtin context;" >&2
    echo "         platform-method demos (hover/completion/signatureHelp) will look poorer." >&2
  fi
fi

if [[ -z "${SKIP_EXTENSIONS:-}" ]]; then
  say "code-server extensions -> extensions/ (from open-vsx)"
  mkdir -p extensions
  docker run --rm -v "$ROOT/extensions:/ext" codercom/code-server:latest \
    --extensions-dir /ext \
    --install-extension 1c-syntax.language-1c-bsl@1.35.0 \
    --install-extension zhuangtongfa.material-theme@3.19.0
fi

if [[ -z "${SKIP_PLAYWRIGHT:-}" ]]; then
  say "Node dependencies + headless Chromium"
  npm install
  npx playwright install chromium
fi

say "Done. Next: scripts/start-codeserver.sh, then node record.mjs scenarios/<name>.json"
