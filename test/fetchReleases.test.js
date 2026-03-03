import test from 'node:test';
import assert from 'node:assert/strict';
import { needsMoreReleasePages, selectUnfetchedReleases } from '../src/fetchReleases.js';

function makeRelease(tagName, { draft = false, prerelease = false } = {}) {
  return { tag_name: tagName, draft, prerelease };
}

test('selectUnfetchedReleases skips cached versions and keeps prereleases', () => {
  const releases = [
    makeRelease('n8n@2.9.4-exp.0', { prerelease: true }),
    makeRelease('n8n@2.10.2', { prerelease: true }),
    makeRelease('n8n@2.9.4'),
    makeRelease('n8n@2.9.3'),
  ];

  const selected = selectUnfetchedReleases(releases, 2, ['2.9.4']);

  assert.deepEqual(
    selected.map((release) => ({ tag: release.tag_name, previousTagName: release.previousTagName })),
    [
      { tag: 'n8n@2.10.2', previousTagName: 'n8n@2.9.4' },
      { tag: 'n8n@2.9.4-exp.0', previousTagName: 'n8n@2.10.2' },
    ],
  );
});

test('selectUnfetchedReleases excludes drafts and returns oldest-first', () => {
  const releases = [
    makeRelease('n8n@2.10.2', { prerelease: true }),
    makeRelease('n8n@2.10.1', { draft: true, prerelease: true }),
    makeRelease('n8n@2.9.4'),
    makeRelease('n8n@2.9.3'),
  ];

  const selected = selectUnfetchedReleases(releases, 2);

  assert.deepEqual(
    selected.map((release) => release.tag_name),
    ['n8n@2.9.4', 'n8n@2.10.2'],
  );
});

test('needsMoreReleasePages requests another page when page one is fully skipped', () => {
  const firstPage = [
    makeRelease('n8n@2.10.2'),
    makeRelease('n8n@2.10.1'),
    makeRelease('n8n@2.10.0'),
  ];

  assert.equal(needsMoreReleasePages(firstPage, 2, ['2.10.2', '2.10.1', '2.10.0']), true);

  const twoPages = [
    ...firstPage,
    makeRelease('n8n@2.9.4'),
    makeRelease('n8n@2.9.3'),
    makeRelease('n8n@2.9.2'),
  ];

  assert.equal(needsMoreReleasePages(twoPages, 2, ['2.10.2', '2.10.1', '2.10.0']), false);
});

test('selectUnfetchedReleases returns an empty list when every release is already cached', () => {
  const releases = [
    makeRelease('n8n@2.10.2'),
    makeRelease('n8n@2.9.4'),
    makeRelease('n8n@2.9.3'),
  ];

  const selected = selectUnfetchedReleases(releases, 3, ['2.10.2', '2.9.4', '2.9.3']);

  assert.deepEqual(selected, []);
});
