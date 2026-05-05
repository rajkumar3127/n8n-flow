/**
 * ChatPanel.jsx — Streaming AI Chat with spec-driven visualization
 *
 * Sends prompts to /api/chat (catalog-driven, uses buildUserPrompt from @json-render/core)
 * and renders responses as live graphs, tables, or weather cards.
 * Components are called directly (not via Renderer) for reliability.
 */
import { useState, useRef, useCallback } from "react";
import WeatherRenderer from "./WeatherRenderer";

// ─── Visualization Components ─────────────────────────────────────────────────

function JiraCard({ ticket }) {
  const statusColor = {
    "In Progress": "var(--accent-cyan)",
    "Open": "var(--accent-purple)",
    "Done": "var(--accent-green)",
  }[ticket.status] || "var(--text-secondary)";
  return (
    <div className="jira-card">
      <div className="jira-header">
        <span className="jira-id">{ticket.id}</span>
        <span className="jira-status" style={{ borderColor: statusColor, color: statusColor }}>
          {ticket.status}
        </span>
      </div>
      <div className="jira-title">{ticket.title}</div>
      <div className="jira-footer">
        <span className="jira-assignee">👤 {ticket.assignee}</span>
        <span className="jira-priority">{ticket.priority}</span>
      </div>
    </div>
  );
}

function JiraList({ tickets = [] }) {
  return <div className="jira-list">{tickets.map(t => <JiraCard key={t.id} ticket={t} />)}</div>;
}

