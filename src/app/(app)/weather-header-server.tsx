import { getWeather, reverseGeocode, DEFAULT_WEATHER_COORDS } from "@/lib/weather";
import HeaderWeatherWidget, { type HeaderWeatherLabels } from "./header-weather-widget";
import type { Lang } from "@/lib/i18n/dictionaries";

// A dedicated async Server Component so this slow (real network) fetch can
// sit behind its own <Suspense> boundary in the Dashboard header — the
// rest of the header (and the page) renders immediately instead of
// waiting on it.
export default async function WeatherHeaderServer({ lang, labels }: { lang: Lang; labels: HeaderWeatherLabels }) {
  const geo = await reverseGeocode(DEFAULT_WEATHER_COORDS.lat, DEFAULT_WEATHER_COORDS.lon);
  const unit = geo?.countryCode === "US" ? "fahrenheit" : "celsius";
  const weather = await getWeather(DEFAULT_WEATHER_COORDS.lat, DEFAULT_WEATHER_COORDS.lon, unit);
  if (weather) weather.cityLabel = geo?.city ?? null;
  return <HeaderWeatherWidget initial={weather} lang={lang} labels={labels} />;
}
