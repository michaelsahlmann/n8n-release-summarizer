import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { fetchDesignatedLatestVersion, listLocalReleases } from '../src/localReleases.js';

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'n8n-release-library-'));
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

test('listLocalReleases keeps all output versions and derives badge metadata from local data', async () => {
  const fixture = await createFixture();

  try {
    await writeReleaseSummary(fixture.outputDir, '2.9.9');
    await writeReleaseSummary(fixture.outputDir, '2.10.3');
    await writeReleaseSummary(fixture.outputDir, '2.10.2');
    await writeReleaseSummary(fixture.outputDir, '2.10.1');
    await writeReleaseSummary(fixture.outputDir, '2.10.0');
    await writeReleaseSummary(fixture.outputDir, '2.9.8');

    await writeReleaseData(fixture.dataDir, '2.10.3', {
      draft: false,
      tag_name: 'n8n@2.10.3',
      prerelease: false,
    });
    await writeReleaseData(fixture.dataDir, '2.10.2', {
      draft: false,
      tag_name: 'n8n@2.10.2',
      prerelease: true,
    });
    await writeReleaseData(fixture.dataDir, '2.10.1', {
      draft: true,
      tag_name: 'n8n@2.10.1',
      prerelease: false,
    });
    await writeReleaseData(fixture.dataDir, '2.10.0', {
      draft: false,
      prerelease: false,
      tag_name: 'n8n@2.10.0',
    });
    await writeFile(join(fixture.dataDir, '2.9.8.json'), '{ this is not valid json');

    const releases = await listLocalReleases({
      outputDir: fixture.outputDir,
      dataDir: fixture.dataDir,
      fetcher: async () => ({ tag_name: 'n8n@2.10.3' }),
    });

    assert.deepEqual(
      releases.map((release) => release.version),
      ['2.10.3', '2.10.2', '2.10.1', '2.10.0', '2.9.9', '2.9.8'],
    );

    assert.deepEqual(
      releases,
      [
        { version: '2.10.3', isPrerelease: false, isLatest: true },
        { version: '2.10.2', isPrerelease: true, isLatest: false },
        { version: '2.10.1', isPrerelease: false, isLatest: false },
        { version: '2.10.0', isPrerelease: false, isLatest: false },
        { version: '2.9.9', isPrerelease: false, isLatest: false },
        { version: '2.9.8', isPrerelease: false, isLatest: false },
      ],
    );
  } finally {
    await fixture.cleanup();
  }
});

