import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSocialSummaryPrompt } from '../src/socialSummarize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROMPT_TEMPLATE_PATH = join(ROOT, 'references', 'social-summary-prompt.md');

test('buildSocialSummaryPrompt replaces placeholders with versions and release content', () => {
  const template = 'Versions: {{version_label}}\n\n{{release_content}}';
  const prompt = buildSocialSummaryPrompt(template, ['First body', 'Second body'], ['2.9.4', '2.10.2']);

  assert.match(prompt, /Versions: 2\.9\.4, 2\.10\.2/);
  assert.match(prompt, /--- Release: 2\.9\.4 ---\n\nFirst body/);
  assert.match(prompt, /--- Release: 2\.10\.2 ---\n\nSecond body/);
});

test('buildSocialSummaryPrompt throws if version placeholder is missing', () => {
  assert.throws(
    () => buildSocialSummaryPrompt('{{release_content}}', ['Body'], ['2.9.4']),
    /must include \{\{version_label\}\} and \{\{release_content\}\}/,
  );
});

test('buildSocialSummaryPrompt throws if release content placeholder is missing', () => {
  assert.throws(
    () => buildSocialSummaryPrompt('{{version_label}}', ['Body'], ['2.9.4']),
    /must include \{\{version_label\}\} and \{\{release_content\}\}/,
  );
});

test('social summary prompt template includes both required placeholders', async () => {
  const template = await readFile(PROMPT_TEMPLATE_PATH, 'utf8');

  assert.match(template, /\{\{version_label\}\}/);
  assert.match(template, /\{\{release_content\}\}/);
});
