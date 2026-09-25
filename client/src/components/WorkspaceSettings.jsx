import React, { useState } from 'react';
import { api } from '../api';
import { useToast } from './bits';

export default function WorkspaceSettings() {
  const [recovery, setRecovery] = useState('');
  const [restore, setRestore] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function showRecovery() {
    try { setRecovery((await api('/session/recovery', { method: 'POST' })).key); }
    catch (e) { toast(e.message, 'err'); }
  }
  async function restoreWorkspace() {
    if (!window.confirm('Switch to the saved workspace? Save this workspace’s recovery key first if you want to return.')) return;
    setBusy(true);
    try {
      await api('/session/restore', { method: 'POST', body: { key: restore.trim() } });
      window.location.reload();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  }
  return <section className="cloud-workspace">
    <h3>Your private workspace</h3>
    <p className="dim small">Papers, progress and API keys are saved in your own encrypted workspace on Netlify. This browser remembers it. Save your recovery key to reopen it on another device or after clearing cookies. Anyone with that key can access your workspace.</p>
    <button className="btn-ghost" onClick={showRecovery}>Show recovery key</button>
    {recovery && <label className="field-label">Store this somewhere private<input aria-label="Workspace recovery key" readOnly value={recovery} onFocus={(e) => e.target.select()} /></label>}
    <label className="field-label">Open a saved workspace<input type="password" autoComplete="off" placeholder="Paste your recovery key" value={restore} onChange={(e) => setRestore(e.target.value)} /></label>
    <button className="btn-ghost" disabled={busy || !restore.trim()} onClick={restoreWorkspace}>{busy ? 'Opening…' : 'Open workspace'}</button>
    <p className="dim small">Free hosting has usage limits. Each workspace holds up to 24 MB; each upload up to 4 MB. AI usage is billed by your chosen provider. Custom AI endpoints must be enabled by the site owner.</p>
  </section>;
}
