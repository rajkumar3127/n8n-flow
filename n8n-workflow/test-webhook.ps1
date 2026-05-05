# ============================================================
# test-webhook.ps1 — Send a fake WhatsApp message to n8n
# ============================================================
# Prerequisites:
#   1. n8n must be running:  start-n8n.ps1
#   2. Backend must be running: cd backend && npm run dev
#   3. Workflow must be ACTIVE in n8n (toggle it on!)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File n8n-workflow\test-webhook.ps1
#   powershell -ExecutionPolicy Bypass -File n8n-workflow\test-webhook.ps1 -Message "Book a cab to airport"

param(
  [string]$Message = "",
  [string]$From = "919876543210",
  [string]$N8nUrl = "http://localhost:5678/webhook/whatsapp"
)

$ErrorActionPreference = "Stop"

# Sample messages to rotate through
$SampleMessages = @(
  "What's the weather like in Mumbai today?",
  "I need help tracking my order #12345",
  "Book a table for 2 at 7pm tonight at a good Italian restaurant",
  "Translate 'good morning' to Spanish",
  "Remind me to call John tomorrow at 10am",
  "Where can I find the best price for iPhone 15 Pro?",
  "I want to complain about my recent delivery",
  "What are the symptoms of food poisoning?"
)

if (-not $Message) {
  $Message = $SampleMessages | Get-Random
}

$Timestamp = [int][double]::Parse((Get-Date -UFormat %s))
$MessageId = "wamid.test" + (Get-Random -Minimum 100000 -Maximum 999999)

$Payload = @{
  object = "whatsapp_business_account"
  entry  = @(
    @{
      id      = "TEST_WABA_ID"
      changes = @(
        @{
          value = @{
            messaging_product = "whatsapp"
            metadata          = @{
              display_phone_number = "15550001234"
              phone_number_id      = "9566238171"
            }
            contacts          = @(
              @{
                profile = @{ name = "Test User" }
                wa_id   = $From
              }
            )
            messages          = @(
              @{
                from      = $From
                id        = $MessageId
                timestamp = $Timestamp.ToString()
                text      = @{ body = $Message }
                type      = "text"
              }
            )
          }
          field = "messages"
        }
      )
    }
  )
} | ConvertTo-Json -Depth 10

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         WhatsApp AI — Local Webhook Tester              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "📤 Sending fake WhatsApp message to n8n..." -ForegroundColor Yellow
Write-Host "   From    : $From" -ForegroundColor White
Write-Host "   Message : $Message" -ForegroundColor White
Write-Host "   n8n URL : $N8nUrl" -ForegroundColor White
Write-Host ""

try {
  $Response = Invoke-RestMethod `
    -Uri $N8nUrl `
    -Method POST `
    -ContentType "application/json" `
    -Body $Payload

  Write-Host "✅ n8n responded successfully!" -ForegroundColor Green
  Write-Host "   Response: $($Response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
  $StatusCode = $_.Exception.Response.StatusCode.value__
  $ErrorMsg   = $_.Exception.Message
  Write-Host "❌ Request failed (HTTP $StatusCode): $ErrorMsg" -ForegroundColor Red
  Write-Host ""
  Write-Host "💡 Troubleshooting:" -ForegroundColor Yellow
  Write-Host "   • Is n8n running? → powershell -File n8n-workflow\start-n8n.ps1" -ForegroundColor Gray
  Write-Host "   • Is the workflow ACTIVE? → Toggle it ON in n8n UI (http://localhost:5678)" -ForegroundColor Gray
  Write-Host "   • Is the backend running? → cd backend && npm run dev" -ForegroundColor Gray
  exit 1
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "Next: Check the React dashboard at http://localhost:5173" -ForegroundColor Cyan
Write-Host "      New conversation card should appear in ~2-3 seconds!" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
