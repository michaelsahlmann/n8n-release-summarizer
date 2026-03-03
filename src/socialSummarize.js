import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROMPT_TEMPLATE_PATH = join(ROOT, 'references', 'social-summary-prompt.md');
const TEMPLATE_ERROR =
  'Social summary prompt template must include {{version_label}} and {{release_content}}';

export function buildSocialSummaryPrompt(template, mdContents, versions) {
  if (
    !template.includes('{{version_label}}') ||
    !template.includes('{{release_content}}')
  ) {
    throw new Error(TEMPLATE_ERROR);
  }

  const versionLabel = versions.join(', ');
  const combinedContent = mdContents
    .map((md, i) => `--- Release: ${versions[i]} ---\n\n${md}`)
    .join('\n\n');

  return template
    .replaceAll('{{version_label}}', versionLabel)
    .replaceAll('{{release_content}}', combinedContent);
}

/**
 * Generate a social-media-ready summary from one or more release markdown files.
 *
 * @param {string[]} mdContents  Array of markdown strings, one per release
 * @param {string[]} versions    Matching version labels (same order as mdContents)
 * @param {string}   provider    'anthropic' | 'openai' | 'gemini'
 * @param {string}   model       Model ID to use
 * @returns {Promise<string>}    Plain-text summary suitable for newsletter/social
 */
export async function generateSocialSummary(mdContents, versions, provider, model) {
  let template;
  try {
    template = await readFile(PROMPT_TEMPLATE_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      'Social summary prompt template could not be read from references/social-summary-prompt.md',
    );
  }

  const prompt = buildSocialSummaryPrompt(template, mdContents, versions);

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set. Add it to your .env file.');
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return msg.content[0].text;
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set. Add it to your .env file.');
    const client = new OpenAI({ apiKey });
    const res = await client.chat.completions.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.choices[0].message.content;
  }

  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set. Add it to your .env file.');
    const genAI = new GoogleGenerativeAI(apiKey);
    const gemModel = genAI.getGenerativeModel({ model });
    const result = await gemModel.generateContent(prompt);
    return result.response.text();
  }

  throw new Error(`Unknown provider: ${provider}. Must be 'anthropic', 'openai', or 'gemini'.`);
}
