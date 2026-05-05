import { useState, useCallback } from "react";

/**
 * Recursive JSON tree renderer — no library needed
 * Beautifully renders any JSON structure with syntax highlighting
 */
function JsonNode({ keyName, value, depth = 0, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 2);
  const type = Array.isArray(value) ? "array" : typeof value;

  const toggle = useCallback((e) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  }, []);

  if (value === null) {
    return (
      <div className="json-node" style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && (
          <span className="json-node-key">"{keyName}": </span>
        )}
        <span className="json-node-null">null</span>
      </div>
    );
  }

  if (type === "string") {
    return (
      <div className="json-node" style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && (
          <span className="json-node-key">"{keyName}": </span>
        )}
        <span className="json-node-string">"{value}"</span>
      </div>
    );
  }

  if (type === "number") {
    return (
      <div className="json-node" style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && (
          <span className="json-node-key">"{keyName}": </span>
        )}
        <span className="json-node-number">{value}</span>
      </div>
    );
  }

  if (type === "boolean") {
    return (
      <div className="json-node" style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && (
          <span className="json-node-key">"{keyName}": </span>
        )}
        <span className="json-node-boolean">{String(value)}</span>
      </div>
    );
  }

  if (type === "array") {
    const isEmpty = value.length === 0;
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        <div className="json-node-collapsible" onClick={toggle}>
          {keyName !== undefined && (
            <span className="json-node-key">"{keyName}": </span>
          )}
          <span className="json-node-bracket">[</span>
          {!expanded && (
            <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 4 }}>
              {value.length} {value.length === 1 ? "item" : "items"} ▶
            </span>
          )}
          {isEmpty && <span className="json-node-bracket">]</span>}
        </div>
        {expanded && !isEmpty && (
          <>
            {value.map((item, i) => (
              <JsonNode key={i} value={item} depth={depth + 1} />
            ))}
            <div style={{ paddingLeft: depth * 16 }}>
              <span className="json-node-bracket">]</span>
            </div>
          </>
        )}
      </div>
    );
  }

  if (type === "object") {
    const keys = Object.keys(value);
    const isEmpty = keys.length === 0;
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        <div className="json-node-collapsible" onClick={toggle}>
          {keyName !== undefined && (
            <span className="json-node-key">"{keyName}": </span>
          )}
          <span className="json-node-brace">{"{"}</span>
          {!expanded && (
            <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 4 }}>
              {keys.length} {keys.length === 1 ? "key" : "keys"} ▶
            </span>
          )}
          {isEmpty && <span className="json-node-brace">{"}"}</span>}
        </div>
        {expanded && !isEmpty && (
          <>
            {keys.map((k) => (
              <JsonNode key={k} keyName={k} value={value[k]} depth={depth + 1} />
            ))}
            <div style={{ paddingLeft: depth * 16 }}>
              <span className="json-node-brace">{"}"}</span>
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
}

/**
 * Main JSON Renderer component with toolbar
 */
export default function JsonRenderer({ data }) {
  const [view, setView] = useState("tree"); // "tree" | "raw"
  const [copied, setCopied] = useState(false);

  const copyJson = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [data]);

  const openInJsonRenderDev = useCallback(() => {
    const encoded = encodeURIComponent(JSON.stringify(data, null, 2));
    window.open(`https://json-render.dev/?data=${encoded}`, "_blank");
  }, [data]);

  return (
    <div className="json-renderer">
      <div className="json-renderer-toolbar">
        <div className="json-renderer-tabs">
          <button
            className={`json-tab ${view === "tree" ? "active" : ""}`}
            onClick={() => setView("tree")}
          >
            🌲 Tree
          </button>
          <button
            className={`json-tab ${view === "raw" ? "active" : ""}`}
            onClick={() => setView("raw")}
          >
            {"{ }"} Raw
          </button>
        </div>
        <div className="json-renderer-actions">
          <button className="icon-btn" onClick={copyJson} title="Copy JSON">
            {copied ? "✅ Copied" : "📋 Copy"}
          </button>
          <button className="icon-btn" onClick={openInJsonRenderDev} title="Open in json-render.dev">
            🔗 json-render.dev
          </button>
        </div>
      </div>

      {view === "tree" ? (
        <div className="json-tree">
          <JsonNode value={data} depth={0} defaultExpanded={true} />
        </div>
      ) : (
        <pre className="json-raw">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}
