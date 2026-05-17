import React from 'react';
import { getPapers, uploadPaper } from '../api.js';

// Rich metadata for known papers — matched by filename substring
const KNOWN_PAPERS = [
  { match: 'cpfe',          title: 'Cross-Platform Fairness Evaluation: A Five-Axis Audit Framework for Transformer-Based Mental Health NLP', authors: 'Pall, R., Raghavan, M., Khurana, S.', venue: 'JBI 2025',           year: '2025', color: 'cyan',   tag: 'PRIMARY',   cited: 47  },
  { match: 'indiafinbench', title: 'IndiaFinBench: A Hybrid Retrieval Benchmark for Indian Financial QA',                                    authors: 'Pall, R., Mehta, A.',              venue: 'EMNLP (submitted)',   year: '2025', color: 'violet', tag: 'AUTHOR',    cited: 24  },
  { match: 'fl-diabetes',   title: 'Federated Learning Over Diabetes Registries with Differential Privacy',                                  authors: 'Pall, R., Iyer, V., Raghavan, M.',venue: 'JBI 2024',           year: '2024', color: 'green',  tag: 'AUTHOR',    cited: 18  },
  { match: 'tian',          title: 'Just Ask for Calibration: Strategies for Eliciting Calibrated Confidence Scores from LLMs',             authors: 'Tian, K. et al.',                  venue: 'EMNLP 2023',         year: '2023', color: 'amber',  tag: 'METHODS',   cited: 312 },
  { match: 'farquhar',      title: 'Detecting Hallucinations in Large Language Models Using Semantic Entropy',                               authors: 'Farquhar, S., Kossen, J., et al.',venue: 'Nature 2024',        year: '2024', color: 'cyan',   tag: 'METHODS',   cited: 587 },
  { match: 'bbq',           title: 'BBQ: A Hand-Built Bias Benchmark for Question Answering',                                               authors: 'Parrish, A. et al.',               venue: 'ACL 2022',           year: '2022', color: 'sky',    tag: 'BENCHMARK', cited: 421 },
  { match: 'bold',          title: 'BOLD: Dataset and Metrics for Measuring Biases in Open-Ended Language Generation',                      authors: 'Dhamala, J. et al.',               venue: 'FAccT 2021',         year: '2021', color: 'sky',    tag: 'BENCHMARK', cited: 289 },
  { match: 'beta',          title: 'Beta Calibration: A Well-Founded and Easily Implemented Improvement on Logistic Calibration',           authors: 'Kull, M., Filho, T., Flach, P.', venue: 'AISTATS 2017',       year: '2017', color: 'amber',  tag: 'METHODS',   cited: 198 },
];

const MOCK_PAPERS = [
  { id: 'p1', filename: 'CPFE-JBI-2025.pdf',           size_kb: 412, status: 'indexed', chunks: 187, ...KNOWN_PAPERS[0] },
  { id: 'p2', filename: 'IndiaFinBench.pdf',            size_kb: 301, status: 'indexed', chunks: 142, ...KNOWN_PAPERS[1] },
  { id: 'p3', filename: 'FL-Diabetes-JBI-2024.pdf',    size_kb: 289, status: 'indexed', chunks: 118, ...KNOWN_PAPERS[2] },
  { id: 'p4', filename: 'Tian-2023-calibration.pdf',   size_kb: 251, status: 'indexed', chunks: 96,  ...KNOWN_PAPERS[3] },
  { id: 'p5', filename: 'Farquhar-2024-entropy.pdf',   size_kb: 198, status: 'indexed', chunks: 84,  ...KNOWN_PAPERS[4] },
  { id: 'p6', filename: 'BBQ-Parrish-2022.pdf',        size_kb: 378, status: 'indexed', chunks: 156, ...KNOWN_PAPERS[5] },
  { id: 'p7', filename: 'BOLD-Dhamala-2021.pdf',       size_kb: 244, status: 'indexed', chunks: 102, ...KNOWN_PAPERS[6] },
  { id: 'p8', filename: 'BetaCalibration-2017.pdf',    size_kb: 180, status: 'indexing', chunks: 64, ...KNOWN_PAPERS[7] },
];

/** Map a real `{ filename, size_kb, ingested }` from the API to a richer display object. */
function apiPaperToDisplay(p, idx) {
  const lc = p.filename.toLowerCase();
  const known = KNOWN_PAPERS.find(k => lc.includes(k.match));
  return {
    id:       `p-${idx}`,
    filename: p.filename,
    size_kb:  p.size_kb,
    status:   p.ingested ? 'indexed' : 'pending',
    chunks:   p.chunks ?? 0,
    title:    known?.title    ?? p.filename.replace(/\.pdf$/i, ''),
    authors:  known?.authors  ?? '',
    venue:    known?.venue    ?? '',
    year:     known?.year     ?? '',
    color:    known?.color    ?? 'amber',
    tag:      known?.tag      ?? 'PAPER',
    cited:    known?.cited    ?? 0,
  };
}

