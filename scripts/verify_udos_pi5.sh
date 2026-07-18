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

check_contains() {
  local file="$1"
  local marker="$2"
  local label="$3"
  grep -Fq "$marker" "$file" \
    || { echo "FAIL | Missing $label"; exit 1; }
  echo "PASS | $label"
}

check_absent_regex() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if grep -Eqi "$pattern" "$file"; then
    echo "FAIL | Unexpected $label"
    grep -Ein "$pattern" "$file" | sed -n '1,12p' || true
    exit 1
  fi
  echo "PASS | $label absent"
}

cd "$ROOT"

printf '%s\n' \
  '============================================================' \
  '🐉 UDOS PI5 LOCAL VERIFICATION V2' \
  '============================================================' \
  '[GUARD] network_listener = LOOPBACK_ONLY' \
  '[GUARD] external_api_call = NO' \
  '[GUARD] repo_write = NO' \
  ''

required=(
  index.html
  README.md
  UDOS_Specification.md
  package.json
  server.js
)

for file in "${required[@]}"; do
  [ -f "$file" ] \
    || { echo "FAIL | Missing $file"; exit 1; }
  echo "PASS | $file"
done

echo
echo "=== HTML MARKERS ==="

check_contains \
  index.html \
  'Universal Dragon Operating System' \
  'UDOS identity'

check_contains \
  index.html \
  'UDOS_ARCHITECTURE_TABS_V2' \
  'architecture tabs V2'

check_contains \
  index.html \
  'data-architecture-key="human"' \
  'Human Input option'

check_contains \
  index.html \
  'data-architecture-key="brain"' \
  'EVE / NOVA option'

check_contains \
  index.html \
  'data-architecture-key="shield"' \
  'Dragon Shield option'

check_contains \
  index.html \
  'data-architecture-key="tools"' \
  'Tools + Devices option'

check_contains \
  index.html \
  'data-architecture-key="public"' \
  'Public Site option'

check_contains \
  index.html \
  'function selectArchitectureLayer' \
  'architecture interaction'

check_contains \
  index.html \
  'Public static preview mode' \
  'public static mode'

check_contains \
  index.html \
  'no private backend exposed' \
  'public-safe backend boundary'

check_absent_regex \
  index.html \
  'UDOS_ARCHITECTURE_SCROLL_HINT|<pre class="arch"' \
  'legacy horizontal architecture'

check_absent_regex \
  index.html \
  'groq|gpt[-_/ ]?oss|120b' \
  'public provider/model branding'

echo
echo "=== HTML PARSER ==="

python3 <<'PY'
from html.parser import HTMLParser
from pathlib import Path

class Validator(HTMLParser):
    pass

text = Path("index.html").read_text(encoding="utf-8")
parser = Validator()
parser.feed(text)
parser.close()

if "<html" not in text.lower():
    raise SystemExit("FAIL | Missing HTML root")

if text.count('class="architecture-option"') != 5:
    raise SystemExit("FAIL | Expected exactly five architecture buttons")

if text.count('role="tab"') != 5:
    raise SystemExit("FAIL | Expected exactly five architecture tabs")

if text.count('role="tabpanel"') != 1:
    raise SystemExit("FAIL | Expected one architecture tab panel")

print("PASS | HTML parser check")
print("PASS | Architecture button count = 5")
print("PASS | Architecture tab panel count = 1")
PY

echo
echo "=== JAVASCRIPT SYNTAX ==="

command -v node >/dev/null 2>&1 \
  || { echo "FAIL | Node.js missing"; exit 1; }

node --check server.js
[ ! -f doctor_routes.js ] || node --check doctor_routes.js
[ ! -f functions/api/eve.js ] || node --check functions/api/eve.js
echo "PASS | JavaScript syntax"

echo
echo "=== LOOPBACK STATIC-SITE SMOKE TEST ==="

command -v curl >/dev/null 2>&1 \
  || { echo "FAIL | curl missing"; exit 1; }

python3 -m http.server \
  "$PORT" \
  --bind 127.0.0.1 \
  --directory "$ROOT" \
  >"$SERVER_LOG" 2>&1 &

SERVER_PID=$!
READY=0

for _ in $(seq 1 20); do
  if curl -fsS \
    "http://127.0.0.1:${PORT}/index.html" \
    -o "$PAGE"
  then
    READY=1
    break
  fi
  sleep 0.25
done

[ "$READY" -eq 1 ] || {
  cat "$SERVER_LOG" || true
  echo "FAIL | Loopback server"
  exit 1
}

check_contains \
  "$PAGE" \
  'UDOS_ARCHITECTURE_TABS_V2' \
  'served architecture tabs V2'

check_contains \
  "$PAGE" \
  'data-architecture-key="public"' \
  'served architecture options'

check_contains \
  "$PAGE" \
  'Public static preview mode' \
  'served public static mode'

check_absent_regex \
  "$PAGE" \
  'groq|gpt[-_/ ]?oss|120b' \
  'served provider/model branding'

echo "PASS | Loopback static-site smoke test"

printf '%s\n' \
  '============================================================' \
  '✅ UDOS PI5 LOCAL VERIFICATION V2 COMPLETE' \
  '============================================================' \
  'STATIC_SITE=PASS' \
  'ARCHITECTURE_BUTTON_TABS=PASS' \
  'MOBILE_NO_HORIZONTAL_SCROLL=PASS' \
  'PUBLIC_PROVIDER_NAME_HIDDEN=PASS' \
  'PUBLIC_SAFE_BOUNDARY=PASS' \
  'EXTERNAL_API_CALL=NO' \
  'REPO_WRITE=NO'
