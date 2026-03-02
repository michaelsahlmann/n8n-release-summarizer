# Project

Extract n8n release data from GitHub (issues, commits) to summarize updates per release.

# How It Works

1. Fetch releases from https://github.com/n8n-io/n8n/releases
2. Collect linked issues and commits from each release description
3. Store data and write a per-version summary

# Gotchas

- The comparison URL is also useful (e.g. `https://github.com/n8n-io/n8n/compare/n8n%402.9.4...release/2.10.2`)
- Audience is technical but prefer plain language over jargon

# References

- `references/server-management.md` — use this whenever you need to start, stop, restart, or verify the dev server. Covers the correct PowerShell-based kill commands required on this Windows machine.