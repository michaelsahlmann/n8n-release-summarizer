import { ghFetch } from './api.js';

/**
 * Fetch the most recent stable (non-prerelease) releases from n8n.
 * Returns up to `count` releases, oldest-first so we can easily look up
 * the "previous" tag when calling the compare endpoint.
 *
 * @param {number} count  How many releases to return (newest N stable releases)
 * @returns {Promise<Array<{tag_name, name, published_at, body, prerelease}>>}
 */
export async function fetchReleases(count) {
  // Fetch a larger page to ensure we have enough stable releases after filtering
  const perPage = Math.min(count * 3, 100);
  const data = await ghFetch(`/repos/n8n-io/n8n/releases?per_page=${perPage}`);

  const stable = data.filter((r) => !r.prerelease).slice(0, count);

  // Reverse so index 0 = oldest; this lets us easily reference [i-1] as prevTag
  return stable.reverse();
}
