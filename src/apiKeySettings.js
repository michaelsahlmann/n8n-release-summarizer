import 'dotenv/config';
import { readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

export const DEFAULT_ENV_PATH = join(ROOT, '.env');

export const API_KEY_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', envName: 'ANTHROPIC_API_KEY' },
  { id: 'openai', label: 'OpenAI', envName: 'OPENAI_API_KEY' },
  { id: 'gemini', label: 'Gemini', envName: 'GEMINI_API_KEY' },
  { id: 'groq', label: 'Groq', envName: 'GROQ_API_KEY' },
];

export const AI_PROVIDERS = new Set(API_KEY_PROVIDERS.map((provider) => provider.id));

function getProviderConfig(provider) {
  const config = API_KEY_PROVIDERS.find((item) => item.id === provider);
  if (!config) {
    throw new Error(`Unknown provider: ${provider}. Must be 'anthropic', 'openai', 'gemini', or 'groq'.`);
  }
  return config;
}

function getEnvPath(envPath = DEFAULT_ENV_PATH) {
  return envPath;
}

function buildMissingApiKeyError(config) {
  const error = new Error(`Add the ${config.label} API key to load models.`);
  error.code = 'API_KEY_MISSING';
  error.provider = config.id;
  return error;
}

export function isApiKeyError(error) {
  return error?.code === 'API_KEY_MISSING';
}

export function getApiKey(provider) {
  const config = getProviderConfig(provider);
  const apiKey = process.env[config.envName]?.trim();
  if (!apiKey) {
    throw buildMissingApiKeyError(config);
  }
  return apiKey;
}

export function getApiKeyStatuses() {
  return {
    apiKeys: Object.fromEntries(
      API_KEY_PROVIDERS.map((provider) => {
        const configured = Boolean(process.env[provider.envName]?.trim());
        return [
          provider.id,
          {
            label: provider.label,
            configured,
            status: configured ? 'configured' : 'missing',
          },
        ];
      }),
    ),
  };
}

function quoteEnvValue(value) {
  if (/^[A-Za-z0-9_./:@+=-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function updateEnvContent(raw, envName, value) {
  const lineEnding = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw ? raw.split(/\r?\n/) : [];
  const keyPattern = new RegExp(`^\\s*${envName}\\s*=`);
  let replaced = false;
  const nextLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line && index === lines.length - 1) {
      continue;
    }

    if (keyPattern.test(line)) {
      if (!value || replaced) {
        continue;
      }
      nextLines.push(`${envName}=${quoteEnvValue(value)}`);
      replaced = true;
      continue;
    }

    nextLines.push(line);
  }

  if (value && !replaced) {
    nextLines.push(`${envName}=${quoteEnvValue(value)}`);
  }

  return nextLines.length > 0 ? `${nextLines.join(lineEnding)}${lineEnding}` : '';
}

export async function persistApiKey(provider, apiKey, options = {}) {
  const config = getProviderConfig(provider);
  const envPath = getEnvPath(options.envPath);
  const value = typeof apiKey === 'string' ? apiKey.trim() : '';

  let raw = '';
  try {
    raw = await readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const nextContent = updateEnvContent(raw, config.envName, value);
  await writeFile(envPath, nextContent, 'utf8');

  if (value) {
    process.env[config.envName] = value;
  } else {
    delete process.env[config.envName];
  }

  return getApiKeyStatuses();
}

export function getProviderLabel(provider) {
  return getProviderConfig(provider).label;
}
