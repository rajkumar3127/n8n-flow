# ============================================================
# start-n8n.ps1 — Start n8n for WhatsApp AI Automation
# ============================================================
# Run from the project root:
#   powershell -ExecutionPolicy Bypass -File n8n-workflow\start-n8n.ps1

$ErrorActionPreference = "Stop"

function Write-Banner {
  Write-Host ""
  Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
  Write-Host "║         WhatsApp AI — n8n Automation Launcher           ║" -ForegroundColor Cyan
  Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
  Write-Host ""
}

function Write-Step($num, $text) {
  Write-Host "  [$num] $text" -ForegroundColor Yellow
}

Write-Banner

# ─── Check Node version ───────────────────────────────────────────
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
  Write-Host "❌ Node.js is not installed. Please install Node 18+ from https://nodejs.org" -ForegroundColor Red
  exit 1
}
$major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
if ($major -lt 18) {
  Write-Host "❌ Node.js $nodeVersion detected. n8n requires Node 18+. Please upgrade." -ForegroundColor Red
  exit 1
}
Write-Host "✅ Node.js $nodeVersion detected" -ForegroundColor Green

# ─── Show next steps ──────────────────────────────────────────────
Write-Host ""
Write-Host "📋 AFTER n8n starts (http://localhost:5678), follow these steps:" -ForegroundColor Magenta
Write-Host ""
Write-Step "1" "Open http://localhost:5678 and create your admin account"
Write-Step "2" "Go to Settings → n8n API and enable API access"
Write-Step "3" "Import the workflow:"
Write-Host "       -> Click the + (New Workflow) button"
Write-Host "       -> Click the ⋮ menu -> Import from File"
Write-Host "       -> Select: n8n-workflow\workflow.json" -ForegroundColor White
Write-Step "4" "Activate the workflow (toggle in top-right)"
Write-Step "5" "Note your webhook URL:"
Write-Host "       http://localhost:5678/webhook/whatsapp (POST)" -ForegroundColor White
Write-Host "       http://localhost:5678/webhook/whatsapp (GET — Meta verify)" -ForegroundColor White
Write-Step "6" "Run ngrok for a public URL (see README.md)"
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "  To test locally WITHOUT Meta, run in another terminal:" -ForegroundColor DarkGray
Write-Host "  powershell -ExecutionPolicy Bypass -File n8n-workflow\test-webhook.ps1" -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "🚀 Starting n8n on http://localhost:5678 ..." -ForegroundColor Green
Write-Host "   (Press Ctrl+C to stop)" -ForegroundColor DarkGray
Write-Host ""

# ─── Launch n8n ───────────────────────────────────────────────────
$env:N8N_PORT = "5678"
$env:N8N_HOST = "localhost"
$env:N8N_PROTOCOL = "http"
$env:N8N_LOG_LEVEL = "info"
$env:N8N_DIAGNOSTICS_ENABLED = "false"
$env:N8N_PERSONALIZATION_ENABLED = "false"

npx n8n
