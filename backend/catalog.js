/**
 * catalog.js — Dashboard Catalog for @json-render
 *
 * Defines the available UI components the LLM can output,
 * mirroring the dashboardCatalog.prompt() pattern from the
 * @json-render/core defineCatalog API.
 *
 * The SYSTEM_PROMPT is injected into every Groq request so
 * the model knows it MUST respond with a JSON spec object
 * that the frontend Renderer can map to a React component.
 */

const COMPONENTS = [
  {
    type: "GraphWithTable",
    description: "Shows a bar chart + compact data table side-by-side. Use for numeric trend data over time or categories.",
    propsSchema: {
      graphData: {
        title: "string — chart heading",
        x_label: "string — x-axis label",
        y_label: "string — y-axis label",
        data_points: "Array<{ label: string, value: number }>"
      }
    },
    example: {
      type: "GraphWithTable",
      props: {
        graphData: {
          title: "Monthly Revenue",
          x_label: "Month",
          y_label: "USD",
          data_points: [
            { label: "Jan", value: 12000 },
            { label: "Feb", value: 15500 },
            { label: "Mar", value: 13200 }
          ]
        }
      }
    }
  },
  {
    type: "TableCard",
    description: "Shows multi-column tabular data. Use for structured records, comparisons, or lists with multiple attributes.",
    propsSchema: {
      tableData: {
        columns: "Array<string>",
        rows: "Array<Record<string, string|number>>"
      }
    },
    example: {
      type: "TableCard",
      props: {
        tableData: {
          columns: ["Name", "Value", "Status"],
          rows: [
            { Name: "Alpha", Value: 100, Status: "Active" },
            { Name: "Beta",  Value: 230, Status: "Pending" }
          ]
        }
      }
    }
  },
  {
    type: "WeatherFull",
    description: "Displays current weather conditions, 7-day bar chart, and forecast table for a location.",
    propsSchema: {
      weatherData: "object — populated by backend; pass { location: 'city name' } to trigger fetch"
    },
    example: {
      type: "WeatherFull",
      props: { weatherData: { location: "London" } }
    }
  },
  {
    type: "JiraList",
    description: "Displays a list of Jira issues. Use when the user asks about tasks, tickets, or project status.",
    propsSchema: {
      tickets: "Array<{ id, title, status, priority, assignee }>"
    },
    example: {
      type: "JiraList",
      props: {
        tickets: [
          { id: "PROJ-1", title: "Fix login bug", status: "In Progress", priority: "High", assignee: "Alice" }
        ]
      }
    }
  },
  {
    type: "QuerySummaryTable",
    description: "Renders a metadata summary table showing intent, sentiment, confidence, category, priority, and suggested actions. Always render this alongside main content.",
    propsSchema: {
      json: "object — the full LLM JSON response"
    }
  }
];

/**
 * Build the system prompt that describes the catalog to the LLM.
 * Mirrors dashboardCatalog.prompt() from the @json-render example.
 */
function buildCatalogSystemPrompt() {
  const componentDocs = COMPONENTS.map(c => {
    const propLines = JSON.stringify(c.propsSchema, null, 2);
    const exampleLines = c.example ? `\nExample spec:\n${JSON.stringify(c.example, null, 2)}` : "";
    return `### ${c.type}\n${c.description}\nProps:\n${propLines}${exampleLines}`;
  }).join("\n\n---\n\n");

  return `You are an intelligent dashboard assistant. When the user asks a question, respond ONLY with a valid JSON object (no markdown, no extra text) that describes a UI spec for the frontend to render.

## Available Components

${componentDocs}

## Response Format

Your response MUST be a JSON object with this structure:
{
  "spec": {
    "type": "<ComponentType from the list above>",
    "props": { ... }
  },
  "intent": "string — classified intent",
  "ui_render_type": "graph|table|weather|jira|default",
  "response": "string — conversational reply to the user",
  "sentiment": "positive|neutral|negative",
  "confidence": 0.0-1.0,
  "language": "en",
  "suggested_actions": ["..."],
  "category": "string",
  "priority": "low|medium|high",
  "graph_data": null or { title, x_label, y_label, data_points: [{label, value}] },
  "table_data": null or { columns: [], rows: [] },
  "metadata": { "processed_at": "ISO string" }
}

Rules:
- For numeric/trend data → use GraphWithTable, populate graph_data
- For multi-attribute records → use TableCard, populate table_data
- For weather → use WeatherFull (backend will fetch real data)
- For Jira/tasks → use JiraList (backend will fetch real tickets)
- Always include sentiment, confidence, suggested_actions, category, priority
- The spec.props must contain real, plausible example data based on the user's query
- NEVER return markdown, ONLY the raw JSON object`;
}

module.exports = { buildCatalogSystemPrompt, COMPONENTS };
