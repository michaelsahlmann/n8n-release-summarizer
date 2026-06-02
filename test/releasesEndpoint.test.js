import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { listLocalReleases } from '../src/localReleases.js';

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'n8n-release-limit-'));
  const outputDir = join(root, 'output');
  const dataDir = join(root, 'data');
  await mkdir(outputDir);
  await mkdir(dataDir);

  return {
    outputDir,
    dataDir,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function writeReleaseSummary(outputDir, version) {
  await writeFile(join(outputDir, `${version}.md`), `# ${version}\n`);
}

async function writeReleaseData(dataDir, version, release) {
  await writeFile(join(dataDir, `${version}.json`), JSON.stringify({ release }, null, 2));
}

function simulateLimit(versions, limit) {
  if (limit === undefined || limit === null || limit === '') {
    return versions;
  }

  const parsed = parseInt(String(limit), 10);
  if (isNaN(parsed) || parsed < 0) {
    return versions;
  }

  const MAX_RELEASE_LIMIT = 100;
  const capped = Math.min(parsed, MAX_RELEASE_LIMIT);
  return versions.slice(0, capped);
}

test('simulateLimit returns all versions when no limit is provided', async () => {
  const fixture = await createFixture();
  try {
    for (const v of ['2.10.0', '2.9.0', '2.8.0']) {
      await writeReleaseSummary(fixture.outputDir, v);
      await writeReleaseData(fixture.dataDir, v, { tag_name: `n8n@${v}`, prerelease: false });
    }
    const all = await listLocalReleases({ outputDir: fixture.outputDir, dataDir: fixture.dataDir, fetcher: async () => null });
    assert.equal(simulateLimit(all, undefined).length, all.length);
    assert.equal(simulateLimit(all, null).length, all.length);
    assert.equal(simulateLimit(all, '').length, all.length);
  } finally {
    await fixture.cleanup();
  }
});

test('simulateLimit returns empty array for limit=0', async () => {
  const fixture = await createFixture();
  try {
    for (const v of ['2.10.0', '2.9.0']) {
      await writeReleaseSummary(fixture.outputDir, v);
      await writeReleaseData(fixture.dataDir, v, { tag_name: `n8n@${v}`, prerelease: false });
    }
    const all = await listLocalReleases({ outputDir: fixture.outputDir, dataDir: fixture.dataDir, fetcher: async () => null });
    assert.equal(simulateLimit(all, '0').length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test('simulateLimit returns requested number of versions', async () => {
  const fixture = await createFixture();
  try {
    for (const v of ['2.10.0', '2.9.0', '2.8.0', '2.7.0', '2.6.0']) {
      await writeReleaseSummary(fixture.outputDir, v);
      await writeReleaseData(fixture.dataDir, v, { tag_name: `n8n@${v}`, prerelease: false });
    }
    const all = await listLocalReleases({ outputDir: fixture.outputDir, dataDir: fixture.dataDir, fetcher: async () => null });
    assert.equal(simulateLimit(all, '3').length, 3);
    assert.equal(simulateLimit(all, '1').length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test('simulateLimit caps at MAX_RELEASE_LIMIT (100)', async () => {
  const fixture = await createFixture();
  try {
    for (const v of ['2.10.0', '2.9.0']) {
      await writeReleaseSummary(fixture.outputDir, v);
      await writeReleaseData(fixture.dataDir, v, { tag_name: `n8n@${v}`, prerelease: false });
    }
    const all = await listLocalReleases({ outputDir: fixture.outputDir, dataDir: fixture.dataDir, fetcher: async () => null });
    assert.equal(simulateLimit(all, '999').length, all.length);
  } finally {
    await fixture.cleanup();
  }
});

test('simulateLimit returns all versions for negative limit', async () => {
  const fixture = await createFixture();
  try {
    for (const v of ['2.10.0', '2.9.0']) {
      await writeReleaseSummary(fixture.outputDir, v);
      await writeReleaseData(fixture.dataDir, v, { tag_name: `n8n@${v}`, prerelease: false });
    }
    const all = await listLocalReleases({ outputDir: fixture.outputDir, dataDir: fixture.dataDir, fetcher: async () => null });
    assert.equal(simulateLimit(all, '-5').length, all.length);
  } finally {
    await fixture.cleanup();
  }
});

test('simulateLimit returns all versions for non-numeric limit', async () => {
  const fixture = await createFixture();
  try {
    for (const v of ['2.10.0', '2.9.0']) {
      await writeReleaseSummary(fixture.outputDir, v);
      await writeReleaseData(fixture.dataDir, v, { tag_name: `n8n@${v}`, prerelease: false });
    }
    const all = await listLocalReleases({ outputDir: fixture.outputDir, dataDir: fixture.dataDir, fetcher: async () => null });
    assert.equal(simulateLimit(all, 'abc').length, all.length);
  } finally {
    await fixture.cleanup();
  }
});
