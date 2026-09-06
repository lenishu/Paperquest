import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Modal, Spinner, useToast } from './bits';

// Build a client-side connection id for newly added rows (server preserves it on save).
const newId = () => 'c_' + Math.random().toString(16).slice(2, 12);

export default function SettingsModal({ onClose }) {
  const [s, setS] = useState(null);            // { connections, activeId, s2Key }
  const [providers, setProviders] = useState({});
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState({}); // { [connId]: {ok,msg} }
  const [showKey, setShowKey] = useState({});        // { [connId]: bool }
  const toast = useToast();

  useEffect(() => {
    api('/settings')
      .then((d) => {
        setProviders(d.providers || {});
        setS({ connections: d.connections || [], activeId: d.activeId || null, s2Key: d.s2Key || '' });
      })
      .catch((e) => toast(e.message, 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveRaw(next, quiet) {
    const saved = await api('/settings', { method: 'PUT', body: next });
    setProviders(saved.providers || providers);
    setS({ connections: saved.connections || [], activeId: saved.activeId || null, s2Key: saved.s2Key || '' });
    if (!quiet) toast('Settings saved', 'info');
    return saved;
  }

  const updateConn = (id, patch) =>
    setS((cur) => ({ ...cur, connections: cur.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  const addConn = () => {
    const provId = providers.openai ? 'openai' : Object.keys(providers)[0] || 'openai';
    const c = { id: newId(), provider: provId, label: (providers[provId] || {}).name || provId, key: '', model: '', baseUrl: '' };
    setS((cur) => ({ ...cur, connections: [...cur.connections, c], activeId: cur.activeId || c.id }));
  };

  const removeConn = (id) =>
    setS((cur) => {
      const connections = cur.connections.filter((c) => c.id !== id);
      const activeId = cur.activeId === id ? (connections[0] ? connections[0].id : null) : cur.activeId;
      return { ...cur, connections, activeId };
    });

  async function testConn(id) {
    setTestingId(id);
    setTestResult((r) => ({ ...r, [id]: null }));
    try {
      await saveRaw(s, true); // persist ids so the server can resolve connectionId
      const r = await api('/settings/test', { method: 'POST', body: { connectionId: id } });
      setTestResult((rr) => ({ ...rr, [id]: { ok: true, msg: r.message } }));
    } catch (e) {
      setTestResult((rr) => ({ ...rr, [id]: { ok: false, msg: e.message } }));
    } finally {
      setTestingId(null);
    }
  }

  if (!s) {
    return (
      <Modal onClose={onClose}>
        <Spinner label="Loading settings…" />
      </Modal>
    );
  }

  const provList = Object.entries(providers); // [ [id, meta], … ]

  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <h2>⚙️ Model &amp; API keys</h2>
        <button className="iconbtn" onClick={onClose}>✕</button>
      </div>

      <div className="settings-body">
        <label className="field-label">AI connections</label>
        <p className="dim small" style={{ marginTop: 0 }}>
          Add one or more providers (OpenAI, Anthropic, Gemini, Groq, Zhipu GLM, or any OpenAI-compatible
          endpoint). Keep several — even from the same provider — and pick which one is <b>active</b> for
          analysis &amp; lessons. Keys live only in <code>data/settings.json</code> on this machine.
        </p>

        {s.connections.length === 0 && (
          <div className="dim small">No connections yet — add one to enable analysis and lessons.</div>
        )}

        {s.connections.map((c) => {
          const meta = providers[c.provider] || {};
          const active = s.activeId === c.id;
          const tr = testResult[c.id];
          return (
            <div key={c.id} className={`conn-card ${active ? 'active' : ''}`}>
              <div className="conn-top">
                <label className="conn-active">
                  <input
                    type="radio"
                    name="active-conn"
                    checked={active}
                    onChange={() => setS((cur) => ({ ...cur, activeId: c.id }))}
                  />
                  {active ? 'Active' : 'Set active'}
                </label>
                <button className="linkbtn danger" onClick={() => removeConn(c.id)}>Remove</button>
              </div>

              <div className="conn-grid">
                <label className="conn-field">
                  <span>Provider</span>
                  <select
                    value={c.provider}
                    onChange={(e) => {
                      const prov = e.target.value;
                      const relabel = !c.label || provList.some(([, m]) => m.name === c.label);
                      updateConn(c.id, { provider: prov, ...(relabel ? { label: (providers[prov] || {}).name || prov } : {}) });
                    }}
                  >
                    {provList.map(([id, m]) => (
                      <option key={id} value={id}>{m.name}</option>
                    ))}
                  </select>
                </label>

                <label className="conn-field">
                  <span>Label</span>
                  <input value={c.label} placeholder={meta.name || 'e.g. Work key'} onChange={(e) => updateConn(c.id, { label: e.target.value })} />
                </label>
              </div>

              <label className="conn-field">
                <span>
                  API key{' '}
                  {meta.getKey && (
                    <a href={meta.getKey} target="_blank" rel="noreferrer" className="linkbtn">(get one)</a>
                  )}
                </span>
                <div className="keyrow">
                  <input
                    type={showKey[c.id] ? 'text' : 'password'}
                    placeholder={meta.keyHint || 'API key'}
                    value={c.key}
                    onChange={(e) => updateConn(c.id, { key: e.target.value })}
                  />
                  <button className="iconbtn" title={showKey[c.id] ? 'Hide' : 'Show'} onClick={() => setShowKey((k) => ({ ...k, [c.id]: !k[c.id] }))}>
                    {showKey[c.id] ? '🙈' : '👁️'}
                  </button>
                </div>
              </label>

              <div className="conn-grid">
                <label className="conn-field">
                  <span>Model</span>
                  <input
                    placeholder={meta.defaultModel ? `default: ${meta.defaultModel}` : 'e.g. my-model'}
                    value={c.model}
                    onChange={(e) => updateConn(c.id, { model: e.target.value })}
                  />
                </label>
                {meta.custom && (
                  <label className="conn-field">
                    <span>Base URL</span>
                    <input
                      placeholder="https://host/v1"
                      value={c.baseUrl}
                      onChange={(e) => updateConn(c.id, { baseUrl: e.target.value })}
                    />
                  </label>
                )}
              </div>

              <div className="conn-actions">
                <button className="btn small-btn" onClick={() => testConn(c.id)} disabled={testingId === c.id}>
                  {testingId === c.id ? 'Testing…' : 'Test'}
                </button>
                {tr && <span className={`conn-test ${tr.ok ? 'ok' : 'bad'}`}>{tr.ok ? '✓ ' : '✗ '}{tr.msg}</span>}
              </div>
            </div>
          );
        })}

        <button className="btn btn-ghost btn-add-conn" onClick={addConn}>＋ Add connection</button>

        <label className="field-label">Semantic Scholar API key (optional)</label>
        <p className="dim small" style={{ marginTop: 0 }}>
          Used for the paper reference/citation network. Without a key the free shared tier is heavily
          rate-limited.{' '}
          <a href="https://www.semanticscholar.org/product/api#api-key-form" target="_blank" rel="noreferrer" className="linkbtn">(request one)</a>
        </p>
        <div className="keyrow">
          <input
            type={showKey.s2 ? 'text' : 'password'}
            placeholder="Semantic Scholar key"
            value={s.s2Key}
            onChange={(e) => setS((cur) => ({ ...cur, s2Key: e.target.value }))}
          />
          <button className="iconbtn" title={showKey.s2 ? 'Hide' : 'Show'} onClick={() => setShowKey((k) => ({ ...k, s2: !k.s2 }))}>
            {showKey.s2 ? '🙈' : '👁️'}
          </button>
        </div>

        <div className="modal-actions">
          <button
            className="btn btn-primary"
            onClick={async () => {
              try {
                await saveRaw(s);
                onClose();
              } catch (e) {
                toast(e.message, 'err');
              }
            }}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
