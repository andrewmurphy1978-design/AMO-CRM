import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWeather, reverseGeocode, DEFAULT_WEATHER_COORDS } from "@/lib/weather";

// Called by the dashboard's Weather card, both on initial load (server side,
// with the default coordinates) and from the client's Refresh button /
// geolocation lookup (with real coordinates as query params).
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const latParam = Number(request.nextUrl.searchParams.get("lat"));
  const lonParam = Number(request.nextUrl.searchParams.get("lon"));
  const lat = Number.isFinite(latParam) && latParam !== 0 ? latParam : DEFAULT_WEATHER_COORDS.lat;
  const lon = Number.isFinite(lonParam) && lonParam !== 0 ? lonParam : DEFAULT_WEATHER_COORDS.lon;

  const geo = await reverseGeocode(lat, lon);
  const unit = geo?.countryCode === "US" ? "fahrenheit" : "celsius";
  const weather = await getWeather(lat, lon, unit);
  if (!weather) {
    return NextResponse.json({ error: "weather_unavailable" }, { status: 502 });
  }
  weather.cityLabel = geo?.city ?? null;
  return NextResponse.json(weather);
}
