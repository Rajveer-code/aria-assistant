"""Sandboxed-ish Python execution via subprocess.

This is NOT a security boundary. smolagents' LocalPythonExecutor is
"best-effort mitigations only" per their docs. We add:
  - subprocess isolation (-I flag, no user site)
  - hard timeout
  - stdout capture, stderr capture, exit code

For untrusted code this is insufficient. ARIA is a single-user local-only
assistant; we accept that risk.
"""

from __future__ import annotations

import logging
import subprocess
import sys
import textwrap
from typing import Any

from core.jarvis.registry import ARIATool, register

log = logging.getLogger(__name__)

_PREAMBLE = textwrap.dedent("""
import io, sys, json, os
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
_RESULT = None
try:
""").lstrip()

_POSTAMBLE = textwrap.dedent("""
except Exception as _exc:
    print(f"__ERROR__: {type(_exc).__name__}: {_exc}", file=sys.stderr)
print("__OUT__", sys.stdout.getvalue())
print("__ERR__", sys.stderr.getvalue(), file=sys.__stderr__)
""")


def run(code: str, timeout_s: int = 8) -> dict[str, Any]:
    if not code or len(code) > 50_000:
        return {"ok": False, "error": "Code empty or too long (>50k chars)."}

    # Indent user code to live inside the try-block
    indented = textwrap.indent(code.rstrip(), "    ")
    full = _PREAMBLE + indented + "\n" + _POSTAMBLE

    try:
        proc = subprocess.run(
            [sys.executable, "-I", "-S", "-c", full],
            capture_output=True, text=True, timeout=timeout_s,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Timeout after {timeout_s}s"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Subprocess failed: {exc}"}

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""
    # Split our wrapper markers
    out_part = stdout.split("__OUT__", 1)[-1].strip() if "__OUT__" in stdout else stdout
    err_part = ""
    if "__ERR__" in stderr:
        err_part = stderr.split("__ERR__", 1)[-1].strip()
    elif "__ERROR__" in stdout:
        err_part = stdout.split("__ERROR__", 1)[-1].strip()

    return {
        "ok": proc.returncode == 0 and not err_part,
        "exit_code": proc.returncode,
        "stdout": out_part[:10_000],
        "stderr": (err_part or stderr.strip())[:5_000],
    }


register(ARIATool(
    name="run_code",
    category="knowledge",
    description=("Execute a Python snippet in an isolated subprocess. Captures stdout/stderr. "
                 "Not a security sandbox — for personal use only."),
    handler=run,
    schema={"type": "object",
            "properties": {"code": {"type": "string"}, "timeout_s": {"type": "integer"}},
            "required": ["code"]},
    requires_audit=False,
    voice_phrases=("ARIA, run this code ...",),
))
