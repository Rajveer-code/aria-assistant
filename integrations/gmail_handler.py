"""Gmail read/summarize/draft via Google API v1.

Only requests gmail.modify + gmail.send scopes (set in google_auth.py).
"""

from __future__ import annotations

import base64
import logging
from email.mime.text import MIMEText

log = logging.getLogger(__name__)


def _decode_base64_url(data: str) -> str:
    """Decode a URL-safe base64-encoded string to utf-8 text."""
    # Gmail uses URL-safe base64 with padding stripped.
    padded = data + "=" * (-len(data) % 4)
    try:
        return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _extract_plain_text(payload: dict) -> str:
    """Recursively walk a message payload and return the first text/plain body."""
    mime_type = payload.get("mimeType", "")
    body = payload.get("body", {})
    parts = payload.get("parts", [])

    if mime_type == "text/plain":
        data = body.get("data", "")
        if data:
            return _decode_base64_url(data)

    for part in parts:
        text = _extract_plain_text(part)
        if text:
            return text

    return ""


def _header(headers: list[dict], name: str) -> str:
    """Return the value of the first matching header (case-insensitive)."""
    name_lower = name.lower()
    for h in headers:
        if h.get("name", "").lower() == name_lower:
            return h.get("value", "")
    return ""


class GmailHandler:
    """High-level Gmail operations backed by the Google Gmail API v1."""

    def __init__(self) -> None:
        from integrations import google_auth
        if not google_auth.credentials_configured():
            raise RuntimeError(
                "Gmail credentials not configured. "
                "Download OAuth 2.0 client credentials from the Google Cloud Console "
                f"and save them to: {google_auth.CREDENTIALS_PATH}"
            )
        creds = google_auth.get_credentials()
        from googleapiclient.discovery import build
        self._service = build("gmail", "v1", credentials=creds)

    # ------------------------------------------------------------------
    # List threads
    # ------------------------------------------------------------------

    def list_threads(self, max_results: int = 5, query: str = "") -> list[dict]:
        """Return a summary list of recent Gmail threads.

        Each item has keys: thread_id, subject, snippet, date, from_address.
        Returns an empty list on API errors.
        """
        try:
            from googleapiclient.errors import HttpError
        except ImportError:
            HttpError = Exception  # type: ignore[misc,assignment]

        try:
            params: dict = {"userId": "me", "maxResults": max_results}
            if query:
                params["q"] = query
            result = self._service.users().threads().list(**params).execute()
            threads_meta = result.get("threads", [])
        except HttpError as exc:
            log.warning("GmailHandler.list_threads: API error — %s", exc)
            return []
        except Exception as exc:  # noqa: BLE001
            log.warning("GmailHandler.list_threads: unexpected error — %s", exc)
            return []

        threads: list[dict] = []
        for meta in threads_meta:
            thread_id = meta.get("id", "")
            snippet = meta.get("snippet", "")
            # Fetch the first message of each thread for headers (subject/date/from)
            subject = ""
            date = ""
            from_address = ""
            try:
                thread_data = (
                    self._service.users()
                    .threads()
                    .get(userId="me", id=thread_id, format="metadata",
                         metadataHeaders=["Subject", "Date", "From"])
                    .execute()
                )
                msgs = thread_data.get("messages", [])
                if msgs:
                    headers = msgs[0].get("payload", {}).get("headers", [])
                    subject = _header(headers, "Subject")
                    date = _header(headers, "Date")
                    from_address = _header(headers, "From")
            except Exception as exc:  # noqa: BLE001
                log.debug("GmailHandler.list_threads: failed to fetch headers for %s — %s", thread_id, exc)

            threads.append({
                "thread_id": thread_id,
                "subject": subject,
                "snippet": snippet,
                "date": date,
                "from_address": from_address,
            })

        return threads

    # ------------------------------------------------------------------
    # Get thread messages
    # ------------------------------------------------------------------

    def get_thread_messages(self, thread_id: str) -> list[dict]:
        """Return all messages in a thread as structured dicts.

        Each item has keys: from, to, subject, body_text, date.
        Returns an empty list on API errors.
        """
        try:
            from googleapiclient.errors import HttpError
        except ImportError:
            HttpError = Exception  # type: ignore[misc,assignment]

        try:
            thread_data = (
                self._service.users()
                .threads()
                .get(userId="me", id=thread_id, format="full")
                .execute()
            )
        except HttpError as exc:
            log.warning("GmailHandler.get_thread_messages: API error — %s", exc)
            return []
        except Exception as exc:  # noqa: BLE001
            log.warning("GmailHandler.get_thread_messages: unexpected error — %s", exc)
            return []

        messages: list[dict] = []
        for msg in thread_data.get("messages", []):
            payload = msg.get("payload", {})
            headers = payload.get("headers", [])
            body_text = _extract_plain_text(payload)
            messages.append({
                "from": _header(headers, "From"),
                "to": _header(headers, "To"),
                "subject": _header(headers, "Subject"),
                "body_text": body_text,
                "date": _header(headers, "Date"),
            })

        return messages

    # ------------------------------------------------------------------
    # Send email
    # ------------------------------------------------------------------

    def send_email(self, to: str, subject: str, body: str) -> dict:
        """Send an email and return {message_id, thread_id}.

        Returns an empty dict on API errors.
        """
        try:
            from googleapiclient.errors import HttpError
        except ImportError:
            HttpError = Exception  # type: ignore[misc,assignment]

        mime_msg = MIMEText(body)
        mime_msg["to"] = to
        mime_msg["subject"] = subject
        raw = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode("utf-8")

        try:
            sent = (
                self._service.users()
                .messages()
                .send(userId="me", body={"raw": raw})
                .execute()
            )
            return {
                "message_id": sent.get("id", ""),
                "thread_id": sent.get("threadId", ""),
            }
        except HttpError as exc:
            log.warning("GmailHandler.send_email: API error — %s", exc)
            return {}
        except Exception as exc:  # noqa: BLE001
            log.warning("GmailHandler.send_email: unexpected error — %s", exc)
            return {}

    # ------------------------------------------------------------------
    # Create draft
    # ------------------------------------------------------------------

    def create_draft(self, to: str, subject: str, body: str) -> dict:
        """Create a draft email and return {draft_id, message_id, thread_id}.

        Returns an empty dict on API errors.
        """
        try:
            from googleapiclient.errors import HttpError
        except ImportError:
            HttpError = Exception  # type: ignore[misc,assignment]

        mime_msg = MIMEText(body)
        mime_msg["to"] = to
        mime_msg["subject"] = subject
        raw = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode("utf-8")

        try:
            draft = (
                self._service.users()
                .drafts()
                .create(userId="me", body={"message": {"raw": raw}})
                .execute()
            )
            msg = draft.get("message", {})
            return {
                "draft_id": draft.get("id", ""),
                "message_id": msg.get("id", ""),
                "thread_id": msg.get("threadId", ""),
            }
        except HttpError as exc:
            log.warning("GmailHandler.create_draft: API error — %s", exc)
            return {}
        except Exception as exc:  # noqa: BLE001
            log.warning("GmailHandler.create_draft: unexpected error — %s", exc)
            return {}
