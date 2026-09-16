// Open-Meteo: free, no API key, well-documented JSON weather API —
// https://open-meteo.com/en/docs. This session's network egress can't reach
// it to confirm the response shape live, but the field names below
// (current.temperature_2m, current.weather_code, etc.) match Open-Meteo's
// public documentation, which has been stable for years.
export interface WeatherSnapshot {
  temperatureC: number;
  apparentTemperatureC: number;
  weatherCode: number;
  windKph: number;
  humidity: number;
  highC: number;
  lowC: number;
  fetchedAt: string;
}

const WEATHER_CODE_LABELS: Record<number, { en: string; fr: string; emoji: string }> = {
  0: { en: "Clear sky", fr: "Ciel dégagé", emoji: "☀️" },
  1: { en: "Mainly clear", fr: "Généralement dégagé", emoji: "🌤️" },
  2: { en: "Partly cloudy", fr: "Partiellement nuageux", emoji: "⛅" },
  3: { en: "Overcast", fr: "Couvert", emoji: "☁️" },
  45: { en: "Fog", fr: "Brouillard", emoji: "🌫️" },
  48: { en: "Freezing fog", fr: "Brouillard givrant", emoji: "🌫️" },
  51: { en: "Light drizzle", fr: "Bruine légère", emoji: "🌦️" },
  53: { en: "Drizzle", fr: "Bruine", emoji: "🌦️" },
  55: { en: "Dense drizzle", fr: "Bruine dense", emoji: "🌧️" },
  56: { en: "Freezing drizzle", fr: "Bruine verglaçante", emoji: "🌧️" },
  57: { en: "Freezing drizzle", fr: "Bruine verglaçante", emoji: "🌧️" },
  61: { en: "Light rain", fr: "Pluie légère", emoji: "🌦️" },
  63: { en: "Rain", fr: "Pluie", emoji: "🌧️" },
  65: { en: "Heavy rain", fr: "Forte pluie", emoji: "🌧️" },
  66: { en: "Freezing rain", fr: "Pluie verglaçante", emoji: "🌧️" },
  67: { en: "Freezing rain", fr: "Pluie verglaçante", emoji: "🌧️" },
  71: { en: "Light snow", fr: "Neige légère", emoji: "🌨️" },
  73: { en: "Snow", fr: "Neige", emoji: "🌨️" },
  75: { en: "Heavy snow", fr: "Forte neige", emoji: "❄️" },
  77: { en: "Snow grains", fr: "Grains de neige", emoji: "❄️" },
  80: { en: "Rain showers", fr: "Averses de pluie", emoji: "🌦️" },
  81: { en: "Rain showers", fr: "Averses de pluie", emoji: "🌧️" },
  82: { en: "Violent showers", fr: "Averses violentes", emoji: "⛈️" },
  85: { en: "Snow showers", fr: "Averses de neige", emoji: "🌨️" },
  86: { en: "Heavy snow showers", fr: "Fortes averses de neige", emoji: "❄️" },
  95: { en: "Thunderstorm", fr: "Orage", emoji: "⛈️" },
  96: { en: "Thunderstorm w/ hail", fr: "Orage avec grêle", emoji: "⛈️" },
  99: { en: "Severe thunderstorm", fr: "Orage violent", emoji: "⛈️" },
};

export function weatherCodeLabel(code: number, lang: "en" | "fr"): string {
  return WEATHER_CODE_LABELS[code]?.[lang] ?? (lang === "fr" ? "Inconnu" : "Unknown");
}

export function weatherCodeEmoji(code: number): string {
  return WEATHER_CODE_LABELS[code]?.emoji ?? "🌡️";
}

// Ste-Agathe-des-Monts, QC — the default location until the browser
// supplies a real one via geolocation.
export const DEFAULT_WEATHER_COORDS = { lat: 46.0492, lon: -74.2827 };

export async function getWeather(lat: number, lon: number): Promise<WeatherSnapshot | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m"
  );
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        apparent_temperature?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
      daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
    };
    if (!data.current) return null;
    return {
      temperatureC: Math.round(data.current.temperature_2m ?? 0),
      apparentTemperatureC: Math.round(data.current.apparent_temperature ?? 0),
      weatherCode: data.current.weather_code ?? 0,
      windKph: Math.round(data.current.wind_speed_10m ?? 0),
      humidity: Math.round(data.current.relative_humidity_2m ?? 0),
      highC: Math.round(data.daily?.temperature_2m_max?.[0] ?? 0),
      lowC: Math.round(data.daily?.temperature_2m_min?.[0] ?? 0),
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
