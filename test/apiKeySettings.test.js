import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getApiKey,
  getApiKeyStatuses,
  persistApiKey,
} from '../src/apiKeySettings.js';
import { fetchProviderModels, testProviderApiKey } from '../src/providerModels.js';

const API_ENV_NAMES = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY'];

function snapshotApiEnv() {
  return Object.fromEntries(API_ENV_NAMES.map((name) => [name, process.env[name]]));
}

function restoreApiEnv(snapshot) {
  for (const name of API_ENV_NAMES) {
    if (snapshot[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = snapshot[name];
    }
  }
}

async function withTempEnvFile(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'n8n-release-settings-'));
  const envPath = join(dir, '.env');
  try {
    await fn(envPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('settings status never includes the real API key value', () => {
  const snapshot = snapshotApiEnv();
  try {
    process.env.OPENAI_API_KEY = 'sk-real-secret-value';

    const status = getApiKeyStatuses();

    assert.equal(status.apiKeys.openai.configured, true);
    assert.equal(status.apiKeys.openai.status, 'configured');
    assert.equal(JSON.stringify(status).includes('sk-real-secret-value'), false);
  } finally {
    restoreApiEnv(snapshot);
  }
});

test('persistApiKey creates, replaces, and removes a key without restart', async () => {
  const snapshot = snapshotApiEnv();
  try {
    delete process.env.OPENAI_API_KEY;

    await withTempEnvFile(async (envPath) => {
      await persistApiKey('openai', 'sk-first', { envPath });
      assert.equal(process.env.OPENAI_API_KEY, 'sk-first');
      assert.equal(getApiKey('openai'), 'sk-first');
      assert.match(await readFile(envPath, 'utf8'), /OPENAI_API_KEY=sk-first/);

      await persistApiKey('openai', 'sk-second', { envPath });
      const updated = await readFile(envPath, 'utf8');
      assert.equal(process.env.OPENAI_API_KEY, 'sk-second');
      assert.equal((updated.match(/OPENAI_API_KEY=/g) || []).length, 1);
      assert.match(updated, /OPENAI_API_KEY=sk-second/);

      await persistApiKey('openai', '', { envPath });
      const removed = await readFile(envPath, 'utf8');
      assert.equal(process.env.OPENAI_API_KEY, undefined);
      assert.doesNotMatch(removed, /OPENAI_API_KEY=/);
    });
  } finally {
    restoreApiEnv(snapshot);
  }
});

test('saved key is used by model loading without restart', async () => {
  const snapshot = snapshotApiEnv();
  try {
    delete process.env.OPENAI_API_KEY;

    await withTempEnvFile(async (envPath) => {
      await persistApiKey('openai', 'sk-live-memory', { envPath });

      const models = await fetchProviderModels('openai', {
        fetchImpl: async (_url, options) => {
          assert.equal(options.headers.Authorization, 'Bearer sk-live-memory');
          return {
            ok: true,
            json: async () => ({ data: [{ id: 'gpt-test-model' }, { id: 'not-chat-model' }] }),
          };
        },
      });

      assert.deepEqual(models, ['gpt-test-model']);
    });
  } finally {
    restoreApiEnv(snapshot);
  }
});

test('persistApiKey preserves unrelated .env lines', async () => {
  const snapshot = snapshotApiEnv();
  try {
    await withTempEnvFile(async (envPath) => {
      await writeFile(envPath, 'GITHUB_TOKEN=abc\n# keep this\nGEMINI_API_KEY=old\n', 'utf8');

      await persistApiKey('openai', 'sk-added', { envPath });

      const raw = await readFile(envPath, 'utf8');
      assert.match(raw, /GITHUB_TOKEN=abc/);
      assert.match(raw, /# keep this/);
      assert.match(raw, /GEMINI_API_KEY=old/);
      assert.match(raw, /OPENAI_API_KEY=sk-added/);
    });
  } finally {
    restoreApiEnv(snapshot);
  }
});

test('testProviderApiKey reports rejected keys without exposing the key', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: 'bad key' } }),
  });

  await assert.rejects(
    () => testProviderApiKey('openai', 'sk-invalid-secret', { fetchImpl }),
    (error) => {
      assert.equal(error.code, 'API_KEY_INVALID');
      assert.equal(error.message.includes('sk-invalid-secret'), false);
      return true;
    },
  );
});
