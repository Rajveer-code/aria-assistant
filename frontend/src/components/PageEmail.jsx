import React from 'react';
import { getEmails } from '../api.js';

// Fallback mock data shown when Gmail is not configured
const MOCK_EMAILS = [
  { from: 'ETH Zurich Admissions', addr: 'admissions@inf.ethz.ch', subj: 'MSc Data Science · application portal opens June 1', time: '08:42', date: 'TODAY', preview: 'Dear Applicant, the autumn 2026 portal opens June 1. Required: SOP, two LORs, GRE optional. Calibrated test scores due July 15…', unread: true, tag: 'IMPORTANT', tagColor: 'var(--amber)' },
  { from: 'Prof. M. Raghavan', addr: 'm.raghavan@iisc.ac.in', subj: 'Re: CPFE follow-up — can we discuss EMNLP slot?', time: '07:18', date: 'TODAY', preview: "Rajveer, the reviewers came back with mostly methods questions. Let's talk Friday before office hours. The fairness section needs…", unread: true, tag: 'ADVISOR', tagColor: 'var(--cyan)' },
  { from: 'arXiv moderation', addr: 'moderation@arxiv.org', subj: 'Submission 2606.04219 accepted to cs.LG · live in 6 hours', time: '06:55', date: 'TODAY', preview: 'Your submission has cleared moderation review and will appear at https://arxiv.org/abs/2606.04219 at the next mailing…', unread: true, tag: 'PUBLISH', tagColor: 'var(--green)' },
  { from: 'HuggingFace', addr: 'noreply@huggingface.co', subj: 'rajveerpall/aria-audit-bench · 14 new downloads overnight', time: '03:21', date: 'TODAY', preview: 'Your dataset gained 14 downloads in the last 24 hours. Total: 318. Top referrer: Twitter…', unread: true, tag: 'ANALYTICS', tagColor: 'var(--violet)' },
  { from: 'J. Vaucher (EPFL)', addr: 'jacques.vaucher@epfl.ch', subj: 'Recommender letter — short call Thursday', time: '21:08', date: 'YESTERDAY', preview: 'Hi Rajveer, happy to write the letter. Quick 15-min sync Thursday to clarify which projects to emphasize…', unread: false, tag: 'ADVISOR', tagColor: 'var(--cyan)' },
  { from: 'Anthropic Careers', addr: 'careers@anthropic.com', subj: 'Application received · Research Engineer (Alignment)', time: '14:22', date: 'YESTERDAY', preview: 'Thank you for your application. Our team reviews on rolling basis; you can expect to hear back within 3 weeks…', unread: false, tag: 'CAREER', tagColor: 'var(--sky)' },
  { from: 'IISc Library', addr: 'library@iisc.ac.in', subj: 'Auto-reminder · 3 books due May 22', time: '09:00', date: 'YESTERDAY', preview: 'The following items are due in 6 days: Pearl (2009) Causality, Murphy (2022) PML Vol 2, Bishop (2024) DLF…', unread: false, tag: '', tagColor: '' },
  { from: 'Prof. M. Raghavan', addr: 'm.raghavan@iisc.ac.in', subj: "Slides for tomorrow's group meeting", time: '17:44', date: 'MAY 14', preview: 'Can you put together 8 minutes on the equity-axis drift? Just the methodology + one figure. Group meeting 10am…', unread: false, tag: 'ADVISOR', tagColor: 'var(--cyan)' },
];

/** Map a Gmail API thread (from backend) to display format. */
function threadToEmail(t) {
  // from_address is "Name <addr@domain>" or just "addr@domain"
  const rawFrom = t.from_address || '';
  const nameMatch = rawFrom.match(/^([^<]+)<[^>]+>/);
  const addrMatch = rawFrom.match(/<([^>]+)>/);
  const from = nameMatch ? nameMatch[1].trim() : rawFrom.split('@')[0] || 'Unknown';
  const addr = addrMatch ? addrMatch[1] : rawFrom;

  // date is RFC 2822 like "Mon, 12 May 2025 07:18:00 +0000"
  let time = '';
  let date = '';
  if (t.date) {
    try {
      const d = new Date(t.date);
      time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const today = new Date();
      const isToday = d.toDateString() === today.toDateString();
      const isYesterday = d.toDateString() === new Date(today - 86400000).toDateString();
      date = isToday ? 'TODAY' : isYesterday ? 'YESTERDAY' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
    } catch { /* leave empty */ }
  }

  return {
    from,
    addr,
    subj: t.subject || '(no subject)',
    time,
    date,
    preview: t.snippet || '',
    unread: false, // Gmail API doesn't return unread in list_threads; would need labels
    tag: '',
    tagColor: '',
  };
}

function SetupCard() {
  return (
    <div style={{
      padding: '28px 32px',
      borderRadius: 'var(--r-md)',
      border: '1px solid var(--line-soft)',
      background: 'var(--surface-2)',
      maxWidth: 560,
    }}>
      <div className="t-label" style={{ marginBottom: 10, color: 'var(--amber)' }}>Gmail not configured</div>
      <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
        Connect Gmail to see live email summaries here. ARIA will read your inbox locally — no data leaves your machine.
      </p>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 2, color: 'var(--ink-2)' }}>
        <div>1. Google Cloud Console → New project</div>
        <div>2. Enable Gmail API + Calendar API</div>
        <div>3. OAuth2 credentials → Desktop app → Download JSON</div>
        <div>4. Save as <span style={{ color: 'var(--cyan)' }}>integrations/credentials.json</span></div>
        <div>5. Restart backend → browser opens for consent</div>
      </div>
      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
        Showing demo inbox below.
      </div>
    </div>
  );
}

