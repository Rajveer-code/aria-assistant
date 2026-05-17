import React from 'react';
import { getEvalHistory } from '../api.js';

const BENCH_RUNS = [
  { id: 'r-1847', date: 'May 16 · 14:32', suite: 'CPFE-1000 + BBQ-2', model: 'qwen3:8b-q4_K_M', n: 1000, comp: 78, cal: 82, faith: 91, cons: 76, eq: 41, attrib: 85, drift: true,  status: 'flagged' },
  { id: 'r-1846', date: 'May 16 · 02:00', suite: 'CPFE-1000',         model: 'qwen3:8b-q4_K_M', n: 1000, comp: 81, cal: 84, faith: 92, cons: 78, eq: 56, attrib: 86, drift: false, status: 'ok' },
  { id: 'r-1845', date: 'May 15 · 14:30', suite: 'BBQ + BOLD',        model: 'qwen3:8b-q4_K_M', n: 800,  comp: 79, cal: 81, faith: 90, cons: 76, eq: 53, attrib: 86, drift: false, status: 'ok' },
  { id: 'r-1844', date: 'May 15 · 02:00', suite: 'CPFE-1000',         model: 'qwen3:8b-q4_K_M', n: 1000, comp: 82, cal: 85, faith: 92, cons: 78, eq: 62, attrib: 86, drift: false, status: 'ok' },
  { id: 'r-1843', date: 'May 14 · 14:30', suite: 'CPFE-1000',         model: 'qwen3:8b-q4_K_M', n: 1000, comp: 84, cal: 87, faith: 93, cons: 80, eq: 72, attrib: 87, drift: false, status: 'ok' },
  { id: 'r-1842', date: 'May 14 · 02:00', suite: 'CPFE-1000 + BOLD',  model: 'qwen3:8b-q4_K_M', n: 1100, comp: 83, cal: 86, faith: 92, cons: 79, eq: 69, attrib: 86, drift: false, status: 'ok' },
  { id: 'r-1841', date: 'May 13 · 14:30', suite: 'CPFE-1000',         model: 'qwen3:8b-q4_K_M', n: 1000, comp: 85, cal: 87, faith: 93, cons: 81, eq: 75, attrib: 87, drift: false, status: 'ok' },
];

function _pj(v) {
  if (!v) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

/** Map a raw SQLite audit_envelopes row → table display row. */
function rowToRun(row, idx) {
  const cal_j   = _pj(row.calibration_json);
  const faith_j = _pj(row.faithfulness_json);
  const cons_j  = _pj(row.consistency_json);
  const eq_j    = _pj(row.equity_json);
  const attr_j  = _pj(row.attribution_json);
  const drift_j = _pj(row.drift_json);

  const cal    = cal_j?.ece_overall      != null ? Math.round(Math.max(0, 1 - cal_j.ece_overall) * 100)          : null;
  const faith  = faith_j?.hhem_score     != null ? Math.round(faith_j.hhem_score * 100)                           : null;
  const cons   = cons_j?.semantic_entropy != null ? Math.round(Math.max(0, 1 - cons_j.semantic_entropy) * 100)    : null;
  const attrib = attr_j?.jaccard_at_k    != null ? Math.round(attr_j.jaccard_at_k * 100)                          : null;

  let eq = null;
  if (eq_j?.disparate_impact != null) {
    const di  = eq_j.disparate_impact   ?? 1;
    const eod = eq_j.equalized_odds_gap ?? 0;
    eq = Math.round(Math.min(di, 2 - di) * 50 + (1 - Math.min(eod, 1)) * 50);
  }

  const comp = typeof row.composite_score === 'number' ? Math.round(row.composite_score)
             : [cal, faith, cons, eq, attrib].filter(v => v != null).reduce((a, b, _, arr) => a + b / arr.length, 0);

  const ts = row.timestamp ? new Date(row.timestamp * 1000) : null;
  const date = ts ? ts.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  const hasDrift = Array.isArray(drift_j?.alarms) && drift_j.alarms.length > 0;
  const status   = (eq != null && eq < 50) || hasDrift ? 'flagged' : 'ok';

  return {
    id:     row.id ? `r-${row.id}` : `r-${idx + 1}`,
    date,
    suite:  'Live query',
    model:  row.model_name || 'qwen3:8b',
    n:      1,
    comp:   Math.round(comp) || 0,
    cal:    cal  ?? 0,
    faith:  faith ?? 0,
    cons:   cons  ?? 0,
    eq:     eq    ?? 0,
    attrib: attrib ?? 0,
    drift:  hasDrift,
    status,
  };
}

function MiniSpark({ values, color, height = 28 }) {
  const W = 100, H = height;
  if (!values || values.length < 2) return <svg width={W} height={H} />;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastY = H - ((values[values.length - 1] - min) / range) * (H - 4) - 2;
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      <circle cx={W} cy={lastY} r="2" fill={color} />
    </svg>
  );
}

