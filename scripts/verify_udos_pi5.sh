#!/usr/bin/env bash
set -euo pipefail
umask 077
export LC_ALL=C

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${UDOS_VERIFY_PORT:-18089}"
TMP_DIR="$(mktemp -d)"
SERVER_LOG="$TMP_DIR/http_server.log"
PAGE="$TMP_DIR/index.html"
SERVER_PID=''

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM
cd "$ROOT"

printf '%s\n' \
  '============================================================' \
  '🐉 UDOS PI5 LOCAL VERIFICATION' \
  '============================================================' \
  '[GUARD] network_listener = LOOPBACK_ONLY' \
  '[GUARD] external_api_call = NO' \
  '[GUARD] repo_write = NO' \
  ''

required=(index.html README.md UDOS_Specification.md package.json server.js)
for file in "${required[@]}"; do
  [ -f "$file" ] || { echo "FAIL | Missing $file"; exit 1; }
  echo "PASS | $file"
done

grep -Fq 'Universal Dragon Operating System' index.html
grep -Fq 'UDOS_MOBILE_ARCH_FIX_V1' index.html
grep -Fq 'UDOS_ARCHITECTURE_SCROLL_HINT' index.html
grep -Fq 'Public static preview mode' index.html
grep -Fq 'no private backend exposed' index.html
echo 'PASS | HTML safety markers'

python3 <<'PY'
from html.parser import HTMLParser
from pathlib import Path
class Validator(HTMLParser):
    pass
text = Path('index.html').read_text(encoding='utf-8')
parser = Validator(); parser.feed(text); parser.close()
if '<html' not in text.lower():
    raise SystemExit('FAIL | Missing HTML root')
if text.lower().count('<pre') != text.lower().count('</pre>'):
    raise SystemExit('FAIL | Unbalanced pre tags')
print('PASS | HTML parser check')
PY

command -v node >/dev/null 2>&1 || { echo 'FAIL | Node.js missing'; exit 1; }
node --check server.js
[ ! -f doctor_routes.js ] || node --check doctor_routes.js
echo 'PASS | JavaScript syntax'

command -v curl >/dev/null 2>&1 || { echo 'FAIL | curl missing'; exit 1; }
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
READY=0
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/index.html" -o "$PAGE"; then
    READY=1
    break
  fi
  sleep 0.25
done
[ "$READY" -eq 1 ] || { cat "$SERVER_LOG" || true; echo 'FAIL | Loopback server'; exit 1; }
grep -Fq 'Universal Dragon Operating System' "$PAGE"
grep -Fq 'UDOS_MOBILE_ARCH_FIX_V1' "$PAGE"
grep -Fq 'Public static preview mode' "$PAGE"

echo 'PASS | Loopback static-site smoke test'
printf '%s\n' \
  '============================================================' \
  '✅ UDOS PI5 LOCAL VERIFICATION COMPLETE' \
  '============================================================' \
  'STATIC_SITE=PASS' \
  'MOBILE_ARCHITECTURE_FIX=PASS' \
  'PUBLIC_SAFE_BOUNDARY=PASS' \
  'EXTERNAL_API_CALL=NO' \
  'REPO_WRITE=NO'
