#!/usr/bin/env bash
#
# Phase 2 activity smoke test — exercises the /activity endpoints end to end:
# adaptive step goal, manual cardio + alias resolution, HealthKit idempotency,
# and the HealthKit-wins dedup. Re-run safe.
#
# Usage:
#   backend/scripts/smoke_activity.sh
#   BASE=http://localhost:3000 USER_ID=test-user-001 backend/scripts/smoke_activity.sh
#
# Requires: curl. Uses jq for pretty output if present (optional). Uses sqlite3
# to clear its own prior test rows if present (optional but recommended — keeps
# absolute-count assertions deterministic across re-runs).

set -u

BASE="${BASE:-http://localhost:3000}"
USER_ID="${USER_ID:-test-user-001}"
HDR=(-H "Content-Type: application/json" -H "X-User-Id: ${USER_ID}")

# DB path (for optional cleanup): backend/data/fitnessap.db, relative to this script.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${DB_PATH:-$SCRIPT_DIR/../data/fitnessap.db}"

pass=0; fail=0
green=$'\033[32m'; red=$'\033[31m'; dim=$'\033[2m'; rst=$'\033[0m'

# Portable date offset: dayoffset N -> YYYY-MM-DD for today+N (BSD then GNU date).
# BSD `date -v` requires an explicit sign (-v+0d / -v-3d); GNU wants "N day".
dayoffset() {
  local n="$1" arg
  case "$n" in -*) arg="$n";; *) arg="+$n";; esac
  date -v"${arg}d" +%F 2>/dev/null || date -d "${n} day" +%F 2>/dev/null
}