export function PageEmail() {
  const [emails,     setEmails]     = React.useState(MOCK_EMAILS);
  const [status,     setStatus]     = React.useState('loading'); // loading | ok | not_configured | offline
  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const selected = emails[Math.min(selectedIdx, emails.length - 1)] || emails[0];

  React.useEffect(() => {
    getEmails(12).then(res => {
      if (res.status === 'not_configured' || res.status === 'offline') {
        setStatus(res.status);
        // keep MOCK_EMAILS
      } else if (res.threads && res.threads.length > 0) {
        setEmails(res.threads.map(threadToEmail));
        setStatus('ok');
        setSelectedIdx(0);
      } else {
        setStatus('not_configured');
      }
    }).catch(() => setStatus('offline'));
  }, []);

  const unreadCount = emails.filter(e => e.unread).length;

  return (
    <div className="page page-email">
      <div className="page-hero">
        <div className="page-eyebrow">03 · Inbox</div>
        <h1 className="page-title">
          Gmail · {status === 'ok' ? 'live' : 'demo'} ·{' '}
          {status === 'ok' && unreadCount > 0 ? `${unreadCount} unread` : `${emails.length} messages`}
        </h1>
        <div className="page-sub">
          {status === 'ok'
            ? 'Live Gmail threads. ARIA summarises each message locally — no data leaves your machine.'
            : 'Demo inbox. Wire Gmail in integrations/ to see live messages.'}
        </div>
      </div>

      {(status === 'not_configured' || status === 'offline') && (
        <div style={{ marginBottom: 24 }}>
          <SetupCard />
        </div>
      )}

      <div className="mail-stage">
        <div className="mail-list glass">
          <div className="mail-list-head">
            <div className="row gap-12">
              <span className="t-label">All mail</span>
              {status === 'ok' && unreadCount > 0 && (
                <span className="pill pill-cyan" style={{ padding: '2px 8px', fontSize: 9 }}>
                  <span className="dot" />{unreadCount} UNREAD
                </span>
              )}
              {status !== 'ok' && (
                <span className="pill" style={{ padding: '2px 8px', fontSize: 9, opacity: 0.6 }}>DEMO</span>
              )}
            </div>
            <div className="row gap-6">
              <button className="btn" style={{ padding: '5px 9px', fontSize: 9 }}>FILTER</button>
              <button className="btn" style={{ padding: '5px 9px', fontSize: 9 }}>SORT</button>
            </div>
          </div>
          <div className="mail-list-scroll scroll-thin">
            {emails.map((e, i) => (
              <div key={i}
                className={`mail-row ${selectedIdx === i ? 'active' : ''} ${e.unread ? 'unread' : ''}`}
                onClick={() => setSelectedIdx(i)}>
                <div className="mail-row-top">
                  <span className="mail-from">{e.from}</span>
                  <span className="mail-time">{e.time || e.date}</span>
                </div>
                <div className="mail-row-mid">
                  <span className="mail-subj">{e.subj}</span>
                </div>
                <div className="mail-row-bot">
                  {e.tag && <span className="mail-tag" style={{ color: e.tagColor, borderColor: e.tagColor + '50' }}>{e.tag}</span>}
                  <span className="mail-preview">{e.preview}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mail-detail glass">
          <div className="mail-detail-head">
            <div>
              <div className="mail-detail-subj">{selected.subj}</div>
              <div className="mail-detail-meta">
                <span><span className="t-faint">from</span> <span className="t-dim">{selected.from} · {selected.addr}</span></span>
                <span className="t-faint">{selected.date} · {selected.time}</span>
              </div>
            </div>
            <div className="row gap-6">
              {selected.tag && (
                <span className="mail-tag" style={{ color: selected.tagColor, borderColor: selected.tagColor + '50' }}>{selected.tag}</span>
              )}
            </div>
          </div>

          <div className="mail-detail-aria">
            <div className="aria-mini">
              <div className="aria-mini-eyebrow">
                <span className="pulse-dot" /> ARIA · Summary
              </div>
              <div className="aria-mini-body">
                {status === 'ok'
                  ? `Subject: "${selected.subj}" from ${selected.from}. ${selected.preview}`
                  : selected.preview || 'Select a message to see the ARIA summary.'}
              </div>
              <div className="aria-mini-actions">
                <button className="btn btn-cyan" style={{ padding: '6px 10px', fontSize: 10 }}>Draft Reply</button>
                <button className="btn" style={{ padding: '6px 10px', fontSize: 10 }}>Schedule</button>
                <button className="btn" style={{ padding: '6px 10px', fontSize: 10 }}>Snooze 1d</button>
              </div>
            </div>
          </div>

          <div className="mail-detail-body">
            <p>{selected.preview}</p>
            {status !== 'ok' && (
              <p style={{ color: 'var(--text-3)' }}>[Full body redacted in demo — connect Gmail to see complete messages.]</p>
            )}
            <p>—<br /><strong>{selected.from}</strong><br />
              <span className="t-faint font-mono" style={{ fontSize: 11 }}>{selected.addr}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
