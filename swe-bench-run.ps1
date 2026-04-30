# ─── Nova CLI — SWE-bench Pre-flight Test Runner (Windows) ───────────────────
# Usage: .\swe-bench-run.ps1 [-Model "poolside/laguna-xs.2:free"] [-MaxIter 40]
#
# Uses repos already cloned in C:\Users\Buddy\Desktop\Tests

param(
    [string]$Model = "gpt-4o-mini",
    [int]$MaxIter = 40,
    [string]$ApiKey = "",
    [string]$PuterToken = "",
    [switch]$Puter
)

$BaseDir = "C:\Users\Buddy\Desktop\Tests"
$Pass = 0
$Fail = 0
$Results = @()

function Log-Pass($msg) { Write-Host "✓ PASS $msg" -ForegroundColor Green; $script:Pass++; $script:Results += "PASS: $msg" }
function Log-Fail($msg) { Write-Host "✗ FAIL $msg" -ForegroundColor Red; $script:Fail++; $script:Results += "FAIL: $msg" }
function Log-Info($msg) { Write-Host "→ $msg" -ForegroundColor Yellow }

$CliDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NovaCli = if (Get-Command nova -ErrorAction SilentlyContinue) { "nova" } else { "npx tsx `"$CliDir\nova-agent.ts`"" }

# ── API setup ─────────────────────────────────────────────────────────────────

$PuterFlag = ""
if ($Puter -or $PuterToken -or $env:PUTER_TOKEN) {
    # Puter mode — no API key needed
    $PuterFlag = "--puter"
    $token = if ($PuterToken) { $PuterToken } elseif ($env:PUTER_TOKEN) { $env:PUTER_TOKEN } else { "" }
    if ($token) { $PuterFlag = "--puter --puter-token `"$token`"" }
    $env:NOVA_API_BASE = "https://api.puter.com/puterai/openai/v1"
    $env:NOVA_API_KEY = if ($token) { $token } else { "puter-free" }
    Write-Host "Using Puter.js (free, no API key required)" -ForegroundColor Green
} else {
    # OpenRouter mode
    if (-not $ApiKey) { $ApiKey = $env:NOVA_API_KEY }
    if (-not $ApiKey) { $ApiKey = $env:OPENAI_API_KEY }
    if (-not $ApiKey) {
        Write-Host ""
        Write-Host "Options:" -ForegroundColor Cyan
        Write-Host "  1. Use Puter (free, no key): .\swe-bench-run.ps1 -Puter" -ForegroundColor Cyan
        Write-Host "     Or with token: .\swe-bench-run.ps1 -PuterToken 'your-token'" -ForegroundColor Cyan
        Write-Host "     Get token: puter.com → F12 → Application → Cookies → auth_token" -ForegroundColor Cyan
        Write-Host "  2. Use OpenRouter (free tier): .\swe-bench-run.ps1 -ApiKey 'sk-or-v1-...'" -ForegroundColor Cyan
        Write-Host "     Get free key: https://openrouter.ai/keys" -ForegroundColor Cyan
        Write-Host ""
        $choice = Read-Host "Enter API key or Puter token (or press Enter to use Puter without token)"
        if ($choice) {
            if ($choice.StartsWith("sk-or-") -or $choice.StartsWith("sk-")) {
                $ApiKey = $choice
                $env:NOVA_API_KEY = $ApiKey
                $env:NOVA_API_BASE = "https://openrouter.ai/api/v1"
            } else {
                # Treat as Puter token
                $PuterToken = $choice
                $PuterFlag = "--puter --puter-token `"$PuterToken`""
                $env:NOVA_API_BASE = "https://api.puter.com/puterai/openai/v1"
                $env:NOVA_API_KEY = $PuterToken
            }
        } else {
            # No key — try Puter without token
            $PuterFlag = "--puter"
            $env:NOVA_API_BASE = "https://api.puter.com/puterai/openai/v1"
            $env:NOVA_API_KEY = "puter-free"
            Write-Host "Trying Puter without token (may have rate limits)" -ForegroundColor Yellow
        }
    } else {
        $env:NOVA_API_KEY = $ApiKey
        $env:NOVA_API_BASE = "https://openrouter.ai/api/v1"
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  Nova CLI — SWE-bench Pre-flight Tests" -ForegroundColor Cyan
Write-Host "  Model: $Model  |  Max iterations: $MaxIter" -ForegroundColor Cyan
Write-Host "  API Base: $env:NOVA_API_BASE" -ForegroundColor Cyan
Write-Host "  Base dir: $BaseDir" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# ── Test 1: Express /health endpoint ─────────────────────────────────────────

Write-Host "━━━ Test 1: Express /health endpoint (Easy) ━━━" -ForegroundColor Cyan
$ExpressDir = "$BaseDir\express"

if (-not (Test-Path $ExpressDir)) {
    Log-Info "Cloning express..."
    git clone --depth=1 https://github.com/expressjs/express $ExpressDir
}

Set-Location $ExpressDir
Log-Info "Installing dependencies..."
npm install --silent 2>$null

# Clean up any previous test run
if (Test-Path "test\health.js") { Remove-Item "test\health.js" -Force }

Log-Info "Running agent (max $MaxIter iterations)..."
Invoke-Expression "$NovaCli agent $PuterFlag --prompt `"Read one existing test file in test/ to understand the supertest pattern, then write test/health.js — a Mocha test using supertest that creates a minimal Express app with a GET /health route returning {status: 'ok'}, and asserts the response is 200 with that body. The test file should be self-contained (create its own app instance). Run npm test and confirm the health test passes. Do not stop after writing the file — you must run npm test and show the result.`" --model `"$Model`" --max-iterations $MaxIter --workspace `"$ExpressDir`" --log `"$BaseDir\test1.jsonl`""

$npmTestOutput = npm test 2>&1
$testPassed = (Test-Path "test\health.js") -and ($npmTestOutput -match "passing")
if ($testPassed) { Log-Pass "Test 1: Express /health endpoint" }
else {
    Log-Fail "Test 1: Express /health endpoint"
    if (-not (Test-Path "test\health.js")) { Write-Host "  test/health.js was not created" -ForegroundColor Red }
    else { Write-Host "  test/health.js exists but npm test failed" -ForegroundColor Red }
    Write-Host "  Log: $BaseDir\test1.jsonl" -ForegroundColor Yellow
}

# ── Test 2: MS to TypeScript ──────────────────────────────────────────────────

Write-Host ""
Write-Host "━━━ Test 2: MS to TypeScript (Medium) ━━━" -ForegroundColor Cyan
$MsDir = "$BaseDir\ms"

if (-not (Test-Path $MsDir)) {
    Log-Info "Cloning ms..."
    git clone --depth=1 https://github.com/vercel/ms $MsDir
}

Set-Location $MsDir
Log-Info "Installing dependencies..."
npm install --silent 2>$null

Log-Info "Running agent (max $MaxIter iterations)..."
Invoke-Expression "$NovaCli agent $PuterFlag --prompt `"Convert index.js to TypeScript. Follow these steps exactly: 1) Read index.js fully to understand the code, 2) Use move_file to rename index.js to index.ts, 3) Add TypeScript type annotations to all functions and variables, 4) Create tsconfig.json with strict:false if it does not exist, 5) Run get_diagnostics on index.ts to check for errors, 6) Fix any type errors one by one, 7) Run bash('npx tsc --noEmit') to verify zero errors. Do not stop until tsc reports no errors.`" --model `"$Model`" --max-iterations $MaxIter --workspace `"$MsDir`" --log `"$BaseDir\test2.jsonl`""

$tscOutput = npx tsc --noEmit 2>&1
$tscPassed = (Test-Path "index.ts") -and ($LASTEXITCODE -eq 0)
if ($tscPassed) { Log-Pass "Test 2: MS to TypeScript" }
else {
    Log-Fail "Test 2: MS to TypeScript"
    if (-not (Test-Path "index.ts")) { Write-Host "  index.ts was not created" -ForegroundColor Red }
    else { Write-Host "  index.ts exists but tsc reports errors: $($tscOutput | Select-Object -First 3)" -ForegroundColor Red }
    Write-Host "  Log: $BaseDir\test2.jsonl" -ForegroundColor Yellow
}

# ── Test 3: Requests timeout bug ─────────────────────────────────────────────

Write-Host ""
Write-Host "━━━ Test 3: Requests timeout bug — SWE-bench Lite #1 (Critical) ━━━" -ForegroundColor Cyan
$RequestsDir = "$BaseDir\requests"

if (-not (Test-Path $RequestsDir)) {
    Log-Info "Cloning requests..."
    git clone https://github.com/psf/requests $RequestsDir
}

Set-Location $RequestsDir
Log-Info "Checking out buggy commit 2e3e6f4..."
git checkout 2e3e6f4 2>$null
Log-Info "Installing dependencies..."
pip install -e ".[test]" --quiet 2>$null

Log-Info "Running agent (max $MaxIter iterations)..."
Invoke-Expression "$NovaCli agent $PuterFlag --prompt `"Fix: requests.get('https://httpbin.org/delay/10', timeout=5) does not raise a timeout exception after 5 seconds. It should raise requests.exceptions.Timeout. MANDATORY FIRST STEP: Run python -m pytest tests/test_requests.py -k test_timeout -xvs 2>&1 to see the exact failure. Read the error carefully. Then find the bug in requests/sessions.py or requests/adapters.py. Make the minimal fix. Run the test again to verify it passes. Only edit files in the requests/ directory.`" --model `"$Model`" --max-iterations $MaxIter --workspace `"$RequestsDir`" --log `"$BaseDir\test3.jsonl`""

