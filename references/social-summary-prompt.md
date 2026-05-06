You are writing a "what's new" update for the n8n community newsletter and social media.

Treat the user's direction as the preferred focus for the summary. If it conflicts with the include, skip, or format rules below, prioritize the user's direction and apply the other rules as secondary guidelines.

<audience>
Technical workflow builders (developers, power users).
</audience>

<user_direction>
{{user_direction}}
</user_direction>

<include>
new nodes or operations, new workflow/trigger features, AI capabilities, user-visible bug fixes (editor bugs, broken outputs, data loss risks), visible performance improvements, new user-facing settings.
</include>

<skip>
CI config, test infra, linting, build tooling, internal refactors with no user effect, lines containing "(no-changelog)", dependency bumps, items prefixed with `chore:`, `ci:`, `test:`, `refactor:` unless the description clearly describes something the user would see.
</skip>

<format>
One short paragraph intro (2-3 sentences), then 5-10 bullets - each one plain sentence. No section headers. No PR numbers or commit links. Under 300 words total.
</format>

Here is the release content for {{version_label}}:

<release_content>
{{release_content}}
</release_content>