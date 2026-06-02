import 'dotenv/config';
import express from 'express';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { listLocalReleases } from './localReleases.js';
import { runPipeline } from './pipeline.js';
import { generateSocialSummary } from './socialSummarize.js';
import { explainItem } from './explainItem.js';
import { answerReleaseChat, validateReleaseChatRequest } from './releaseChat.js';
import { getApiKeyStatuses, isApiKeyError, persistApiKey } from './apiKeySettings.js';
import { fetchProviderModels, testProviderApiKey } from './providerModels.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'output');
const DATA_DIR = join(ROOT, 'data');

const app = express();
app.use(express.json());
app.use(express.static(join(ROOT, 'public')));

console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET'}`);
console.log(`OPENAI_API_KEY:    ${process.env.OPENAI_API_KEY ? 'set' : 'NOT SET'}`);
console.log(`GEMINI_API_KEY:    ${process.env.GEMINI_API_KEY ? 'set' : 'NOT SET'}`);

// Validate that a version string is safe to use as a filename component
const SAFE_VERSION = /^[\w.\-]+$/;

// --- GET /api/releases ---
// Returns locally cached release summaries (newest first)
// Optional query: ?limit=N to cap the number of results (0 returns empty, max 100)
const MAX_RELEASE_LIMIT = 100;

