/**
 * Parse an n8n release body into structured sections.
 *
 * n8n auto-generates release notes in this format:
 *   ## Bug Fixes
 *   * **component:** Description (#12345) (abc1234)
 *
 * Returns:
 *   {
 *     sections: [{ title: string, items: [{ prNumber, commitSha, rawText }] }],
 *     allPRs: Set<number>,
 *     allSHAs: Set<string>
 *   }
 */
export function parseRefs(body) {
  if (!body) return { sections: [], allPRs: new Set(), allSHAs: new Set() };

  const lines = body.split('\n');
  const sections = [];
  let current = null;

  const allPRs = new Set();
  const allSHAs = new Set();

  for (const line of lines) {
    // Section header: ## Bug Fixes / ## Features / ## Performance Improvements etc.
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      current = { title: headerMatch[1].trim(), items: [] };
      sections.push(current);
      continue;
    }

    // Bullet item line
    const bulletMatch = line.match(/^\s*\*\s+(.+)/);
    if (!bulletMatch || !current) continue;

    const rawText = bulletMatch[1];

    // Extract PR number: (#12345) or [#12345]
    const prMatches = [...rawText.matchAll(/#(\d{4,6})/g)];
    const prNumber = prMatches.length > 0 ? parseInt(prMatches[0][1], 10) : null;

    // Extract commit SHA: a 7-40 char hex string in a markdown link (commit hash)
    // Pattern: ([abc1234](https://github.com/...commit/...))
    const shaMatches = [...rawText.matchAll(/\[([a-f0-9]{7,40})\]\(https:\/\/github\.com[^)]+commit[^)]+\)/g)];
    const commitSha = shaMatches.length > 0 ? shaMatches[0][1] : null;

    if (prNumber) allPRs.add(prNumber);
    if (commitSha) allSHAs.add(commitSha);

    current.items.push({ prNumber, commitSha, rawText });
  }

  return { sections, allPRs, allSHAs };
}
