/**
 * ARIA API client — all backend calls go to http://localhost:8000 directly.
 * CORS is configured on the backend to allow localhost:3000 / 5173 / 5174.
 */

export const BASE = 'http://localhost:8000';
export const WS_BASE = 'ws://localhost:8000';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function _json(res) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/** Non-streaming query. Returns { response, audit_envelope, sources, latency_ms } */
export async function sendQuery(prompt, runAudit = true) {
  const res = await fetch(`${BASE}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, run_audit: runAudit }),
  });
  return _json(res);
}

/**
 * Streaming SSE query.
 * onToken(token) called per token; onDone(auditEnvelope|null) called at end.
 */
export async function sendQueryStream(prompt, onToken, onDone) {
  const res = await fetch(`${BASE}/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, run_audit: true }),
  });
  if (!res.ok) throw new Error(`Stream failed: HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.error) throw new Error(data.error);
        if (data.token) onToken(data.token);
        if (data.done) onDone(data.audit ?? null);
      } catch (e) {
        // only re-throw non-JSON parse errors
        if (e.message && !e.message.includes('JSON')) throw e;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

/** Upload audio blob → transcribe + query. Returns { response, transcript, audit_envelope, ... } */
export async function sendVoice(audioBlob) {
  const form = new FormData();
  form.append('file', audioBlob, 'recording.webm');
  const res = await fetch(`${BASE}/voice`, { method: 'POST', body: form });
  return _json(res);
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Returns { status, ollama, model, qdrant, audit_db, papers_indexed, vram_used_gb, vram_total_gb } */
export async function getHealth() {
  try {
    const res = await fetch(`${BASE}/health`, {
      signal: AbortSignal.timeout?.(3000) ?? undefined,
    });
    if (!res.ok) return { status: 'error', ollama: false };
    return res.json();
  } catch {
    return { status: 'offline', ollama: false, qdrant: false, audit_db: false, papers_indexed: 0 };
  }
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** Returns { envelopes: AuditEnvelope[], count } */
export async function getRecentAudits(n = 10) {
  try {
    const res = await fetch(`${BASE}/audit/recent?n=${n}`);
    if (!res.ok) return { envelopes: [], count: 0 };
    return res.json();
  } catch {
    return { envelopes: [], count: 0 };
  }
}

/** Returns { runs: AuditEnvelope[], count } — for evaluation history page */
export async function getEvalHistory(n = 100) {
  try {
    const res = await fetch(`${BASE}/eval/history?n=${n}`);
    if (!res.ok) return { runs: [], count: 0 };
    return res.json();
  } catch {
    return { runs: [], count: 0 };
  }
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

/**
 * Gmail threads.
 * 503 → { status: 'not_configured', message, instructions }
 * 200 → { threads: [], count }
 */
export async function getEmails(n = 8) {
  try {
    const res = await fetch(`${BASE}/integrations/emails?n=${n}`);
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      return { status: 'not_configured', message: body.detail || 'Gmail not configured' };
    }
    if (!res.ok) return { status: 'error', threads: [] };
    return res.json();
  } catch {
    return { status: 'offline', threads: [] };
  }
}

/**
 * Calendar events.
 * 503 → { status: 'not_configured', message }
 * 200 → { events: [], date, count }
 */
export async function getEvents(date = 'today') {
  try {
    const res = await fetch(`${BASE}/integrations/events?date=${date}`);
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      return { status: 'not_configured', message: body.detail || 'Calendar not configured' };
    }
    if (!res.ok) return { status: 'error', events: [] };
    return res.json();
  } catch {
    return { status: 'offline', events: [] };
  }
}

// ---------------------------------------------------------------------------
// RAG / Papers
// ---------------------------------------------------------------------------

/** Returns { papers: [{filename, size_kb, ingested}], papers_dir } */
export async function getPapers() {
  try {
    const res = await fetch(`${BASE}/rag/papers`);
    if (!res.ok) return { papers: [], papers_dir: '' };
    return res.json();
  } catch {
    return { papers: [], papers_dir: '' };
  }
}

/** Upload + ingest a PDF. Returns { filename, chunks_added, path } */
export async function uploadPaper(file) {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch(`${BASE}/rag/upload`, { method: 'POST', body: form });
  return _json(res);
}

// ---------------------------------------------------------------------------
// OAuth setup
// ---------------------------------------------------------------------------

export async function getOAuthInstructions() {
  try {
    const res = await fetch(`${BASE}/setup/google-oauth-instructions`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