$pytestOutput = python -m pytest tests/test_requests.py -k test_timeout -x --tb=no -q 2>&1
if ($pytestOutput -match "passed") {
    Log-Pass "Test 3: Requests timeout bug"
} else {
    Log-Fail "Test 3: Requests timeout bug"
    Write-Host "  This is the most critical test for SWE-bench readiness" -ForegroundColor Yellow
    Write-Host "  Log: $BaseDir\test3.jsonl" -ForegroundColor Yellow
    Write-Host "  Manual check: python -m pytest tests/test_requests.py -k test_timeout -xvs" -ForegroundColor Yellow
}

# ── Test 4: Coverage ──────────────────────────────────────────────────────────

Write-Host ""
Write-Host "━━━ Test 4: Test coverage 0% → 80% (Hard) ━━━" -ForegroundColor Cyan
Set-Location $MsDir

# Reset tests directory
if (Test-Path "tests") { Remove-Item -Recurse -Force "tests" }
New-Item -ItemType Directory -Force -Path "tests" | Out-Null

Log-Info "Running agent (max $MaxIter iterations)..."
Invoke-Expression "$NovaCli agent $PuterFlag --prompt `"This repo has 0% test coverage. Add Jest tests for all functions in index.ts (or index.js if TypeScript conversion failed). Target 80% statement coverage. Steps: 1) Run npm test -- --coverage to see current state, 2) Read the source file to understand all functions and edge cases, 3) Write tests/index.test.js (or .ts) covering all branches including edge cases, 4) Run npm test -- --coverage again and check the Statements % in the report, 5) Add more tests for uncovered lines until you reach 80%. Do not stop until coverage is at or above 80%.`" --model `"$Model`" --max-iterations $MaxIter --workspace `"$MsDir`" --log `"$BaseDir\test4.jsonl`""

$coverageOutput = npm test -- --coverage --coverageReporters=text-summary 2>&1
$coverageMatch = ($coverageOutput | Select-String "Statements") | Select-Object -First 1
$coveragePct = 0
if ($coverageMatch) {
    if ($coverageMatch.Line -match '(\d+\.?\d*)%') { $coveragePct = [double]$Matches[1] }
}
if ($coveragePct -ge 80) { Log-Pass "Test 4: Coverage ${coveragePct}% (target: 80%)" }
else {
    Log-Fail "Test 4: Coverage ${coveragePct}% (target: 80%)"
    Write-Host "  Log: $BaseDir\test4.jsonl" -ForegroundColor Yellow
}

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  Results: $Pass/4 passed" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
foreach ($r in $Results) {
    if ($r -match "^PASS") { Write-Host "  $r" -ForegroundColor Green }
    else { Write-Host "  $r" -ForegroundColor Red }
}
Write-Host ""

if ($Pass -eq 4) {
    Write-Host "All pre-flight tests passed. Ready for full SWE-bench run." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next step — run full benchmark:"
    Write-Host "  nova bench --tasks swe-bench-verified.jsonl --output predictions.jsonl --model $Model --max-iterations $MaxIter"
} elseif ($Pass -ge 3) {
    Write-Host "3/4 passed. Fix the failing test before running full SWE-bench." -ForegroundColor Yellow
    Write-Host "Test 3 (requests timeout) is the most critical — if it fails, debug it first."
} else {
    Write-Host "$Pass/4 passed. Debug the failures before running full SWE-bench." -ForegroundColor Red
    Write-Host "Check the .jsonl log files in $BaseDir for iteration-by-iteration details."
}
Write-Host ""
Write-Host "Log files:"
Write-Host "  Test 1: $BaseDir\test1.jsonl"
Write-Host "  Test 2: $BaseDir\test2.jsonl"
Write-Host "  Test 3: $BaseDir\test3.jsonl"
Write-Host "  Test 4: $BaseDir\test4.jsonl"
Write-Host ""
