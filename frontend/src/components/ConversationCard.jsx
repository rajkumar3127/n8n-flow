import { useState, useCallback } from "react";
import JsonRenderer from "./JsonRenderer";
import AdaptiveCardRenderer from "./AdaptiveCardRenderer";

const INTENT_ICONS = {
  weather_query: "🌤️",
  product_search: "🛍️",
  support_request: "🎧",
  general_question: "💬",
  booking: "📅",
  reminder: "⏰",
  translation: "🌐",
  issue_tracking: "📋",
  data_visualization: "📊",
  parse_error: "⚠️",
  default: "🤖",
};

const SENTIMENT_ICONS = {
  positive: "😊",
  neutral: "😐",
  negative: "😟",
};

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return timestamp;
  }
}

function getInitials(number) {
  if (!number) return "?";
  const str = String(number);
  return str.slice(-2);
}

export default function ConversationCard({ conversation, onDelete, addToast }) {
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const json = conversation.structured_json || {};
  const intent = json.intent || "unknown";
  const intentIcon = INTENT_ICONS[intent] || INTENT_ICONS.default;
  const sentiment = json.sentiment || "neutral";
  const confidence = json.confidence;
  const priority = json.priority || "medium";
  const suggestedActions = json.suggested_actions || [];
  const response = json.response || "";

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
      onDelete?.(conversation.id);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  }, [conversation.id, onDelete]);

  const handleReEnrich = useCallback(async () => {
    try {
      addToast?.("Re-processing...", "info");
      const res = await fetch(`http://localhost:3001/api/conversations/${conversation.id}/re-enrich`, { method: "POST" });
      if (res.ok) {
        addToast?.("Re-processed successfully!", "success");
        // The SSE update_message event will automatically refresh the UI
      } else {
        addToast?.("Failed to re-process", "error");
      }
    } catch (err) {
      console.error("Re-enrich failed:", err);
      addToast?.("Failed to re-process", "error");
    }
  }, [conversation.id, addToast]);

  return (
    <div className="conv-card">
      {/* Header */}
      <div className="conv-card-header">
        <div className="conv-card-from">
          <div className="avatar">{getInitials(conversation.from_number)}</div>
          <div>
            <div className="conv-card-number">+{conversation.from_number}</div>
            <div className="conv-card-time">
              {SENTIMENT_ICONS[sentiment]} {formatTime(conversation.timestamp)}
            </div>
          </div>
        </div>
        <div className="conv-card-badges">
          <span className="badge badge-intent">{intentIcon} {intent.replace(/_/g, " ")}</span>
          <span className={`badge badge-priority-${priority}`}>{priority}</span>
        </div>
      </div>

      {/* Body */}
      <div className="conv-card-body">
        <div className="conv-message-label">📩 Incoming Message</div>
        <div className="conv-message-text">"{conversation.message}"</div>

        {response && (
          <>
            <div className="conv-response-label">🤖 AI Response</div>
            <div className="conv-response">{response}</div>
          </>
        )}

        {/* Adaptive Generative UI */}
        <AdaptiveCardRenderer json={json} />

        {/* Confidence Bar */}
        {confidence !== undefined && (
          <div className="confidence-bar-wrapper">
            <div className="confidence-bar-header">
              <span>Confidence</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--accent-green)" }}>
                {(confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="confidence-bar-track">
              <div
                className="confidence-bar-fill"
                style={{ width: `${Math.min(confidence * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Suggested Actions */}
        {suggestedActions.length > 0 && (
          <div>
            <div className="conv-message-label" style={{ marginBottom: 4 }}>💡 Suggested Actions</div>
            <div className="suggested-actions">
              {suggestedActions.map((action, i) => (
                <span key={i} className="action-chip">
                  {action.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* JSON Section */}
      <div className="json-section">
        <button
          className="json-toggle"
          onClick={() => setJsonExpanded(!jsonExpanded)}
        >
          <span className="json-toggle-label">
            <span>{"{ }"}</span>
            <span>Structured JSON</span>
          </span>
          <span className={`json-toggle-chevron ${jsonExpanded ? "open" : ""}`}>▼</span>
        </button>
        {jsonExpanded && (
          <div className="json-content">
            <JsonRenderer data={json} />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="conv-card-actions">
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: "auto" }}>
          ID: {conversation.id?.slice(0, 8)}…
        </span>
        <button
          className="btn-secondary"
          onClick={handleReEnrich}
          style={{ marginRight: 8, fontSize: 12, padding: "4px 8px" }}
        >
          🔄 Re-process
        </button>
        <button
          className="btn-delete"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "🗑 Delete"}
        </button>
      </div>
    </div>
  );
}
