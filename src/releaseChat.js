import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AI_PROVIDERS, generateAIText } from './aiProvider.js';
import { gatherItemContext } from './explainItem.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const SAFE_VERSION = /^[\w.\-]+$/;
const SAFE_SHA = /^[a-f0-9]{7,40}$/i;
const MAX_CHAT_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;
const MAX_TOTAL_MESSAGE_CHARS = 8000;
const MAX_RELEASE_DIGEST_CHARS = 12000;

function stripReleaseText(value) {
  return String(value ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePrNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : NaN;
}

function normalizeCommitSha(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value);
}

function findSelectedItem(sections, prNumber, commitSha) {
  for (const section of sections) {
    const item = section.items?.find(
      (candidate) =>
        (prNumber && candidate.prNumber === prNumber) ||
        (commitSha && candidate.commitSha === commitSha),
    );

    if (item) {
      return { sectionTitle: section.title, item };
    }
  }

  return null;
}

export function validateReleaseChatRequest(body) {
  const version = body?.version;
  if (!version || typeof version !== 'string' || !SAFE_VERSION.test(version)) {
    return { error: 'A valid version is required.' };
  }

  const provider = body?.provider;
  if (!provider || !AI_PROVIDERS.has(provider)) {
    return { error: "provider must be 'anthropic', 'openai', or 'gemini'." };
  }

  const model = body?.model;
  if (!model || typeof model !== 'string') {
    return { error: 'model is required.' };
  }

  const prNumber = parsePrNumber(body?.prNumber);
  if (Number.isNaN(prNumber)) {
    return { error: 'prNumber must be a positive number when provided.' };
  }

  const commitSha = normalizeCommitSha(body?.commitSha);
  if (commitSha && !SAFE_SHA.test(commitSha)) {
    return { error: 'commitSha must be a valid 7 to 40 character SHA.' };
  }

  if (!prNumber && !commitSha) {
    return { error: 'At least one of prNumber or commitSha is required.' };
  }

  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return { error: 'messages must be a non-empty array.' };
  }

  if (body.messages.length > MAX_CHAT_MESSAGES) {
    return { error: `messages cannot include more than ${MAX_CHAT_MESSAGES} entries.` };
  }

  let totalChars = 0;
  const messages = [];
  for (const message of body.messages) {
    if (!message || !['user', 'assistant'].includes(message.role)) {
      return { error: "Each message role must be 'user' or 'assistant'." };
    }

    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (!content) {
      return { error: 'Each message must include content.' };
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return { error: `Each message must be ${MAX_MESSAGE_CHARS} characters or fewer.` };
    }

    totalChars += content.length;
    messages.push({ role: message.role, content });
  }

  if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
    return { error: `messages must be ${MAX_TOTAL_MESSAGE_CHARS} total characters or fewer.` };
  }

  if (messages[messages.length - 1].role !== 'user') {
    return { error: 'The latest message must be from the user.' };
  }

  return {
    value: {
      version,
      provider,
      model,
      prNumber,
      commitSha,
      messages,
    },
  };
}

export function buildReleaseDigest(data, version, prNumber, commitSha) {
  const sections = data?.parsed?.sections?.filter((section) => section.items?.length > 0) ?? [];
  if (sections.length === 0) {
    return '';
  }

  const release = data?.release ?? {};
  const selected = findSelectedItem(sections, prNumber, commitSha);
  const lines = [
    `Release: ${release.tag_name || `n8n@${version}`}`,
    `Published: ${release.published_at || 'unknown'}`,
    `Prerelease: ${release.prerelease === true ? 'yes' : 'no'}`,
    '',
    'Section counts:',
    ...sections.map((section) => `- ${stripReleaseText(section.title)}: ${section.items.length} item(s)`),
  ];

  if (selected) {
    lines.push(
      '',
      'Selected release item:',
      `- Section: ${stripReleaseText(selected.sectionTitle)}`,
      `- Text: ${stripReleaseText(selected.item.rawText)}`,
    );
  }

  lines.push('', 'Release items:');
  let digest = lines.join('\n');

  for (const section of sections) {
    const sectionLines = [`\n## ${stripReleaseText(section.title)}`];
    for (const item of section.items) {
      sectionLines.push(`- ${stripReleaseText(item.rawText)}`);
    }

    const nextDigest = `${digest}\n${sectionLines.join('\n')}`;
    if (nextDigest.length > MAX_RELEASE_DIGEST_CHARS) {
      return `${digest}\n\n[Additional release items omitted to keep the chat context short.]`;
    }

    digest = nextDigest;
  }

  return digest;
}

export function buildReleaseChatSystemPrompt({ version, itemContextParts, releaseDigest }) {
  const itemContext = itemContextParts.length > 0
    ? itemContextParts.join('\n\n---\n\n')
    : 'No detailed PR or commit context was available.';

  return `You are helping a workflow builder understand changes in n8n ${version}.

Answer follow-up questions about the selected release item and the surrounding release.
Use plain language, be concrete, and keep answers concise.
If the context does not prove something, say what is known and what is uncertain.
Do not invent product behavior that is not supported by the context.

Selected item context:
---
${itemContext}
---

Release context:
---
${releaseDigest || 'No broader release context was available.'}
---`;
}

async function readReleaseData(version) {
  try {
    const raw = await readFile(join(DATA_DIR, `${version}.json`), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function answerReleaseChat({ version, prNumber, commitSha, provider, model, messages }) {
  const data = await readReleaseData(version);
  const sections = data?.parsed?.sections?.filter((section) => section.items?.length > 0) ?? [];
  if (sections.length > 0 && !findSelectedItem(sections, prNumber, commitSha)) {
    const err = new Error('Selected release item was not found in local release data.');
    err.statusCode = 400;
    throw err;
  }

  const releaseDigest = buildReleaseDigest(data, version, prNumber, commitSha);

  let itemContextParts = [];
  try {
    itemContextParts = await gatherItemContext(version, prNumber, commitSha);
  } catch (err) {
    if (!releaseDigest) {
      throw err;
    }
  }

  const system = buildReleaseChatSystemPrompt({
    version,
    itemContextParts,
    releaseDigest,
  });

  return generateAIText({
    provider,
    model,
    system,
    maxTokens: 768,
    messages,
  });
}
