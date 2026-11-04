import type { ModeloIA, ProvedorIA, ConfiguracaoIA } from './types';
import { validateOllamaEndpoint } from './aiConfig';

const REQUEST_TIMEOUT_MS = 45_000;

// Catálogo atualizado de modelos por provedor
export const MODELOS_IA: Record<ProvedorIA, ModeloIA[]> = {
  groq: [
    { id: 'llama-3.3-70b-versatile', nome: 'Llama 3.3 70B', livre: true, descricao: 'Modelo rápido e gratuito da Groq' },
    { id: 'llama-3.1-8b-instant', nome: 'Llama 3.1 8B Instant', livre: true, descricao: 'Leve e gratuito' },
    { id: 'gemma2-9b-it', nome: 'Gemma 2 9B', livre: true, descricao: 'Gratuito da Google via Groq' },
  ],
  openai: [
    { id: 'gpt-4o-mini', nome: 'GPT-4o mini', livre: false, descricao: 'Rápido e econômico' },
    { id: 'gpt-4o', nome: 'GPT-4o', livre: false, descricao: 'Modelo mais capaz' },
    { id: 'gpt-3.5-turbo', nome: 'GPT-3.5 Turbo', livre: false, descricao: 'Legado e econômico' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', nome: 'Gemini 2.5 Flash', livre: true, descricao: 'Rápido e gratuito com API Key' },
    { id: 'gemini-2.5-pro', nome: 'Gemini 2.5 Pro', livre: false, descricao: 'Raciocínio avançado' },
    { id: 'gemini-2.0-flash', nome: 'Gemini 2.0 Flash', livre: true, descricao: 'Estável e veloz' },
  ],
  anthropic: [
    { id: 'claude-3-5-haiku-20241022', nome: 'Claude 3.5 Haiku', livre: false, descricao: 'Rápido' },
    { id: 'claude-3-5-sonnet-20241022', nome: 'Claude 3.5 Sonnet', livre: false, descricao: 'Equilibrado' },
  ],
  openrouter: [
    { id: 'meta-llama/llama-3.1-8b-instruct:free', nome: 'Llama 3.1 8B (free)', livre: true, descricao: 'Gratuito via OpenRouter' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', nome: 'Llama 3.3 70B (free)', livre: true, descricao: 'Gratuito via OpenRouter' },
    { id: 'google/gemma-2-9b-it:free', nome: 'Gemma 2 9B (free)', livre: true, descricao: 'Gratuito via OpenRouter' },
  ],
  ollama: [
    { id: 'llama3.1', nome: 'Llama 3.1 8B', livre: true, descricao: 'Modelo offline rápido (Ollama)' },
    { id: 'llama3.2', nome: 'Llama 3.2 3B', livre: true, descricao: 'Modelo ultra-leve (Ollama)' },
    { id: 'qwen2.5', nome: 'Qwen 2.5', livre: true, descricao: 'Alta capacidade local (Ollama)' },
  ],
};

export const NOMES_PROVEDOR: Record<ProvedorIA, string> = {
  groq: 'Groq (gratuito)',
  openai: 'OpenAI (ChatGPT)',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  openrouter: 'OpenRouter (gratuito)',
  ollama: 'Ollama (Local Offline)',
};

export function getModelosProvedor(provedor: ProvedorIA): ModeloIA[] {
  return MODELOS_IA[provedor] || [];
}

function normalizeGeminiModel(modelId: string): string {
  const m = (modelId || '').trim();
  if (!m || m === 'gemini-3.5-flash') return 'gemini-2.5-flash';
  if (m === 'gemini-3.5-pro') return 'gemini-2.5-pro';
  return m;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ProviderCall {
  config: ConfiguracaoIA;
  systemPrompt: string;
  userPrompt: string;
}

async function safeProviderFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('TimeoutError') || msg.includes('aborted') || msg.includes('timeout')) {
      throw new Error('Tempo limite excedido ao aguardar resposta do provedor de IA (45s).');
    }
    throw new Error(
      `Falha de conexão com o provedor de IA (${msg}). Verifique conectividade de rede/porta 443 ou se o Ollama local está ativo.`
    );
  }
}

