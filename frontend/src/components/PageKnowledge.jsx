import React from 'react';
import { Icon } from './Icons.jsx';
import {
  searchWeb, searchArxiv, searchWikipedia, summarizeYouTube,
  listRssFeeds, addRssFeed, deleteRssFeed, listRssItems,
  runCode,
} from '../jarvis_api.js';

function HubCard({ icon, title, voice, status, children, footer }) {
  return (
    <div className="hub-card glass">
      <div className="hub-card-head">
        <div className="hub-card-title-row">
          <span className="hub-card-icon">{icon}</span>
          <div>
            <div className="hub-card-title">{title}</div>
            {voice && <div className="hub-card-voice">Say: {voice}</div>}
          </div>
        </div>
        {status}
      </div>
      <div className="hub-card-body">{children}</div>
      {footer && <div className="hub-card-foot">{footer}</div>}
    </div>
  );
}

// ────────── Web search ──────────
function WebSearchCard() {
  const [q, setQ] = React.useState('');
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try { setData(await searchWeb(q)); }
    catch (e) { setData({ ok: false, error: e.message, results: [] }); }
    finally { setBusy(false); }
  };
  return (
    <HubCard icon={<Icon.Search />} title="Web search · DuckDuckGo" voice='"ARIA, search the web for ..."'
      status={busy && <span className="pill pill-cyan"><span className="dot" />SEARCHING</span>}>
      <div className="row gap-8" style={{ marginBottom: 10 }}>
        <input className="hub-input" placeholder="query" value={q}
          onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} style={{ flex: 1 }} />
        <button className="btn btn-cyan" onClick={go} disabled={busy}>Go</button>
      </div>
      {data?.results?.length > 0 ? (
        <div className="col gap-8" style={{ maxHeight: 240, overflowY: 'auto' }}>
          {data.results.map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noreferrer" className="search-result">
              <div className="search-result-title">{r.title}</div>
              <div className="search-result-snippet">{r.snippet}</div>
              <div className="search-result-url">{r.url}</div>
            </a>
          ))}
        </div>
      ) : <div className="t-dim">Run a query.</div>}
    </HubCard>
  );
}

// ────────── arXiv ──────────
function ArxivCard() {
  const [q, setQ] = React.useState('');
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try { setData(await searchArxiv(q, 8)); }
    catch (e) { setData({ ok: false, error: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <HubCard icon={<Icon.Paper />} title="arXiv" voice='"ARIA, find papers on ..."'>
      <div className="row gap-8" style={{ marginBottom: 10 }}>
        <input className="hub-input" placeholder="query" value={q}
          onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} style={{ flex: 1 }} />
        <button className="btn btn-cyan" onClick={go} disabled={busy}>Search</button>
      </div>
      {data?.results?.length > 0 ? (
        <div className="col gap-8" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {data.results.map((r, i) => (
            <div key={i} className="arxiv-row">
              <div className="row gap-8" style={{ alignItems: 'baseline' }}>
                <a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)', fontWeight: 500 }}>{r.title}</a>
                <span className="pill" style={{ fontSize: 8, padding: '1px 6px' }}>{r.primary_category}</span>
              </div>
              <div className="t-dim" style={{ fontSize: 10, marginTop: 2 }}>
                {(r.authors || []).slice(0, 3).join(', ')}{r.authors?.length > 3 ? ' et al.' : ''} · {r.published?.slice(0, 10)}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.5 }}>
                {r.abstract.slice(0, 320)}…
              </div>
            </div>
          ))}
        </div>
      ) : <div className="t-dim">Run a query.</div>}
    </HubCard>
  );
}

