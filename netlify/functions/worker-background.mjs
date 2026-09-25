import { getStore } from '@netlify/blobs';
import cloud from '../../server/cloud.js';

export default async function handler(req) {
  process.env.NETLIFY = 'true';
  await cloud.backgroundHandler(req, getStore({ name: 'paperquest-private-v1', consistency: 'strong' }));
}
