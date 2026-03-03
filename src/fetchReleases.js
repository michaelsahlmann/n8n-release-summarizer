import { ghFetch } from './api.js';

const RELEASES_PATH = '/repos/n8n-io/n8n/releases';
const RELEASES_PER_PAGE = 100;

function normalizeVersion(tagName) {
  return tagName.replace(/^n8n@/, '');
}

function toExcludedVersionSet(excludeVersions) {
  return excludeVersions instanceof Set ? excludeVersions : new Set(excludeVersions);
}

function isPublishedRelease(release) {
  return Boolean(release) && !release.draft;
}

function findNthUnfetchedReleaseIndex(releases, count, excludeVersions) {
  if (count < 1) {
    return -1;
  }

  const excludedVersions = toExcludedVersionSet(excludeVersions);
  let unseenCount = 0;

  for (let i = 0; i < releases.length; i++) {
    const release = releases[i];
    if (!isPublishedRelease(release)) {
      continue;
    }

    if (excludedVersions.has(normalizeVersion(release.tag_name))) {
      continue;
    }

    unseenCount += 1;
    if (unseenCount === count) {
      return i;
    }
  }

  return -1;
}

/**
 * Decide whether we need to keep paging GitHub releases to fully define the next batch.
 * We need the Nth unseen release plus one more published release after it so compare
 * requests can still anchor against the true previous tag even when cached versions are skipped.
 */
export function needsMoreReleasePages(releases, count, excludeVersions = []) {
  const nthUnfetchedIndex = findNthUnfetchedReleaseIndex(releases, count, excludeVersions);

  if (nthUnfetchedIndex === -1) {
    return true;
  }

  for (let i = nthUnfetchedIndex + 1; i < releases.length; i++) {
    if (isPublishedRelease(releases[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Pick the next N unfetched releases from a GitHub releases feed (newest-first input),
 * keeping prereleases and returning the selected batch oldest-first.
 */
export function selectUnfetchedReleases(releases, count, excludeVersions = []) {
  const excludedVersions = toExcludedVersionSet(excludeVersions);
  const selected = [];

  for (let i = 0; i < releases.length && selected.length < count; i++) {
    const release = releases[i];
    if (!isPublishedRelease(release)) {
      continue;
    }

    if (excludedVersions.has(normalizeVersion(release.tag_name))) {
      continue;
    }

    let previousTagName = null;
    for (let j = i + 1; j < releases.length; j++) {
      if (isPublishedRelease(releases[j])) {
        previousTagName = releases[j].tag_name;
        break;
      }
    }

    selected.push({ ...release, previousTagName });
  }

  return selected.reverse();
}

/**
 * Fetch up to `count` additional published releases from n8n, skipping versions
 * already present locally while still including prereleases. Returns the batch
 * oldest-first so the pipeline can compare each release against its real previous tag.
 *
 * @param {number} count  How many new releases to return
 * @param {{ excludeVersions?: Iterable<string> }} [options]
 * @returns {Promise<Array<{tag_name, name, published_at, body, prerelease, previousTagName: string | null}>>}
 */
export async function fetchReleases(count, { excludeVersions = [] } = {}) {
  const releases = [];
  let page = 1;

  while (true) {
    const data = await ghFetch(`${RELEASES_PATH}?per_page=${RELEASES_PER_PAGE}&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    releases.push(...data);

    if (!needsMoreReleasePages(releases, count, excludeVersions)) {
      break;
    }

    if (data.length < RELEASES_PER_PAGE) {
      break;
    }

    page += 1;
  }

  return selectUnfetchedReleases(releases, count, excludeVersions);
}
