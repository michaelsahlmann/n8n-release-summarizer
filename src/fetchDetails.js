import { ghFetch } from './api.js';

/**
 * Fetch details for a single PR/issue by number.
 * Returns null on 404 (stale refs in release body).
 *
 * @param {number} number  PR or issue number
 * @param {number} [delayMs=0]  Optional delay before the request (rate-limit courtesy)
 * @returns {Promise<{number, title, body, labels, html_url, pull_request} | null>}
 */
export async function fetchPR(number, delayMs = 0) {
  const data = await ghFetch(`/repos/n8n-io/n8n/issues/${number}`, delayMs);
  if (!data) return null;

  return {
    number: data.number,
    title: data.title,
    body: data.body ?? '',
    labels: (data.labels ?? []).map((l) => l.name),
    html_url: data.html_url,
    pull_request: data.pull_request ?? null,
  };
}

/**
 * Fetch details for multiple PR numbers with a delay between requests.
 *
 * @param {number[]} numbers
 * @param {number} [delayMs=100]
 * @returns {Promise<Map<number, object>>}
 */
export async function fetchPRs(numbers, delayMs = 100) {
  const results = new Map();
  for (const num of numbers) {
    const pr = await fetchPR(num, delayMs);
    if (pr) results.set(num, pr);
  }
  return results;
}
