import React from 'react';
import { Icon } from './Icons.jsx';
import { getSettings, patchSetting, resetSetting, resetAllSettings } from '../aria_api.js';

// Group settings into logical sections for the UI.
const GROUPS = [
  { name: 'Models',     keys: ['ollama_url', 'llm_primary', 'llm_copilot_path', 'embedding_model', 'reranker_model', 'hhem_model', 'llava_model'] },
  { name: 'Voice',      keys: ['whisper_model', 'whisper_device', 'piper_voice', 'wake_phrase', 'wake_gesture_required'] },
  { name: 'RAG',        keys: ['qdrant_path', 'qdrant_collection_text', 'qdrant_collection_visual', 'rag_chunk_size', 'rag_chunk_overlap', 'rag_top_k_retrieve', 'rag_top_k_final', 'rag_rrf_k', 'rag_embed_batch_size'] },
  { name: 'Audit',      keys: ['audit_db_path', 'audit_drift_lambda', 'audit_drift_delta'] },
  { name: 'ARIA',     keys: ['default_city', 'weather_units', 'clipboard_enabled', 'clipboard_poll_ms', 'clipboard_history_max', 'rss_poll_interval_s', 'notification_queue_size'] },
  { name: 'Paths',      keys: ['papers_dir', 'memory_path', 'overrides_path', 'rss_feeds_path', 'flashcards_db', 'notifications_db'] },
  { name: 'GitHub',     keys: ['github_repo_allowlist', 'obsidian_vaults'] },
  { name: 'API',        keys: ['api_host', 'api_port'] },
];

function SettingRow({ keyName, value, overridden, restartKey, onSave, onReset }) {
  const [edit, setEdit] = React.useState(false);
  const [val, setVal] = React.useState(value);
  React.useEffect(() => { setVal(value); }, [value]);

  const submit = async () => {
    let v = val;
    if (typeof value === 'number') v = Number(val);
    if (typeof value === 'boolean') v = (val === true || val === 'true');
    if (Array.isArray(value)) v = String(val).split(',').map(s => s.trim()).filter(Boolean);
    await onSave(keyName, v);
    setEdit(false);
  };

  return (
    <div className="settings-row">
      <div style={{ flex: 1 }}>
        <div className="settings-key">
          {keyName}
          {overridden && <span className="pill pill-cyan" style={{ fontSize: 8, padding: '0 6px', marginLeft: 6 }}>OVERRIDE</span>}
          {restartKey && <span className="pill" style={{ fontSize: 8, padding: '0 6px', marginLeft: 4 }}>RESTART</span>}
        </div>
        {!edit ? (
          <div className="settings-val">
            {typeof value === 'boolean' ? (value ? 'true' : 'false')
             : Array.isArray(value) ? value.join(', ') || '—'
             : String(value || '—')}
          </div>
        ) : (
          <input className="hub-input" value={val ?? ''}
            type={typeof value === 'number' ? 'number' : 'text'}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} style={{ width: '100%' }} />
        )}
      </div>
      <div className="row gap-4">
        {!edit ? (
          <button className="btn" style={{ padding: '3px 8px', fontSize: 9 }} onClick={() => setEdit(true)}>EDIT</button>
        ) : (
          <>
            <button className="btn btn-cyan" style={{ padding: '3px 8px', fontSize: 9 }} onClick={submit}>SAVE</button>
            <button className="btn" style={{ padding: '3px 8px', fontSize: 9 }} onClick={() => setEdit(false)}>×</button>
          </>
        )}
        {overridden && !edit && (
          <button className="btn" style={{ padding: '3px 8px', fontSize: 9, color: 'var(--danger)' }}
            onClick={() => onReset(keyName)}>RESET</button>
        )}
      </div>
    </div>
  );
}

export function PageSettings() {
  const [data, setData] = React.useState(null);
  const [selectedGroup, setSelectedGroup] = React.useState('Models');

  const refresh = React.useCallback(async () => {
    try { setData(await getSettings()); } catch {}
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  if (!data) return <div className="page page-hub"><div className="t-dim" style={{ padding: 40 }}>Loading settings…</div></div>;

  const settings = data.settings;
  const overrides = data.overrides;
  const restartKeys = new Set(data.restart_keys);

  const onSave = async (key, value) => {
    await patchSetting(key, value);
    refresh();
  };
  const onReset = async (key) => { await resetSetting(key); refresh(); };
  const onResetAll = async () => {
    if (confirm('Clear all setting overrides?')) {
      await resetAllSettings();
      refresh();
    }
  };

  const group = GROUPS.find(g => g.name === selectedGroup) || GROUPS[0];

  return (
    <div className="page page-hub">
      <div className="page-hero">
        <div className="page-eyebrow">10 · System</div>
        <h1 className="page-title">Settings</h1>
        <div className="page-sub">
          Effective configuration. Overrides persist to <code style={{ background: 'rgba(0,0,0,0.04)', padding: '1px 4px' }}>{data.overrides_path}</code>.
          Some keys require a backend restart to take effect.
        </div>
      </div>
      <div className="settings-stage">
        <div className="settings-sidebar glass">
          {GROUPS.map(g => (
            <div key={g.name}
              className={`settings-group ${selectedGroup === g.name ? 'active' : ''}`}
              onClick={() => setSelectedGroup(g.name)}>
              {g.name}
              <span className="t-tiny" style={{ marginLeft: 'auto' }}>{g.keys.length}</span>
            </div>
          ))}
          <button className="btn" style={{ marginTop: 12, padding: '5px 10px', fontSize: 9, color: 'var(--danger)' }}
            onClick={onResetAll}>RESET ALL OVERRIDES</button>
        </div>
        <div className="settings-content glass">
          <div className="t-label" style={{ marginBottom: 12 }}>{group.name}</div>
          {group.keys.filter(k => k in settings).map(k => (
            <SettingRow key={k} keyName={k} value={settings[k]}
              overridden={k in overrides} restartKey={restartKeys.has(k)}
              onSave={onSave} onReset={onReset} />
          ))}
        </div>
      </div>
    </div>
  );
}
