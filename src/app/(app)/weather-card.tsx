"use client";

import { useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { weatherCodeEmoji, weatherCodeLabel, DEFAULT_WEATHER_COORDS, type WeatherSnapshot } from "@/lib/weather";
import RefreshButton from "./refresh-button";

export interface WeatherLabels {
  title: string;
  refresh: string;
  refreshing: string;
  updatedPrefix: string;
  humidity: string;
  wind: string;
  high: string;
  low: string;
  feelsLike: string;
  unavailable: string;
}

export default function WeatherCard({
  initial,
  lang,
  labels,
}: {
  initial: WeatherSnapshot | null;
  lang: "en" | "fr";
  labels: WeatherLabels;
}) {
  const [weather, setWeather] = useState(initial);
  const [loading, setLoading] = useState(false);
  const dateLocale = getDateLocale(lang);
  // Only try the browser's real location once automatically (on mount); the
  // Refresh button can always retry it after that.
  const triedAutoLocate = useRef(false);

  async function refresh(coords?: { lat: number; lon: number }) {
    setLoading(true);
    try {
      const { lat, lon } = coords ?? DEFAULT_WEATHER_COORDS;
      const res = await fetch(`/api/dashboard/weather?lat=${lat}&lon=${lon}`);
      if (res.ok) setWeather(await res.json());
    } catch {
      // Keep showing the last known snapshot rather than clearing it.
    } finally {
      setLoading(false);
    }
  }

  function locateAndRefresh() {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => refresh({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => refresh(),
        { timeout: 5000 }
      );
    } else {
      refresh();
    }
  }

  useEffect(() => {
    if (triedAutoLocate.current) return;
    triedAutoLocate.current = true;
    locateAndRefresh();
    // Only ever runs once, right after the SSR-rendered default-location
    // snapshot shows up, to swap in the real one silently.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const degree = weather?.unit === "fahrenheit" ? "°F" : "°C";
  const windUnitLabel = weather?.windUnit === "mph" ? "mph" : "km/h";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        <RefreshButton onClick={locateAndRefresh} loading={loading} label={labels.refresh} loadingLabel={labels.refreshing} />
      </div>
      {weather?.cityLabel && <p className="text-xs font-medium text-soft">{weather.cityLabel}</p>}
      {!weather ? (
        <p className="mt-3 text-sm text-soft">{labels.unavailable}</p>
      ) : (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-4xl">{weatherCodeEmoji(weather.weatherCode)}</span>
              <div>
                <p className="font-display text-3xl font-semibold text-ink">
                  {weather.temperature}
                  {degree}
                </p>
                <p className="text-sm text-soft">{weatherCodeLabel(weather.weatherCode, lang)}</p>
              </div>
            </div>

            <div className="text-center">
              <p className="font-display text-2xl font-semibold text-ink">
                {weather.highTemp}
                {degree}
              </p>
              <p className="text-base text-soft">
                {weather.lowTemp}
                {degree}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-soft">
                {labels.high} / {labels.low}
              </p>
            </div>

            <dl className="space-y-1 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-soft">{labels.feelsLike}</dt>
                <dd className="text-ink">
                  {weather.apparentTemperature}
                  {degree}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-soft">{labels.humidity}</dt>
                <dd className="text-ink">{weather.humidity}%</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-soft">{labels.wind}</dt>
                <dd className="text-ink">
                  {weather.windSpeed} {windUnitLabel}
                </dd>
              </div>
            </dl>
          </div>

          {weather.daily.length > 0 && (
            <div className="mt-4 grid grid-cols-5 gap-1 border-t border-card-border pt-3">
              {weather.daily.map((day) => (
                <div key={day.date} className="flex flex-col items-center gap-0.5 text-center">
                  <span className="text-[11px] font-medium uppercase text-soft">
                    {format(new Date(day.date), "EEE", { locale: dateLocale })}
                  </span>
                  <span className="text-lg">{weatherCodeEmoji(day.weatherCode)}</span>
                  <span className="text-base font-medium text-ink">{day.highTemp}°</span>
                  <span className="text-sm text-soft">{day.lowTemp}°</span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs text-soft">
            {labels.updatedPrefix}{" "}
            {formatDistanceToNow(new Date(weather.fetchedAt), { addSuffix: true, locale: dateLocale })}
          </p>
        </div>
      )}
    </div>
  );
}
