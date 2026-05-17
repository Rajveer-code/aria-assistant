"""Google Calendar read/write via Google Calendar API v3."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

log = logging.getLogger(__name__)


def _parse_date_arg(date_str: str) -> date:
    """Convert a human-readable date string to a :class:`datetime.date`.

    Accepted values:
    - ``"today"``
    - ``"tomorrow"``
    - ISO 8601 date string ``"YYYY-MM-DD"``

    Raises:
        ValueError: for unrecognised formats.
    """
    lower = date_str.strip().lower()
    today = date.today()
    if lower == "today":
        return today
    if lower == "tomorrow":
        return today + timedelta(days=1)
    # ISO 8601 fallback
    return date.fromisoformat(date_str.strip())


def _day_bounds_utc(day: date) -> tuple[str, str]:
    """Return RFC 3339 strings for midnight-to-midnight UTC for *day*."""
    start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


class CalendarHandler:
    """High-level Google Calendar operations backed by the Calendar API v3."""

    def __init__(self) -> None:
        from integrations import google_auth
        if not google_auth.credentials_configured():
            raise RuntimeError(
                "Google credentials not configured. "
                "Download OAuth 2.0 client credentials from the Google Cloud Console "
                f"and save them to: {google_auth.CREDENTIALS_PATH}"
            )
        creds = google_auth.get_credentials()
        from googleapiclient.discovery import build
        self._service = build("calendar", "v3", credentials=creds)

    # ------------------------------------------------------------------
    # Get events for a day
    # ------------------------------------------------------------------

    def get_events(self, date: str = "today", max_results: int = 10) -> list[dict]:
        """Return events for the given day.

        Parameters
        ----------
        date:
            ``"today"``, ``"tomorrow"``, or ``"YYYY-MM-DD"``.
        max_results:
            Maximum number of events to return.

        Returns
        -------
        list of dicts with keys: event_id, summary, start, end, location, description.
        Returns an empty list on API errors or if no events exist.
        """
        try:
            from googleapiclient.errors import HttpError
        except ImportError:
            HttpError = Exception  # type: ignore[misc,assignment]

        try:
            day = _parse_date_arg(date)
        except (ValueError, TypeError) as exc:
            log.warning("CalendarHandler.get_events: bad date %r — %s", date, exc)
            return []

        time_min, time_max = _day_bounds_utc(day)

        try:
            result = (
                self._service.events()
                .list(
                    calendarId="primary",
                    timeMin=time_min,
                    timeMax=time_max,
                    maxResults=max_results,
                    singleEvents=True,
                    orderBy="startTime",
                )
                .execute()
            )
        except HttpError as exc:
            log.warning("CalendarHandler.get_events: API error — %s", exc)
            return []
        except Exception as exc:  # noqa: BLE001
            log.warning("CalendarHandler.get_events: unexpected error — %s", exc)
            return []

        events: list[dict] = []
        for item in result.get("items", []):
            start_raw = item.get("start", {})
            end_raw = item.get("end", {})
            events.append({
                "event_id": item.get("id", ""),
                "summary": item.get("summary", ""),
                "start": start_raw.get("dateTime") or start_raw.get("date", ""),
                "end": end_raw.get("dateTime") or end_raw.get("date", ""),
                "location": item.get("location", ""),
                "description": item.get("description", ""),
            })

        return events

    # ------------------------------------------------------------------
    # Create event
    # ------------------------------------------------------------------

    def create_event(
        self,
        summary: str,
        start_dt: str,
        end_dt: str,
        description: str = "",
        location: str = "",
    ) -> dict:
        """Create a calendar event on the primary calendar.

        Parameters
        ----------
        summary:
            Event title.
        start_dt / end_dt:
            ISO 8601 datetime strings (e.g. ``"2026-05-18T14:00:00+05:30"``).
        description:
            Optional event body text.
        location:
            Optional location string.

        Returns
        -------
        The created event resource dict, or an empty dict on error.
        """
        try:
            from googleapiclient.errors import HttpError
        except ImportError:
            HttpError = Exception  # type: ignore[misc,assignment]

        body: dict = {
            "summary": summary,
            "start": {"dateTime": start_dt},
            "end": {"dateTime": end_dt},
        }
        if description:
            body["description"] = description
        if location:
            body["location"] = location

        try:
            created = (
                self._service.events()
                .insert(calendarId="primary", body=body)
                .execute()
            )
            return dict(created)
        except HttpError as exc:
            log.warning("CalendarHandler.create_event: API error — %s", exc)
            return {}
        except Exception as exc:  # noqa: BLE001
            log.warning("CalendarHandler.create_event: unexpected error — %s", exc)
            return {}

    # ------------------------------------------------------------------
    # List calendars
    # ------------------------------------------------------------------

    def list_calendars(self) -> list[dict]:
        """Return all calendars the authenticated user can see.

        Each item has keys: id, summary, primary (bool).
        Returns an empty list on API errors.
        """
        try:
            from googleapiclient.errors import HttpError
        except ImportError:
            HttpError = Exception  # type: ignore[misc,assignment]

        try:
            result = self._service.calendarList().list().execute()
        except HttpError as exc:
            log.warning("CalendarHandler.list_calendars: API error — %s", exc)
            return []
        except Exception as exc:  # noqa: BLE001
            log.warning("CalendarHandler.list_calendars: unexpected error — %s", exc)
            return []

        calendars: list[dict] = []
        for item in result.get("items", []):
            calendars.append({
                "id": item.get("id", ""),
                "summary": item.get("summary", ""),
                "primary": bool(item.get("primary", False)),
            })

        return calendars
