/**
 * AuditEnvelopePanel — THE STAR COMPONENT
 *
 * Displays:
 *  1. Hand-crafted SVG pentagon radar chart with animated fill + glow
 *  2. Axis score list with color-coded values
 *  3. EKG-style drift sparklines (one per axis, alarm state)
 *  4. Baseline comparison table (ARIA vs GG / RAGAS / LlamaGuard)
 */

import { useRef, useEffect, useState, useCallback } from 'react';

// ── Constants ────────────────────────────────────────────────────

const AXES = [
  { key: 'calibration',  label: 'Calibration',  short: 'CAL', color: '#7EE787' },
  { key: 'faithfulness', label: 'Faithfulness', short: 'FAI', color: '#58A6FF' },
  { key: 'consistency',  label: 'Consistency',  short: 'CON', color: '#00D4C8' },
  { key: 'equity_di',    label: 'Equity DI',    short: 'EQU', color: '#E76F51' },
  { key: 'attribution',  label: 'Attribution',  short: 'ATT', color: '#BC8CFF' },
];

// Baseline comparison data
const BASELINES = {
  faithfulness: { gg: 0.612, ragas: 0.743, llama: null },
  calibration:  { gg: 0.558, ragas: 0.681, llama: null },
  consistency:  { gg: null,  ragas: 0.695, llama: 0.702 },
  equity_di:    { gg: 0.541, ragas: null,  llama: 0.613 },
  attribution:  { gg: 0.489, ragas: 0.601, llama: 0.610 },
};

// ── Pentagon math ────────────────────────────────────────────────

const SVG_SIZE  = 220;
const CENTER    = SVG_SIZE / 2;
const R_MAX     = 82;  // max radius for score = 1.0
const GRID_VALS = [0.25, 0.5, 0.75, 1.0];