check() { # check "label" "expected-substring" "value"
  if printf '%s' "$3" | grep -q "$2"; then
    echo "  ${green}ok${rst}  $1"; pass=$((pass+1))
  else
    echo "  ${red}FAIL${rst} $1"; echo "       expected to contain: $2"; echo "       got: $3"; fail=$((fail+1))
  fi
}
refute() { # refute "label" "must-NOT-contain" "value"
  if printf '%s' "$3" | grep -q "$2"; then
    echo "  ${red}FAIL${rst} $1"; echo "       did not expect: $2"; echo "       got: $3"; fail=$((fail+1))
  else
    echo "  ${green}ok${rst}  $1"; pass=$((pass+1))
  fi
}
show() { command -v jq >/dev/null 2>&1 && printf '%s' "$1" | jq . || printf '%s\n' "$1"; }
json_id() { printf '%s' "$1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4; }

D3=$(dayoffset -3); D2=$(dayoffset -2); D1=$(dayoffset -1); D0=$(dayoffset 0)
echo "${dim}BASE=$BASE  USER_ID=$USER_ID  today=$D0${rst}"
echo

# --- 0. cleanup prior smoke artifacts (optional, keeps counts deterministic) ---
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" \
    "DELETE FROM cardio_sessions WHERE user_id='$USER_ID' AND (hk_uuid='HK-BIKE-1' OR (source='manual' AND modality='stationary bike'));
     DELETE FROM daily_activity WHERE user_id='$USER_ID' AND date IN ('$D3','$D2','$D1','$D0');" 2>/dev/null \
    && echo "0. Cleared prior smoke rows" \
    || echo "0. ${dim}cleanup query failed (continuing)${rst}"
else
  echo "0. ${dim}sqlite3 or DB not found — skipping cleanup (count assertions may drift on re-run)${rst}"
fi

# --- 0b. reachable? ---
health=$(curl -s "${HDR[@]}" "$BASE/health")
check "backend is up (/health)" '"status":"ok"' "$health"

# --- 1. seed 3 prior days so the adaptive goal has a baseline (median 8000 +5% -> 8400) ---
curl -s "${HDR[@]}" -X POST "$BASE/activity/daily" -d "{\"date\":\"$D3\",\"steps\":7000,\"source\":\"healthkit\"}" >/dev/null
curl -s "${HDR[@]}" -X POST "$BASE/activity/daily" -d "{\"date\":\"$D2\",\"steps\":8000,\"source\":\"healthkit\"}" >/dev/null
curl -s "${HDR[@]}" -X POST "$BASE/activity/daily" -d "{\"date\":\"$D1\",\"steps\":9000,\"source\":\"healthkit\"}" >/dev/null
echo "1. Seeded baseline days ($D3, $D2, $D1)"

# --- 2. today's rollup -> step_goal should be 8400 ---
today=$(curl -s "${HDR[@]}" -X POST "$BASE/activity/daily" \
  -d "{\"date\":\"$D0\",\"steps\":5200,\"distance_m\":4100,\"active_energy_kcal\":380,\"source\":\"healthkit\"}")
echo "2. Today rollup:"; show "$today"
check "adaptive step_goal = 8400 (median 8000 +5%)" '"step_goal":8400' "$today"

# --- 3. manual cardio -> "stationary bike" alias-resolves to movement_id stationary_bike ---
manual=$(curl -s "${HDR[@]}" -X POST "$BASE/activity/cardio" \
  -d "{\"date\":\"$D0\",\"started_at\":\"${D0}T07:05:00Z\",\"modality\":\"stationary bike\",\"duration_min\":30,\"intensity\":\"moderate\"}")
MANUAL_ID=$(json_id "$manual")
echo "3. Manual cardio (id=$MANUAL_ID):"; show "$manual"
check "modality resolved to stationary_bike" '"movement_id":"stationary_bike"' "$manual"
check "manual source" '"source":"manual"' "$manual"
check "captured a manual id" '.' "$MANUAL_ID"

# --- 4. HealthKit sync of the same bout (overlapping) -> HK wins, manual superseded ---
sync1=$(curl -s "${HDR[@]}" -X POST "$BASE/activity/healthkit/sync" \
  -d "{\"workouts\":[{\"hk_uuid\":\"HK-BIKE-1\",\"started_at\":\"${D0}T07:00:00Z\",\"modality\":\"cycling\",\"duration_min\":32,\"active_energy_kcal\":210,\"avg_hr\":121}]}")
echo "4. HealthKit sync (first):"; show "$sync1"
check "HK inserted 1" '"inserted":1' "$sync1"
check "overlapping manual superseded" '"superseded_manual":1' "$sync1"

# --- 5. re-sync identical payload -> idempotent (update, no dup, no new supersede) ---
sync2=$(curl -s "${HDR[@]}" -X POST "$BASE/activity/healthkit/sync" \
  -d "{\"workouts\":[{\"hk_uuid\":\"HK-BIKE-1\",\"started_at\":\"${D0}T07:00:00Z\",\"modality\":\"cycling\",\"duration_min\":32,\"active_energy_kcal\":210,\"avg_hr\":121}]}")
echo "5. HealthKit sync (re-run):"; show "$sync2"
check "idempotent: inserted 0" '"inserted":0' "$sync2"
check "idempotent: updated 1" '"updated":1' "$sync2"

# --- 6. summary -> goal + only the HK bout counts ---
summary=$(curl -s "${HDR[@]}" "$BASE/activity/$USER_ID/summary")
echo "6. Summary:"; show "$summary"
check "summary today step_goal 8400" '"step_goal":8400' "$summary"
check "cardio_minutes_7d = 32 (manual 30 excluded)" '"cardio_minutes_7d":32' "$summary"

# --- 7. dedup proof by id: superseded manual is hidden by default, shown with the flag ---
def=$(curl -s "${HDR[@]}" "$BASE/activity/$USER_ID/cardio?days=7")
inc=$(curl -s "${HDR[@]}" "$BASE/activity/$USER_ID/cardio?days=7&include_superseded=true")
echo "7. Cardio list (default vs include_superseded)"
refute "default list hides the superseded manual row" "$MANUAL_ID" "$def"
check  "include_superseded shows the manual row" "$MANUAL_ID" "$inc"
check  "default list still shows the HK bout" '"hk_uuid":"HK-BIKE-1"' "$def"

echo
if [ "$fail" -eq 0 ]; then
  echo "${green}ALL $pass CHECKS PASSED${rst}"
else
  echo "${red}${fail} FAILED${rst}, ${green}${pass} passed${rst}"
fi
exit "$fail"
