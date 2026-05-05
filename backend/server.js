require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const db = require("./db");
const { buildCatalogSystemPrompt } = require("./catalog");
const { buildUserPrompt } = require("@json-render/core");

const app = express();
const PORT = process.env.PORT || 3001;

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:5173",
    "http://localhost:3000",
  ],
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

// ─────────────────────────────────────────────
// SSE (Server-Sent Events) for real-time updates
// ─────────────────────────────────────────────
const sseClients = new Set();

function broadcastSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => res.write(payload));
}

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Heartbeat every 30s
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 30000);

  sseClients.add(res);
  console.log(`[SSE] Client connected. Total: ${sseClients.size}`);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    console.log(`[SSE] Client disconnected. Total: ${sseClients.size}`);
  });
});

// ─────────────────────────────────────────────
// Meta WhatsApp Webhook Verification
// ─────────────────────────────────────────────
app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`[Webhook] Verification attempt — mode: ${mode}, token: ${token}`);

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("[Webhook] ✅ Verified!");
    return res.status(200).send(challenge);
  }
  console.log("[Webhook] ❌ Verification failed.");
  return res.sendStatus(403);
});

// ─────────────────────────────────────────────
// Meta WhatsApp Webhook — Receive Messages
// ─────────────────────────────────────────────
app.post("/webhook/whatsapp", async (req, res) => {
  // Always respond 200 immediately (Meta requirement)
  res.sendStatus(200);

  const body = req.body;

  // Validate it's a WhatsApp message event
  if (
    body.object !== "whatsapp_business_account" ||
    !body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  ) {
    return;
  }

  const change = body.entry[0].changes[0].value;
  const message = change.messages[0];
  const fromNumber = message.from;
  const messageText = message.text?.body;
  const msgTimestamp = new Date(parseInt(message.timestamp) * 1000).toISOString();

  if (!messageText) {
    console.log("[Webhook] Received non-text message, skipping.");
    return;
  }

  console.log(`[Webhook] 📩 Message from ${fromNumber}: "${messageText}"`);

  // Process with Groq LLM
  try {
    const structuredJson = await processWithGroq(messageText, fromNumber);
    const id = uuidv4();

    db.insertConversation({
      id,
      from_number: fromNumber,
      message: messageText,
      structured_json: structuredJson,
      raw_llm_response: JSON.stringify(structuredJson),
      timestamp: msgTimestamp,
      intent: structuredJson.intent || null,
      confidence: structuredJson.confidence || null,
    });

    // Broadcast to SSE clients (React frontend)
    broadcastSSE({
      type: "new_message",
      data: {
        id,
        from_number: fromNumber,
        message: messageText,
        structured_json: structuredJson,
        timestamp: msgTimestamp,
      },
    });

    // Optionally send reply back on WhatsApp
    if (process.env.WHATSAPP_REPLY_ENABLED === "true") {
      await sendWhatsAppReply(fromNumber, structuredJson.response);
    }
  } catch (err) {
    console.error("[Webhook] ❌ LLM processing error:", err.message);
  }
});