// uploadPhase: null | 'uploading' | 'indexing' | 'done' | 'error'
export function PagePapers() {
  const [papers,      setPapers]      = React.useState(MOCK_PAPERS);
  const [isLive,      setIsLive]      = React.useState(false);
  const [selected,    setSelected]    = React.useState(MOCK_PAPERS[0]);
  const [uploadPhase, setUploadPhase] = React.useState(null);
  const [uploadMsg,   setUploadMsg]   = React.useState('');
  const fileInputRef = React.useRef(null);
  const clearTimer   = React.useRef(null);

  const loadPapers = React.useCallback(() => {
    getPapers().then(res => {
      if (res.papers && res.papers.length > 0) {
        const mapped = res.papers.map(apiPaperToDisplay);
        setPapers(mapped);
        setSelected(s => mapped.find(p => p.filename === s?.filename) ?? mapped[0]);
        setIsLive(true);
      }
      // else keep MOCK_PAPERS
    }).catch(() => {});
  }, []);

  React.useEffect(() => { loadPapers(); }, [loadPapers]);
  React.useEffect(() => () => clearTimeout(clearTimer.current), []);

  const handleUpload = React.useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadPhase('error');
      setUploadMsg('Only PDF files accepted.');
      clearTimer.current = setTimeout(() => setUploadPhase(null), 3000);
      return;
    }
    clearTimeout(clearTimer.current);
    setUploadPhase('uploading');
    setUploadMsg(`Uploading ${file.name} (${(file.size / 1024).toFixed(0)} KB)…`);

    // Simulate upload→index phase split (backend does both in one request)
    const indexTimer = setTimeout(() => {
      setUploadPhase('indexing');
      setUploadMsg(`Indexing ${file.name} — BGE-M3 embedding…`);
    }, 600);

    try {
      const result = await uploadPaper(file);
      clearTimeout(indexTimer);
      const chunks = result.chunks_added ?? 0;
      setUploadPhase('done');
      setUploadMsg(`${result.filename} · ${chunks} chunk${chunks !== 1 ? 's' : ''} indexed`);
      loadPapers();
      clearTimer.current = setTimeout(() => setUploadPhase(null), 5000);
    } catch (err) {
      clearTimeout(indexTimer);
      setUploadPhase('error');
      setUploadMsg(`Upload failed — ${err.message}`);
      clearTimer.current = setTimeout(() => setUploadPhase(null), 5000);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [loadPapers]);

  const totalChunks = papers.reduce((a, p) => a + (p.chunks || 0), 0);

  return (
    <div className="page page-papers">
      <div className="page-hero">
        <div className="page-eyebrow">06 · Corpus</div>
        <h1 className="page-title">
          RAG library · {papers.length} papers · {totalChunks > 0 ? `${totalChunks} chunks indexed` : 'no chunks yet'}
        </h1>
        <div className="page-sub">
          All chunks embedded with <span className="hl-cy">BGE-M3</span> + sparse BM25, fused via RRF (k=60).
          {isLive ? ' Showing real papers from rag/papers/.' : ' Demo corpus — add PDFs to rag/papers/ to index them.'}
        </div>
      </div>

      {uploadPhase && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 'var(--r-sm)',
          display: 'flex', alignItems: 'center', gap: 10,
          background: uploadPhase === 'done'  ? 'rgba(58,107,74,0.10)'
                    : uploadPhase === 'error' ? 'rgba(180,60,60,0.08)'
                    : 'rgba(42,90,132,0.08)',
          border: `1px solid ${
            uploadPhase === 'done'  ? 'rgba(58,107,74,0.3)'
          : uploadPhase === 'error' ? 'rgba(180,60,60,0.25)'
          : 'rgba(42,90,132,0.25)'}`,
          fontSize: 11, color: 'var(--ink-1)', fontFamily: 'var(--font-mono)',
        }}>
          {(uploadPhase === 'uploading' || uploadPhase === 'indexing') && (
            <span className="pulse-dot" style={{ width: 6, height: 6, flexShrink: 0 }} />
          )}
          {uploadPhase === 'done'  && <span style={{ color: 'var(--green)' }}>●</span>}
          {uploadPhase === 'error' && <span style={{ color: 'var(--danger)' }}>●</span>}
          <span style={{ color:
            uploadPhase === 'uploading' ? 'var(--cyan)'
          : uploadPhase === 'indexing'  ? 'var(--amber)'
          : uploadPhase === 'done'      ? 'var(--green)'
          : 'var(--danger)'
          }}>
            {uploadPhase === 'uploading' ? 'UPLOADING' : uploadPhase === 'indexing' ? 'INDEXING' : uploadPhase === 'done' ? 'DONE' : 'ERROR'}
          </span>
          <span style={{ color: 'var(--ink-2)' }}>{uploadMsg}</span>
        </div>
      )}

      <div className="papers-stage">
        <div className="papers-list glass">
          <div className="papers-list-head">
            <div className="row gap-12">
              <span className="t-label">Corpus</span>
              <span className="pill pill-cyan" style={{ padding: '2px 8px', fontSize: 9 }}>
                <span className="dot" />{papers.filter(p => p.status === 'indexed').length} READY
              </span>
              {isLive && <span className="pill pill-green" style={{ padding: '2px 8px', fontSize: 9 }}><span className="dot" />LIVE</span>}
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={handleUpload}
              />
              <button
                className="btn btn-cyan"
                style={{ padding: '5px 10px', fontSize: 9 }}
                disabled={uploadPhase === 'uploading' || uploadPhase === 'indexing'}
                onClick={() => fileInputRef.current?.click()}
              >
                {(uploadPhase === 'uploading' || uploadPhase === 'indexing') ? '…' : '+ ADD PDF'}
              </button>
            </div>
          </div>
          <div className="papers-list-scroll scroll-thin">
            {papers.map(p => (
              <div key={p.id}
                className={`paper-row ${selected.id === p.id ? 'active' : ''}`}
                onClick={() => setSelected(p)}
                style={{ '--paper-color': `var(--${p.color})` }}>
                <div className="paper-row-top">
                  <span className="paper-tag" style={{ color: `var(--${p.color})`, borderColor: `var(--${p.color})50` }}>{p.tag}</span>
                  <span className="paper-status">
                    {p.status === 'indexed'
                      ? <span className="paper-status-ok">●</span>
                      : <span className="paper-status-idx">●</span>}
                    <span className="font-mono" style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: p.status === 'indexed' ? 'var(--green)' : 'var(--amber)' }}>
                      {p.status}
                    </span>
                  </span>
                </div>
                <div className="paper-row-title">{p.title}</div>
                {p.authors && (
                  <div className="paper-row-meta">
                    <span>{p.authors}</span>
                    {p.venue && <><span className="t-faint">·</span><span>{p.venue}</span></>}
                  </div>
                )}
                <div className="paper-row-bot">
                  {p.chunks > 0 && <><span className="paper-chunks">{p.chunks} chunks</span><span className="t-faint">·</span></>}
                  <span>{p.size_kb} KB</span>
                  {p.cited > 0 && <><span className="t-faint">·</span><span>cited {p.cited}×</span></>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="paper-detail glass">
          <div className="paper-detail-head">
            <div className="paper-detail-tag" style={{ color: `var(--${selected.color})`, borderColor: `var(--${selected.color})50` }}>{selected.tag}</div>
            <h2 className="paper-detail-title">{selected.title}</h2>
            {selected.authors && (
              <div className="paper-detail-meta">
                <span>{selected.authors}</span>
                {selected.venue && <><span className="t-faint">·</span><span>{selected.venue}</span></>}
                {selected.year  && <><span className="t-faint">·</span><span>{selected.year}</span></>}
              </div>
            )}
          </div>

          <div className="paper-detail-stats">
            <div className="paper-stat">
              <div className="paper-stat-label">Size</div>
              <div className="paper-stat-val">{selected.size_kb} KB</div>
            </div>
            <div className="paper-stat">
              <div className="paper-stat-label">Chunks</div>
              <div className="paper-stat-val">{selected.chunks || '—'}</div>
            </div>
            <div className="paper-stat">
              <div className="paper-stat-label">Embedding</div>
              <div className="paper-stat-val mono">BGE-M3</div>
            </div>
            <div className="paper-stat">
              <div className="paper-stat-label">Cited in ARIA</div>
              <div className="paper-stat-val">{selected.cited > 0 ? `${selected.cited}×` : '—'}</div>
            </div>
          </div>

          {!isLive && (
            <div className="paper-detail-section">
              <div className="t-label" style={{ marginBottom: 10 }}>ARIA · Auto-extracted highlights</div>
              <div className="paper-highlights">
                <div className="paper-highlight">
                  <div className="paper-highlight-tag">FINDING</div>
                  <div>The 5-axis CPFE envelope detected disparate impact on the profession-substitution counterfactual that single-axis benchmarks (BBQ, BOLD) missed in 3 of 4 evaluation suites.</div>
                </div>
                <div className="paper-highlight">
                  <div className="paper-highlight-tag">METHOD</div>
                  <div>Group-conditional isotonic regression with 10-bin grouping reduced Twitter ECE from 0.087 → 0.041 (Δ=-0.046) while preserving accuracy within 0.4pp.</div>
                </div>
                <div className="paper-highlight">
                  <div className="paper-highlight-tag">CAVEAT</div>
                  <div>Two protected subgroups (n=147, n=183) fall below the small-sample threshold; Platt et al. 2023 recommends Beta calibration in that regime.</div>
                </div>
              </div>
            </div>
          )}

          <div className="paper-detail-section">
            <div className="t-label" style={{ marginBottom: 8 }}>File info</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', lineHeight: 2 }}>
              <div>Filename: <span style={{ color: 'var(--cyan)' }}>{selected.filename}</span></div>
              <div>Status: <span style={{ color: selected.status === 'indexed' ? 'var(--green)' : 'var(--amber)' }}>{selected.status}</span></div>
              {selected.chunks > 0 && <div>Chunks: {selected.chunks}</div>}
            </div>
          </div>

          <div className="paper-detail-footer">
            <button className="btn">Open PDF</button>
            <button className="btn">Show All Chunks</button>
            <button className="btn btn-cyan" onClick={loadPapers}>Re-index</button>
          </div>
        </div>
      </div>
    </div>
  );
}
