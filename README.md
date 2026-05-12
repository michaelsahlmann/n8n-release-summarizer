# n8n Release Summarizer

This project fetches n8n release information from GitHub and creates plain-language summaries.

It can be used from the command line or through a small local web app. The generated files are saved in:

- `data/` for raw release data
- `output/` for markdown summaries

## Requirements

- Node.js 18 or newer
- npm
- A GitHub token for higher GitHub API limits
- Optional API keys for AI-generated social summaries

## Setup

Install dependencies:

```bash
npm install
```

Copy the example environment file:

```bash
cp .env.example .env
```

Then add your own values to `.env`:

```bash
GITHUB_TOKEN=your_github_token_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

Do not commit `.env`. It is ignored by Git because it may contain private keys.

## Usage

Fetch releases and write local summary files:

```bash
npm start
```

Fetch a specific number of new releases:

```bash
npm start -- --count 10
```

Run the local web app:

```bash
npm run server
```

Then open:

```text
http://localhost:3000
```

## Testing

Run the test suite:

```bash
npm test
```

Check dependencies for known security issues:

```bash
npm audit --omit=dev
```

## Contributing

Contributions are welcome. Please read `CONTRIBUTING.md` before opening a pull request.

## License

MIT
