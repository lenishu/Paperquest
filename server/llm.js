// Provider-agnostic LLM adapter. Kinds: openai (OpenAI, Groq, Zhipu GLM and any
// OpenAI-compatible endpoint), anthropic, gemini. Node 18+ (global fetch).
const store = require('./store');

const TIMEOUT_MS = 240000;

async function timedFetch(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function readError(res) {
  let body = '';
  try {
    body = await res.text();
  } catch {}
  let msg = body.slice(0, 400);
  try {
    const j = JSON.parse(body);
    msg = j.error?.message || j.message || msg;
  } catch {}
  return `${res.status} ${res.statusText}: ${msg}`;
}

// messages: [{role:'system'|'user'|'assistant', content:string}]
async function callLLM(settings, messages, { json = true, maxTokens = 8000 } = {}) {
  const conn = store.activeConnection(settings);
  if (!conn || !(conn.key || '').trim()) {
    throw httpError(400, 'No active API connection with a key. Open Settings (gear icon), add a key and mark it active.');
  }
  const meta = store.providerMeta(conn.provider);
  const key = conn.key.trim();
  const model = (conn.model && conn.model.trim()) || meta.defaultModel;
  const baseUrl = (conn.baseUrl && conn.baseUrl.trim()) || meta.baseUrl;
  if (meta.kind === 'openai' && !baseUrl) {
    throw httpError(400, 'This custom connection needs a Base URL (e.g. https://host/v1). Open Settings.');
  }
  if (!model) throw httpError(400, 'This connection needs a model name. Open Settings.');

  if (meta.kind === 'openai') return openai(key, model, messages, json, maxTokens, baseUrl, conn.provider === 'openai');
  if (meta.kind === 'anthropic') return anthropic(key, model, messages, json, maxTokens);
  if (meta.kind === 'gemini') return gemini(key, model, messages, json, maxTokens, baseUrl);
  throw httpError(400, `Unknown provider kind "${meta.kind}"`);
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Works for OpenAI and any OpenAI-compatible endpoint (Groq, Zhipu GLM, custom).
// baseUrl is the API root (…/v1 or vendor equivalent). useCompletionTokens picks
// the newer `max_completion_tokens` param (real OpenAI) vs `max_tokens` (others).
async function openai(key, model, messages, json, maxTokens, baseUrl, useCompletionTokens) {
  const url = `${String(baseUrl).replace(/\/$/, '')}/chat/completions`;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  const body = { model, messages };
  if (json) body.response_format = { type: 'json_object' };
  if (useCompletionTokens) body.max_completion_tokens = maxTokens; else body.max_tokens = maxTokens;

  const send = () => timedFetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  let res = await send();

  // Recover from provider-specific param quirks (400 only): swap the token param,
  // or drop response_format if the model/endpoint doesn't support JSON mode.
  if (res.status === 400) {
    const errText = await res.clone().text();
    let retry = false;
    if (/max_completion_tokens/i.test(errText) && 'max_completion_tokens' in body) {
      delete body.max_completion_tokens; body.max_tokens = maxTokens; retry = true;
    } else if (/max_tokens/i.test(errText) && 'max_tokens' in body && useCompletionTokens === false) {
      // some endpoints reject max_tokens too — last resort, let the server default it
      delete body.max_tokens; retry = true;
    }
    if (/response_format|json/i.test(errText) && body.response_format) {
      delete body.response_format; retry = true;
    }
    if (retry) res = await send();
  }

  if (!res.ok) throw httpError(502, `Provider error — ${await readError(res)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw httpError(502, 'The provider returned an empty response');
  return text;
}

async function anthropic(key, model, messages, json, maxTokens) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await timedFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: rest
    })
  });

  if (!res.ok) throw httpError(502, `Anthropic error — ${await readError(res)}`);
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  if (!text) throw httpError(502, 'Anthropic returned an empty response');
  return text;
}

async function gemini(key, model, messages, json, maxTokens, baseUrl) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const root = String(baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const url = `${root}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await timedFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        maxOutputTokens: maxTokens,
        ...(json ? { responseMimeType: 'application/json' } : {})
      }
    })
  });

  if (!res.ok) throw httpError(502, `Gemini error — ${await readError(res)}`);
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) {
    const reason = cand?.finishReason || data.promptFeedback?.blockReason || 'empty response';
    throw httpError(502, `Gemini returned no text (${reason})`);
  }
  return text;
}

// Robust JSON extraction from model output.
function parseModelJSON(text) {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try {
    return JSON.parse(t);
  } catch {
    // remove trailing commas and retry
    try {
      return JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      throw httpError(502, 'The model returned malformed JSON. Try again (or a different model). Raw start: ' + t.slice(0, 200));
    }
  }
}

module.exports = { callLLM, parseModelJSON, httpError };
