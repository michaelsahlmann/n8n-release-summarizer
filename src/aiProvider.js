import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_PROVIDERS, getApiKey } from './apiKeySettings.js';

export { AI_PROVIDERS };

function normalizeMessages(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: String(message.content ?? ''),
  }));
}

function buildGeminiPrompt(system, messages) {
  const parts = [];
  if (system) {
    parts.push(`System instructions:\n${system}`);
  }

  for (const message of messages) {
    const label = message.role === 'assistant' ? 'Assistant' : 'User';
    parts.push(`${label}:\n${message.content}`);
  }

  return parts.join('\n\n---\n\n');
}

export async function generateAIText({
  provider,
  model,
  messages,
  system = '',
  maxTokens = 1024,
}) {
  if (!AI_PROVIDERS.has(provider)) {
    throw new Error(`Unknown provider: ${provider}. Must be 'anthropic', 'openai', 'gemini', or 'groq'.`);
  }

  const normalizedMessages = normalizeMessages(messages);

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: getApiKey(provider) });
    const msg = await client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: normalizedMessages,
    });
    return msg.content?.[0]?.text ?? '';
  }

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey: getApiKey(provider) });
    const res = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...normalizedMessages,
      ],
    });
    return res.choices?.[0]?.message?.content ?? '';
  }

  if (provider === 'groq') {
    const client = new OpenAI({ apiKey: getApiKey(provider), baseURL: 'https://api.groq.com/openai/v1' });
    const res = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...normalizedMessages,
      ],
    });
    return res.choices?.[0]?.message?.content ?? '';
  }

  const genAI = new GoogleGenerativeAI(getApiKey(provider));
  const gemModel = genAI.getGenerativeModel({ model });
  const result = await gemModel.generateContent(buildGeminiPrompt(system, normalizedMessages));
  return result.response.text();
}
