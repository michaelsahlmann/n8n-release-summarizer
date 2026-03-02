import { fetchReleases } from './fetchReleases.js';
import { parseRefs } from './parseRelease.js';
import { fetchCompare } from './fetchCompare.js';
import { fetchPRs } from './fetchDetails.js';
import { buildSummary } from './summarize.js';

/**
 * Fetch and process N releases, writing markdown to output/ and JSON to data/.
 *
 * @param {number} count       Number of most-recent stable releases to process
 * @param {function} onProgress  Called with a log string for each status update
 * @returns {Promise<Array<{version, prCount, commitCount}>>}
 */
export async function runPipeline(count, onProgress = () => {}) {
  onProgress(`Fetching ${count} most recent stable n8n releases...\n`);

  const releases = await fetchReleases(count);

  if (releases.length === 0) {
    throw new Error('No stable releases found.');
  }

  onProgress(`Found ${releases.length} stable releases.\n`);

  const results = [];

  for (let i = 0; i < releases.length; i++) {
    const release = releases[i];
    const version = release.tag_name;
    const label = `[${i + 1}/${releases.length}] ${version}`;

    onProgress(`${label} — parsing...`);

    // 1. Parse the release body for PR refs and commit SHAs
    const parsed = parseRefs(release.body);

    // 2. Fetch compare vs previous release (catches commits not in body)
    const prevTag = i > 0 ? releases[i - 1].tag_name : null;
    let commits = [];
    if (prevTag) {
      try {
        commits = await fetchCompare(prevTag, version);
      } catch (err) {
        onProgress(`\n  Warning: compare failed (${err.message})`);
      }
    }

    // 3. Fetch PR details for all PR numbers found in the body
    const prNumbers = [...parsed.allPRs];
    onProgress(` fetching ${prNumbers.length} PRs...`);

    const prDetails = await fetchPRs(prNumbers, 100);

    // 4. Build and write the summary
    const { prCount, commitCount } = await buildSummary(release, parsed, prDetails, commits);

    onProgress(` done. ${prCount} PRs, ${commitCount} commits.\n`);
    results.push({ version, prCount, commitCount });
  }

  onProgress('\nAll done! Check output/ for summaries and data/ for raw JSON.');

  return results;
}