export async function chamarIA({ config, systemPrompt, userPrompt }: ProviderCall): Promise<{
  text: string;
  provider: string;
  model: string;
  durationMs: number;
}> {
  if (!config.apiKey && config.provedor !== 'ollama') {
    throw new Error('Nenhuma API Key configurada. Acesse a aba Configurações para informar sua chave.');
  }

  const start = Date.now();
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let text = '';
  let effectiveModel = config.modelo;

  switch (config.provedor) {
    case 'groq':
      text = await callGroq(config, messages);
      break;
    case 'openai':
      text = await callOpenAI(config, messages);
      break;
    case 'openrouter':
      text = await callOpenRouter(config, messages);
      break;
    case 'gemini':
      effectiveModel = normalizeGeminiModel(config.modelo);
      text = await callGemini({ ...config, modelo: effectiveModel }, userPrompt, systemPrompt);
      break;
    case 'anthropic':
      text = await callAnthropic(config, messages);
      break;
    case 'ollama':
      text = await callOllama(config, messages);
      break;
    default:
      throw new Error(`Provedor não suportado: ${config.provedor}`);
  }

  const durationMs = Date.now() - start;
  return {
    text: text.trim(),
    provider: NOMES_PROVEDOR[config.provedor],
    model: effectiveModel,
    durationMs,
  };
}

async function callGroq(config: ConfiguracaoIA, messages: ChatMessage[]) {
  const res = await safeProviderFetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelo,
      messages,
      temperature: config.temperatura,
      max_tokens: config.maxTokens,
    }),
  });
  if (!res.ok) throw new Error(await extractHttpErr(res));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callOpenAI(config: ConfiguracaoIA, messages: ChatMessage[]) {
  const res = await safeProviderFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelo,
      messages,
      temperature: config.temperatura,
      max_tokens: config.maxTokens,
    }),
  });
  if (!res.ok) throw new Error(await extractHttpErr(res));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callOpenRouter(config: ConfiguracaoIA, messages: ChatMessage[]) {
  const res = await safeProviderFetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
      'X-Title': 'Painel Impressoras BI',
    },
    body: JSON.stringify({
      model: config.modelo,
      messages,
      temperature: config.temperatura,
      max_tokens: config.maxTokens,
    }),
  });
  if (!res.ok) throw new Error(await extractHttpErr(res));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(config: ConfiguracaoIA, userPrompt: string, systemPrompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.modelo)}:generateContent`;
  const res = await safeProviderFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\nDADOS:\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: config.temperatura,
        maxOutputTokens: config.maxTokens,
      },
    }),
  });
  if (!res.ok) throw new Error(await extractHttpErr(res));
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
}

async function callAnthropic(config: ConfiguracaoIA, messages: ChatMessage[]) {
  const res = await safeProviderFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.modelo,
      max_tokens: config.maxTokens,
      temperature: config.temperatura,
      system: messages[0]?.content || '',
      messages: messages.slice(1).filter((m) => m.content),
    }),
  });
  if (!res.ok) throw new Error(await extractHttpErr(res));
  const data = await res.json();
  return data.content?.map((b: { type: string; text?: string }) => b.text || '').join('') || '';
}

async function callOllama(config: ConfiguracaoIA, messages: ChatMessage[]) {
  const baseDefault = process.env.OLLAMA_BASE_URL?.trim()
    ? `${process.env.OLLAMA_BASE_URL.trim().replace(/\/$/, '')}/api/chat`
    : 'http://127.0.0.1:11434/api/chat';
  const targetUrl = config.endpointUrl ? validateOllamaEndpoint(config.endpointUrl) : baseDefault;

  const res = await safeProviderFetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.modelo,
      messages,
      stream: false,
      options: {
        temperature: config.temperatura,
      },
    }),
  });
  if (!res.ok) throw new Error(await extractHttpErr(res));
  const data = await res.json();
  return data.message?.content || '';
}

async function extractHttpErr(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  let json: { error?: { message?: string } | string } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    // resposta não-JSON
  }
  const msg = json?.error
    ? typeof json.error === 'string'
      ? json.error
      : json.error.message
    : text;
  return `Erro HTTP ${res.status} do provedor: ${(msg || 'sem detalhes').slice(0, 300)}`;
}