// Pentagon vertices at angle offset so top vertex points up
// Angles: starting from top (−90°), going clockwise
function pentagonPoint(i, radius, n = 5) {
  const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

function pentagonPath(radius, n = 5) {
  const pts = Array.from({ length: n }, (_, i) => pentagonPoint(i, radius, n));
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';
}

function scoresToPath(scores) {
  return AXES.map((axis, i) => {
    const v = Math.max(0, Math.min(1, scores[axis.key] ?? 0));
    const pt = pentagonPoint(i, v * R_MAX);
    return `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
  }).join(' ') + ' Z';
}

// ── Sub-components ───────────────────────────────────────────────

function RadarChart({ envelope, isLive }) {
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (envelope) setAnimKey(k => k + 1);
  }, [envelope]);

  const scores = envelope?.scores ?? {};
  const dataPath = scoresToPath(scores);

  return (
    <svg
      width={SVG_SIZE}
      height={SVG_SIZE}
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      style={{ overflow: 'visible', flexShrink: 0 }}
    >
      <defs>
        {/* Teal glow filter */}
        <filter id="teal-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="teal-glow-strong" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="radar-fill-grad" cx="50%" cy="50%">
          <stop offset="0%"   stopColor="#00D4C8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#00D4C8" stopOpacity="0.06" />
        </radialGradient>
        <radialGradient id="center-glow" cx="50%" cy="50%">
          <stop offset="0%"   stopColor="#00D4C8" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00D4C8" stopOpacity="0"   />
        </radialGradient>
      </defs>

      {/* Outer ambient glow */}
      <circle
        cx={CENTER} cy={CENTER} r={R_MAX + 20}
        fill="none"
        stroke="rgba(0,212,200,0.03)"
        strokeWidth="40"
      />

      {/* Concentric grid pentagons */}
      {GRID_VALS.map(val => (
        <path
          key={val}
          d={pentagonPath(val * R_MAX)}
          fill="none"
          stroke={val === 1.0 ? '#1E3048' : '#131D2B'}
          strokeWidth={val === 1.0 ? 1.5 : 0.8}
          strokeDasharray={val < 1.0 ? '3,4' : undefined}
        />
      ))}

      {/* Grid value labels (0.25, 0.5, 0.75) */}
      {[0.25, 0.5, 0.75].map(val => (
        <text
          key={val}
          x={CENTER + 3}
          y={CENTER - val * R_MAX - 2}
          fill="#253D5A"
          fontSize="7"
          fontFamily="'JetBrains Mono', monospace"
          textAnchor="start"
        >
          {val.toFixed(2)}
        </text>
      ))}

      {/* Axis spokes */}
      {AXES.map((axis, i) => {
        const outerPt = pentagonPoint(i, R_MAX + 2);
        return (
          <line
            key={axis.key}
            x1={CENTER} y1={CENTER}
            x2={outerPt.x} y2={outerPt.y}
            stroke="#131D2B"
            strokeWidth="1"
          />
        );
      })}

      {/* Data fill — animated on change */}
      {envelope && (
        <path
          key={`fill-${animKey}`}
          d={dataPath}
          fill="url(#radar-fill-grad)"
          stroke="none"
          style={{
            animation: 'radar-fill 400ms ease forwards',
          }}
        />
      )}

      {/* Data stroke with glow */}
      {envelope && (
        <path
          key={`stroke-${animKey}`}
          d={dataPath}
          fill="none"
          stroke="#00D4C8"
          strokeWidth="1.5"
          filter="url(#teal-glow)"
          style={{
            animation: 'radar-fill 400ms ease forwards',
          }}
        />
      )}

      {/* Axis vertex dots + labels */}
      {AXES.map((axis, i) => {
        const labelPt  = pentagonPoint(i, R_MAX + 20);
        const dotPt    = envelope
          ? pentagonPoint(i, (scores[axis.key] ?? 0) * R_MAX)
          : pentagonPoint(i, R_MAX * 0.1);

        // Label alignment based on position
        let anchor = 'middle';
        if (labelPt.x < CENTER - 8) anchor = 'end';
        else if (labelPt.x > CENTER + 8) anchor = 'start';

        return (
          <g key={axis.key}>
            {/* Score dot on data polygon */}
            {envelope && (
              <circle
                cx={dotPt.x} cy={dotPt.y}
                r={3}
                fill={axis.color}
                stroke="var(--bg-panel, #0D1117)"
                strokeWidth="1"
                filter="url(#teal-glow)"
              />
            )}
            {/* Outer vertex tick */}
            <circle
              cx={pentagonPoint(i, R_MAX).x}
              cy={pentagonPoint(i, R_MAX).y}
              r={1.5}
              fill="#1E3048"
            />
            {/* Axis label */}
            <text
              x={labelPt.x}
              y={labelPt.y + 4}
              textAnchor={anchor}
              fontSize="8.5"
              fontFamily="'Space Mono', monospace"
              fontWeight="700"
              letterSpacing="0.08em"
              fill={axis.color}
              opacity="0.9"
            >
              {axis.short}
            </text>
          </g>
        );
      })}

      {/* Center live dot */}
      <circle cx={CENTER} cy={CENTER} r={3} fill="var(--bg-panel, #0D1117)" stroke="#00D4C8" strokeWidth="1" />
      {isLive && (
        <>
          <circle cx={CENTER} cy={CENTER} r={3} fill="#00D4C8" opacity="0.9">
            <animate attributeName="opacity" values="0.9;0.2;0.9" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={CENTER} cy={CENTER} r={3} fill="none" stroke="#00D4C8" strokeWidth="1">
            <animate attributeName="r" values="3;12;3" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
          </circle>
        </>
      )}
    </svg>
  );
}

// ── Drift Sparkline (EKG style) ───────────────────────────────────

function DriftSparkline({ axisKey, history, color }) {
  const width  = 160;
  const height = 32;
  const pad    = 4;

  const values = history.map(h => h.scores?.[axisKey] ?? 0.5);
  const last20 = values.slice(-20);

  if (last20.length < 2) {
    return <div style={{ width, height, background: 'rgba(255,255,255,0.02)', borderRadius: 2 }} />;
  }

  const minV = Math.min(...last20) - 0.02;
  const maxV = Math.max(...last20) + 0.02;
  const range = maxV - minV || 0.01;

  const xStep = (width - pad * 2) / (last20.length - 1);

  const points = last20.map((v, i) => {
    const x = pad + i * xStep;
    const y = pad + (1 - (v - minV) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Check if any recent alarm
  const recentAlarms = history.slice(-5).some(h => h.alarms?.includes(axisKey));
  const activeColor = recentAlarms ? '#F5A623' : color;

  // Shade fill below line
  const fillPath = `M${pad},${height - pad} ${points.split(' ').map((p, i) => (i === 0 ? `L${p}` : p)).join(' ')} L${pad + (last20.length - 1) * xStep},${height - pad} Z`;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <svg
        width={width}
        height={height}
        style={{
          display: 'block',
          filter: recentAlarms ? `drop-shadow(0 0 3px ${activeColor})` : undefined,
        }}
      >
        <defs>
          <linearGradient id={`spark-fill-${axisKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={activeColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={activeColor} stopOpacity="0"    />
          </linearGradient>
        </defs>
        {/* Fill */}
        <path
          d={fillPath}
          fill={`url(#spark-fill-${axisKey})`}
        />
        {/* EKG line */}
        <polyline
          points={points}
          fill="none"
          stroke={activeColor}
          strokeWidth={recentAlarms ? 1.5 : 1}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Last-point dot */}
        {(() => {
          const lastPt = last20[last20.length - 1];
          const lx = pad + (last20.length - 1) * xStep;
          const ly = pad + (1 - (lastPt - minV) / range) * (height - pad * 2);
          return (
            <circle cx={lx} cy={ly} r={2} fill={activeColor}>
              {recentAlarms && (
                <animate attributeName="r" values="2;4;2" dur="0.8s" repeatCount="indefinite" />
              )}
            </circle>
          );
        })()}
      </svg>
      {recentAlarms && (
        <span style={{
          position: 'absolute',
          right: -52,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '9px',
          fontFamily: "'Space Mono', monospace",
          fontWeight: 700,
          color: '#F5A623',
          letterSpacing: '0.06em',
          animation: 'alarm-flash 1s ease-in-out infinite',
          whiteSpace: 'nowrap',
        }}>
          ⚡ ALARM
        </span>
      )}
    </div>
  );
}

// ── Score value formatting ────────────────────────────────────────

function scoreColor(v) {
  if (v >= 0.85) return '#7EE787';
  if (v >= 0.70) return '#00D4C8';
  if (v >= 0.55) return '#F5A623';
  return '#E76F51';
}

// ── Baseline comparison table ─────────────────────────────────────

function BaselineTable({ envelope }) {
  const scores = envelope?.scores ?? {};

  const fmt = (v) =>
    v == null ? (
      <span style={{ color: '#253D5A' }}>n/a</span>
    ) : (
      <span style={{ color: '#8B949E' }}>{v.toFixed(3)}</span>
    );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: "'JetBrains Mono', 'Space Mono', monospace",
        fontSize: '11px',
      }}>
        <thead>
          <tr>
            {['AXIS', 'ARIA', 'GG-Eval', 'RAGAS', 'LlamaGuard'].map(col => (
              <th key={col} style={{
                padding: '4px 8px',
                textAlign: col === 'AXIS' ? 'left' : 'right',
                color: col === 'ARIA' ? '#00D4C8' : '#484F58',
                fontWeight: 700,
                letterSpacing: '0.08em',
                fontSize: '9px',
                borderBottom: '1px solid #1A2332',
                whiteSpace: 'nowrap',
              }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AXES.map((axis, i) => {
            const ariaVal = scores[axis.key];
            const bl = BASELINES[axis.key] ?? {};
            return (
              <tr
                key={axis.key}
                style={{
                  borderBottom: i < AXES.length - 1 ? '1px solid #0F1A24' : undefined,
                  transition: 'background 150ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,200,0.04)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <td style={{
                  padding: '5px 8px',
                  color: axis.color,
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                }}>
                  {axis.short}
                </td>
                <td style={{
                  padding: '5px 8px',
                  textAlign: 'right',
                  fontWeight: 600,
                  color: ariaVal != null ? scoreColor(ariaVal) : '#484F58',
                }}>
                  {ariaVal != null ? ariaVal.toFixed(3) : '—'}
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt(bl.gg)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt(bl.ragas)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt(bl.llama)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export default function AuditEnvelopePanel({ envelope, history = [] }) {
  const isLive = !!envelope;

  const composite = envelope?.composite
    ?? (envelope
      ? Object.values(envelope.scores ?? {}).reduce((a, b) => a + b, 0) /
        Object.values(envelope.scores ?? {}).length
      : null);

  const compositeColor = composite != null ? scoreColor(composite) : '#484F58';

  const hasAlarms = envelope?.alarms?.length > 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: '#0D1117',
      border: '1px solid #1A2332',
      borderRadius: 6,
    }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid #1A2332',
        flexShrink: 0,
        background: 'rgba(10,14,19,0.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="live-dot" style={{ background: isLive ? '#00D4C8' : '#253D5A' }} />
          <span style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: '#8B949E',
          }}>
            AUDIT ENVELOPE
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {hasAlarms && (
            <span style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: '#F5A623',
              background: 'rgba(245,166,35,0.1)',
              border: '1px solid rgba(245,166,35,0.3)',
              borderRadius: 3,
              padding: '2px 6px',
              animation: 'alarm-flash 1.2s ease-in-out infinite',
            }}>
              ⚡ {envelope.alarms.length} ALARM{envelope.alarms.length > 1 ? 'S' : ''}
            </span>
          )}
          {composite != null && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 18,
              fontWeight: 600,
              color: compositeColor,
              textShadow: `0 0 12px ${compositeColor}60`,
              letterSpacing: '-0.02em',
            }}>
              {composite.toFixed(3)}
            </div>
          )}
          <span style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            letterSpacing: '0.1em',
            color: isLive ? '#00D4C8' : '#253D5A',
            textTransform: 'uppercase',
          }}>
            {isLive ? '● LIVE' : '○ IDLE'}
          </span>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>

        {/* Row 1: Radar + Score list */}
        <div style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
        }}>
          {/* Radar */}
          <div style={{
            flexShrink: 0,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid #131D2B',
            borderRadius: 6,
            padding: '8px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Scan line animation */}
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(0,212,200,0.15), transparent)',
              animation: 'scan-line 4s linear infinite',
              pointerEvents: 'none',
            }} />
            <RadarChart envelope={envelope} isLive={isLive} />
          </div>

          {/* Score list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {AXES.map(axis => {
              const val = envelope?.scores?.[axis.key];
              const pct = val != null ? Math.round(val * 100) : null;
              const barW = val != null ? val * 100 : 0;

              return (
                <div key={axis.key} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      color: axis.color,
                    }}>
                      {axis.label.toUpperCase()}
                    </span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12,
                      fontWeight: 500,
                      color: val != null ? scoreColor(val) : '#253D5A',
                    }}>
                      {val != null ? val.toFixed(3) : '—'}
                    </span>
                  </div>
                  {/* Score bar */}
                  <div style={{
                    height: 3,
                    background: '#131D2B',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${barW}%`,
                      background: axis.color,
                      borderRadius: 2,
                      boxShadow: val != null ? `0 0 6px ${axis.color}60` : undefined,
                      transition: 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
                    }} />
                  </div>
                </div>
              );
            })}

            {/* Composite score */}
            {composite != null && (
              <div style={{
                marginTop: 4,
                paddingTop: 8,
                borderTop: '1px solid #1A2332',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: '#8B949E',
                }}>
                  COMPOSITE
                </span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 14,
                  fontWeight: 600,
                  color: compositeColor,
                  textShadow: `0 0 8px ${compositeColor}50`,
                }}>
                  {composite.toFixed(3)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #1A2332', flexShrink: 0 }} />

        {/* Row 2: Drift Sparklines */}
        <div>
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: '#484F58',
            marginBottom: 10,
          }}>
            DRIFT — LAST 20 QUERIES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {AXES.map(axis => (
              <div key={axis.key} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <span style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 8.5,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: axis.color,
                  width: 28,
                  flexShrink: 0,
                  opacity: 0.8,
                }}>
                  {axis.short}
                </span>
                <div style={{ position: 'relative', width: 160 + 56 }}>
                  <DriftSparkline
                    axisKey={axis.key}
                    history={history}
                    color={axis.color}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #1A2332', flexShrink: 0 }} />

        {/* Row 3: Baseline comparison */}
        <div>
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: '#484F58',
            marginBottom: 8,
          }}>
            BASELINE COMPARISON
          </div>
          <BaselineTable envelope={envelope} />
        </div>

        {/* Timestamp */}
        {envelope?.timestamp && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: '#253D5A',
            textAlign: 'right',
            letterSpacing: '0.05em',
          }}>
            Last audit: {new Date(envelope.timestamp).toLocaleTimeString()}
          </div>
        )}

        {/* Empty state */}
        {!envelope && (
          <div style={{
            textAlign: 'center',
            padding: '20px 0',
            color: '#253D5A',
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            letterSpacing: '0.08em',
          }}>
            <div style={{ marginBottom: 8, fontSize: 24 }}>◯</div>
            AWAITING FIRST QUERY
          </div>
        )}

      </div>
    </div>
  );
}
