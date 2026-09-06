export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method };
  if (form) {
    opts.body = form; // browser sets multipart headers
  } else if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch('/api' + path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new Error((data && data.error) || `${res.status} ${res.statusText}`);
  return data;
}

export function downloadUrl(path) {
  return '/api' + path;
}