test('listLocalReleases uses an explicit cached latest flag when present', async () => {
  const fixture = await createFixture();

  try {
    await writeReleaseSummary(fixture.outputDir, '2.10.3');
    await writeReleaseSummary(fixture.outputDir, '2.10.2');

    await writeReleaseData(fixture.dataDir, '2.10.3', {
      draft: false,
      tag_name: 'n8n@2.10.3',
      prerelease: false,
      make_latest: true,
    });
    await writeReleaseData(fixture.dataDir, '2.10.2', {
      draft: false,
      tag_name: 'n8n@2.10.2',
      prerelease: false,
    });

    const releases = await listLocalReleases({
      outputDir: fixture.outputDir,
      dataDir: fixture.dataDir,
      fetcher: async () => ({ tag_name: 'n8n@2.10.2' }),
    });

    assert.deepEqual(releases, [
      { version: '2.10.3', isPrerelease: false, isLatest: true },
      { version: '2.10.2', isPrerelease: false, isLatest: false },
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test('listLocalReleases falls back to the GitHub designated latest release', async () => {
  const fixture = await createFixture();

  try {
    await writeReleaseSummary(fixture.outputDir, '2.11.1');
    await writeReleaseSummary(fixture.outputDir, '2.10.3');
    await writeReleaseSummary(fixture.outputDir, '1.123.23');

    await writeReleaseData(fixture.dataDir, '2.11.1', {
      draft: false,
      tag_name: 'n8n@2.11.1',
      prerelease: true,
    });
    await writeReleaseData(fixture.dataDir, '2.10.3', {
      draft: false,
      tag_name: 'n8n@2.10.3',
      prerelease: false,
    });
    await writeReleaseData(fixture.dataDir, '1.123.23', {
      draft: false,
      tag_name: 'n8n@1.123.23',
      prerelease: false,
    });

    const releases = await listLocalReleases({
      outputDir: fixture.outputDir,
      dataDir: fixture.dataDir,
      fetcher: async () => ({ tag_name: 'n8n@2.10.3' }),
    });

    assert.deepEqual(releases, [
      { version: '2.11.1', isPrerelease: true, isLatest: false },
      { version: '2.10.3', isPrerelease: false, isLatest: true },
      { version: '1.123.23', isPrerelease: false, isLatest: false },
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test('listLocalReleases defaults to the first stable local release when GitHub latest is unavailable', async () => {
  const fixture = await createFixture();

  try {
    await writeReleaseSummary(fixture.outputDir, '2.11.1');
    await writeReleaseSummary(fixture.outputDir, '2.10.3');
    await writeReleaseSummary(fixture.outputDir, '2.10.2');

    await writeReleaseData(fixture.dataDir, '2.11.1', {
      draft: false,
      tag_name: 'n8n@2.11.1',
      prerelease: true,
    });
    await writeReleaseData(fixture.dataDir, '2.10.3', {
      draft: false,
      tag_name: 'n8n@2.10.3',
      prerelease: false,
    });
    await writeReleaseData(fixture.dataDir, '2.10.2', {
      draft: false,
      tag_name: 'n8n@2.10.2',
      prerelease: false,
    });

    const releases = await listLocalReleases({
      outputDir: fixture.outputDir,
      dataDir: fixture.dataDir,
      fetcher: async () => {
        throw new Error('rate limited');
      },
    });

    assert.deepEqual(releases, [
      { version: '2.11.1', isPrerelease: true, isLatest: false },
      { version: '2.10.3', isPrerelease: false, isLatest: true },
      { version: '2.10.2', isPrerelease: false, isLatest: false },
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test('listLocalReleases does not mark any release as latest when every local release is a prerelease', async () => {
  const fixture = await createFixture();

  try {
    await writeReleaseSummary(fixture.outputDir, '2.11.1');
    await writeReleaseSummary(fixture.outputDir, '2.10.2');

    await writeReleaseData(fixture.dataDir, '2.11.1', {
      draft: false,
      tag_name: 'n8n@2.11.1',
      prerelease: true,
    });
    await writeReleaseData(fixture.dataDir, '2.10.2', {
      draft: false,
      tag_name: 'n8n@2.10.2',
      prerelease: true,
    });

    const releases = await listLocalReleases({
      outputDir: fixture.outputDir,
      dataDir: fixture.dataDir,
      fetcher: async () => ({ tag_name: 'n8n@2.10.3' }),
    });

    assert.deepEqual(releases, [
      { version: '2.11.1', isPrerelease: true, isLatest: false },
      { version: '2.10.2', isPrerelease: true, isLatest: false },
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test('fetchDesignatedLatestVersion normalizes the GitHub tag name and returns null on failures', async () => {
  assert.equal(
    await fetchDesignatedLatestVersion(async () => ({ tag_name: 'n8n@2.10.3' })),
    '2.10.3',
  );
  assert.equal(
    await fetchDesignatedLatestVersion(async () => ({ tag_name: null })),
    null,
  );
  assert.equal(
    await fetchDesignatedLatestVersion(async () => {
      throw new Error('boom');
    }),
    null,
  );
});

test('listLocalReleases returns an empty list when the output directory does not exist', async () => {
  const fixture = await createFixture();

  try {
    const missingOutputDir = join(fixture.outputDir, 'missing');
    const releases = await listLocalReleases({
      outputDir: missingOutputDir,
      dataDir: fixture.dataDir,
    });

    assert.deepEqual(releases, []);
  } finally {
    await fixture.cleanup();
  }
});
