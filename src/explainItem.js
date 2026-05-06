import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchPR } from './fetchDetails.js';
import { ghFetch } from './api.js';
import { generateAIText } from './aiProvider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

export function buildExplainPrompt(contextParts) {
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

export async function gatherItemContext(version, prNumber, commitSha) {
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

  return contextParts;
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
  const contextParts = await gatherItemContext(version, prNumber, commitSha);
  const prompt = buildExplainPrompt(contextParts);
  return generateAIText({
    provider,
    model,
    maxTokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });
}
