import { getStore } from '@netlify/blobs';
import cloud from '../../server/cloud.js';

export default async function handler(req) {
  process.env.NETLIFY = 'true';
  const blobs = getStore({ name: 'paperquest-private-v1', consistency: 'strong' });
  return cloud.apiHandler(req, blobs, async (token, jobId) => {
    const base = process.env.DEPLOY_URL || process.env.URL;
    if (!base) throw new Error('Deployment URL missing');
    const response = await fetch(new URL('/.netlify/functions/worker-background', base), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cloud.cookie(token).split(';')[0] },
      body: JSON.stringify({ jobId }), signal: AbortSignal.timeout(15000)
    });
    if (response.status !== 202) throw new Error('Worker unavailable');
  });
}
export const config = { path: '/api/*' };
