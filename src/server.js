import 'dotenv/config';
import express from 'express';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runPipeline } from './pipeline.js';
import { generateSocialSummary } from './socialSummarize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'output');

const app = express();
app.use(express.json());
app.use(express.static(join(ROOT, 'public')));

console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET'}`);
console.log(`OPENAI_API_KEY:    ${process.env.OPENAI_API_KEY ? 'set' : 'NOT SET'}`);
console.log(`GEMINI_API_KEY:    ${process.env.GEMINI_API_KEY ? 'set' : 'NOT SET'}`);

// Validate that a version string is safe to use as a filename component
const SAFE_VERSION = /^[\w.\-]+$/;

// --- GET /api/releases ---
// Scans output/*.md and returns sorted version list (newest first)
app.get('/api/releases', async (req, res) => {
  try {
    const files = await readdir(OUTPUT_DIR);
    const versions = files
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    res.json({ versions });
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.json({ versions: [] });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// --- GET /api/models?provider=X ---
// Returns a sorted list of model IDs for the given provider
app.get('/api/models', async (req, res) => {
  const provider = req.query.provider;

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'ANTHROPIC_API_KEY not set' });
    try {
      const r = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      });
      const data = await r.json();
      const models = (data.data || []).map((m) => m.id).sort();
      return res.json({ models });
    } catch (err) {
      return res.status(502).json({ error: `Anthropic API error: ${err.message}` });
    }
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'OPENAI_API_KEY not set' });
    try {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await r.json();
      const models = (data.data || [])
        .map((m) => m.id)
        .filter((id) => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3'))
        .sort();
      return res.json({ models });
    } catch (err) {
      return res.status(502).json({ error: `OpenAI API error: ${err.message}` });
    }
  }

  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'GEMINI_API_KEY not set' });
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      const data = await r.json();
      const models = (data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => m.name.replace('models/', ''))
        .sort();
      return res.json({ models });
    } catch (err) {
      return res.status(502).json({ error: `Gemini API error: ${err.message}` });
    }
  }

  return res.status(400).json({ error: `Unknown provider: ${provider}` });
});

// --- POST /api/fetch ---
// Body: { count: number }
// Runs the pipeline and returns progress log
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

// --- POST /api/social-summary ---
// Body: { versions: string[], provider: string, model: string }
// Reads md files and calls the selected provider to generate a social summary
app.post('/api/social-summary', async (req, res) => {
  const { versions, provider, model } = req.body ?? {};

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
    const summary = await generateSocialSummary(mdContents, versions, provider, model);
    res.json({ summary });
  } catch (err) {
    if (/_API_KEY/.test(err.message)) {
      return res.status(500).json({ error: err.message });
    }
    res.status(502).json({ error: `AI API error: ${err.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
