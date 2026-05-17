"""Open apps / files / URLs from voice or UI.

App allowlist matches by lowercase substring. Files are resolved via glob
against a small set of common roots. URLs go through the system default browser.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import webbrowser
from pathlib import Path
from typing import Any

from core.jarvis.registry import JarvisTool, register

log = logging.getLogger(__name__)

# Friendly name → executable command (Windows-first; falls back to system PATH).
_APP_ALIASES = {
    "vscode":         ["code"],
    "vs code":        ["code"],
    "code":           ["code"],
    "notepad":        ["notepad.exe"],
    "calculator":     ["calc.exe"],
    "calc":           ["calc.exe"],
    "explorer":       ["explorer.exe"],
    "file explorer":  ["explorer.exe"],
    "browser":        [],   # webbrowser.open handles default
    "chrome":         ["chrome", "chrome.exe"],
    "firefox":        ["firefox", "firefox.exe"],
    "edge":           ["msedge", "msedge.exe"],
    "obsidian":       ["obsidian.exe", "obsidian"],
    "terminal":       ["wt.exe", "powershell.exe", "cmd.exe"],
    "powershell":     ["powershell.exe", "pwsh.exe"],
    "ollama":         ["ollama.exe", "ollama"],
}

# Where to look for files when target looks like a name (not absolute path).
_SEARCH_ROOTS: tuple[Path, ...] = (
    Path.home(),
    Path.cwd(),
    Path.cwd().parent,
)


def _find_app(name: str) -> list[str] | None:
    key = name.lower().strip()
    candidates = _APP_ALIASES.get(key, [name])
    for c in candidates:
        if not c:
            continue
        path = shutil.which(c)
        if path:
            return [path]
        if Path(c).exists():
            return [c]
    return None


def _find_file(target: str) -> Path | None:
    p = Path(target)
    if p.is_absolute() and p.exists():
        return p
    # Glob each root for the literal name and ".*" variants
    for root in _SEARCH_ROOTS:
        if not root.exists():
            continue
        for found in root.rglob(target):
            if found.is_file():
                return found
        # ext-agnostic search
        for found in root.rglob(target + ".*"):
            if found.is_file():
                return found
    return None


def open_target(target: str, kind: str = "app") -> dict[str, Any]:
    target = target.strip()
    if not target:
        return {"ok": False, "error": "Empty target."}

    if kind == "url":
        try:
            webbrowser.open(target, new=2)
            return {"ok": True, "kind": "url", "target": target}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "target": target}

    if kind == "file":
        f = _find_file(target)
        if not f:
            return {"ok": False, "error": f"File not found: {target}"}
        try:
            os.startfile(str(f))  # Windows-native, falls back below
            return {"ok": True, "kind": "file", "target": str(f)}
        except AttributeError:
            try:
                subprocess.Popen(["xdg-open", str(f)])
                return {"ok": True, "kind": "file", "target": str(f)}
            except Exception as exc:  # noqa: BLE001
                return {"ok": False, "error": str(exc), "target": str(f)}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "target": str(f)}

    # kind == app (default)
    cmd = _find_app(target)
    if not cmd:
        # Last resort: try shutil.which on the raw target
        path = shutil.which(target)
        if path:
            cmd = [path]
    if not cmd:
        return {"ok": False, "error": f"App not found: {target}",
                "hint": "Add to PATH or register an alias in launcher._APP_ALIASES"}
    try:
        subprocess.Popen(cmd, shell=False)
        return {"ok": True, "kind": "app", "cmd": cmd}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "cmd": cmd}


register(JarvisTool(
    name="open_app",
    category="power",
    description=("Open an application, file, or URL on the user's desktop. "
                 "kind ∈ {app, file, url}."),
    handler=open_target,
    schema={"type": "object",
            "properties": {"target": {"type": "string"},
                           "kind": {"type": "string", "enum": ["app", "file", "url"]}},
            "required": ["target"]},
    requires_audit=False,
    voice_phrases=("ARIA, open VS Code", "ARIA, open the ARIA repo"),
))