// ─────────────────────────────────────────────
// n8n Ingest Endpoint
// Called by n8n after it processes the message
// ─────────────────────────────────────────────
app.post("/api/ingest", async (req, res) => {
  try {
    const { from_number, message, structured_json, timestamp } = req.body;

    if (!from_number || !message) {
      return res.status(400).json({ error: "Missing required fields: from_number, message" });
    }

    const id = uuidv4();

    // If no structured_json provided, generate it via LLM (or mock in dev)
    let parsedJson;
    if (!structured_json) {
      parsedJson = await processWithGroq(message, from_number);
    } else {
      parsedJson = typeof structured_json === "string"
        ? JSON.parse(structured_json)
        : structured_json;
      // Make sure external parsed json gets enriched too
      parsedJson = await enrichParsedJson(parsedJson);
    }

    const ts = timestamp || new Date().toISOString();

    db.insertConversation({
      id,
      from_number,
      message,
      structured_json: parsedJson,
      raw_llm_response: JSON.stringify(parsedJson),
      timestamp: ts,
      intent: parsedJson.intent || null,
      confidence: parsedJson.confidence || null,
    });

    broadcastSSE({ type: "new_message", data: { id, from_number, message, structured_json: parsedJson, timestamp: ts } });

    console.log(`[Ingest] ✅ Stored conversation ${id} from ${from_number} — intent: ${parsedJson.intent}`);
    return res.status(201).json({ id, message: "Conversation stored successfully", structured_json: parsedJson });
  } catch (err) {
    console.error("[Ingest] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// Test Message Endpoint — for frontend demo button
// ─────────────────────────────────────────────
app.post("/api/test-message", async (req, res) => {
  const testMessages = [
    { msg: "What's the weather like in Mumbai today?", from: "919876543210" },
    { msg: "I need help tracking my order #12345", from: "919123456780" },
    { msg: "Book a table for 2 at 7pm tonight at a good Italian place", from: "917654321098" },
    { msg: "Translate 'good morning' to Hindi", from: "916543210987" },
    { msg: "Remind me to call John tomorrow at 10am", from: "915432109876" },
    { msg: "Where can I find the best price for iPhone 15 Pro?", from: "914321098765" },
  ];
  const pick = testMessages[Math.floor(Math.random() * testMessages.length)];
  const from_number = req.body?.from_number || pick.from;
  const message = req.body?.message || pick.msg;

  try {
    const structuredJson = await processWithGroq(message, from_number);
    const id = uuidv4();
    const timestamp = new Date().toISOString();

    db.insertConversation({
      id,
      from_number,
      message,
      structured_json: structuredJson,
      raw_llm_response: JSON.stringify(structuredJson),
      timestamp,
      intent: structuredJson.intent || null,
      confidence: structuredJson.confidence || null,
    });

    broadcastSSE({ type: "new_message", data: { id, from_number, message, structured_json: structuredJson, timestamp } });
    console.log(`[Test] ✅ Simulated message from ${from_number}: "${message}"`);
    return res.status(201).json({ id, from_number, message, structured_json: structuredJson });
  } catch (err) {
    console.error("[Test] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// REST API Endpoints
// ─────────────────────────────────────────────
app.get("/api/conversations", (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const conversations = db.getAllConversations(limit, offset);
  res.json(conversations);
});

app.get("/api/conversations/stats", (req, res) => {
  const stats = db.getStats();
  res.json(stats);
});

app.get("/api/conversations/by-number/:number", (req, res) => {
  const conversations = db.getConversationsByNumber(req.params.number);
  res.json(conversations);
});

app.get("/api/conversations/:id", (req, res) => {
  const conversation = db.getConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ error: "Not found" });
  res.json(conversation);
});

app.delete("/api/conversations/:id", (req, res) => {
  const result = db.deleteConversation(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Not found" });
  broadcastSSE({ type: "delete_message", data: { id: req.params.id } });
  res.json({ message: "Deleted successfully" });
});

// Re-enrich a single conversation with fresh LLM + data enrichment
app.post("/api/conversations/:id/re-enrich", async (req, res) => {
  const conv = db.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: "Not found" });
  try {
    const structuredJson = await processWithGroq(conv.message, conv.from_number);
    db.updateConversationJson(req.params.id, structuredJson);
    broadcastSSE({ type: "update_message", data: { id: req.params.id, structured_json: structuredJson } });
    res.json({ id: req.params.id, structured_json: structuredJson });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Re-enrich ALL conversations that have no meaningful data
app.post("/api/conversations/re-enrich-all", async (req, res) => {
  const conversations = db.getAllConversations(200, 0);
  const needsEnrich = conversations.filter(c => {
    const j = c.structured_json;
    return !j?.weather_data && !j?.jira_tickets?.length && !j?.graph_data && !j?.table_data;
  });
  res.json({ queued: needsEnrich.length });
  // Process async in background
  (async () => {
    for (const conv of needsEnrich) {
      try {
        const structuredJson = await processWithGroq(conv.message, conv.from_number);
        db.updateConversationJson(conv.id, structuredJson);
        broadcastSSE({ type: "update_message", data: { id: conv.id, structured_json: structuredJson } });
        await new Promise(r => setTimeout(r, 500)); // Rate limit
      } catch (err) {
        console.error(`[ReEnrich] Failed ${conv.id}:`, err.message);
      }
    }
    console.log(`[ReEnrich] Done processing ${needsEnrich.length} conversations`);
  })();
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), sse_clients: sseClients.size });
});

// ─────────────────────────────────────────────
// Groq LLM Integration
// ─────────────────────────────────────────────
async function processWithGroq(userMessage, fromNumber) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const MODEL = process.env.GROQ_MODEL || "llama3-8b-8192";

  if (!GROQ_API_KEY || GROQ_API_KEY.includes("xxxx")) {
    return getMockResponse(userMessage);
  }

  // Use the catalog system prompt — tells LLM exactly which UI components
  // are available and how to format the spec JSON.
  const systemPrompt = buildCatalogSystemPrompt();

  // buildUserPrompt wraps the raw message with any current state/context
  const userPrompt = buildUserPrompt({ prompt: userMessage });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  let parsed = JSON.parse(content);

  // Inject model and timestamp into metadata
  parsed.metadata = { model: MODEL, processed_at: new Date().toISOString() };

  return enrichParsedJson(parsed);
}

// ─────────────────────────────────────────────
// Shared Enrichment Logic
// ─────────────────────────────────────────────
async function enrichParsedJson(parsed) {
  // ── Infer ui_render_type from intent or spec.type when LLM omits it ──
  const intentStr = (parsed.intent || "").toLowerCase();
  if (!parsed.ui_render_type || !["weather","graph","table","jira"].includes(parsed.ui_render_type)) {
    if (parsed.spec?.type === "WeatherFull")     parsed.ui_render_type = "weather";
    else if (parsed.spec?.type === "GraphWithTable") parsed.ui_render_type = "graph";
    else if (parsed.spec?.type === "TableCard")      parsed.ui_render_type = "table";
    else if (parsed.spec?.type === "JiraList")        parsed.ui_render_type = "jira";
    else if (intentStr.includes("weather") || intentStr.includes("forecast") || intentStr.includes("temperature")) parsed.ui_render_type = "weather";
    else if (intentStr.includes("graph") || intentStr.includes("chart") || intentStr.includes("visualization") || intentStr.includes("visual")) parsed.ui_render_type = "graph";
    else if (intentStr.includes("table") || intentStr.includes("report") || intentStr.includes("translation")) parsed.ui_render_type = "table";
    else parsed.ui_render_type = "jira";
  }

  // ── Backend data enrichment ──
  if (parsed.ui_render_type === "weather") {
    const loc = parsed.entities?.location
      || parsed.spec?.props?.weatherData?.location
      || "London";
    parsed.weather_data = await fetchWeather(loc);
    if (parsed.spec?.type === "WeatherFull") {
      parsed.spec.props = parsed.spec.props || {};
      parsed.spec.props.weatherData = parsed.weather_data;
    }
  } else if (parsed.ui_render_type === "jira") {
    parsed.jira_tickets = await fetchJiraIssues(parsed.entities);
  }

  return parsed;
}


// ─────────────────────────────────────────────
// Weather API Integration (Open-Meteo)
// ─────────────────────────────────────────────
async function fetchWeather(location) {
  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) {
      throw new Error("Location not found");
    }
    const { latitude, longitude, name, country } = geoData.results[0];

    // Fetch current conditions + 7-day daily forecast
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,wind_speed_10m,weather_code,relative_humidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
      `&timezone=auto&forecast_days=7`
    );
    const w = await weatherRes.json();

    const current = {
      location: `${name}, ${country}`,
      temperature: w.current.temperature_2m,
      unit: w.current_units.temperature_2m,
      wind_speed: w.current.wind_speed_10m,
      humidity: w.current.relative_humidity_2m,
      weather_code: w.current.weather_code
    };

    // Build graph_data — 7-day max temperature bar chart
    const dayLabels = w.daily.time.map(d => {
      const dt = new Date(d);
      return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
    });

    const graph_data = {
      title: `7-Day Temperature Forecast — ${name}`,
      x_label: "Day",
      y_label: `Temp (${w.current_units.temperature_2m})`,
      data_points: dayLabels.map((label, i) => ({
        label,
        value: w.daily.temperature_2m_max[i]
      }))
    };

    // Build table_data — 7-day detailed forecast table
    const table_data = {
      columns: ["Date", "Max °C", "Min °C", "Rain (mm)", "Wind (km/h)"],
      rows: w.daily.time.map((d, i) => ({
        "Date": dayLabels[i],
        "Max °C": w.daily.temperature_2m_max[i],
        "Min °C": w.daily.temperature_2m_min[i],
        "Rain (mm)": w.daily.precipitation_sum[i],
        "Wind (km/h)": w.daily.wind_speed_10m_max[i]
      }))
    };

    return { current, graph_data, table_data };
  } catch (err) {
    console.error("[Weather] Fetch error:", err.message);
    return { error: "Could not fetch weather data for " + location };
  }
}

// ─────────────────────────────────────────────
// Jira Integration
// ─────────────────────────────────────────────
async function fetchJiraIssues(entities) {
  const domain = process.env.JIRA_DOMAIN;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!domain || !email || !token) {
    console.log("[Jira] Missing credentials. Returning mock data.");
    return [
      { id: "MOCK-1", title: "Mock Jira Ticket (Setup .env)", status: "To Do", priority: "High", assignee: "Unassigned" },
      { id: "MOCK-2", title: "Add JIRA_DOMAIN, JIRA_EMAIL, JIRA_API_TOKEN", status: "In Progress", priority: "Highest", assignee: "Admin" }
    ];
  }

  let jql = "project IS NOT EMPTY order by created DESC";

  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  
  try {
    const body = JSON.stringify({
      jql: jql,
      maxResults: 5,
      fields: ["summary", "status", "priority", "assignee"]
    });

    const res = await fetch(`https://${domain}.atlassian.net/rest/api/3/search/jql`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: body
    });

    if (!res.ok) {
      throw new Error(`Jira API error: ${res.status}`);
    }

    const data = await res.json();
    return data.issues.map(issue => ({
      id: issue.key,
      title: issue.fields.summary,
      status: issue.fields.status.name,
      priority: issue.fields.priority?.name || "None",
      assignee: issue.fields.assignee?.displayName || "Unassigned"
    }));
  } catch (err) {
    console.error("[Jira] Fetch error:", err.message);
    return [
      { id: "ERR-1", title: `Error fetching from Jira: ${err.message}`, status: "Error", priority: "Critical", assignee: "System" }
    ];
  }
}

