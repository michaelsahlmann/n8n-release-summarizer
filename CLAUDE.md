# Project

Fetches n8n release data from GitHub and produces:
- Per-version markdown summaries in `output/`
- Raw JSON data in `data/`
- AI-generated social media summaries (via Anthropic, OpenAI, or Gemini)

Target audience: technical workflow builders. Prefer plain language over jargon.

# Architecture

Two entry points share the same pipeline modules:

**CLI** (`src/index.js`): runs the pipeline and exits.
**Web server** (`src/server.js`): Express on port 3000, serves `public/index.html` and REST endpoints.

Core modules in `src/`:
- `pipeline.js` — orchestrates the full workflow
- `api.js` — GitHub API wrapper with retry logic
- `fetchReleases.js` — fetches the next N unfetched releases from GitHub, including prereleases
- `parseRelease.js` — extracts PR refs and commit SHAs from release markdown
- `fetchCompare.js` — gets full commit list between two release tags
- `fetchDetails.js` — fetches PR/issue titles, bodies, and labels
- `summarize.js` — builds markdown summaries; writes to `output/` and `data/`
- `socialSummarize.js` — calls AI providers to generate social copy

# How to Run

**CLI** (fetches additional releases, writes files, exits):
```bash
npm start              # default: 5 releases
npm start -- --count 10
```

**Web server** (interactive UI + REST API):
```bash
npm run server   # http://localhost:3000
```

API endpoints: `GET /api/releases`, `GET /api/models?provider=X`, `POST /api/fetch`, `POST /api/social-summary`

# Environment Variables

Copy `.env.example` to `.env` and fill in:
- `GITHUB_TOKEN` — required for higher rate limits
- `ANTHROPIC_API_KEY` — for Claude-based social summaries
- `OPENAI_API_KEY` — for GPT-based social summaries
- `GEMINI_API_KEY` — for Gemini-based social summaries

# Output

- `data/{version}.json` — raw release, parsed refs, and commit data
- `output/{version}.md` — formatted markdown summary

Repeated fetches are incremental against the local `output/` cache. Existing summaries are skipped, and prereleases are still eligible to be fetched.

# Gotchas

- The GitHub comparison URL is useful for catching commits not mentioned in the release body (e.g. `https://github.com/n8n-io/n8n/compare/n8n%402.9.4...release/2.10.2`)
- The pipeline orders releases oldest-first internally (for previous-version lookup); the web UI displays newest-first.

# References

- `references/server-management.md` — use this whenever you need to start, stop, restart, or verify the dev server. Covers the correct PowerShell-based kill commands required on this Windows machine.
