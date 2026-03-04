import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchPR } from './fetchDetails.js';
import { ghFetch } from './api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

function buildExplainPrompt(contextParts) {
  const context = contextParts.join('\n\n---\n\n');
  return `You are explaining an n8n platform change to a technical workflow builder who is not a core contributor.

Given the context below (a release note entry, PR description, and/or commit message), write a 2-4 sentence plain-language explanation of:
1. What was the problem or gap before this change
2. What this change does
3. How it affects someone using n8n day-to-day (if applicable)

Be concrete and specific. Avoid jargon like "refactor" or "serialize" without explaining what it means in practice. If the change is purely internal infrastructure with no user-visible effect, say so briefly.

Context:
---
${context}
---`;
}

async function callAI(prompt, provider, model) {
  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set. Add it to your .env file.');
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: 512,
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
      max_tokens: 512,
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

/**
 * Gather context for a single release item and generate an AI explanation.
 *
 * @param {string} version   Release version (e.g. "2.10.2")
 * @param {number|null} prNumber  PR/issue number (may be null)
 * @param {string|null} commitSha  Short commit SHA (may be null)
 * @param {string} provider  AI provider
 * @param {string} model     Model ID
 * @returns {Promise<string>}  Plain-language explanation
 */
export async function explainItem(version, prNumber, commitSha, provider, model) {
  const contextParts = [];

  // 1. Release note line from stored data
  try {
    const raw = await readFile(join(DATA_DIR, `${version}.json`), 'utf8');
    const data = JSON.parse(raw);
    const allItems = data.parsed.sections.flatMap((s) => s.items);
    const match = allItems.find(
      (i) =>
        (prNumber && i.prNumber === prNumber) ||
        (commitSha && i.commitSha === commitSha),
    );
    if (match) {
      contextParts.push(`Release note entry:\n${match.rawText}`);
    }
  } catch {
    // proceed without stored data
  }

  // 2. PR/issue details from GitHub
  if (prNumber) {
    try {
      const pr = await fetchPR(prNumber);
      if (pr) {
        contextParts.push(
          `PR #${pr.number}: ${pr.title}\n` +
            `Labels: ${pr.labels.join(', ') || 'none'}\n` +
            `URL: ${pr.html_url}\n` +
            `Body:\n${(pr.body || '').slice(0, 3000)}`,
        );
      }
    } catch {
      // proceed without PR details
    }
  }

  // 3. Commit details from GitHub
  if (commitSha) {
    try {
      const commit = await ghFetch(`/repos/n8n-io/n8n/commits/${commitSha}`);
      if (commit) {
        contextParts.push(
          `Commit ${commit.sha?.slice(0, 7)}:\n${commit.commit?.message || ''}`,
        );
      }
    } catch {
      // proceed without commit details
    }
  }

  if (contextParts.length === 0) {
    throw new Error('No context could be gathered for this item.');
  }

  const prompt = buildExplainPrompt(contextParts);
  return callAI(prompt, provider, model);
}
