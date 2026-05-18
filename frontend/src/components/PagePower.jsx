import React from 'react';
import { Icon } from './Icons.jsx';
import {
  openLauncher, captureScreenshot, githubList, githubAction,
  listNotes, indexNotes,
  generateFlashcards, dueCards, reviewCard,
} from '../aria_api.js';

function HubCard({ icon, title, voice, status, children }) {
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
    </div>
  );
}

// ────────── Launcher ──────────
function LauncherCard() {
  const [target, setTarget] = React.useState('');
  const [kind, setKind] = React.useState('app');
  const [msg, setMsg] = React.useState('');
  const go = async () => {
    if (!target.trim()) return;
    try {
      const r = await openLauncher(target, kind);
      setMsg(r.ok ? `✓ Opened ${target}` : `✗ ${r.error}`);
    } catch (e) { setMsg(`✗ ${e.message}`); }
    setTimeout(() => setMsg(''), 3500);
  };
  return (
    <HubCard icon={<Icon.Wrench />} title="App / file launcher" voice='"ARIA, open VS Code"'>
      <div className="row gap-8" style={{ marginBottom: 8 }}>
        <select className="hub-input" value={kind} onChange={e => setKind(e.target.value)}
          style={{ width: 80 }}>
          <option value="app">app</option>
          <option value="file">file</option>
          <option value="url">url</option>
        </select>
        <input className="hub-input" placeholder={
          kind === 'url' ? 'https://...' : kind === 'file' ? 'filename' : 'vscode / chrome / terminal'
        } value={target} onChange={e => setTarget(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && go()} style={{ flex: 1 }} />
        <button className="btn btn-cyan" onClick={go}>Open</button>
      </div>
      {msg && <div className="t-tiny" style={{ color: msg.startsWith('✓') ? 'var(--green)' : 'var(--danger)' }}>{msg}</div>}
      <div className="t-tiny" style={{ marginTop: 6, color: 'var(--ink-3)' }}>
        Quick: vscode · chrome · firefox · obsidian · explorer · terminal · notepad
      </div>
    </HubCard>
  );
}

// ────────── Vision ──────────
function VisionCard() {
  const [query, setQuery] = React.useState('Describe what is shown on this screen.');
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    setBusy(true); setData(null);
    try { setData(await captureScreenshot(null, query)); }
    catch (e) { setData({ ok: false, error: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <HubCard icon={<Icon.Eye />} title="Screenshot · LLaVA vision" voice='"ARIA, what is on my screen"'
      status={busy ? <span className="pill pill-cyan"><span className="dot" />ANALYSING</span> : null}>
      <textarea className="hub-textarea" rows="2" value={query}
        onChange={e => setQuery(e.target.value)} />
      <div className="row gap-8" style={{ marginTop: 8 }}>
        <button className="btn btn-cyan" onClick={go} disabled={busy}>Capture &amp; analyse</button>
        <span className="t-tiny" style={{ color: 'var(--ink-3)' }}>~3.5 GB VRAM via Ollama</span>
      </div>
      {data?.ok ? (
        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {data.answer}
        </div>
      ) : data?.error ? <div className="t-dim" style={{ marginTop: 8 }}>— {data.error}</div> : null}
    </HubCard>
  );
}

// ────────── GitHub ──────────
function GitHubCard() {
  const [repos, setRepos] = React.useState([]);
  const [available, setAvailable] = React.useState(true);
  const [repo, setRepo] = React.useState('');
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    githubList().then(r => {
      setRepos(r.repos || []);
      setAvailable(!!r.gh_available);
      if (r.repos?.length) setRepo(r.repos[0]);
    }).catch(() => setAvailable(false));
  }, []);
  const run = async (action) => {
    if (!repo) return;
    setBusy(true);
    try { setData(await githubAction(action, repo, {})); }
    catch (e) { setData({ ok: false, error: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <HubCard icon={<Icon.Audit />} title="GitHub · read-only"
      voice='"ARIA, list pull requests on aria-audit"'>
      {!available ? (
        <div className="t-dim">`gh` CLI not installed — install from <a href="https://cli.github.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>cli.github.com</a></div>
      ) : (
        <>
          <div className="row gap-8" style={{ marginBottom: 8 }}>
            <select className="hub-input" value={repo} onChange={e => setRepo(e.target.value)} style={{ flex: 1 }}>
              {repos.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="row gap-6" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
            {['status', 'pr_list', 'issue_list', 'workflow_runs'].map(a => (
              <button key={a} className="btn" style={{ padding: '4px 10px', fontSize: 10 }}
                disabled={busy} onClick={() => run(a)}>{a.replace('_', ' ')}</button>
            ))}
          </div>
          {data?.ok ? (
            <pre className="hub-pre" style={{ maxHeight: 240 }}>{JSON.stringify(data.data, null, 2)}</pre>
          ) : data?.error ? <div className="t-dim">— {data.error}</div> : null}
        </>
      )}
    </HubCard>
  );
}

// ────────── Notes / Obsidian ──────────
function NotesCard() {
  const [vaults, setVaults] = React.useState([]);
  const [path, setPath] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const refresh = React.useCallback(async () => {
    try { const r = await listNotes(); setVaults(r.vaults || []); } catch {}
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);
  const add = async () => {
    if (!path.trim()) return;
    setBusy(true); setMsg('Indexing…');
    try {
      const r = await indexNotes(path);
      setMsg(r.ok ? `✓ ${r.files_indexed} files, ${r.chunks_added} chunks` : `✗ ${r.error}`);
      if (r.ok) { setPath(''); refresh(); }
    } catch (e) { setMsg(`✗ ${e.message}`); }
    finally { setBusy(false); setTimeout(() => setMsg(''), 5000); }
  };
  return (
    <HubCard icon={<Icon.Paper />} title="Obsidian-style vault" voice='"ARIA, index my notes at ..."'>
      <div className="row gap-8" style={{ marginBottom: 8 }}>
        <input className="hub-input" placeholder="C:\path\to\vault" value={path}
          onChange={e => setPath(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-cyan" onClick={add} disabled={busy}>Index</button>
      </div>
      {msg && <div className="t-tiny" style={{ color: msg.startsWith('✓') ? 'var(--green)' : 'var(--danger)' }}>{msg}</div>}
      {vaults.length === 0 ? <div className="t-dim" style={{ marginTop: 8 }}>No vaults indexed yet.</div> : (
        <div className="col gap-4" style={{ marginTop: 8 }}>
          {vaults.map(v => (
            <div key={v.slug} className="row" style={{ fontSize: 11,
              justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{v.slug}</span>
              <span className="t-dim">{v.files} files · {v.chunks} chunks</span>
            </div>
          ))}
        </div>
      )}
    </HubCard>
  );
}

// ────────── Study / flashcards ──────────
function StudyCard() {
  const [src, setSrc] = React.useState('topic');
  const [id, setId] = React.useState('');
  const [n, setN] = React.useState(10);
  const [busy, setBusy] = React.useState(false);
  const [due, setDue] = React.useState([]);
  const [idx, setIdx] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try { const r = await dueCards(); setDue(r.cards || []); setIdx(0); setRevealed(false); } catch {}
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  const gen = async () => {
    if (!id.trim()) return;
    setBusy(true);
    try { await generateFlashcards(src, id, n); await refresh(); }
    finally { setBusy(false); }
  };
  const rate = async (q) => {
    const card = due[idx]; if (!card) return;
    await reviewCard(card.id, q);
    setRevealed(false);
    if (idx + 1 < due.length) setIdx(idx + 1);
    else refresh();
  };
  const current = due[idx];

  return (
    <HubCard icon={<Icon.Chart />} title="Study mode · spaced repetition"
      voice='"ARIA, make flashcards from the CPFE paper"'
      status={<span className="pill"><span className="dot" />{due.length} due</span>}>
      <div className="row gap-8" style={{ marginBottom: 8 }}>
        <select className="hub-input" value={src} onChange={e => setSrc(e.target.value)} style={{ width: 90 }}>
          <option value="topic">topic</option>
          <option value="text">text</option>
          <option value="paper">paper</option>
        </select>
        <input className="hub-input" placeholder={src === 'paper' ? 'filename.pdf' : src === 'topic' ? 'topic' : 'paste text'}
          value={id} onChange={e => setId(e.target.value)} style={{ flex: 1 }} />
        <input className="hub-input" type="number" min="1" max="30" value={n}
          onChange={e => setN(Number(e.target.value))} style={{ width: 56 }} />
        <button className="btn btn-cyan" onClick={gen} disabled={busy}>{busy ? '…' : 'Gen'}</button>
      </div>
      {current ? (
        <div className="flashcard">
          <div className="t-tiny">card {idx + 1} of {due.length} · ease {current.ease.toFixed(2)} · reps {current.reps}</div>
          <div style={{ fontSize: 14, fontWeight: 500, marginTop: 6 }}>{current.question}</div>
          {revealed ? (
            <>
              <div style={{ fontSize: 13, marginTop: 8, color: 'var(--ink-2)' }}>{current.answer}</div>
              <div className="row gap-6" style={{ marginTop: 10 }}>
                {[0, 1, 2, 3, 4, 5].map(q => (
                  <button key={q} className="btn" style={{ padding: '4px 8px', fontSize: 10 }}
                    onClick={() => rate(q)}>{q}</button>
                ))}
                <span className="t-tiny" style={{ color: 'var(--ink-3)' }}>SM-2 quality 0–5</span>
              </div>
            </>
          ) : (
            <button className="btn btn-cyan" style={{ marginTop: 8 }} onClick={() => setRevealed(true)}>Reveal</button>
          )}
        </div>
      ) : <div className="t-dim">No cards due. Generate some.</div>}
    </HubCard>
  );
}

export function PagePower() {
  return (
    <div className="page page-hub">
      <div className="page-hero">
        <div className="page-eyebrow">09 · Power</div>
        <h1 className="page-title">Power tools</h1>
        <div className="page-sub">
          App launcher, screenshot vision (LLaVA), GitHub read-only, Obsidian indexing, flashcards with spaced repetition.
        </div>
      </div>
      <div className="hub-grid">
        <LauncherCard />
        <VisionCard />
        <GitHubCard />
        <NotesCard />
        <StudyCard />
      </div>
    </div>
  );
}