// ─────────────────────────────────────────────
// Mock response for development/testing
// ─────────────────────────────────────────────
function getMockResponse(userMessage) {
  const msgLower = userMessage.toLowerCase();
  
  let ui_render_type = "default";
  let intent = "general_question";
  let extraData = {};

  if (msgLower.includes("jira") || msgLower.includes("ticket") || msgLower.includes("issue")) {
    ui_render_type = "jira";
    intent = "issue_tracking";
    extraData.jira_tickets = [
      { id: "PROJ-101", title: "Fix login bug", status: "In Progress", priority: "High", assignee: "Alice" },
      { id: "PROJ-102", title: "Update landing page", status: "Open", priority: "Medium", assignee: "Bob" },
      { id: "PROJ-103", title: "Database migration", status: "Done", priority: "Critical", assignee: "Charlie" }
    ];
  } else if (msgLower.includes("graph") || msgLower.includes("chart") || msgLower.includes("plot")) {
    ui_render_type = "graph";
    intent = "data_visualization";
    extraData.graph_data = {
      title: "Weekly User Signups",
      x_label: "Days",
      y_label: "Signups",
      data_points: [
        { label: "Mon", value: 45 },
        { label: "Tue", value: 52 },
        { label: "Wed", value: 38 },
        { label: "Thu", value: 65 },
        { label: "Fri", value: 80 }
      ]
    };
  } else if (msgLower.includes("table") || msgLower.includes("list") || msgLower.includes("report")) {
    ui_render_type = "table";
    intent = "data_visualization";
    extraData.table_data = {
      columns: ["Name", "Role", "Department", "Performance"],
      rows: [
        { Name: "Sarah", Role: "Engineer", Department: "Tech", Performance: "Excellent" },
        { Name: "Mike", Role: "Designer", Department: "Product", Performance: "Good" },
        { Name: "Emma", Role: "Manager", Department: "Ops", Performance: "Outstanding" }
      ]
    };
  } else {
    const intents = ["weather_query", "product_search", "support_request", "general_question", "booking", "reminder"];
    intent = intents[Math.floor(Math.random() * intents.length)];
  }

  return {
    intent,
    ui_render_type,
    entities: {
      query: userMessage.substring(0, 50),
      user_message_length: userMessage.length,
    },
    response: `[MOCK] I received your message: "${userMessage}". In production, this will be a real AI response.`,
    sentiment: "neutral",
    confidence: 0.85 + Math.random() * 0.14,
    language: "en",
    suggested_actions: ["get_more_info", "connect_to_agent"],
    category: "general",
    priority: "medium",
    ...extraData,
    metadata: {
      model: "mock-dev-mode",
      processed_at: new Date().toISOString(),
      note: "Set GROQ_API_KEY in .env for real AI responses",
    },
  };
}

