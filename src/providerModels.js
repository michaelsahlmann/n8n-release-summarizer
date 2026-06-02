import { AI_PROVIDERS, getApiKey, getProviderLabel } from './apiKeySettings.js';

function buildProviderApiError(provider, status, text) {
  const label = getProviderLabel(provider);
  const error = new Error(`${label} rejected the API key.`);
  error.code = status === 401 || status === 403 ? 'API_KEY_INVALID' : 'PROVIDER_API_ERROR';
  error.statusCode = status;
  error.provider = provider;
  error.details = text;
  return error;
}

async function readErrorText(response) {
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || JSON.stringify(data);
  } catch {
    return response.text();
  }
}

async function fetchJson(response, provider) {
  if (!response.ok) {
    const text = await readErrorText(response);
    throw buildProviderApiError(provider, response.status, text);
  }

  return response.json();
}

export async function fetchProviderModels(provider, options = {}) {
  if (!AI_PROVIDERS.has(provider)) {
    const error = new Error(`Unknown provider: ${provider}`);
    error.statusCode = 400;
    throw error;
  }

  const apiKey = options.apiKey ?? getApiKey(provider);
  const fetchImpl = options.fetchImpl ?? fetch;

  if (provider === 'anthropic') {
    const response = await fetchImpl('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    const data = await fetchJson(response, provider);
    return (data.data || []).map((model) => model.id).sort();
  }

  if (provider === 'openai') {
    const response = await fetchImpl('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await fetchJson(response, provider);
    return (data.data || [])
      .map((model) => model.id)
      .filter((id) => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3'))
      .sort();
  }

  if (provider === 'gemini') {
    const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey },
    });
    const data = await fetchJson(response, provider);
    return (data.models || [])
      .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
      .map((model) => model.name.replace('models/', ''))
      .sort();
  }

  if (provider === 'groq') {
    const response = await fetchImpl('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await fetchJson(response, provider);
    return (data.data || [])
      .map((model) => model.id)
      .sort();
  }

  return [];
}

export async function testProviderApiKey(provider, apiKey, options = {}) {
  if (!AI_PROVIDERS.has(provider)) {
    const error = new Error(`Unknown provider: ${provider}`);
    error.statusCode = 400;
    throw error;
  }

  const enteredValue = typeof apiKey === 'string' ? apiKey.trim() : '';
  const value = enteredValue || getApiKey(provider);

  const models = await fetchProviderModels(provider, {
    apiKey: value,
    fetchImpl: options.fetchImpl,
  });

  return {
    status: 'configured',
    modelCount: models.length,
  };
}
