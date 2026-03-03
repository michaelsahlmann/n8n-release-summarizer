import { fetchReleases } from './fetchReleases.js';
import { parseRefs } from './parseRelease.js';
import { fetchCompare } from './fetchCompare.js';
import { fetchPRs } from './fetchDetails.js';
import { listLocalReleaseVersions } from './localReleases.js';
import { buildSummary } from './summarize.js';

/**
 * Fetch and process up to N additional releases, writing markdown to output/ and JSON to data/.
 *
 * @param {number} count       Number of additional releases to process
 * @param {function} onProgress  Called with a log string for each status update
 * @returns {Promise<Array<{version, prCount, commitCount}>>}
 */
export async function runPipeline(count, onProgress = () => {}) {
  const localVersions = await listLocalReleaseVersions();
  const existingSummaryLabel = localVersions.length === 1 ? 'summary' : 'summaries';
  onProgress(`Found ${localVersions.length} local ${existingSummaryLabel}.\n`);
  onProgress(`Fetching up to ${count} additional n8n releases (including prereleases)...\n`);

  const releases = await fetchReleases(count, { excludeVersions: localVersions });

  if (releases.length === 0) {
    onProgress('No new releases were found. Local summaries are already up to date.\n');
    return [];
  }

  const releaseLabel = releases.length === 1 ? 'release' : 'releases';
  onProgress(`Found ${releases.length} new ${releaseLabel} to process.\n`);

  const results = [];

  for (let i = 0; i < releases.length; i++) {
    const release = releases[i];
    const version = release.tag_name;
    const label = `[${i + 1}/${releases.length}] ${version}`;

    onProgress(`${label} — parsing...`);

    // 1. Parse the release body for PR refs and commit SHAs
    const parsed = parseRefs(release.body);

    // 2. Fetch compare vs previous release (catches commits not in body)
    const prevTag = release.previousTagName ?? (i > 0 ? releases[i - 1].tag_name : null);
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
