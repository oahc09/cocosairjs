#!/usr/bin/env bash
# Focused Agent Review lane, using one already source-bound development build.
set -euo pipefail
cd "$(dirname "$0")/../.."
out=${1:?review-ci.sh requires an absolute, new evidence directory}
case "$out" in /*) ;; *) echo 'Use an absolute evidence path.' >&2; exit 2;; esac
port=${AIR_REVIEW_PORT:-7454}
export AIR_REVIEW_BASE="http://127.0.0.1:$port/"
mkdir "$out"
export TMPDIR="$out"
git rev-parse HEAD > "$out/head.txt"
node --version > "$out/node-version.txt"
node tools/mcp/node_modules/playwright/cli.js --version > "$out/playwright-version.txt"
export AIR_CHROMIUM="${AIR_CHROMIUM:-$(node -p "require('./tools/mcp/node_modules/playwright').chromium.executablePath()")}"
"$AIR_CHROMIUM" --version > "$out/chromium-version.txt"
node tools/mcp/agent-review.mjs doctor > "$out/doctor.json"

node tools/dev/dev-server.cjs --port "$port" > "$out/server.log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true' EXIT
for attempt in {1..80}; do
    kill -0 "$server"
    if grep -Fq "dev server: $AIR_REVIEW_BASE" "$out/server.log" &&
        curl --noproxy '*' --silent --fail --max-time 1 "${AIR_REVIEW_BASE}gltf-viewer/" >/dev/null; then
        break
    fi
    sleep 0.25
done
kill -0 "$server"
curl --noproxy '*' --silent --fail --max-time 3 "${AIR_REVIEW_BASE}gltf-viewer/" >/dev/null

for driver in agent-review-browser glass-pass-browser seeded-panel-browser; do
    timeout --signal=TERM --kill-after=5s 150s node "tools/mcp/$driver.mjs" | tee "$out/$driver.json"
done
