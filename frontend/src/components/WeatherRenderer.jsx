/**
 * WeatherRenderer.jsx
 *
 * Renders weather data as a rich dashboard using plain React components.
 * No @json-render Renderer is used — all components are called directly
 * to avoid the { root, elements } spec format complexity.
 *
 * The spec-driven pattern is preserved conceptually:
 *   buildWeatherSpec(data) → plain spec object describing the UI
 *   WeatherDashboard renders that spec as React elements
 */

// ─── WMO weather code helper ─────────────────────────────────────────────────
const WMO_CODES = {
  0:  { icon: "☀️",  text: "Clear sky",     accent: "#f59e0b" },
  1:  { icon: "🌤️", text: "Mainly clear",  accent: "#f59e0b" },
  2:  { icon: "⛅",  text: "Partly cloudy", accent: "#94a3b8" },
  3:  { icon: "☁️",  text: "Overcast",      accent: "#64748b" },
  45: { icon: "🌫️", text: "Fog",           accent: "#78716c" },
  48: { icon: "🌫️", text: "Icy fog",       accent: "#78716c" },
  51: { icon: "🌧️", text: "Light drizzle", accent: "#38bdf8" },
  61: { icon: "🌧️", text: "Rain",          accent: "#38bdf8" },
  71: { icon: "❄️",  text: "Snow",          accent: "#bae6fd" },
  80: { icon: "🌦️", text: "Showers",       accent: "#60a5fa" },
  95: { icon: "⛈️",  text: "Thunderstorm", accent: "#a78bfa" },
};

function wmo(code) {
  const key = Object.keys(WMO_CODES).reverse().find(k => code >= Number(k));
  return WMO_CODES[key] || { icon: "🌤️", text: "Variable", accent: "#06b6d4" };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function WeatherCurrentHero({ icon, accent, location, condition, temperature, unit, humidity, windSpeed }) {
  return (
    <div className="wr-hero" style={{ "--wr-accent": accent }}>
      <div className="wr-hero-left">
        <div className="wr-hero-icon">{icon}</div>
        <div>
          <div className="wr-hero-location">{location}</div>
          <div className="wr-hero-condition">{condition}</div>
        </div>
      </div>
      <div className="wr-hero-right">
        <div className="wr-hero-temp">
          {temperature}
          <span className="wr-hero-unit">{unit}</span>
        </div>
        <div className="wr-hero-stats">
          💧 {humidity}% &nbsp;·&nbsp; 🌬️ {windSpeed} km/h
        </div>
      </div>
    </div>
  );
}

function WeatherBarChart({ dataPoints, maxTemp, yLabel, chartTitle }) {
  if (!dataPoints?.length) return null;
  return (
    <div className="wr-section">
      <div className="wr-section-label">📊 {chartTitle}</div>
      <div className="wr-bar-chart">
        {dataPoints.map((pt, i) => {
          const pct = (pt.value / maxTemp) * 100;
          return (
            <div key={i} className="wr-bar-col">
              <div className="wr-bar-val">{pt.value}°</div>
              <div className="wr-bar-track">
                <div
                  className="wr-bar-fill"
                  style={{ height: `${pct}%`, animationDelay: `${i * 0.07}s` }}
                />
              </div>
              <div className="wr-bar-lbl">{pt.label}</div>
            </div>
          );
        })}
      </div>
      <div className="wr-bar-y-label">{yLabel}</div>
    </div>
  );
}

function WeatherForecastTable({ tableColumns, tableRows }) {
  if (!tableRows?.length) return null;
  return (
    <div className="wr-section">
      <div className="wr-section-label">📋 Detailed Forecast</div>
      <div className="wr-table-wrap">
        <table className="wr-forecast-table">
          <thead>
            <tr>{tableColumns.map((col, i) => <th key={i}>{col}</th>)}</tr>
          </thead>
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={ri}>
                {tableColumns.map((col, ci) => (
                  <td key={ci}>{row[col] ?? "–"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────
/**
 * Drop-in weather dashboard. Pass raw weatherData from the backend.
 * Builds a spec object internally, then renders it directly — no Renderer needed.
 */
export default function WeatherRenderer({ weatherData }) {
  if (!weatherData || weatherData.error) {
    return <div className="weather-error">⚠️ {weatherData?.error || "Weather data unavailable"}</div>;
  }

  const { current, graph_data, table_data } = weatherData;
  const meta = wmo(current?.weather_code ?? 0);
  const maxTemp = Math.max(...(graph_data?.data_points || []).map(d => d.value), 1);

  return (
    <div className="wr-dashboard">
      <WeatherCurrentHero
        icon={meta.icon}
        accent={meta.accent}
        location={current?.location ?? "Unknown"}
        condition={meta.text}
        temperature={current?.temperature ?? "–"}
        unit={current?.unit ?? "°C"}
        humidity={current?.humidity ?? "–"}
        windSpeed={current?.wind_speed ?? "–"}
      />
      <WeatherBarChart
        chartTitle={graph_data?.title ?? "7-Day Forecast"}
        dataPoints={graph_data?.data_points ?? []}
        maxTemp={maxTemp}
        yLabel={graph_data?.y_label ?? "°C"}
      />
      <WeatherForecastTable
        tableColumns={table_data?.columns ?? []}
        tableRows={table_data?.rows ?? []}
      />
    </div>
  );
}
