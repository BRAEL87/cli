#!/usr/bin/env bash
# ─── Nova CLI — SWE-bench Pre-flight Test Runner ─────────────────────────────
# Usage: bash swe-bench-run.sh [model] [max-iterations]
# Example: bash swe-bench-run.sh "poolside/laguna-xs.2:free" 40
#
# Runs the 4 pre-flight tests that cover 95% of SWE-bench failure modes.
# Pass all 4 before running the full benchmark.

set -e

MODEL="${1:-puter-hy3-preview}"
MAX_ITER="${2:-40}"
BASE_DIR="$HOME/nova-agent-tests"
PASS=0
FAIL=0
RESULTS=()

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_pass() { echo -e "${GREEN}✓ PASS${NC} $1"; PASS=$((PASS+1)); RESULTS+=("PASS: $1"); }
log_fail() { echo -e "${RED}✗ FAIL${NC} $1"; FAIL=$((FAIL+1)); RESULTS+=("FAIL: $1"); }
log_info() { echo -e "${YELLOW}→${NC} $1"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nova CLI — SWE-bench Pre-flight Tests"
echo "  Model: $MODEL  |  Max iterations: $MAX_ITER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Setup ─────────────────────────────────────────────────────────────────────

mkdir -p "$BASE_DIR"

# Check nova CLI is available
if ! command -v nova &>/dev/null && ! command -v npx &>/dev/null; then
    echo "ERROR: nova CLI not found. Run: npm install -g nova-agent-cli"
    exit 1
fi

NOVA_CMD="nova"
if ! command -v nova &>/dev/null; then
    NOVA_CMD="npx tsx $(dirname "$0")/nova-agent.ts"
fi

# ── Test 1: Express /health endpoint ─────────────────────────────────────────

echo "━━━ Test 1: Express /health endpoint (Easy) ━━━"
log_info "Cloning express..."
cd "$BASE_DIR"
[ -d express-test ] || git clone --depth=1 https://github.com/expressjs/express express-test
cd express-test
npm install --silent 2>/dev/null || true

log_info "Running agent..."
$NOVA_CMD agent \
  --prompt "Read one existing test file in test/ to understand the supertest pattern, then write test/health.js — a Mocha test using supertest that creates a minimal Express app with a GET /health route returning {status: 'ok'}, and asserts the response is 200 with that body. The test file should be self-contained. Run npm test and confirm the health test passes. Do not stop after writing the file — you must run npm test and show the result." \
  --model "$MODEL" \
  --max-iterations 15 \
  --workspace "$BASE_DIR/express-test" \
  --log "$BASE_DIR/test1.jsonl" 2>/dev/null

if [ -f "test/health.js" ] && npm test 2>/dev/null | grep -q "passing"; then
    log_pass "Test 1: Express /health endpoint"
else
    log_fail "Test 1: Express /health endpoint"
    echo "  Debug: check $BASE_DIR/test1.jsonl"
fi

# ── Test 2: MS to TypeScript ──────────────────────────────────────────────────

echo ""
echo "━━━ Test 2: MS to TypeScript (Medium) ━━━"
log_info "Cloning ms..."
cd "$BASE_DIR"
[ -d ms-test ] || git clone --depth=1 https://github.com/vercel/ms ms-test
cd ms-test
npm install --silent 2>/dev/null || true

log_info "Running agent..."
$NOVA_CMD agent \
  --prompt "Convert index.js to TypeScript. Steps: 1) Read index.js fully, 2) Use move_file to rename index.js to index.ts, 3) Add TypeScript types, 4) Create tsconfig.json if missing, 5) Run npx tsc --noEmit to check for errors, 6) Fix any type errors. The goal is zero TypeScript errors." \
  --model "$MODEL" \
  --max-iterations 25 \
  --workspace "$BASE_DIR/ms-test" \
  --log "$BASE_DIR/test2.jsonl" 2>/dev/null

if [ -f "index.ts" ] && npx tsc --noEmit 2>/dev/null; then
    log_pass "Test 2: MS to TypeScript"
else
    log_fail "Test 2: MS to TypeScript"
    echo "  Debug: check $BASE_DIR/test2.jsonl"
fi

# ── Test 3: Requests timeout bug (THE CRITICAL TEST) ─────────────────────────

echo ""
echo "━━━ Test 3: Requests timeout bug — SWE-bench Lite #1 (Critical) ━━━"
log_info "Cloning requests..."
cd "$BASE_DIR"
[ -d requests-test ] || git clone https://github.com/psf/requests requests-test
cd requests-test
git checkout 2e3e6f4 2>/dev/null || true
pip install -e ".[test]" --quiet 2>/dev/null || pip install -e . --quiet 2>/dev/null || true

log_info "Running agent..."
$NOVA_CMD agent \
  --prompt "Fix: requests.get('https://httpbin.org/delay/10', timeout=5) does not raise a timeout exception after 5 seconds. It should raise requests.exceptions.Timeout. Run: python -m pytest tests/test_requests.py -k test_timeout -xvs FIRST to see the exact failure. Then find the bug in requests/sessions.py or requests/adapters.py. Make the minimal fix. Run the test again to verify it passes. Only edit files in the requests/ directory." \
  --model "$MODEL" \
  --max-iterations "$MAX_ITER" \
  --workspace "$BASE_DIR/requests-test" \
  --log "$BASE_DIR/test3.jsonl" 2>/dev/null

if python -m pytest tests/test_requests.py -k test_timeout -x --tb=no -q 2>/dev/null | grep -q "passed"; then
    log_pass "Test 3: Requests timeout bug"
else
    log_fail "Test 3: Requests timeout bug"
    echo "  Debug: check $BASE_DIR/test3.jsonl"
    echo "  This is the most important test — debug this before running full SWE-bench"
fi

# ── Test 4: Coverage from 0% to 80% ──────────────────────────────────────────

echo ""
echo "━━━ Test 4: Test coverage 0% → 80% (Hard) ━━━"
log_info "Using ms-test repo..."
cd "$BASE_DIR/ms-test"
rm -rf tests/ && mkdir -p tests

log_info "Running agent..."
$NOVA_CMD agent \
  --prompt "This repo has 0% test coverage. Add Jest tests for all functions in index.ts (or index.js if TypeScript conversion failed). Target 80% coverage. Steps: 1) Read the source file to understand all functions and edge cases, 2) Write tests/index.test.js (or .ts) covering all branches, 3) Run npm test -- --coverage and check the coverage report, 4) Add more tests for uncovered branches until you reach 80%." \
  --model "$MODEL" \
  --max-iterations "$MAX_ITER" \
  --workspace "$BASE_DIR/ms-test" \
  --log "$BASE_DIR/test4.jsonl" 2>/dev/null

COVERAGE=$(npm test -- --coverage --coverageReporters=text-summary 2>/dev/null | grep "Statements" | grep -oP '\d+\.\d+(?=%)' | head -1)
if [ -n "$COVERAGE" ] && (( $(echo "$COVERAGE >= 80" | bc -l 2>/dev/null || echo 0) )); then
    log_pass "Test 4: Coverage ${COVERAGE}% (target: 80%)"
else
    log_fail "Test 4: Coverage ${COVERAGE:-unknown}% (target: 80%)"
    echo "  Debug: check $BASE_DIR/test4.jsonl"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: $PASS/4 passed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for r in "${RESULTS[@]}"; do
    if [[ $r == PASS* ]]; then
        echo -e "  ${GREEN}$r${NC}"
    else
        echo -e "  ${RED}$r${NC}"
    fi
done
echo ""

if [ $PASS -eq 4 ]; then
    echo -e "${GREEN}All pre-flight tests passed. Ready for full SWE-bench run.${NC}"
    echo ""
    echo "Run full benchmark:"
    echo "  nova bench --tasks swe-bench-verified.jsonl --output predictions.jsonl --model $MODEL --max-iterations $MAX_ITER"
elif [ $PASS -ge 3 ]; then
    echo -e "${YELLOW}3/4 passed. Fix the failing test before running full SWE-bench.${NC}"
    echo "Test 3 (requests timeout) is the most critical — if it fails, debug it first."
else
    echo -e "${RED}$PASS/4 passed. Debug the failures before running full SWE-bench.${NC}"
    echo "Check the .jsonl log files in $BASE_DIR for iteration-by-iteration details."
fi
echo ""
