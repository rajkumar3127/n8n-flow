import { useEffect, useState, useCallback, useRef } from "react";
import ConversationCard from "./components/ConversationCard";
import ChatPanel from "./components/ChatPanel";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

// ─── Toast notifications ───
function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span>{t.type === "success" ? "✅" : t.type === "error" ? "❌" : "ℹ️"}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Pipeline Diagram ───
function PipelinePanel({ msgCount }) {
  const steps = [
    { icon: "📱", label: "WhatsApp", active: msgCount > 0 },
    { icon: "🔗", label: "Meta API", active: msgCount > 0 },
    { icon: "⚙️", label: "n8n", active: msgCount > 0 },
    { icon: "🤖", label: "Groq LLM", active: msgCount > 0 },
    { icon: "{ }", label: "JSON", active: msgCount > 0 },
    { icon: "🗄️", label: "SQLite", active: msgCount > 0 },
    { icon: "⚛️", label: "React", active: true },
  ];

  return (
    <div className="pipeline-panel">
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 14, letterSpacing: 0.5 }}>
        PIPELINE STATUS
      </div>
      <div className="pipeline-steps">
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <div className={`pipeline-step ${step.active ? "active" : ""}`}>
              <div className="pipeline-step-icon">{step.icon}</div>
              <div className="pipeline-step-label">{step.label}</div>
            </div>
            {i < steps.length - 1 && (
              <div className={`pipeline-arrow ${step.active ? "active" : ""}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [stats, setStats] = useState({ total: 0, last_hour: 0, by_intent: [] });
  const [loading, setLoading] = useState(true);
  const [sseStatus, setSseStatus] = useState("connecting"); // connecting | connected | disconnected
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [toasts, setToasts] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [showTestInput, setShowTestInput] = useState(false);
  const [testQuery, setTestQuery] = useState("");
  const sseRef = useRef(null);
  const toastIdRef = useRef(0);

  // ─── Toast helper ───
  const addToast = useCallback((message, type = "info") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // ─── Fetch conversations ───
  const fetchConversations = useCallback(async () => {
    try {
      const [convRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/conversations`),
        fetch(`${API_BASE}/conversations/stats`),
      ]);
      if (convRes.ok) {
        const data = await convRes.json();
        setConversations(data);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (err) {
      console.warn("Could not reach backend:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── SSE for real-time updates ───
  useEffect(() => {
    fetchConversations();

    const connectSSE = () => {
      setSseStatus("connecting");
      const es = new EventSource(`${API_BASE}/events`);
      sseRef.current = es;

      es.onopen = () => {
        setSseStatus("connected");
        addToast("Live updates connected", "success");
      };

      es.onmessage = (e) => {
        try {
          const { type, data } = JSON.parse(e.data);
          if (type === "new_message") {
            setConversations((prev) => [data, ...prev]);
            setStats((s) => ({ ...s, total: s.total + 1, last_hour: s.last_hour + 1 }));
            addToast(`New message from +${data.from_number}`, "success");
          } else if (type === "delete_message") {
            setConversations((prev) => prev.filter((c) => c.id !== data.id));
          } else if (type === "update_message") {
            setConversations((prev) => prev.map(c => c.id === data.id ? { ...c, structured_json: data.structured_json } : c));
          }
        } catch {}
      };

      es.onerror = () => {
        setSseStatus("disconnected");
        es.close();
        // Reconnect after 5s
        setTimeout(connectSSE, 5000);
      };
    };

    connectSSE();
    return () => sseRef.current?.close();
  }, [fetchConversations, addToast]);

  // ─── Delete handler ───
  const handleDelete = useCallback((id) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setStats((s) => ({ ...s, total: Math.max(0, s.total - 1) }));
    addToast("Conversation deleted", "info");
  }, [addToast]);

  // ─── Send test message ───
  const sendTestMessage = useCallback(async (customQuery = null) => {
    try {
      const bodyPayload = customQuery ? { message: customQuery } : {};
      const res = await fetch(`${API_BASE}/test-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      if (res.ok) {
        const data = await res.json();
        addToast(`✅ Test: "${data.message?.substring(0, 40)}…"`, "success");
        setTimeout(fetchConversations, 500);
      } else {
        addToast("Backend not running — start it first (npm start in /backend)", "error");
      }
    } catch {
      addToast("Cannot reach backend at http://localhost:3001", "error");
    }
  }, [addToast, fetchConversations]);

  // ─── Filters ───
  const intents = [...new Set(conversations.map((c) => c.structured_json?.intent).filter(Boolean))];

  const filtered = conversations.filter((c) => {
    const matchSearch =
      !search ||
      c.message?.toLowerCase().includes(search.toLowerCase()) ||
      c.from_number?.includes(search) ||
      c.structured_json?.intent?.includes(search.toLowerCase()) ||
      c.structured_json?.response?.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      activeFilter === "all" || c.structured_json?.intent === activeFilter;
    return matchSearch && matchFilter;
  });

  const sseLabel = {
    connected: "Live",
    connecting: "Connecting…",
    disconnected: "Disconnected",
  }[sseStatus];

  return (
    <div className="app-layout">
      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-logo">💬</div>
          <div>
            <div className="topbar-title">WhatsApp AI Dashboard</div>
            <div className="topbar-subtitle">n8n · Groq LLM · React · SQLite</div>
          </div>
        </div>
        <div className="topbar-right">
          <input
            className="filter-input"
            style={{ width: "250px", marginRight: "12px", border: "1px solid var(--border-color)" }}
            placeholder="🔍 Search messages, intents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn-secondary" onClick={fetchConversations} title="Refresh">
            🔄 Refresh
          </button>
          
          {showTestInput ? (
            <form 
              onSubmit={(e) => { 
                e.preventDefault(); 
                if (testQuery.trim()) {
                  sendTestMessage(testQuery.trim());
                  setTestQuery("");
                  setShowTestInput(false);
                }
              }}
              style={{ display: "flex", gap: "8px" }}
            >
              <input
                className="filter-input"
                style={{ width: "220px", border: "1px solid var(--accent-purple)", outline: "none" }}
                autoFocus
                placeholder="Type a query to test..."
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
              />
              <button type="submit" className="btn-primary" disabled={!testQuery.trim()}>
                Send
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowTestInput(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <button className="btn-primary" onClick={() => setShowTestInput(true)}>
              ⚡ Test Message
            </button>
          )}

          <div className={`status-pill ${sseStatus}`}>
            <span className={`status-dot ${sseStatus === "connected" ? "pulse" : ""}`} />
            {sseLabel}
          </div>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-section-label">Overview</div>
        <div className="stat-card-mini">
          <div className="stat-card-mini-value" style={{ color: "var(--accent-green)" }}>
            {stats.total}
          </div>
          <div className="stat-card-mini-label">Total Conversations</div>
        </div>
        <div className="stat-card-mini">
          <div className="stat-card-mini-value" style={{ color: "var(--accent-cyan)" }}>
            {stats.last_hour}
          </div>
          <div className="stat-card-mini-label">Last Hour</div>
        </div>
        <div className="stat-card-mini">
          <div className="stat-card-mini-value" style={{ color: "var(--accent-purple)" }}>
            {(sseRef.current?.readyState === 1) ? "ON" : "OFF"}
          </div>
          <div className="stat-card-mini-label">Live Stream</div>
        </div>

        <div className="sidebar-section-label" style={{ marginTop: 8 }}>Filter by Intent</div>
        <div
          className={`sidebar-item ${activeFilter === "all" ? "active" : ""}`}
          onClick={() => setActiveFilter("all")}
        >
          <span className="sidebar-item-icon">🌐</span>
          All Messages
          <span className="sidebar-item-count">{conversations.length}</span>
        </div>
        {intents.map((intent) => (
          <div
            key={intent}
            className={`sidebar-item ${activeFilter === intent ? "active" : ""}`}
            onClick={() => setActiveFilter(intent)}
          >
            <span className="sidebar-item-icon">
              {{ weather_query: "🌤️", product_search: "🛍️", support_request: "🎧", general_question: "💬", booking: "📅", reminder: "⏰", issue_tracking: "📋", data_visualization: "📊" }[intent] || "🤖"}
            </span>
            {intent.replace(/_/g, " ")}
            <span className="sidebar-item-count">
              {conversations.filter((c) => c.structured_json?.intent === intent).length}
            </span>
          </div>
        ))}

        <div className="sidebar-section-label" style={{ marginTop: 8 }}>Top Intents</div>
        {(stats.by_intent || []).slice(0, 5).map((item) => (
          <div key={item.intent} style={{ padding: "6px 4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: "var(--text-secondary)" }}>{item.intent?.replace(/_/g, " ")}</span>
              <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{item.count}</span>
            </div>
            <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 999 }}>
              <div style={{
                height: "100%",
                width: `${(item.count / (stats.total || 1)) * 100}%`,
                background: "var(--accent-green)",
                borderRadius: 999,
              }} />
            </div>
          </div>
        ))}
      </aside>

      {/* ── Main ── */}
      <main className="main-content">
        {/* Pipeline */}
        <PipelinePanel msgCount={conversations.length} />

        {/* Header + Filter */}
        <div>
          <div className="section-header">
            <div>
              <div className="section-title">Conversation Feed</div>
              <div className="section-subtitle">
                {filtered.length} {filtered.length === 1 ? "message" : "messages"} • Real-time via SSE
              </div>
            </div>
          </div>
        </div>

        <div className="filter-bar">
          <span
            className={`filter-badge ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            All
          </span>
          {intents.map((intent) => (
            <span
              key={intent}
              className={`filter-badge ${activeFilter === intent ? "active" : ""}`}
              onClick={() => setActiveFilter(intent)}
            >
              {intent.replace(/_/g, " ")}
            </span>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <div className="empty-state-title">Connecting to backend…</div>
            <div className="empty-state-subtitle">
              Make sure the Express server is running on port 3001
            </div>
          </div>
        ) : (
          <div className="conversations-grid">
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <div className="empty-state-title">No messages yet</div>
                <div className="empty-state-subtitle">
                  Send a WhatsApp message to your test number, or click ⚡ Test Message above to simulate one.
                </div>
                <button className="btn-primary" onClick={() => setShowTestInput(true)} style={{ marginTop: 8 }}>
                  ⚡ Send Test Message
                </button>
              </div>
            ) : (
              filtered.map((conv) => (
                <ConversationCard
                  key={conv.id}
                  conversation={conv}
                  onDelete={handleDelete}
                  addToast={addToast}
                />
              ))
            )}
          </div>
        )}
      </main>

      {/* ── Floating Chat Drawer ── */}
      <button
        id="chat-toggle-btn"
        className={`chat-fab ${chatOpen ? "open" : ""}`}
        onClick={() => setChatOpen(o => !o)}
        title="AI Data Assistant"
      >
        {chatOpen ? "✕" : "🤖"}
      </button>

      <div className={`chat-drawer ${chatOpen ? "open" : ""}`}>
        <ChatPanel />
      </div>

      <Toast toasts={toasts} />
    </div>
  );
}
