import React, { useState, useEffect, useRef } from 'react';

// ==================== Pentagon Radar ====================
export function PentagonRadar({ scores, flaggedIdx, labels, colors, axisHover, setAxisHover }) {
  const W = 460, H = 400, cx = W / 2, cy = H / 2 + 6, R = 138;
  const angles = [0, 1, 2, 3, 4].map(i => -Math.PI / 2 + i * (2 * Math.PI / 5));
  const vertex = (i, r) => [cx + r * Math.cos(angles[i]), cy + r * Math.sin(angles[i])];

  const rings = [0.2, 0.4, 0.6, 0.8, 1.0].map(s =>
    angles.map((a, i) => {
      const [x, y] = vertex(i, R * s);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ')
  );

  const dataPoints = scores.map((s, i) => vertex(i, R * (s / 100)));
  const dataPolygon = dataPoints.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const axisLines = angles.map((a, i) => vertex(i, R));

  return (
    <svg className="radar-svg" viewBox={`0 0 ${W} ${H}`} aria-label="CPFE 5-axis pentagon radar">
      <defs>
        <linearGradient id="radarFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#2A4A7F" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#2A4A7F" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {rings.map((pts, i) => (
        <polygon key={i} points={pts}
          fill="none"
          stroke={i === 4 ? '#D5CFC2' : '#EDE9DF'}
          strokeWidth="1" />
      ))}

      {axisLines.map(([x, y], i) => (
        <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#EDE9DF" strokeWidth="1" />
      ))}

      {[20, 40, 60, 80].map(v => {
        const [x, y] = vertex(0, R * (v / 100));
        return (
          <text key={v} x={x + 6} y={y + 3}
            fontFamily="IBM Plex Mono" fontSize="9" fill="#A8A39C">{v}</text>
        );
      })}

      <polygon points={dataPolygon}
        fill="url(#radarFill)"
        stroke="#2A4A7F"
        strokeWidth="1.8"
        strokeLinejoin="round"
        style={{ transition: 'all 800ms cubic-bezier(0.22, 1, 0.36, 1)' }}
      />

      {dataPoints.map(([x, y], i) => {
        const isFlag = flaggedIdx === i;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="4.5"
              fill="#FFFFFF"
              stroke={isFlag ? '#A04942' : '#2A4A7F'}
              strokeWidth="2"
              style={{ transition: 'all 800ms cubic-bezier(0.22, 1, 0.36, 1)' }}
            />
            {isFlag && <circle cx={x} cy={y} r="2" fill="#A04942" />}
          </g>
        );
      })}

      {labels.map((lbl, i) => {
        const [lx, ly] = vertex(i, R + 30);
        const isFlag = flaggedIdx === i;
        return (
          <g key={i}
            onMouseEnter={() => setAxisHover && setAxisHover(i)}
            onMouseLeave={() => setAxisHover && setAxisHover(null)}
            style={{ cursor: 'pointer' }}>
            <text x={lx} y={ly - 5}
              textAnchor="middle" dominantBaseline="middle"
              fontFamily="IBM Plex Mono" fontSize="10" fontWeight="500"
              letterSpacing="0.6"
              fill={axisHover === i ? '#1A1814' : '#5A5A52'}
              style={{ textTransform: 'uppercase', transition: 'fill 150ms ease' }}>
              {lbl}
            </text>
            <text x={lx} y={ly + 11}
              textAnchor="middle" dominantBaseline="middle"
              fontFamily="Newsreader" fontSize="16" fontWeight="500"
              fill={isFlag ? '#A04942' : '#1A1814'}>
              {scores[i].toFixed(0)}
            </text>
          </g>
        );
      })}

      <g>
        <circle cx={cx} cy={cy} r="44" fill="#FFFFFF" stroke="#E5E0D5" strokeWidth="1" />
      </g>
    </svg>
  );
}

// ==================== Animated counter ====================
export function CountUp({ value, duration = 700, className }) {
  const [n, setN] = useState(() =>
    (typeof document !== 'undefined' && document.hidden) ? value : 0
  );
  const ref = useRef({ raf: 0 });

  useEffect(() => {
    cancelAnimationFrame(ref.current.raf);
    if (document.hidden) { setN(value); return; }
    const from = n;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(from + (value - from) * eased);
      if (p < 1) ref.current.raf = requestAnimationFrame(tick);
    };
    ref.current.raf = requestAnimationFrame(tick);
    const onVis = () => { if (!document.hidden) setN(value); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(ref.current.raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return <span className={className}>{Math.round(n)}</span>;
}

// ==================== Animated bar ====================
export function AxisBar({ value, color }) {
  const [w, setW] = useState(() =>
    (typeof document !== 'undefined' && document.hidden) ? value : 0
  );
  useEffect(() => {
    if (document.hidden) { setW(value); return; }
    const t = setTimeout(() => setW(value), 50);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="axis-bar">
      <div className="axis-bar-fill" style={{ width: `${w}%`, color }} />
    </div>
  );
}