export function PageEval() {
  const [runs,    setRuns]    = React.useState(BENCH_RUNS);
  const [isLive,  setIsLive]  = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getEvalHistory(100).then(res => {
      if (res.runs && res.runs.length > 0) {
        setRuns(res.runs.map(rowToRun));
        setIsLive(true);
      }
      // else keep BENCH_RUNS
    }).catch(() => {
      // keep BENCH_RUNS on error
    }).finally(() => setLoading(false));
  }, []);

  const compSeries  = runs.map(r => r.comp).reverse();
  const eqSeries    = runs.map(r => r.eq).reverse();
  const calSeries   = runs.map(r => r.cal).reverse();
  const faithSeries = runs.map(r => r.faith).reverse();

  const latest = runs[0] || BENCH_RUNS[0];

  const stats = [
    { key: 'comp',  label: 'Composite',   val: latest.comp,  color: 'var(--green)',  series: compSeries,  delta: compSeries.length >= 2 ? compSeries[compSeries.length - 1] - compSeries[0] : 0 },
    { key: 'eq',    label: 'Equity',       val: latest.eq,    color: 'var(--danger)', series: eqSeries,    delta: eqSeries.length >= 2    ? eqSeries[eqSeries.length - 1]     - eqSeries[0]    : 0 },
    { key: 'cal',   label: 'Calibration',  val: latest.cal,   color: 'var(--amber)',  series: calSeries,   delta: calSeries.length >= 2   ? calSeries[calSeries.length - 1]   - calSeries[0]   : 0 },
    { key: 'faith', label: 'Faithfulness', val: latest.faith, color: 'var(--cyan)',   series: faithSeries, delta: faithSeries.length >= 2 ? faithSeries[faithSeries.length-1] - faithSeries[0]  : 0 },
  ];

  return (
    <div className="page page-eval">
      <div className="page-hero">
        <div className="page-eyebrow">05 · Evaluation</div>
        <h1 className="page-title">
          Audit history · {runs.length} {isLive ? 'live' : 'demo'} runs
        </h1>
        <div className="page-sub">
          {isLive
            ? 'Live audit envelopes from the SQLite DB. Every ARIA response is logged here.'
            : 'Demo history. Run queries to generate live audit envelopes — they will appear here.'}
        </div>
      </div>

      <div className="eval-summary">
        {stats.map(s => {
          const deltaStr = (s.delta >= 0 ? '+' : '') + s.delta.toFixed(0);
          return (
            <div key={s.key} className="eval-stat glass">
              <div className="eval-stat-head">
                <div className="t-label">{s.label}</div>
                <div className={`eval-stat-delta ${s.delta < 0 ? 'down' : 'up'}`}>{deltaStr}</div>
              </div>
              <div className="eval-stat-num" style={{ color: s.color }}>{s.val}</div>
              <MiniSpark values={s.series} color={s.color} height={32} />
              <div className="eval-stat-foot">last {s.series.length} runs</div>
            </div>
          );
        })}
      </div>

      <div className="eval-table glass">
        <div className="eval-table-head">
          <div className="t-label">Run history</div>
          <div className="row gap-8">
            {isLive
              ? <span className="pill pill-green" style={{ padding: '3px 8px', fontSize: 9 }}><span className="dot" />LIVE</span>
              : <span className="pill" style={{ padding: '3px 8px', fontSize: 9 }}>DEMO</span>}
            <span className="pill" style={{ padding: '3px 8px', fontSize: 9 }}>QWEN3·8B</span>
            <button className="btn" style={{ padding: '5px 10px', fontSize: 9 }}>EXPORT CSV</button>
          </div>
        </div>
        <div className="eval-table-scroll scroll-thin">
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Date</th>
                <th>Suite</th>
                <th>N</th>
                <th>Composite</th>
                <th>Cal</th>
                <th>Faith</th>
                <th>Cons</th>
                <th>Equity</th>
                <th>Attrib</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} className={r.status === 'flagged' ? 'flagged' : ''}>
                  <td className="mono">{r.id}</td>
                  <td className="mono dim">{r.date}</td>
                  <td>{r.suite}</td>
                  <td className="mono">{r.n.toLocaleString()}</td>
                  <td className="mono">
                    <span style={{ color: r.comp >= 80 ? 'var(--green)' : r.comp >= 60 ? 'var(--amber)' : 'var(--danger)' }}>
                      {r.comp}
                    </span>
                  </td>
                  <td className="mono">{r.cal}</td>
                  <td className="mono">{r.faith}</td>
                  <td className="mono">{r.cons}</td>
                  <td className="mono">
                    <span style={{ color: r.eq < 50 ? 'var(--danger)' : r.eq < 70 ? 'var(--amber)' : 'var(--green)' }}>
                      {r.eq}
                    </span>
                  </td>
                  <td className="mono">{r.attrib}</td>
                  <td>
                    {r.status === 'flagged'
                      ? <span className="pill pill-danger" style={{ padding: '2px 7px', fontSize: 9 }}><span className="dot" />FLAG</span>
                      : <span className="pill pill-green"  style={{ padding: '2px 7px', fontSize: 9 }}><span className="dot" />OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
