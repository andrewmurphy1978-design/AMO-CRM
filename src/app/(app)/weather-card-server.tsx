import { getWeather, reverseGeocode, DEFAULT_WEATHER_COORDS } from "@/lib/weather";
import WeatherCard, { type WeatherLabels } from "./weather-card";

// A dedicated async Server Component so this slow (real network) fetch can
// sit behind its own <Suspense> boundary in page.tsx — the rest of the
// dashboard renders immediately instead of waiting on it.
export default async function WeatherCardServer({ lang, labels }: { lang: "en" | "fr"; labels: WeatherLabels }) {
  const geo = await reverseGeocode(DEFAULT_WEATHER_COORDS.lat, DEFAULT_WEATHER_COORDS.lon);
  const unit = geo?.countryCode === "US" ? "fahrenheit" : "celsius";
  const weather = await getWeather(DEFAULT_WEATHER_COORDS.lat, DEFAULT_WEATHER_COORDS.lon, unit);
  if (weather) weather.cityLabel = geo?.city ?? null;
  return <WeatherCard initial={weather} lang={lang} labels={labels} />;
}
