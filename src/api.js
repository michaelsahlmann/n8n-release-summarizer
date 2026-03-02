import 'dotenv/config';

const BASE = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.warn('Warning: GITHUB_TOKEN not set. Requests will be rate-limited to 60/hour.');
}

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

/**
 * Fetch a GitHub API endpoint and return parsed JSON.
 * Throws on non-2xx responses (except 404, which returns null).
 */
export async function ghFetch(path, delayMs = 0) {
  if (delayMs > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
  }

  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, { headers });

  if (res.status === 404) return null;

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status} on ${url}: ${text}`);
  }

  return res.json();
}
