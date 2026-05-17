"""ARIA assistant orchestrator — smolagents CodeAgent with custom tools.

SECURITY: smolagents LocalPythonExecutor is NOT a sandbox. Personal-trust-only.
Hard-coded tool allowlist below. Never expose to remote prompts.
"""

from __future__ import annotations

import logging
import sqlite3
from typing import Any, Optional

from config.settings import settings
from core.llm_engine import OllamaPrimary

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Smolagents LLM adapter
# ---------------------------------------------------------------------------

class AriaOllamaModel:
    """smolagents-compatible LLM backend wrapping OllamaPrimary.

    smolagents accepts any object with a ``__call__(messages, ...) -> str``
    interface.  This adapter translates the smolagents messages list (a list
    of dicts with ``role`` / ``content`` keys) into a single prompt string for
    the Ollama /api/generate endpoint.

    The conversion is intentionally simple — Qwen3 has an instruction-tuned
    chat template, but smolagents prepares the full agent scaffold so we just
    concatenate the turns.
    """

    def __init__(self, ollama: Optional[OllamaPrimary] = None) -> None:
        self._ollama = ollama or OllamaPrimary()

    def __call__(
        self,
        messages: list[dict[str, str]],
        stop_sequences: Optional[list[str]] = None,
        grammar: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """Convert *messages* to a prompt string and call Ollama."""
        prompt_parts: list[str] = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                prompt_parts.append(f"<|system|>\n{content}\n")
            elif role == "assistant":
                prompt_parts.append(f"<|assistant|>\n{content}\n")
            else:
                prompt_parts.append(f"<|user|>\n{content}\n")
        prompt_parts.append("<|assistant|>\n")
        prompt = "".join(prompt_parts)

        generation = self._ollama.generate(prompt, max_tokens=1024, temperature=0.2)
        return generation.text


# ---------------------------------------------------------------------------
# smolagents tools
# ---------------------------------------------------------------------------

def _make_tools(retriever: Any, calendar: Any, gmail: Any, db_path: str) -> list:
    """Build and return the tool list.  Each tool is a @tool-decorated function.

    Tools are defined inside this factory so they can close over the lazy
    handler objects without module-level side-effects.
    """
    try:
        from smolagents import tool  # noqa: PLC0415
    except ImportError as exc:
        raise ImportError(
            "smolagents is not installed.  Install with: pip install smolagents"
        ) from exc

    @tool
    def rag_search(query: str) -> str:
        """Search the research paper RAG index and return formatted citations.

        Args:
            query: Natural-language search query for the research paper corpus.

        Returns:
            Formatted string of matching passages with source citations.
        """
        if retriever is None:
            return "RAG retriever not available."
        try:
            results = retriever.retrieve(query, k=settings.rag_top_k_final)
            if not results:
                return "No relevant passages found."
            parts: list[str] = []
            for r in results:
                parts.append(f"[{r.source}] (score={r.score:.3f})\n{r.text.strip()}")
            return "\n\n---\n\n".join(parts)
        except Exception:
            logger.exception("rag_search() failed for query=%r", query)
            return "RAG search encountered an error."

    @tool
    def get_calendar_events(date: str = "today") -> str:
        """Get Google Calendar events for a given date.

        Args:
            date: Date string in YYYY-MM-DD format, or the word "today".

        Returns:
            Human-readable list of calendar events for the requested date.
        """
        if calendar is None:
            return "Google Calendar integration not available."
        try:
            events = calendar.get_events(date)
            if not events:
                return f"No events found for {date}."
            lines = [f"Events for {date}:"]
            for ev in events:
                lines.append(f"  - {ev}")
            return "\n".join(lines)
        except Exception:
            logger.exception("get_calendar_events() failed for date=%r", date)
            return "Calendar lookup encountered an error."

    @tool
    def get_recent_emails(n: int = 5) -> str:
        """Get the n most recent Gmail threads.

        Args:
            n: Number of recent email threads to retrieve (default 5).

        Returns:
            Formatted summary of the most recent Gmail threads.
        """
        if gmail is None:
            return "Gmail integration not available."
        try:
            threads = gmail.get_recent_threads(n)
            if not threads:
                return "No recent email threads found."
            lines = [f"Last {n} email threads:"]
            for i, t in enumerate(threads, 1):
                lines.append(f"  {i}. {t}")
            return "\n".join(lines)
        except Exception:
            logger.exception("get_recent_emails() failed (n=%d)", n)
            return "Gmail lookup encountered an error."

    @tool
    def get_audit_summary() -> str:
        """Return the last 10 AuditEnvelope composite scores from the SQLite audit log.

        Returns:
            Formatted table of the 10 most recent audit composite scores with timestamps.
        """
        try:
            conn = sqlite3.connect(db_path)
            cur = conn.execute(
                """SELECT request_id, model_name, composite_score, timestamp
                   FROM audit_envelopes
                   ORDER BY rowid DESC
                   LIMIT 10"""
            )
            rows = cur.fetchall()
            conn.close()
            if not rows:
                return "No audit records found."
            lines = ["Last 10 audit results:", "request_id | model | composite | timestamp"]
            for req_id, model, score, ts in rows:
                score_str = f"{score:.4f}" if score is not None else "N/A"
                lines.append(f"  {req_id[:8]}… | {model} | {score_str} | {ts}")
            return "\n".join(lines)
        except sqlite3.OperationalError:
            return "Audit database not initialised yet."
        except Exception:
            logger.exception("get_audit_summary() failed")
            return "Audit summary encountered an error."

    return [rag_search, get_calendar_events, get_recent_emails, get_audit_summary]


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

class AssistantOrchestrator:
    """ARIA agent loop powered by smolagents CodeAgent.

    SECURITY: smolagents LocalPythonExecutor is best-effort, not a sandbox.
    Tool allowlist hardcoded here; never expose to untrusted remote prompts.

    Lazy initialisation keeps startup fast: heavy models (retriever) are only
    instantiated when the first query arrives.
    """

    # Hard-coded allowlist — only these tool names may be registered.
    _ALLOWED_TOOLS = frozenset(
        {"rag_search", "get_calendar_events", "get_recent_emails", "get_audit_summary"}
    )

    def __init__(self) -> None:
        self._ollama = OllamaPrimary()
        self._aria_model = AriaOllamaModel(self._ollama)

        # Lazy references — initialised on first use.
        self._retriever: Any = None
        self._calendar: Any = None
        self._gmail: Any = None

        self._agent: Any = None  # smolagents CodeAgent, built after first query

    # ------------------------------------------------------------------
    # Lazy dependency initialisation
    # ------------------------------------------------------------------

    def _ensure_retriever(self) -> Any:
        if self._retriever is None:
            try:
                from rag.hybrid_retriever import HybridRetriever  # noqa: PLC0415
                self._retriever = HybridRetriever()
            except (ImportError, NotImplementedError):
                logger.warning("HybridRetriever not available; rag_search will be a no-op.")
        return self._retriever

    def _ensure_calendar(self) -> Any:
        if self._calendar is None:
            try:
                from integrations.calendar_handler import CalendarHandler  # noqa: PLC0415
                self._calendar = CalendarHandler()
            except (ImportError, NotImplementedError):
                logger.warning("CalendarHandler not available.")
        return self._calendar

    def _ensure_gmail(self) -> Any:
        if self._gmail is None:
            try:
                from integrations.gmail_handler import GmailHandler  # noqa: PLC0415
                self._gmail = GmailHandler()
            except (ImportError, NotImplementedError):
                logger.warning("GmailHandler not available.")
        return self._gmail

    def _ensure_agent(self) -> Any:
        """Build the smolagents CodeAgent on first call."""
        if self._agent is not None:
            return self._agent

        try:
            from smolagents import CodeAgent  # noqa: PLC0415
        except ImportError as exc:
            raise ImportError(
                "smolagents is not installed.  Install with: pip install smolagents"
            ) from exc

        tools = _make_tools(
            retriever=self._retriever,   # may be None at build time; tools handle that
            calendar=self._calendar,
            gmail=self._gmail,
            db_path=settings.audit_db_path,
        )

        # Validate allowlist at construction time.
        for t in tools:
            name = getattr(t, "name", None) or getattr(t, "__name__", "")
            if name not in self._ALLOWED_TOOLS:
                raise ValueError(
                    f"Tool {name!r} is not in the hard-coded allowlist. "
                    "Add it to AssistantOrchestrator._ALLOWED_TOOLS first."
                )

        self._agent = CodeAgent(
            tools=tools,
            model=self._aria_model,
        )
        logger.info("CodeAgent initialised with %d tools.", len(tools))
        return self._agent

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_query(
        self,
        query: str,
        run_audit: bool = True,
    ) -> dict[str, Any]:
        """Run the smolagents CodeAgent on *query* and optionally audit the response.

        Parameters
        ----------
        query:
            The user's natural-language question or command.
        run_audit:
            When True, the final response is passed to aria_audit.orchestrator.audit()
            and the AuditEnvelope is included in the return value.

        Returns
        -------
        dict with keys:
            response       – str, the agent's answer
            audit_envelope – dict | None (dataclass fields) or None if audit skipped
            sources        – list[str] of source identifiers cited by rag_search
        """
        # Ensure lazy deps are loaded before building the agent so tools get
        # real handler objects where available.
        self._ensure_retriever()
        self._ensure_calendar()
        self._ensure_gmail()

        agent = self._ensure_agent()

        try:
            response_text: str = agent.run(query)
        except Exception:
            logger.exception("CodeAgent.run() failed for query=%r", query)
            response_text = "I encountered an error while processing your request."

        # Extract source citations from tool call history (best-effort).
        sources: list[str] = _extract_sources(agent)

        audit_envelope_dict: Optional[dict[str, Any]] = None
        if run_audit:
            audit_envelope_dict = _run_audit(
                prompt=query,
                response=response_text,
                model_name=self._ollama.model,
                generate_fn=lambda p: self._ollama.generate(p, max_tokens=512).text,
                db_path=settings.audit_db_path,
            )

        return {
            "response": response_text,
            "audit_envelope": audit_envelope_dict,
            "sources": sources,
        }

    def process_voice_query(self, wav_path: str) -> dict[str, Any]:
        """Transcribe *wav_path*, run the agent, speak the response.

        Thin convenience wrapper: STT → process_query() → TTS.

        Returns the same dict as process_query() with an extra key:
            transcript – str, the STT output
        """
        from core.voice_engine import VoiceEngine  # noqa: PLC0415 — lazy to avoid circular import

        voice = VoiceEngine()
        transcript = voice.transcribe(wav_path)
        logger.info("Transcript: %r", transcript)

        if not transcript:
            return {
                "response": "",
                "transcript": "",
                "audit_envelope": None,
                "sources": [],
            }

        result = self.process_query(transcript)
        result["transcript"] = transcript

        if result["response"]:
            try:
                voice.speak(result["response"])
            except Exception:
                logger.exception("speak() failed after process_voice_query()")

        return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_sources(agent: Any) -> list[str]:
    """Pull source identifiers out of the agent's last tool-call log.

    smolagents stores task logs in agent.logs (list of dicts).  We scan for
    rag_search observations and parse source tags from the formatted output.

    Returns an empty list if the log is absent or the format is unexpected.
    """
    sources: list[str] = []
    try:
        for step in getattr(agent, "logs", []):
            obs = step.get("observation", "")
            if not isinstance(obs, str):
                continue
            for line in obs.splitlines():
                # Lines formatted as "[source_id] (score=…)" by rag_search
                if line.startswith("[") and "]" in line:
                    src = line[1 : line.index("]")]
                    if src and src not in sources:
                        sources.append(src)
    except Exception:
        pass
    return sources


def _run_audit(
    prompt: str,
    response: str,
    model_name: str,
    generate_fn: Any,
    db_path: str,
) -> Optional[dict[str, Any]]:
    """Call aria_audit.orchestrator.audit() and return the envelope as a dict.

    Returns None if aria_audit is not installed or the audit raises.
    """
    try:
        from aria_audit.orchestrator import audit  # noqa: PLC0415
        from aria_audit.storage.sqlite_logger import EnvelopeLogger  # noqa: PLC0415
        from dataclasses import asdict  # noqa: PLC0415

        db_logger = EnvelopeLogger(db_path)
        envelope = audit(
            prompt=prompt,
            response=response,
            model_name=model_name,
            generate_fn=generate_fn,
            db_logger=db_logger,
        )
        return asdict(envelope)
    except ImportError:
        logger.warning("aria_audit not installed; skipping audit.")
        return None
    except Exception:
        logger.exception("Audit failed; continuing without audit envelope.")
        return None
