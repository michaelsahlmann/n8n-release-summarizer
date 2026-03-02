import { ghFetch } from './api.js';

/**
 * Fetch the commit comparison between two tags.
 * GitHub returns at most 250 commits per request.
 *
 * @param {string} prevTag  e.g. "n8n@2.9.4"
 * @param {string} currTag  e.g. "n8n@2.10.2"
 * @returns {Promise<Array<{sha, message, author, html_url}>>}
 */
export async function fetchCompare(prevTag, currTag) {
  const path = `/repos/n8n-io/n8n/compare/${encodeURIComponent(prevTag)}...${encodeURIComponent(currTag)}`;
  const data = await ghFetch(path);

  if (!data || !Array.isArray(data.commits)) return [];

  return data.commits.map((c) => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: c.commit?.message ?? '',
    author: c.commit?.author?.name ?? c.author?.login ?? 'unknown',
    html_url: c.html_url,
  }));
}
