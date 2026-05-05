# WhatsApp AI × n8n — Full Integration Guide

This guide wires **Meta WhatsApp Business API → n8n → Groq LLM → Express Backend → React Dashboard** together end-to-end.

---

## Architecture

```
📱 WhatsApp User
       │
       ▼
 Meta WhatsApp API
       │  POST (webhook)
       ▼
 ┌─────────────────────┐
 │   n8n  :5678        │
 │  ┌─────────────┐    │
 │  │ GET verify  │─── ┼──► returns hub.challenge to Meta
 │  │ POST msg    │    │
 │  └──────┬──────┘    │
 │         │           │
 │  Extract Message    │
 │         │           │
 │  Groq LLM (AI)      │
 │         │           │
 │  Parse Response     │
 └─────────┼───────────┘
           │  POST /api/ingest
           ▼
 ┌──────────────────────┐
 │  Express Backend     │
 │     :3001            │
 │   lowdb storage      │
 │   SSE broadcast      │
 └──────────┬───────────┘
            │  SSE stream
            ▼
 ┌──────────────────────┐
 │  React Dashboard     │
 │     :5173            │
 │  Glassmorphic UI     │
 └──────────────────────┘
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | **18+** | https://nodejs.org |
| npm | 9+ | bundled with Node |
| ngrok | any | https://ngrok.com/download |
| Meta WhatsApp Business account | — | https://developers.facebook.com |

---

## Step 1 — Start All Three Services

Open **3 separate PowerShell terminals** in the project root.

### Terminal 1 — Express Backend
```powershell
cd backend
npm install
npm run dev
```
> ✅ Should print: `WhatsApp AI Backend — Running on http://localhost:3001`

### Terminal 2 — React Frontend
```powershell
cd frontend
npm install
npm run dev
```
> ✅ Should open: `http://localhost:5173`

### Terminal 3 — n8n
```powershell
powershell -ExecutionPolicy Bypass -File n8n-workflow\start-n8n.ps1
```
> ✅ Should print: `Editor is now accessible via: http://localhost:5678/`

---

## Step 2 — Set Up n8n (First Time Only)

1. Open **http://localhost:5678** in your browser
2. Create your admin account (email + password — stored locally)
3. Skip the questionnaire

---

## Step 3 — Import the Workflow

1. In n8n, click **"+"** (New Workflow) in the top menu
2. Click the **⋮ (three-dot)** menu → **"Import from File"**
3. Select: `n8n-workflow/workflow.json`
4. The workflow canvas will load with 9 nodes
5. Click **"Save"** (Ctrl+S)
6. **Activate** the workflow using the toggle in the top-right corner

> [!IMPORTANT]
> The workflow **must be Active** (green toggle) for the webhook to work.

---

## Step 4 — Verify Webhook URLs

Once the workflow is active, n8n creates two webhook endpoints:

| Method | URL | Purpose |
|---|---|---|
| `GET` | `http://localhost:5678/webhook/whatsapp` | Meta webhook verification |
| `POST` | `http://localhost:5678/webhook/whatsapp` | Incoming messages |

---

## Step 5 — Test Locally (No Meta Required)

Run the test script in a new terminal:

```powershell
powershell -ExecutionPolicy Bypass -File n8n-workflow\test-webhook.ps1
```

Or with a custom message:
```powershell
powershell -ExecutionPolicy Bypass -File n8n-workflow\test-webhook.ps1 -Message "Book a cab to the airport at 6am"
```

**Expected flow:**
1. ✅ Script sends fake WhatsApp payload → n8n
2. ✅ n8n extracts message → calls Groq LLM
3. ✅ n8n POSTs structured JSON → `http://localhost:3001/api/ingest`
4. ✅ Backend stores in lowdb → broadcasts via SSE
5. ✅ React dashboard shows new conversation card

Check the backend logs (`Terminal 1`) for:
```
[Ingest] ✅ Stored conversation <uuid> from 919876543210 — intent: booking
```

---

## Step 6 — Connect to Real Meta WhatsApp (Production)

### 6a. Start ngrok tunnel

```powershell
ngrok http 5678
```

ngrok will print a URL like:
```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:5678
```

Your public webhook URL is:
```
https://abc123.ngrok-free.app/webhook/whatsapp
```

### 6b. Configure Meta Developer Console

1. Go to **https://developers.facebook.com/apps**
2. Select your app → **WhatsApp → Configuration**
3. Under **Webhook**:
   - **Callback URL**: `https://abc123.ngrok-free.app/webhook/whatsapp`
   - **Verify Token**: `n8n_whatsapp_token` *(matches `WHATSAPP_VERIFY_TOKEN` in `.env`)*
4. Click **Verify and Save**
5. Subscribe to **"messages"** field

> [!WARNING]
> ngrok free tier URLs **change every time** you restart ngrok. You'll need to update Meta's webhook URL each time. Use a paid ngrok plan or a VPS for persistent URLs.

### 6c. Test with a real phone

Send a WhatsApp message to your test number. Watch the React dashboard — the card should appear within ~2-3 seconds.

---

## Workflow Node Map

| Node | Purpose |
|---|---|
| **WhatsApp Webhook GET** | Handles Meta's `hub.challenge` verification |
| **WhatsApp Webhook POST** | Receives incoming message events |
| **Send Challenge** | Returns `hub.challenge` to Meta (200 OK) |
| **Extract Message** | Parses WhatsApp payload, extracts text + metadata |
| **Should Skip?** | Skips non-text messages (images, audio, etc.) |
| **Respond Skip OK** | Returns 200 OK to Meta on skipped messages |
| **Groq LLM** | Calls `llama-3.3-70b-versatile` for intent classification |
| **Parse LLM Response** | Parses JSON from Groq, builds ingest payload |
| **Store in Backend** | POSTs to `localhost:3001/api/ingest` |
| **Respond 200 OK** | Returns 200 OK to Meta after processing |

---

## Environment Variables Reference

The backend `.env` file controls all credentials:

```env
PORT=3001
WHATSAPP_VERIFY_TOKEN=n8n_whatsapp_token   # Must match Meta webhook config
WHATSAPP_ACCESS_TOKEN=<your-meta-token>    # For sending replies (optional)
WHATSAPP_PHONE_NUMBER_ID=<your-phone-id>   # For sending replies (optional)
GROQ_API_KEY=<your-groq-key>               # Also embedded in workflow.json
GROQ_MODEL=llama-3.3-70b-versatile
N8N_WEBHOOK_SECRET=my_n8n_secret
FRONTEND_URL=http://localhost:5173
```

> [!NOTE]
> The Groq API key is embedded directly in `workflow.json` for simplicity. For production, use n8n's built-in **Credentials** system (Settings → Credentials → New → HTTP Header Auth).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| n8n webhook returns 404 | Make sure the workflow is **Active** (green toggle) |
| Groq returns 401 | Check the API key in `workflow.json` node "Groq LLM" |
| Backend ingest returns 400 | Check backend is running on port 3001 |
| Meta says "Verification failed" | Make sure `WHATSAPP_VERIFY_TOKEN` matches Meta config |
| SSE not streaming to React | Check CORS — frontend must be at `http://localhost:5173` |
| n8n won't start | Check Node version: `node --version` (must be 18+) |

---

## Data Flow Summary

```
WhatsApp msg
  → n8n extracts: { from_number, message, timestamp }
  → Groq returns: { intent, entities, response, sentiment, confidence, ... }
  → Backend stores: all fields + structured_json in lowdb
  → SSE broadcasts: { type: "new_message", data: {...} }
  → React renders: conversation card with intent badge + JSON tree
```
