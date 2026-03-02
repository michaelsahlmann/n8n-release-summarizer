import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
  const versionLabel = versions.join(', ');

  const combinedContent = mdContents
    .map((md, i) => `--- Release: ${versions[i]} ---\n\n${md}`)
    .join('\n\n');

  const prompt = `You are writing a "what's new" update for the n8n community newsletter and social media.
Audience: technical workflow builders (developers, power users).

INCLUDE: new nodes or operations, new workflow/trigger features, AI capabilities, user-visible bug fixes (editor bugs, broken outputs, data loss risks), visible performance improvements, new user-facing settings.

SKIP: CI config, test infra, linting, build tooling, internal refactors with no user effect, lines containing "(no-changelog)", dependency bumps, items prefixed with \`chore:\`, \`ci:\`, \`test:\`, \`refactor:\` unless the description clearly describes something the user would see.

FORMAT: One short paragraph intro (2-3 sentences), then 5–10 bullets — each one plain sentence. No section headers. No PR numbers or commit links. Under 300 words total.

Here is the release content for ${versionLabel}:

${combinedContent}`;

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