// ─────────────────────────────────────────────
// Send WhatsApp Reply (Optional)
// ─────────────────────────────────────────────
async function sendWhatsAppReply(toNumber, responseText) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) return;

  await fetch(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toNumber,
        type: "text",
        text: { body: responseText },
      }),
    }
  );
}

// ─────────────────────────────────────────────
// Chat Streaming Endpoint (catalog-driven)
// Mirrors the Next.js POST /api/chat pattern from @json-render docs.
// Streams Groq response as newline-delimited JSON for the frontend
// ChatPanel to consume and progressively render via @json-render/react.
// ─────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!GROQ_API_KEY || GROQ_API_KEY.includes("xxxx")) {
    return res.status(400).json({ error: "GROQ_API_KEY not configured" });
  }

  const { prompt, context } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  // Use buildUserPrompt from @json-render/core to structure the input
  // (wraps message with any currentSpec/state context for edit flows)
  const userPrompt = buildUserPrompt({
    prompt,
    state: context?.state,
    currentSpec: context?.currentSpec,
  });

  const systemPrompt = buildCatalogSystemPrompt();

  // Set up streaming SSE-style response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 1500,
        response_format: { type: "json_object" },
        stream: true,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      res.write(`data: ${JSON.stringify({ error: err })}\n\n`);
      return res.end();
    }

    // Accumulate streamed chunks, then parse the full JSON and enrich it
    let fullContent = "";
    const reader = groqRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        try {
          const evt = JSON.parse(raw);
          const delta = evt.choices?.[0]?.delta?.content || "";
          fullContent += delta;
          if (delta) res.write(`data: ${JSON.stringify({ type: "delta", delta })}\n\n`);
        } catch { /* skip malformed SSE chunks */ }
      }
    }

    // Parse the complete JSON once streaming is done
    let parsed;
    try {
      parsed = JSON.parse(fullContent);
    } catch (parseErr) {
      // Fallback: retry as non-streaming to get clean JSON
      console.warn("[Chat] Stream parse failed, retrying non-streaming...");
      try {
        const fallbackRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.5,
            max_tokens: 1500,
            response_format: { type: "json_object" },
          }),
        });
        const fallbackData = await fallbackRes.json();
        parsed = JSON.parse(fallbackData.choices[0]?.message?.content);
      } catch (fallbackErr) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Could not parse LLM response" })}\n\n`);
        return res.end();
      }
    }

    // Inject metadata
    parsed.metadata = { model: MODEL, processed_at: new Date().toISOString() };

    parsed = await enrichParsedJson(parsed);

    // Emit the fully resolved spec as the final event
    res.write(`data: ${JSON.stringify({ type: "done", result: parsed })}\n\n`);
    res.end();
  } catch (err) {
    console.error("[Chat] Error:", err.message);
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
    res.end();
  }
});

// ─────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   WhatsApp AI Backend — Running          ║
║   http://localhost:${PORT}                  ║
║                                          ║
║   POST /api/ingest      (n8n data in)   ║
║   GET  /api/conversations               ║
║   GET  /api/events      (SSE stream)    ║
║   GET  /webhook/whatsapp (Meta verify)  ║
╚══════════════════════════════════════════╝
  `);
});