// ────────── Wikipedia ──────────
function WikipediaCard() {
  const [q, setQ] = React.useState('');
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try { setData(await searchWikipedia(q)); }
    catch (e) { setData({ ok: false, error: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <HubCard icon={<Icon.Search />} title="Wikipedia" voice='"ARIA, look up X on Wikipedia"'>
      <div className="row gap-8" style={{ marginBottom: 10 }}>
        <input className="hub-input" placeholder="topic" value={q}
          onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} style={{ flex: 1 }} />
        <button className="btn btn-cyan" onClick={go} disabled={busy}>Go</button>
      </div>
      {data?.ok ? (
        <div className="wiki-card">
          {data.thumbnail && (
            <img src={data.thumbnail} alt={data.title} style={{ width: 120, height: 120,
              objectFit: 'cover', borderRadius: 6, marginRight: 12, float: 'left' }} />
          )}
          <div style={{ fontWeight: 500 }}>{data.title}</div>
          <div className="t-dim" style={{ fontSize: 11 }}>{data.description}</div>
          <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>{data.extract}</div>
          <a href={data.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--cyan)' }}>Read more →</a>
        </div>
      ) : data?.error ? <div className="t-dim">— {data.error}</div>
                       : <div className="t-dim">Run a query.</div>}
    </HubCard>
  );
}

// ────────── YouTube ──────────
function YouTubeCard() {
  const [url, setUrl] = React.useState('');
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    if (!url.trim()) return;
    setBusy(true); setData(null);
    try { setData(await summarizeYouTube(url)); }
    catch (e) { setData({ ok: false, error: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <HubCard icon={<Icon.Eye />} title="YouTube · transcript summary"
      voice='"ARIA, summarize this YouTube video"'
      status={busy ? <span className="pill pill-cyan"><span className="dot" />FETCHING</span> : null}>
      <div className="row gap-8" style={{ marginBottom: 10 }}>
        <input className="hub-input" placeholder="https://youtube.com/watch?v=..."
          value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && go()} style={{ flex: 1 }} />
        <button className="btn btn-cyan" onClick={go} disabled={busy}>Summarize</button>
      </div>
      {data?.ok ? (
        <>
          <div className="t-tiny">Transcript: {data.transcript_length} chars · summarized first {data.truncated_to}</div>
          <div style={{ fontSize: 12, marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{data.summary}</div>
          {data.audit_envelope && (
            <div className="t-tiny" style={{ marginTop: 6, color: 'var(--green)' }}>
              ✓ Audit envelope logged
            </div>
          )}
        </>
      ) : data?.error ? <div className="t-dim">— {data.error}</div>
                       : <div className="t-dim">Paste a YouTube URL.</div>}
    </HubCard>
  );
}

// ────────── RSS ──────────
function RssCard() {
  const [feeds, setFeeds] = React.useState([]);
  const [items, setItems] = React.useState([]);
  const [newUrl, setNewUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const refresh = React.useCallback(async () => {
    try {
      const r = await listRssFeeds(); setFeeds(r.feeds || []);
      const i = await listRssItems(null, 12); setItems(i.items || []);
    } catch {}
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);
  const add = async () => {
    if (!newUrl.trim()) return;
    setBusy(true);
    try { await addRssFeed(newUrl, null); setNewUrl(''); await refresh(); }
    finally { setBusy(false); }
  };
  const remove = async (id) => { await deleteRssFeed(id); refresh(); };
  return (
    <HubCard icon={<Icon.Mail />} title="RSS / Atom feeds"
      voice='"ARIA, what is new on arXiv today"'
      status={<span className="pill"><span className="dot" />{feeds.length} feeds</span>}>
      <div className="row gap-8" style={{ marginBottom: 8 }}>
        <input className="hub-input" placeholder="feed URL" value={newUrl}
          onChange={e => setNewUrl(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-cyan" onClick={add} disabled={busy}>Add</button>
      </div>
      <div className="row gap-6" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        {feeds.map(f => (
          <span key={f.id} className="pill" style={{ fontSize: 9, padding: '2px 6px' }}>
            {f.label}
            <button className="btn" style={{ padding: 0, marginLeft: 4, fontSize: 9,
              background: 'transparent', border: 'none', color: 'var(--danger)' }}
              onClick={() => remove(f.id)}>×</button>
          </span>
        ))}
      </div>
      {items.length === 0 ? <div className="t-dim">No items yet.</div> : (
        <div className="col gap-6" style={{ maxHeight: 240, overflowY: 'auto' }}>
          {items.slice(0, 8).map((it, i) => (
            <a key={i} href={it.link} target="_blank" rel="noreferrer" className="rss-row">
              <span className="t-tiny" style={{ minWidth: 70 }}>{it.feed_label}</span>
              <span style={{ flex: 1 }}>{it.title}</span>
            </a>
          ))}
        </div>
      )}
    </HubCard>
  );
}

// ────────── Code runner ──────────
function CodeRunnerCard() {
  const [code, setCode] = React.useState('print("hello from aria")\n');
  const [out, setOut] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    setBusy(true);
    try { setOut(await runCode(code, 8)); }
    catch (e) { setOut({ ok: false, error: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <HubCard icon={<Icon.Cpu />} title="Code runner · Python" voice='"ARIA, run this code"'>
      <textarea className="hub-textarea" rows="6" value={code}
        onChange={e => setCode(e.target.value)} spellCheck={false} />
      <div className="row gap-8" style={{ marginTop: 8 }}>
        <button className="btn btn-cyan" onClick={run} disabled={busy}>{busy ? '…' : 'Run'}</button>
        <span className="t-tiny" style={{ color: 'var(--ink-3)' }}>isolated subprocess · 8s timeout · not a sandbox</span>
      </div>
      {out && (
        <div style={{ marginTop: 8 }}>
          <div className="t-label">
            {out.ok ? <span style={{ color: 'var(--green)' }}>✓ exit 0</span>
                    : <span style={{ color: 'var(--danger)' }}>✗ {out.exit_code ?? 'err'}</span>}
          </div>
          {out.stdout && <pre className="hub-pre">{out.stdout}</pre>}
          {out.stderr && <pre className="hub-pre err">{out.stderr}</pre>}
        </div>
      )}
    </HubCard>
  );
}

export function PageKnowledge() {
  return (
    <div className="page page-hub">
      <div className="page-hero">
        <div className="page-eyebrow">08 · Knowledge</div>
        <h1 className="page-title">Knowledge tools</h1>
        <div className="page-sub">
          Web, arXiv, Wikipedia, YouTube summarizer, RSS reader, Python runner — all zero-cost APIs.
        </div>
      </div>
      <div className="hub-grid">
        <WebSearchCard />
        <ArxivCard />
        <WikipediaCard />
        <YouTubeCard />
        <RssCard />
        <CodeRunnerCard />
      </div>
    </div>
  );
}
