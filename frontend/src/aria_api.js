// Wrappers for /tools/* and /settings endpoints. Mirrors api.js style.
import { BASE } from './api.js';

async function _json(res) {
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// ─────────── Tool registry meta ───────────
export const listTools = () => fetch(`${BASE}/tools/`).then(_json);

// ─────────── Notifications ───────────
export const getRecentNotifications = (n = 20) =>
  fetch(`${BASE}/tools/notifications/recent?n=${n}`).then(_json);

// ─────────── Utilities ───────────
export const weather = (city) =>
  fetch(`${BASE}/tools/weather${city ? `?city=${encodeURIComponent(city)}` : ''}`).then(_json);

export const getSystemStats = () => fetch(`${BASE}/tools/system`).then(_json);

export const createTimer = ({ label, seconds }) =>
  fetch(`${BASE}/tools/timer`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, seconds }),
  }).then(_json);

export const listTimers = () => fetch(`${BASE}/tools/timer`).then(_json);

export const cancelTimer = (id) =>
  fetch(`${BASE}/tools/timer/${id}`, { method: 'DELETE' }).then(_json);

export const getClipboardHistory = () =>
  fetch(`${BASE}/tools/clipboard/history`).then(_json);

export const summarizeClipboard = (text) =>
  fetch(`${BASE}/tools/clipboard/summarize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(_json);

export const getMemory = () => fetch(`${BASE}/tools/memory`).then(_json);

export const patchMemory = (key, value) =>
  fetch(`${BASE}/tools/memory`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  }).then(_json);

// ─────────── Knowledge ───────────
export const searchWeb = (q) =>
  fetch(`${BASE}/tools/search/web?q=${encodeURIComponent(q)}`).then(_json);

export const searchArxiv = (q, max = 10) =>
  fetch(`${BASE}/tools/search/arxiv?q=${encodeURIComponent(q)}&max=${max}`).then(_json);

export const searchWikipedia = (q) =>
  fetch(`${BASE}/tools/search/wikipedia?q=${encodeURIComponent(q)}`).then(_json);

export const summarizeYouTube = (url) =>
  fetch(`${BASE}/tools/youtube/summarize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }).then(_json);

export const listRssFeeds = () => fetch(`${BASE}/tools/rss/feeds`).then(_json);

export const addRssFeed = (url, label) =>
  fetch(`${BASE}/tools/rss/feeds`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, label }),
  }).then(_json);

export const deleteRssFeed = (id) =>
  fetch(`${BASE}/tools/rss/feeds/${id}`, { method: 'DELETE' }).then(_json);

export const listRssItems = (feedId, limit = 30) => {
  const qp = new URLSearchParams({ limit });
  if (feedId != null) qp.set('feed', feedId);
  return fetch(`${BASE}/tools/rss/items?${qp}`).then(_json);
};

export const runCode = (code, timeoutS = 8) =>
  fetch(`${BASE}/tools/run_code`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, timeout_s: timeoutS }),
  }).then(_json);

// ─────────── Power ───────────
export const openLauncher = (target, kind = 'app') =>
  fetch(`${BASE}/tools/launcher/open`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, kind }),
  }).then(_json);

export const captureScreenshot = (region, query) =>
  fetch(`${BASE}/tools/vision/screenshot`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ region, query }),
  }).then(_json);

export const githubList = () => fetch(`${BASE}/tools/github`).then(_json);

export const githubAction = (action, repo, args) =>
  fetch(`${BASE}/tools/github`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, repo, args }),
  }).then(_json);

export const listNotes = () => fetch(`${BASE}/tools/notes`).then(_json);

export const indexNotes = (vaultPath) =>
  fetch(`${BASE}/tools/notes/index`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_path: vaultPath }),
  }).then(_json);

export const generateFlashcards = (sourceKind, sourceId, nCards = 10) =>
  fetch(`${BASE}/tools/study/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_kind: sourceKind, source_id: sourceId, n_cards: nCards }),
  }).then(_json);

export const dueCards = () => fetch(`${BASE}/tools/study/due`).then(_json);

export const reviewCard = (cardId, quality) =>
  fetch(`${BASE}/tools/study/review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_id: cardId, quality }),
  }).then(_json);

// ─────────── Settings ───────────
export const getSettings = () => fetch(`${BASE}/settings`).then(_json);

export const patchSetting = (key, value) =>
  fetch(`${BASE}/settings`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  }).then(_json);

export const resetSetting = (key) =>
  fetch(`${BASE}/settings/${encodeURIComponent(key)}`, { method: 'DELETE' }).then(_json);

export const resetAllSettings = () =>
  fetch(`${BASE}/settings`, { method: 'DELETE' }).then(_json);
