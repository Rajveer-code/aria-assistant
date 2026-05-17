"""Read-only GitHub helper via the `gh` CLI (allowlisted repos only)."""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
from typing import Any

from config.settings import settings
from core.jarvis.registry import JarvisTool, register

log = logging.getLogger(__name__)


def _gh_available() -> bool:
    return shutil.which("gh") is not None


def allowed_repos() -> dict[str, Any]:
    if not _gh_available():
        return {"ok": False, "error": "`gh` CLI not installed.",
                "hint": "https://cli.github.com/"}
    return {"ok": True, "repos": list(settings.github_repo_allowlist),
            "gh_available": True}


def _check_repo(repo: str) -> str | None:
    if repo not in settings.github_repo_allowlist:
        return f"Repo {repo!r} is not on the allowlist."
    return None


def run_action(action: str, repo: str, args: dict | None = None) -> dict[str, Any]:
    args = args or {}
    if not _gh_available():
        return {"ok": False, "error": "`gh` CLI not installed."}
    err = _check_repo(repo)
    if err:
        return {"ok": False, "error": err}

    cmd: list[str]
    if action == "status":
        cmd = ["gh", "repo", "view", repo, "--json",
               "name,description,defaultBranchRef,pushedAt,stargazerCount,openIssues"]
    elif action == "pr_list":
        cmd = ["gh", "pr", "list", "-R", repo, "--state",
               args.get("state", "open"), "--json",
               "number,title,state,author,createdAt,url", "--limit",
               str(int(args.get("limit", 20)))]
    elif action == "pr_view":
        num = args.get("number")
        if not num:
            return {"ok": False, "error": "Missing `number`"}
        cmd = ["gh", "pr", "view", str(num), "-R", repo, "--json",
               "number,title,state,body,author,createdAt,mergeable,url"]
    elif action == "issue_list":
        cmd = ["gh", "issue", "list", "-R", repo, "--state",
               args.get("state", "open"), "--json",
               "number,title,state,author,createdAt,url", "--limit",
               str(int(args.get("limit", 20)))]
    elif action == "issue_view":
        num = args.get("number")
        if not num:
            return {"ok": False, "error": "Missing `number`"}
        cmd = ["gh", "issue", "view", str(num), "-R", repo, "--json",
               "number,title,state,body,author,createdAt,url"]
    elif action == "workflow_runs":
        cmd = ["gh", "run", "list", "-R", repo, "--json",
               "name,status,conclusion,createdAt,url", "--limit",
               str(int(args.get("limit", 10)))]
    else:
        return {"ok": False, "error": f"Unsupported action: {action!r}"}

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15, check=False, shell=False)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "gh CLI timed out"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}

    if proc.returncode != 0:
        return {"ok": False, "error": proc.stderr.strip() or "gh failed", "cmd": cmd}

    try:
        data = json.loads(proc.stdout)
    except Exception:  # noqa: BLE001
        data = proc.stdout

    return {"ok": True, "action": action, "repo": repo, "data": data}


register(JarvisTool(
    name="github",
    category="power",
    description=("Run read-only GitHub queries via the `gh` CLI on allowlisted repos. "
                 "Actions: status, pr_list, pr_view, issue_list, issue_view, workflow_runs."),
    handler=run_action,
    schema={"type": "object",
            "properties": {"action": {"type": "string"},
                           "repo": {"type": "string"},
                           "args": {"type": "object"}},
            "required": ["action", "repo"]},
    requires_audit=False,
    voice_phrases=("ARIA, list PRs on aria-audit",),
))
