import React from 'react';
import { Icon } from './Icons.jsx';
import {
  weather, getSystemStats,
  createTimer, listTimers, cancelTimer,
  getClipboardHistory, summarizeClipboard,
  getMemory, patchMemory,
} from '../aria_api.js';

// ────────── Generic card shell ──────────
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

// ────────── Weather ──────────
function WeatherCard() {
  const [city, setCity] = React.useState('');
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const fetchIt = React.useCallback(async (c) => {
    setLoading(true);
    try { setData(await weather(c || undefined)); }
    catch (e) { setData({ ok: false, error: e.message }); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { fetchIt(); }, [fetchIt]);

  const cur = data?.current;
  return (
    <HubCard icon={<Icon.Cloud />} title="Weather" voice='"ARIA, weather in Pune"'
      status={loading ? <span className="pill pill-cyan"><span className="dot" />LOADING</span>
                      : data?.ok ? <span className="pill pill-good"><span className="dot" />LIVE</span>
                      : <span className="pill pill-flag"><span className="dot" />OFFLINE</span>}>
      <div className="row gap-8" style={{ marginBottom: 10 }}>
        <input className="hub-input" placeholder={data?.city || 'city'}
          value={city} onChange={e => setCity(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchIt(city)} />
        <button className="btn btn-cyan" onClick={() => fetchIt(city)}>Go</button>
      </div>
      {cur ? (
        <>
          <div className="hub-big-num">{cur.temp_c}°<span className="hub-big-unit">C</span></div>
          <div className="t-dim" style={{ fontSize: 12 }}>
            {cur.description} · feels {cur.feels_like_c}° · {cur.humidity}% RH · {cur.wind_kph} km/h
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {(data.forecast || []).map(d => (
              <div key={d.date} className="forecast-cell">
                <div className="t-tiny">{d.date?.slice(5)}</div>
                <div style={{ fontSize: 13 }}>{d.min_c}° – {d.max_c}°</div>
              </div>
            ))}
          </div>
        </>
      ) : data?.error ? <div className="t-dim">Backend offline — {data.error}</div>
                      : <div className="t-dim">No data yet.</div>}
    </HubCard>
  );
}

// ────────── System stats ──────────
function SystemStatsCard() {
  const [stats, setStats] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const s = await getSystemStats(); if (alive) setStats(s); } catch {}
    };
    tick();
    const id = setInterval(tick, 2_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const Bar = ({ pct, color }) => (
    <div style={{ height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, pct ?? 0)}%`, height: '100%', background: color, transition: 'width 600ms ease' }} />
    </div>
  );
  return (
    <HubCard icon={<Icon.Cpu />} title="System" voice='"ARIA, system stats"'
      status={<span className="pill"><span className="dot" />{stats?.ok ? 'LIVE' : '—'}</span>}>
      {stats?.ok ? (
        <div className="col gap-10">
          <div>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 11 }}>
              <span>CPU · {stats.cpu.cores} cores</span><span>{stats.cpu.pct?.toFixed(0)}%</span>
            </div>
            <Bar pct={stats.cpu.pct} color="var(--cyan)" />
          </div>
          <div>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 11 }}>
              <span>RAM</span><span>{stats.ram.used_gb} / {stats.ram.total_gb} GB · {stats.ram.pct}%</span>
            </div>
            <Bar pct={stats.ram.pct} color="var(--violet)" />
          </div>
          {stats.gpu && (
            <div>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 11 }}>
                <span>GPU · {stats.gpu.name}</span><span>{stats.gpu.vram_used_gb} / {stats.gpu.vram_total_gb} GB</span>
              </div>
              <Bar pct={stats.gpu.vram_pct} color="var(--green)" />
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 10, marginTop: 4, color: 'var(--ink-3)' }}>
                <span>util {stats.gpu.util_pct}%</span>
                {stats.gpu.temp_c != null && <span>{stats.gpu.temp_c}°C</span>}
              </div>
            </div>
          )}
          {stats.disk && (
            <div>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 11 }}>
                <span>Disk</span><span>{stats.disk.used_gb} / {stats.disk.total_gb} GB</span>
              </div>
              <Bar pct={stats.disk.pct} color="var(--amber)" />
            </div>
          )}
        </div>
      ) : <div className="t-dim">Loading…</div>}
    </HubCard>
  );
}

// ────────── Timer ──────────
function TimerCard() {
  const [minutes, setMinutes] = React.useState(25);
  const [label, setLabel] = React.useState('pomodoro');
  const [timers, setTimers] = React.useState([]);
  const refresh = React.useCallback(async () => {
    try { const r = await listTimers(); setTimers(r.timers || []); } catch {}
  }, []);
  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1_000);
    return () => clearInterval(id);
  }, [refresh]);
  const start = async () => {
    if (minutes < 1) return;
    await createTimer({ label, seconds: minutes * 60 });
    refresh();
  };
  const stop = async (id) => { await cancelTimer(id); refresh(); };
  const fmt = (s) => {
    s = Math.max(0, Math.round(s));
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  return (
    <HubCard icon={<Icon.Clock />} title="Timer · Pomodoro" voice='"ARIA, 25 minute timer"'>
      <div className="row gap-8" style={{ marginBottom: 10 }}>
        <input className="hub-input" type="number" min="1" max="240" value={minutes}
          onChange={e => setMinutes(Number(e.target.value))} style={{ width: 64 }} />
        <span className="t-dim" style={{ fontSize: 11 }}>min</span>
        <input className="hub-input" placeholder="label" value={label}
          onChange={e => setLabel(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-cyan" onClick={start}>Start</button>
      </div>
      {timers.length === 0 ? <div className="t-dim">No active timers.</div> : (
        <div className="col gap-6">
          {timers.map(t => (
            <div key={t.id} className="row" style={{ justifyContent: 'space-between',
              padding: '6px 10px', background: 'rgba(0,0,0,0.03)', borderRadius: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{t.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--cyan)' }}>{fmt(t.remaining)}</span>
              <button className="btn" style={{ padding: '2px 8px', fontSize: 9 }}
                onClick={() => stop(t.id)}>STOP</button>
            </div>
          ))}
        </div>
      )}
    </HubCard>
  );
}

// ────────── Clipboard ──────────
function ClipboardCard() {
  const [items, setItems] = React.useState([]);
  const [enabled, setEnabled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [summary, setSummary] = React.useState(null);
  const refresh = React.useCallback(async () => {
    try {
      const r = await getClipboardHistory();
      setItems(r.items || []); setEnabled(!!r.enabled);
    } catch {}
  }, []);
  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3_000);
    return () => clearInterval(id);
  }, [refresh]);
  const doSummarize = async (text) => {
    setBusy(true); setSummary(null);
    try { setSummary(await summarizeClipboard(text)); }
    catch (e) { setSummary({ ok: false, error: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <HubCard icon={<Icon.Clipboard />} title="Clipboard" voice='"ARIA, summarize my clipboard"'
      status={enabled ? <span className="pill pill-good"><span className="dot" />WATCHING</span>
                      : <span className="pill"><span className="dot" />OFF</span>}>
      {!enabled && (
        <div className="t-dim" style={{ fontSize: 11, marginBottom: 8 }}>
          Enable in Settings → ARIA → Clipboard watcher (off by default for privacy).
        </div>
      )}
      {items.length === 0 ? <div className="t-dim">No clipboard items yet.</div> : (
        <div className="col gap-6" style={{ maxHeight: 200, overflowY: 'auto' }}>
          {items.slice(0, 6).map((it, i) => (
            <div key={i} className="clip-row">
              <span className="pill" style={{ fontSize: 8, padding: '1px 6px' }}>{it.kind}</span>
              <span className="clip-text">{it.text.slice(0, 120)}</span>
              <button className="btn" style={{ padding: '2px 6px', fontSize: 9 }}
                disabled={busy} onClick={() => doSummarize(it.text)}>SUM</button>
            </div>
          ))}
        </div>
      )}
      {summary && summary.ok && (
        <div className="hub-summary">
          <div className="t-label">Summary</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{summary.summary}</div>
        </div>
      )}
    </HubCard>
  );
}

// ────────── Memory ──────────
function MemoryCard() {
  const [mem, setMem] = React.useState({});
  const [k, setK] = React.useState('');
  const [v, setV] = React.useState('');
  const refresh = React.useCallback(async () => {
    try { const r = await getMemory(); setMem(r.memory || {}); } catch {}
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);
  const save = async () => {
    if (!k) return;
    await patchMemory(k, v);
    setK(''); setV(''); refresh();
  };
  return (
    <HubCard icon={<Icon.Audit />} title="Persistent memory"
      voice='"ARIA, remember that I prefer Markdown"'>
      <div className="row gap-8" style={{ marginBottom: 8 }}>
        <input className="hub-input" placeholder="key" value={k}
          onChange={e => setK(e.target.value)} style={{ flex: 1 }} />
        <input className="hub-input" placeholder="value" value={v}
          onChange={e => setV(e.target.value)} style={{ flex: 2 }} />
        <button className="btn btn-cyan" onClick={save}>Set</button>
      </div>
      {Object.keys(mem).length === 0 ? <div className="t-dim">No saved memories yet.</div> : (
        <div className="col gap-4" style={{ maxHeight: 180, overflowY: 'auto' }}>
          {Object.entries(mem).map(([key, val]) => (
            <div key={key} className="row" style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
              justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: 4 }}>
              <span style={{ color: 'var(--cyan)' }}>{key}</span>
              <span style={{ color: 'var(--ink-2)', maxWidth: 220, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {typeof val === 'string' ? val : JSON.stringify(val)}
              </span>
            </div>
          ))}
        </div>
      )}
    </HubCard>
  );
}

// ────────── Page ──────────
export function PageUtilities() {
  return (
    <div className="page page-hub">
      <div className="page-hero">
        <div className="page-eyebrow">07 · Utilities</div>
        <h1 className="page-title">Daily tools</h1>
        <div className="page-sub">
          Weather, system stats, timers, clipboard, and persistent memory. Voice-callable; everything runs locally.
        </div>
      </div>
      <div className="hub-grid">
        <WeatherCard />
        <SystemStatsCard />
        <TimerCard />
        <ClipboardCard />
        <MemoryCard />
      </div>
    </div>
  );
}
