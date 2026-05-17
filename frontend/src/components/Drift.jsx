import React from 'react';

function DriftTimeline({ series, driftAt }) {
  const W = 1300, H = 100;
  const pad = { l: 8, r: 8, t: 8, b: 18 };
  const n = series[0]?.values.length || 0;
  const xStep = n > 1 ? (W - pad.l - pad.r) / (n - 1) : 0;
  const y = (v) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  const pathFor = (vals) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${pad.l + i * xStep} ${y(v)}`).join(' ');
  const driftX = driftAt != null ? pad.l + driftAt * xStep : null;

  return (
    <svg className="drift-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[25, 50, 75].map(p => (
        <line key={p} x1={pad.l} x2={W - pad.r}
          y1={pad.t + (1 - p / 100) * (H - pad.t - pad.b)}
          y2={pad.t + (1 - p / 100) * (H - pad.t - pad.b)}
          stroke="#EDE9DF" strokeWidth="1" />
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b}
        stroke="#D5CFC2" strokeWidth="1" />

      {series.map((s) => (
        <g key={s.name}>
          <path d={pathFor(s.values)} fill="none" stroke={s.color}
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {s.values.length > 0 && (
            <circle
              cx={pad.l + (n - 1) * xStep}
              cy={y(s.values[s.values.length - 1])}
              r="2.5" fill={s.color} />
          )}
        </g>
      ))}

      {driftX != null && (
        <g>
          <line x1={driftX} x2={driftX} y1={pad.t} y2={H - pad.b}
            stroke="#A04942" strokeWidth="1.2" strokeDasharray="4,3" />
          <text x={driftX + 8} y={pad.t + 10}
            fill="#A04942" fontFamily="IBM Plex Mono" fontSize="10" fontWeight="500">
            Drift alarm — t={driftAt}
          </text>
          <text x={driftX + 8} y={pad.t + 24}
            fill="#A04942" fontFamily="IBM Plex Mono" fontSize="9" opacity="0.7">
            Page-Hinkley · h = 12.4
          </text>
        </g>
      )}
    </svg>
  );
}

export function DriftBar({ series, driftAt }) {
  return (
    <div className="drift-bar">
      <div className="drift-head">
        <div>
          <div className="t-label" style={{ marginBottom: 4 }}>Audit drift monitor</div>
          <div className="font-mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            Page-Hinkley CUSUM · last 20 responses · 5σ detection window
          </div>
        </div>
        <div className="drift-legend">
          {series.map(s => (
            <div key={s.name} className="drift-legend-item" style={{ color: s.color }}>
              <span className="swatch" />
              <span style={{ color: 'var(--ink-2)' }}>{s.name}</span>
            </div>
          ))}
          {driftAt != null && (
            <div className="drift-legend-item" style={{ color: 'var(--flag)' }}>
              <span style={{ width: 14, height: 0, borderTop: '1.5px dashed currentColor' }} />
              <span style={{ color: 'var(--flag)' }}>Alarm</span>
            </div>
          )}
        </div>
      </div>
      <div className="drift-svg-wrap">
        <DriftTimeline series={series} driftAt={driftAt} />
      </div>
    </div>
  );
}
