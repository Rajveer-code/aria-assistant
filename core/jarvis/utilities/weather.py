"""Free weather via wttr.in (no API key, no rate limit for personal use)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config.settings import settings
from core.jarvis.registry import ARIATool, register

log = logging.getLogger(__name__)

_WTTR = "https://wttr.in/{city}?format=j1"


async def fetch(city: str) -> dict[str, Any]:
    """Fetch current + 3-day forecast as a compact dict."""
    units = settings.weather_units  # currently informational; wttr returns both
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(_WTTR.format(city=city))
            r.raise_for_status()
            data = r.json()
    except Exception as exc:  # noqa: BLE001
        log.warning("wttr.in fetch failed for %r: %s", city, exc)
        return {
            "ok": False, "error": str(exc), "city": city,
            "current": None, "forecast": [],
        }

    current = (data.get("current_condition") or [{}])[0]
    forecast = []
    for d in (data.get("weather") or [])[:3]:
        forecast.append({
            "date": d.get("date"),
            "max_c": d.get("maxtempC"),
            "min_c": d.get("mintempC"),
            "max_f": d.get("maxtempF"),
            "min_f": d.get("mintempF"),
            "summary": (d.get("hourly") or [{}])[0].get("weatherDesc", [{}])[0].get("value"),
        })

    return {
        "ok": True, "city": city, "units": units,
        "current": {
            "temp_c": current.get("temp_C"),
            "temp_f": current.get("temp_F"),
            "feels_like_c": current.get("FeelsLikeC"),
            "humidity": current.get("humidity"),
            "wind_kph": current.get("windspeedKmph"),
            "description": (current.get("weatherDesc") or [{}])[0].get("value"),
            "observed_at": current.get("observation_time"),
        },
        "forecast": forecast,
        "source": "wttr.in",
    }


# Register tool
register(ARIATool(
    name="weather",
    category="utilities",
    description=("Get current weather and 3-day forecast for a city. "
                 "If no city is provided, uses the user's default city."),
    handler=fetch,
    schema={"type": "object", "properties": {"city": {"type": "string"}}},
    requires_audit=False,
    voice_phrases=("ARIA, what's the weather", "ARIA, weather in Pune"),
))
