import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateAIText } from './aiProvider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROMPT_TEMPLATE_PATH = join(ROOT, 'references', 'social-summary-prompt.md');
const TEMPLATE_ERROR =
  'Social summary prompt template must include {{version_label}}, {{release_content}}, and {{user_direction}}';
const DEFAULT_USER_DIRECTION = 'No extra user direction was provided.';

export function buildSocialSummaryPrompt(template, mdContents, versions, userDirection = '') {
  if (
    !template.includes('{{version_label}}') ||
    !template.includes('{{release_content}}') ||
    !template.includes('{{user_direction}}')
  ) {
    throw new Error(TEMPLATE_ERROR);
  }

  const versionLabel = versions.join(', ');
  const direction = typeof userDirection === 'string' ? userDirection.trim() : '';
  const userDirectionText = direction || DEFAULT_USER_DIRECTION;
  const combinedContent = mdContents
    .map((md, i) => `--- Release: ${versions[i]} ---\n\n${md}`)
    .join('\n\n');

  return template
    .replaceAll('{{version_label}}', versionLabel)
    .replaceAll('{{user_direction}}', userDirectionText)
    .replaceAll('{{release_content}}', combinedContent);
}

/**
 * Generate a social-media-ready summary from one or more release markdown files.
 *
 * @param {string[]} mdContents  Array of markdown strings, one per release
 * @param {string[]} versions    Matching version labels (same order as mdContents)
 * @param {string}   provider    'anthropic' | 'openai' | 'gemini' | 'groq'
 * @param {string}   model       Model ID to use
 * @param {string}   userDirection Optional user-provided focus direction
 * @returns {Promise<string>}    Plain-text summary suitable for newsletter/social
 */
export async function generateSocialSummary(
  mdContents,
  versions,
  provider,
  model,
  userDirection = '',
) {
  let template;
  try {
    template = await readFile(PROMPT_TEMPLATE_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      'Social summary prompt template could not be read from references/social-summary-prompt.md',
    );
  }

  const prompt = buildSocialSummaryPrompt(template, mdContents, versions, userDirection);

  return generateAIText({
    provider,
    model,
    maxTokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
}
