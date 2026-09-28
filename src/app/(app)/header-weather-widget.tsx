"use client";

import { useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import {
  weatherCodeEmoji,
  weatherCodeLabel,
  DEFAULT_WEATHER_COORDS,
  type WeatherSnapshot,
} from "@/lib/weather";
import type { Lang } from "@/lib/i18n/dictionaries";
import RefreshButton from "./refresh-button";

export interface HeaderWeatherLabels {
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

// A compact placeholder pill matching the widget's own trigger button size
// — shown by the <Suspense> boundary around WeatherHeaderServer while the
// real (network) weather fetch is still in flight, so the rest of the
// Dashboard header never waits on it.
export function WeatherWidgetSkeleton() {
  return (
    <div className="hidden h-9 w-20 animate-pulse rounded-lg bg-white/10 sm:block" />
  );
}

// Replaces the old dashboard-wide Weather card (weather-card.tsx) — same
// fetch/refresh/geolocation logic, just condensed into a header pill
// (today's sky condition, current temp, high/low) that opens the full
// detail as a drop-down instead of taking up a permanent card slot.
export default function HeaderWeatherWidget({
  initial,
  lang,
  labels,
}: {
  initial: WeatherSnapshot | null;
  lang: Lang;
  labels: HeaderWeatherLabels;
}) {
  const [weather, setWeather] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dateLocale = getDateLocale(lang);
  // Only try the browser's real location once automatically (on mount); the
  // Refresh button can always retry it after that.
  const triedAutoLocate = useRef(false);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
        (pos) =>
          refresh({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => refresh(),
        { timeout: 5000 },
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

  if (!weather) {
    return (
      <div className="hidden items-center rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-amo-white/70 sm:flex">
        {labels.unavailable}
      </div>
    );
  }

  const degree = weather.unit === "fahrenheit" ? "°F" : "°C";
  const windUnitLabel = weather.windUnit === "mph" ? "mph" : "km/h";

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-amo-white transition-colors hover:bg-white/15"
      >
        <span className="text-xl leading-none">
          {weatherCodeEmoji(weather.weatherCode)}
        </span>
        <span className="font-display text-sm font-bold tabular-nums leading-none">
          {weather.temperature}
          {degree}
        </span>
        <span className="text-[9px] leading-tight opacity-80">
          <span className="block">
            {weather.highTemp}
            {degree}
          </span>
          <span className="block">
            {weather.lowTemp}
            {degree}
          </span>
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-card-border bg-card-bg p-4 text-left shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-semibold text-ink">
                {labels.title}
              </h3>
              {weather.cityLabel && (
                <p className="text-xs font-medium text-soft">
                  {weather.cityLabel}
                </p>
              )}
            </div>
            <RefreshButton
              onClick={locateAndRefresh}
              loading={loading}
              label={labels.refresh}
              loadingLabel={labels.refreshing}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-4xl">
                {weatherCodeEmoji(weather.weatherCode)}
              </span>
              <div>
                <p className="font-display text-3xl font-semibold text-ink">
                  {weather.temperature}
                  {degree}
                </p>
                <p className="text-sm text-soft">
                  {weatherCodeLabel(weather.weatherCode, lang)}
                </p>
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
          </div>

          <dl className="mt-3 space-y-1 text-xs">
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

          {weather.daily.length > 0 && (
            <div className="mt-3 grid grid-cols-5 gap-1 border-t border-card-border pt-3">
              {weather.daily.map((day) => (
                <div
                  key={day.date}
                  className="flex flex-col items-center gap-0.5 text-center"
                >
                  <span className="text-[10px] font-medium uppercase text-soft">
                    {format(new Date(day.date), "EEE", { locale: dateLocale })}
                  </span>
                  <span className="text-base">
                    {weatherCodeEmoji(day.weatherCode)}
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {day.highTemp}°
                  </span>
                  <span className="text-xs text-soft">{day.lowTemp}°</span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs text-soft">
            {labels.updatedPrefix}{" "}
            {formatDistanceToNow(new Date(weather.fetchedAt), {
              addSuffix: true,
              locale: dateLocale,
            })}
          </p>
        </div>
      )}
    </div>
  );
}
