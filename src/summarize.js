import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * Build a plain-language markdown summary for a single release.
 *
 * @param {object} release    Raw release object from GitHub API
 * @param {object} parsed     Output of parseRefs(release.body)
 * @param {Map}    prDetails  Map<number, PR object> from fetchPRs
 * @param {Array}  commits    Commit list from fetchCompare
 */
export async function buildSummary(release, parsed, prDetails, commits) {
  const version = release.tag_name.replace(/^n8n@/, '');
  const date = release.published_at?.slice(0, 10) ?? 'unknown';

  // Build a lookup: shortSha → commit, for fallback descriptions
  const commitBySha = new Map();
  for (const c of commits) {
    commitBySha.set(c.shortSha, c);
    commitBySha.set(c.sha, c);
  }

  // Track which SHAs were mentioned in release body sections (to detect "other" commits)
  const bodySHAs = new Set();
  for (const section of parsed.sections) {
    for (const item of section.items) {
      if (item.commitSha) bodySHAs.add(item.commitSha);
    }
  }

  // --- Format each section ---
  const sectionLines = [];

  for (const section of parsed.sections) {
    if (section.items.length === 0) continue;
    sectionLines.push(`## ${section.title}`);

    for (const item of section.items) {
      const line = formatItem(item, prDetails, commitBySha);
      sectionLines.push(`- ${line}`);
    }

    sectionLines.push('');
  }

  // --- Detect commits not mentioned in release body ---
  const bodyPRs = parsed.allPRs;
  const extraCommits = commits.filter((c) => {
    // Skip if this commit's SHA appears in the body
    if (bodySHAs.has(c.shortSha) || bodySHAs.has(c.sha)) return false;
    // Skip merge commits and version bumps
    const msg = c.message.toLowerCase();
    if (msg.startsWith('merge ') || msg.includes('chore(release)')) return false;
    // Skip if PR number from commit message already appears in body
    const prRef = c.message.match(/#(\d{4,6})/);
    if (prRef && bodyPRs.has(parseInt(prRef[1], 10))) return false;
    return true;
  });

  if (extraCommits.length > 0) {
    sectionLines.push('## Other Changes (from commit history)');
    for (const c of extraCommits) {
      const firstLine = c.message.split('\n')[0].trim();
      sectionLines.push(`- ${firstLine} ([${c.shortSha}](${c.html_url}))`);
    }
    sectionLines.push('');
  }

  // --- Assemble final markdown ---
  const md = [
    `# n8n ${release.tag_name} — Release Summary`,
    `**Released:** ${date}`,
    '',
    ...sectionLines,
  ].join('\n');

  // --- Write files ---
  const dataDir = join(ROOT, 'data');
  const outputDir = join(ROOT, 'output');
  await mkdir(dataDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const rawData = { release, parsed: { ...parsed, allPRs: [...parsed.allPRs], allSHAs: [...parsed.allSHAs] }, commits };
  await writeFile(join(dataDir, `${version}.json`), JSON.stringify(rawData, null, 2));
  await writeFile(join(outputDir, `${version}.md`), md);

  return { version, prCount: bodyPRs.size, commitCount: commits.length };
}

/**
 * Format a single release-body item into a readable line.
 * Priority: PR title > raw text from body > commit message
 */
function formatItem(item, prDetails, commitBySha) {
  const pr = item.prNumber ? prDetails.get(item.prNumber) : null;
  const commit = item.commitSha
    ? commitBySha.get(item.commitSha) ?? commitBySha.get(item.commitSha?.slice(0, 7))
    : null;

  // Determine the label (PR title beats raw body text)
  let label = pr?.title ?? stripMarkdownLinks(item.rawText);

  // Build the PR link suffix
  const prLink = pr
    ? ` ([#${pr.number}](${pr.html_url}))`
    : item.prNumber
    ? ` (#${item.prNumber})`
    : '';

  // Append commit message snippet if PR body is sparse (< 50 chars)
  let extra = '';
  const prBody = (pr?.body ?? '').trim();
  if (prBody.length < 50 && commit) {
    const snippet = commit.message.split('\n')[0].trim();
    if (snippet && snippet !== label) {
      extra = ` — ${snippet}`;
    }
  }

  return `${label}${prLink}${extra}`;
}

/** Strip markdown links from a string, keeping only display text. */
function stripMarkdownLinks(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [text](url) → text
    .replace(/\(#\d+\)/g, '')                  // (#12345) → ''
    .replace(/\s+/g, ' ')
    .trim();
}