app.get('/api/releases', async (req, res) => {
  try {
    const versions = await listLocalReleases();
    const rawLimit = req.query.limit;

    if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
      return res.json({ versions });
    }

    const limit = parseInt(rawLimit, 10);
    if (isNaN(limit) || limit < 0) {
      return res.json({ versions });
    }

    const capped = Math.min(limit, MAX_RELEASE_LIMIT);
    res.json({ versions: versions.slice(0, capped) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- GET /api/settings ---
// Returns API-key status only. Secret values are never returned to the browser.
app.get('/api/settings', (req, res) => {
  res.json(getApiKeyStatuses());
});

// --- PUT /api/settings/api-keys ---
// Body: { provider: string, apiKey?: string }
// Saves or removes the selected provider key and updates process.env immediately.
app.put('/api/settings/api-keys', async (req, res) => {
  const { provider, apiKey } = req.body ?? {};
  try {
    const settings = await persistApiKey(provider, apiKey);
    res.json({ ok: true, ...settings });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// --- POST /api/settings/api-keys/test ---
// Body: { provider: string, apiKey: string }
// Tests the entered key without saving it.
app.post('/api/settings/api-keys/test', async (req, res) => {
  const { provider, apiKey } = req.body ?? {};
  try {
    const result = await testProviderApiKey(provider, apiKey);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err.code === 'API_KEY_MISSING') {
      return res.status(400).json({ ok: false, status: 'missing', error: err.message });
    }
    if (err.code === 'API_KEY_INVALID') {
      return res.status(400).json({ ok: false, status: 'invalid', error: err.message });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({ ok: false, status: 'invalid', error: err.message });
    }
    res.status(502).json({ ok: false, status: 'invalid', error: err.message });
  }
});

// --- GET /api/models?provider=X ---
// Returns a sorted list of model IDs for the given provider
app.get('/api/models', async (req, res) => {
  const provider = req.query.provider;

  try {
    const models = await fetchProviderModels(provider);
    return res.json({ models });
  } catch (err) {
    if (isApiKeyError(err)) {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'API_KEY_INVALID') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(err.statusCode === 400 ? 400 : 502).json({ error: err.message });
  }
});

// --- POST /api/fetch ---
// Body: { count: number }
// Fetches up to N additional unseen releases and returns progress log
app.post('/api/fetch', async (req, res) => {
  const count = parseInt(req.body?.count, 10);
  if (isNaN(count) || count < 1 || count > 50) {
    return res.status(400).json({ error: 'count must be a number between 1 and 50' });
  }

  const log = [];
  try {
    const fetched = await runPipeline(count, (msg) => log.push(msg));
    res.json({ ok: true, fetched, log });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, log });
  }
});

// --- GET /api/release-data/:version ---
// Returns structured release data for the modal view
app.get('/api/release-data/:version', async (req, res) => {
  const { version } = req.params;
  if (!SAFE_VERSION.test(version)) {
    return res.status(400).json({ error: `Invalid version string: ${version}` });
  }

  const filePath = join(DATA_DIR, `${version}.json`);
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: `No data found for version ${version}.` });
    }
    return res.status(500).json({ error: err.message });
  }

  const data = JSON.parse(raw);
  const sections = (data.parsed?.sections || [])
    .map((section) => ({
      title: section.title,
      items: section.items.map((item) => {
        let text = item.rawText;
        const componentMatch = text.match(/^\*\*([^*]+?):\*\*\s*/);
        const component = componentMatch ? componentMatch[1] : null;
        if (componentMatch) text = text.slice(componentMatch[0].length);
        text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        text = text.replace(/\s*\(#\d+\)/g, '');
        text = text.replace(/\s*\([a-f0-9]{7,}\)/g, '');
        return {
          prNumber: item.prNumber,
          commitSha: item.commitSha,
          description: text.trim(),
          component,
        };
      }),
    }))
    .filter((section) => section.items.length > 0);

  res.json({
    version,
    tagName: data.release?.tag_name || `n8n@${version}`,
    publishedAt: data.release?.published_at || null,
    htmlUrl: data.release?.html_url || null,
    sections,
  });
});

// --- POST /api/explain-item ---
// Fetches PR/commit context from GitHub and generates an AI explanation
app.post('/api/explain-item', async (req, res) => {
  const { version, prNumber, commitSha, provider, model } = req.body ?? {};

  if (!version || !SAFE_VERSION.test(version)) {
    return res.status(400).json({ error: 'A valid version is required.' });
  }
  if (!provider) {
    return res.status(400).json({ error: 'provider is required.' });
  }
  if (!model) {
    return res.status(400).json({ error: 'model is required.' });
  }
  if (!prNumber && !commitSha) {
    return res.status(400).json({ error: 'At least one of prNumber or commitSha is required.' });
  }

  try {
    const explanation = await explainItem(version, prNumber || null, commitSha || null, provider, model);
    res.json({ explanation });
  } catch (err) {
    if (isApiKeyError(err)) {
      return res.status(400).json({ error: err.message });
    }
    res.status(502).json({ error: `AI API error: ${err.message}` });
  }
});

// --- POST /api/release-chat ---
// Answers follow-up questions about a selected release item.
app.post('/api/release-chat', async (req, res) => {
  const validation = validateReleaseChatRequest(req.body ?? {});
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const answer = await answerReleaseChat(validation.value);
    res.json({ answer });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (isApiKeyError(err)) {
      return res.status(400).json({ error: err.message });
    }
    res.status(502).json({ error: `AI API error: ${err.message}` });
  }
});

// --- POST /api/social-summary ---
// Body: { versions: string[], provider: string, model: string, userDirection?: string }
// Reads md files and calls the selected provider to generate a social summary
app.post('/api/social-summary', async (req, res) => {
  const { versions, provider, model, userDirection } = req.body ?? {};
  const trimmedUserDirection = typeof userDirection === 'string' ? userDirection.trim() : '';

  if (!Array.isArray(versions) || versions.length === 0) {
    return res.status(400).json({ error: 'versions must be a non-empty array' });
  }
  if (!provider) {
    return res.status(400).json({ error: 'provider is required' });
  }
  if (!model) {
    return res.status(400).json({ error: 'model is required' });
  }

  // Validate each version string before using it in file paths
  for (const v of versions) {
    if (!SAFE_VERSION.test(v)) {
      return res.status(400).json({ error: `Invalid version string: ${v}` });
    }
  }

  // Read all markdown files
  const mdContents = [];
  for (const version of versions) {
    const filePath = join(OUTPUT_DIR, `${version}.md`);
    try {
      const content = await readFile(filePath, 'utf8');
      mdContents.push(content);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: `No summary found for version ${version}. Run the pipeline first.` });
      }
      throw err;
    }
  }

  try {
    const summary = await generateSocialSummary(
      mdContents,
      versions,
      provider,
      model,
      trimmedUserDirection,
    );
    res.json({ summary });
  } catch (err) {
    if (isApiKeyError(err)) {
      return res.status(400).json({ error: err.message });
    }
    res.status(502).json({ error: `AI API error: ${err.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
