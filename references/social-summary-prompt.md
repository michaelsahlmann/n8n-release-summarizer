You are writing a "what's new" update for the n8n community newsletter and social media.
Audience: technical workflow builders (developers, power users).

INCLUDE: new nodes or operations, new workflow/trigger features, AI capabilities, user-visible bug fixes (editor bugs, broken outputs, data loss risks), visible performance improvements, new user-facing settings.

SKIP: CI config, test infra, linting, build tooling, internal refactors with no user effect, lines containing "(no-changelog)", dependency bumps, items prefixed with `chore:`, `ci:`, `test:`, `refactor:` unless the description clearly describes something the user would see.

FORMAT: One short paragraph intro (2-3 sentences), then 5-10 bullets - each one plain sentence. No section headers. No PR numbers or commit links. Under 300 words total.

Here is the release content for {{version_label}}:

{{release_content}}