function GraphWithTable({ graphData }) {
  const pts = graphData?.data_points || [];
  const maxVal = Math.max(...pts.map(d => d.value), 1);
  return (
    <div className="graph-with-table">
      <div className="gwt-chart-col">
        <div className="graph-card">
          <div className="graph-title">{graphData?.title}</div>
          <div className="graph-y-label">{graphData?.y_label}</div>
          <div className="graph-chart">
            {pts.map((pt, i) => (
              <div key={i} className="graph-bar-container">
                <div className="graph-bar-value">{pt.value}</div>
                <div className="graph-bar-track">
                  <div
                    className="graph-bar-fill"
                    style={{ height: `${(pt.value / maxVal) * 100}%`, animationDelay: `${i * 0.1}s` }}
                  />
                </div>
                <div className="graph-bar-label">{pt.label}</div>
              </div>
            ))}
          </div>
          <div className="graph-x-label">{graphData?.x_label}</div>
        </div>
      </div>
      <div className="gwt-table-col">
        <div className="graph-data-table-card">
          <div className="graph-data-table-title">{graphData?.title}</div>
          <div className="graph-data-table-subtitle">{graphData?.x_label} / {graphData?.y_label}</div>
          <table className="graph-data-table">
            <thead>
              <tr>
                <th>{graphData?.x_label || "Label"}</th>
                <th>{graphData?.y_label || "Value"}</th>
              </tr>
            </thead>
            <tbody>
              {pts.map((pt, i) => (
                <tr key={i}>
                  <td>{pt.label}</td>
                  <td className="graph-data-value-cell">{pt.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TableCard({ tableData }) {
  if (!tableData?.columns?.length) return <div className="chat-no-data">No table data</div>;
  return (
    <div className="table-card-container">
      <table className="data-table">
        <thead>
          <tr>{tableData.columns.map((col, i) => <th key={i}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {tableData.rows.map((row, ri) => (
            <tr key={ri}>
              {tableData.columns.map((col, ci) => (
                <td key={ci}>{row[col] ?? "–"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeatherFull({ weatherData }) {
  return <WeatherRenderer weatherData={weatherData} />;
}

/**
 * Resolves the LLM result to a React visualization element.
 * Tries spec.type first (catalog-driven), then falls back to legacy fields.
 */
function renderVisualization(result) {
  if (!result) return null;

  // Catalog-driven: use spec from LLM
  const specType  = result.spec?.type;
  const specProps = result.spec?.props || {};
  if (specType === "GraphWithTable") return <GraphWithTable graphData={specProps.graphData} />;
  if (specType === "TableCard")      return <TableCard tableData={specProps.tableData} />;
  if (specType === "WeatherFull")    return <WeatherFull weatherData={specProps.weatherData} />;
  if (specType === "JiraList")       return <JiraList tickets={specProps.tickets} />;

  // Legacy field fallback
  const t = result.ui_render_type;
  if (t === "jira"    && result.jira_tickets)  return <JiraList tickets={result.jira_tickets} />;
  if (t === "graph"   && result.graph_data)    return <GraphWithTable graphData={result.graph_data} />;
  if (t === "table"   && result.table_data)    return <TableCard tableData={result.table_data} />;
  if (t === "weather" && result.weather_data)  return <WeatherFull weatherData={result.weather_data} />;

  return null;
}

// ─── Main ChatPanel ───────────────────────────────────────────────────────────
export default function ChatPanel() {
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState("");
  const [isLoading, setIsLoading]     = useState(false);
  const [streamingText, setStreaming] = useState("");
  const bottomRef = useRef(null);

  const scrollBottom = () =>
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

  const sendMessage = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || isLoading) return;

    setInput("");
    setIsLoading(true);
    setStreaming("");
    setMessages(prev => [...prev, { role: "user", text: prompt }]);
    scrollBottom();

    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let finalResult = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "delta") {
              accumulated += evt.delta;
              setStreaming(accumulated);
            } else if (evt.type === "done") {
              finalResult = evt.result;
            } else if (evt.type === "error") {
              throw new Error(evt.error);
            }
          } catch { /* skip parse errors on partial chunks */ }
        }
      }

      setMessages(prev => [...prev, {
        role: "assistant",
        text: finalResult?.response || "Here's what I found:",
        result: finalResult,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", text: `❌ Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
      setStreaming("");
      scrollBottom();
    }
  }, [input, isLoading]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-icon">🤖</div>
        <div>
          <div className="chat-header-title">AI Data Assistant</div>
          <div className="chat-header-sub">Ask about sales, weather, tasks, or any data</div>
        </div>
        <div className="chat-header-badge">@json-render</div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <div className="chat-empty-title">Start a conversation</div>
            <div className="chat-empty-sub">Try: "show monthly sales graph" or "weather in Tokyo"</div>
            <div className="chat-suggestions">
              {[
                "Show Q1 sales as a graph",
                "Weather in Mumbai",
                "My Jira tickets",
                "Team performance table",
              ].map((s, i) => (
                <button key={i} className="chat-suggestion-chip" onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="chat-bubble">
              <div className="chat-bubble-text">{msg.text}</div>

              {/* Visualization card */}
              {msg.role === "assistant" && msg.result && (() => {
                const viz = renderVisualization(msg.result);
                if (!viz) return null;
                const t = msg.result.ui_render_type;
                return (
                  <div className="chat-viz-card">
                    <div className="chat-viz-badge">
                      {t === "graph"   && "📊 Data Visualization"}
                      {t === "table"   && "📑 Data Table"}
                      {t === "weather" && "🌤️ Weather Forecast"}
                      {t === "jira"    && "📋 Jira Issues"}
                    </div>
                    {viz}
                  </div>
                );
              })()}

              {/* Meta badges */}
              {msg.role === "assistant" && msg.result && (
                <div className="chat-meta-row">
                  {msg.result.sentiment   && <span className="meta-tag sentiment">{msg.result.sentiment}</span>}
                  {msg.result.confidence  && <span className="meta-tag confidence">{(msg.result.confidence * 100).toFixed(0)}% confident</span>}
                  {msg.result.suggested_actions?.slice(0, 2).map((a, i) => (
                    <span key={i} className="meta-tag action">#{a}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming / typing indicator */}
        {isLoading && (
          <div className="chat-message assistant">
            <div className="chat-bubble">
              {streamingText
                ? <div className="chat-streaming">{streamingText.slice(-150)}<span className="cursor-blink">|</span></div>
                : <div className="chat-typing"><span /><span /><span /></div>
              }
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <textarea
          id="chat-input"
          className="chat-textarea"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask for data, graphs, weather, Jira tickets…"
          rows={1}
          disabled={isLoading}
        />
        <button
          id="chat-send-btn"
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? "⏳" : "➤"}
        </button>
      </div>
    </div>
  );
}
