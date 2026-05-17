"""Shared OAuth2 credentials manager (Gmail + Calendar). Phase 3."""

from __future__ import annotations

from pathlib import Path

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
]

CREDENTIALS_PATH = Path(__file__).with_name("credentials.json")
TOKEN_PATH = Path(__file__).with_name("token.json")


def credentials_configured() -> bool:
    """Return True if credentials.json exists on disk."""
    return CREDENTIALS_PATH.exists()


def get_credentials():
    """Return valid Google OAuth2 credentials, refreshing or re-authorising as needed.

    Flow:
    1. Load cached token from TOKEN_PATH if it exists.
    2. If the token is expired but has a refresh token, refresh silently.
    3. If no valid token exists, run the InstalledAppFlow browser redirect.
    4. Persist the (possibly refreshed) token back to TOKEN_PATH.

    Raises:
        RuntimeError: if credentials.json is not present.
    """
    if not credentials_configured():
        raise RuntimeError(
            "Google credentials not found. "
            "Download OAuth 2.0 client credentials from the Google Cloud Console "
            f"and save them to: {CREDENTIALS_PATH}"
        )

    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request

    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_PATH.write_text(creds.to_json())
    return creds
