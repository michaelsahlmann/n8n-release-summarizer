import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReleaseChatSystemPrompt,
  buildReleaseDigest,
  validateReleaseChatRequest,
} from '../src/releaseChat.js';

test('validateReleaseChatRequest accepts a valid follow-up payload', () => {
  const result = validateReleaseChatRequest({
    version: '2.20.0',
    prNumber: 29430,
    commitSha: '2259f32',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'assistant', content: 'This change adds boundaries.' },
      { role: 'user', content: '  Does this affect normal workflow users?  ' },
    ],
  });

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, {
    version: '2.20.0',
    prNumber: 29430,
    commitSha: '2259f32',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'assistant', content: 'This change adds boundaries.' },
      { role: 'user', content: 'Does this affect normal workflow users?' },
    ],
  });
});

test('validateReleaseChatRequest rejects unsafe or oversized payloads', () => {
  assert.match(
    validateReleaseChatRequest({
      version: '../secret',
      prNumber: 1,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'What changed?' }],
    }).error,
    /valid version/,
  );

  assert.match(
    validateReleaseChatRequest({
      version: '2.20.0',
      prNumber: 1,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      messages: [{ role: 'assistant', content: 'Answer only.' }],
    }).error,
    /latest message/,
  );

  assert.match(
    validateReleaseChatRequest({
      version: '2.20.0',
      prNumber: 1,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'x'.repeat(2001) }],
    }).error,
    /2000 characters/,
  );
});

test('buildReleaseDigest includes selected item and compact release context', () => {
  const digest = buildReleaseDigest(
    {
      release: {
        tag_name: 'n8n@2.20.0',
        published_at: '2026-05-05T09:41:40Z',
        prerelease: true,
      },
      parsed: {
        sections: [
          {
            title: 'Bug Fixes',
            items: [
              {
                prNumber: 29430,
                commitSha: '2259f32',
                rawText: '**ai-builder:** Add boundaries ([#29430](https://github.com/n8n-io/n8n/issues/29430))',
              },
            ],
          },
          {
            title: 'Features',
            items: [
              {
                prNumber: 29498,
                commitSha: '39bd7b4',
                rawText: 'Add instance-level JWKS URI endpoint',
              },
            ],
          },
        ],
      },
    },
    '2.20.0',
    29430,
    '2259f32',
  );

  assert.match(digest, /Release: n8n@2\.20\.0/);
  assert.match(digest, /Bug Fixes: 1 item/);
  assert.match(digest, /Selected release item:/);
  assert.match(digest, /ai-builder.*Add boundaries/);
  assert.doesNotMatch(digest, /https:\/\/github\.com/);
});

test('buildReleaseChatSystemPrompt combines item and release context', () => {
  const prompt = buildReleaseChatSystemPrompt({
    version: '2.20.0',
    itemContextParts: ['PR #29430: Add boundaries'],
    releaseDigest: 'Release: n8n@2.20.0',
  });

  assert.match(prompt, /n8n 2\.20\.0/);
  assert.match(prompt, /PR #29430: Add boundaries/);
  assert.match(prompt, /Release: n8n@2\.20\.0/);
  assert.match(prompt, /Do not invent/);
});
