"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
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

  function handleRefreshClick() {
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

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        <RefreshButton
          onClick={handleRefreshClick}
          loading={loading}
          label={labels.refresh}
          loadingLabel={labels.refreshing}
        />
      </div>
      {!weather ? (
        <p className="mt-3 text-sm text-soft">{labels.unavailable}</p>
      ) : (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{weatherCodeEmoji(weather.weatherCode)}</span>
            <div>
              <p className="font-display text-3xl font-semibold text-ink">{weather.temperatureC}°C</p>
              <p className="text-sm text-soft">{weatherCodeLabel(weather.weatherCode, lang)}</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-soft">{labels.feelsLike}</dt>
              <dd className="text-ink">{weather.apparentTemperatureC}°C</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-soft">{labels.humidity}</dt>
              <dd className="text-ink">{weather.humidity}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-soft">{labels.high}</dt>
              <dd className="text-ink">{weather.highC}°C</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-soft">{labels.low}</dt>
              <dd className="text-ink">{weather.lowC}°C</dd>
            </div>
            <div className="col-span-2 flex justify-between">
              <dt className="text-soft">{labels.wind}</dt>
              <dd className="text-ink">{weather.windKph} km/h</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-soft">
            {labels.updatedPrefix}{" "}
            {formatDistanceToNow(new Date(weather.fetchedAt), { addSuffix: true, locale: dateLocale })}
          </p>
        </div>
      )}
    </div>
  );
}
