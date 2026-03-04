import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ghFetch } from './api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'output');
const DATA_DIR = join(ROOT, 'data');

export function sortVersionsDesc(versions) {
  return [...versions].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

function normalizeVersion(tagName) {
  return typeof tagName === 'string' ? tagName.replace(/^n8n@/, '') : null;
}

function hasExplicitLatestFlag(release) {
  return release?.is_latest === true || release?.make_latest === true || release?.make_latest === 'true';
}

async function readReleaseMetadata(version, dataDir) {
  const filePath = join(dataDir, `${version}.json`);

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const release = parsed?.release ?? {};

    return {
      draft: release.draft === true,
      tagName: typeof release.tag_name === 'string' ? release.tag_name : null,
      isPrerelease: release.prerelease === true,
      hasExplicitLatest: hasExplicitLatestFlag(release),
    };
  } catch {
    return {
      draft: false,
      tagName: null,
      isPrerelease: false,
      hasExplicitLatest: false,
    };
  }
}

export async function fetchDesignatedLatestVersion(fetcher = ghFetch) {
  try {
    const release = await fetcher('/repos/n8n-io/n8n/releases/latest');
    return normalizeVersion(release?.tag_name);
  } catch {
    return null;
  }
}

function pickExplicitLatestRelease(releases) {
  const flagged = releases.filter((release) => release.hasExplicitLatest);
  if (flagged.length === 0) {
    return null;
  }

  const stableFlagged = flagged.find((release) => !release.draft && !release.isPrerelease);
  return stableFlagged ?? flagged[0];
}

function pickDefaultLatestRelease(releases) {
  return releases.find((release) => !release.draft && !release.isPrerelease) ?? null;
}

export async function listLocalReleaseVersions() {
  try {
    const files = await readdir(OUTPUT_DIR);
    const versions = files
      .filter((fileName) => fileName.endsWith('.md'))
      .map((fileName) => fileName.replace(/\.md$/, ''));

    return sortVersionsDesc(versions);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }

    throw err;
  }
}

export async function listLocalReleases({ outputDir = OUTPUT_DIR, dataDir = DATA_DIR, fetcher = ghFetch } = {}) {
  let files;
  try {
    files = await readdir(outputDir);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }

    throw err;
  }

  const versions = sortVersionsDesc(
    files.filter((fileName) => fileName.endsWith('.md')).map((fileName) => fileName.replace(/\.md$/, '')),
  );

  const releases = await Promise.all(
    versions.map(async (version) => {
      const metadata = await readReleaseMetadata(version, dataDir);
      return {
        version,
        tagName: metadata.tagName,
        isPrerelease: metadata.isPrerelease,
        isLatest: false,
        draft: metadata.draft,
        hasExplicitLatest: metadata.hasExplicitLatest,
      };
    }),
  );

  let latestRelease = pickExplicitLatestRelease(releases);

  if (!latestRelease) {
    const designatedLatestVersion = await fetchDesignatedLatestVersion(fetcher);
    if (designatedLatestVersion) {
      latestRelease =
        releases.find(
          (release) =>
            release.version === designatedLatestVersion &&
            release.draft !== true &&
            release.isPrerelease !== true,
        ) ?? null;
    }
  }

  if (!latestRelease) {
    latestRelease = pickDefaultLatestRelease(releases);
  }

  return releases.map(({ draft, tagName, hasExplicitLatest, ...release }) => ({
    ...release,
    isLatest: latestRelease?.version === release.version,
  }));
}
