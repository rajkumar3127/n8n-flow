import { useState } from "react";
import { createPortal } from "react-dom";
import WeatherRenderer from "./WeatherRenderer";

// ─── JiraCard ─────────────────────────────────────────────────────────────────
function JiraCard({ ticket }) {
  const statusColor = {
    "In Progress": "var(--accent-cyan)",
    "Open": "var(--accent-purple)",
    "Done": "var(--accent-green)",
  }[ticket.status] || "var(--text-secondary)";

  const priorityIcon = {
    "High": "🔴", "Medium": "🟡", "Low": "🟢", "Critical": "🔥"
  }[ticket.priority] || "⚪";

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
        <div className="jira-assignee">👤 {ticket.assignee}</div>
        <div className="jira-priority">{priorityIcon} {ticket.priority}</div>
      </div>
    </div>
  );
}

function JiraList({ tickets = [] }) {
  return (
    <div className="jira-list">
      {tickets.map(t => <JiraCard key={t.id} ticket={t} />)}
    </div>
  );
}

// ─── GraphCard ────────────────────────────────────────────────────────────────
function GraphCard({ graphData }) {
  const pts = graphData?.data_points || [];
  const maxVal = Math.max(...pts.map(d => d.value), 1);
  return (
    <div className="graph-card">
      <div className="graph-title">{graphData?.title}</div>
      <div className="graph-y-label">{graphData?.y_label}</div>
      <div className="graph-chart">
        {pts.map((pt, i) => {
          const heightPct = (pt.value / maxVal) * 100;
          return (
            <div key={i} className="graph-bar-container">
              <div className="graph-bar-value">{pt.value}</div>
              <div className="graph-bar-track">
                <div
                  className="graph-bar-fill"
                  style={{ height: `${heightPct}%`, animationDelay: `${i * 0.1}s` }}
                />
              </div>
              <div className="graph-bar-label">{pt.label}</div>
            </div>
          );
        })}
      </div>
      <div className="graph-x-label">{graphData?.x_label}</div>
    </div>
  );
}

// ─── TableCard ────────────────────────────────────────────────────────────────
function TableCard({ tableData }) {
  if (!tableData?.columns?.length) return <div className="error">No table data</div>;
  return (
    <div className="table-card-container">
      <table className="data-table">
        <thead>
          <tr>
            {tableData.columns.map((col, i) => <th key={i}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {tableData.rows.map((row, rIdx) => (
            <tr key={rIdx}>
              {tableData.columns.map((col, cIdx) => (
                <td key={cIdx}>{row[col] !== undefined ? row[col] : "–"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── GraphDataTable (compact key/value from graph data_points) ────────────────
function GraphDataTable({ graphData }) {
  const pts = graphData?.data_points || [];
  return (
    <div className="graph-data-table-card">
      <div className="graph-data-table-title">{graphData?.title || "Data Points"}</div>
      <div className="graph-data-table-subtitle">
        {graphData?.x_label && graphData?.y_label
          ? `${graphData.x_label} / ${graphData.y_label}`
          : null}
      </div>
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
  );
}

// ─── GraphWithTable (chart + compact table side-by-side) ─────────────────────
function GraphWithTable({ graphData }) {
  return (
    <div className="graph-with-table">
      <div className="gwt-chart-col">
        <GraphCard graphData={graphData} />
      </div>
      <div className="gwt-table-col">
        <GraphDataTable graphData={graphData} />
      </div>
    </div>
  );
}

// ─── WeatherFull ──────────────────────────────────────────────────────────────
function WeatherFull({ weatherData }) {
  return <WeatherRenderer weatherData={weatherData} />;
}

// ─── QuerySummaryTable (metadata insights) ───────────────────────────────────
function QuerySummaryTable({ json }) {
  const fields = [
    { label: "Intent",     value: json?.intent },
    { label: "Category",   value: json?.category },
    { label: "Sentiment",  value: json?.sentiment },
    { label: "Confidence", value: json?.confidence != null ? `${(json.confidence * 100).toFixed(0)}%` : null },
    { label: "Priority",   value: json?.priority },
    { label: "Language",   value: json?.language },
  ];

  return (
    <div className="query-summary-table-card">
      <div className="summary-title">Response Insights</div>
      <table className="summary-table">
        <tbody>
          {fields.map((f, i) => (
            <tr key={i}>
              <td className="summary-label">{f.label}</td>
              <td className="summary-value">{f.value || "N/A"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {json?.suggested_actions?.length > 0 && (
        <div className="suggested-actions">
          {json.suggested_actions.map((action, i) => (
            <span key={i} className="action-tag"># {action}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main AdaptiveCardRenderer ───────────────────────────────────────────────
/**
 * Routes the LLM JSON response to the correct visualization component.
 * ALWAYS renders a QuerySummaryTable (data report) for every message.
 * Also renders the appropriate data card (weather, graph, table, jira) when data is present.
 */
export default function AdaptiveCardRenderer({ json }) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!json) return null;

  const type = json.ui_render_type;

  // Build data visualization content
  const resolveContent = () => {
    if (type === "jira" && json.jira_tickets?.length)
      return <JiraList tickets={json.jira_tickets} />;
    if (type === "graph" && json.graph_data)
      return <GraphWithTable graphData={json.graph_data} />;
    if (type === "table" && json.table_data)
      return <TableCard tableData={json.table_data} />;
    if (type === "weather" && json.weather_data)
      return <WeatherFull weatherData={json.weather_data} />;
    return null;
  };

  const dataContent = resolveContent();

  const typeBadge = {
    jira:    "📋 Jira Integration",
    graph:   "📊 Data Visualization",
    table:   "📑 Data Report",
    weather: "🌤️ Weather Service",
  }[type] || "🤖 AI Analysis";

  const ExpandModal = () => {
    if (!isExpanded) return null;
    return createPortal(
      <div 
        className="modal-overlay" 
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setIsExpanded(false);
        }}
      >
        <div className="modal-content">
          <button className="modal-close" onClick={() => setIsExpanded(false)}>✕</button>
          <div className="modal-header"><h3>{typeBadge}</h3></div>
          <div className="modal-body">
            <QuerySummaryTable json={json} />
            {dataContent && <><div className="preview-divider" />{dataContent}</>}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div className="adaptive-card-container">
      <div className="adaptive-card-header">
        <span className="adaptive-card-badge">{typeBadge}</span>
        <button className="btn-expand" onClick={() => setIsExpanded(true)}>
          ⤢ Full View
        </button>
      </div>
      <ExpandModal />
    </div>
  );
}

