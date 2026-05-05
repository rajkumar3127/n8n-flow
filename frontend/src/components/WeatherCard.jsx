import React from 'react';

export default function WeatherCard({ weatherData }) {
  if (weatherData.error) {
    return <div className="error">{weatherData.error}</div>;
  }

  // Weather Code Mapping (WMO codes)
  const getIconAndCondition = (code) => {
    if (code === 0) return { icon: "☀️", text: "Clear sky" };
    if ([1, 2, 3].includes(code)) return { icon: "⛅", text: "Partly cloudy" };
    if ([45, 48].includes(code)) return { icon: "🌫️", text: "Fog" };
    if ([51, 53, 55, 56, 57].includes(code)) return { icon: "🌧️", text: "Drizzle" };
    if ([61, 63, 65, 66, 67].includes(code)) return { icon: "🌧️", text: "Rain" };
    if ([71, 73, 75, 77].includes(code)) return { icon: "❄️", text: "Snow" };
    if ([80, 81, 82].includes(code)) return { icon: "🌦️", text: "Rain showers" };
    if ([85, 86].includes(code)) return { icon: "🌨️", text: "Snow showers" };
    if ([95, 96, 99].includes(code)) return { icon: "⛈️", text: "Thunderstorm" };
    return { icon: "🌤️", text: "Unknown" };
  };

  const { icon, text } = getIconAndCondition(weatherData.weather_code);

  return (
    <div className="weather-card">
      <div className="weather-location">{weatherData.location}</div>
      <div className="weather-main">
        <div className="weather-icon">{icon}</div>
        <div className="weather-temp">
          {weatherData.temperature}<span className="weather-unit">{weatherData.unit}</span>
        </div>
      </div>
      <div className="weather-condition">{text}</div>
      <div className="weather-details">
        <div className="weather-detail">
          <span className="weather-detail-label">Wind</span>
          <span className="weather-detail-value">{weatherData.wind_speed} km/h</span>
        </div>
        <div className="weather-detail">
          <span className="weather-detail-label">Humidity</span>
          <span className="weather-detail-value">{weatherData.humidity}%</span>
        </div>
      </div>
    </div>
  );
}
