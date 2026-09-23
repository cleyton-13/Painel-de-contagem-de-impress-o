import type { ModeloIA, ProvedorIA, ConfiguracaoIA } from './types';

// Catálogo pré-definido de modelos por provedor
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
    { id: 'gemini-3.5-flash', nome: 'Gemini 3.5 Flash', livre: true, descricao: 'Gratuito com API Key' },
    { id: 'gemini-3.5-pro', nome: 'Gemini 3.5 Pro', livre: false, descricao: 'Mais capaz' },
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

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ProviderCall {
  config: ConfiguracaoIA;
  systemPrompt: string;
  userPrompt: string;
}

// Faz a chamada ao provedor configurado e retorna o texto da resposta
export async function chamarIA({ config, systemPrompt, userPrompt }: ProviderCall): Promise<{
  text: string;
  provider: string;
  model: string;
  durationMs: number;
}> {
  if (!config.apiKey && config.provedor !== 'ollama') {
    throw new Error('Nenhuma API Key configurada. Configure a IA na tela de manutenção.');
  }

  const start = Date.now();
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let text = '';

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
      text = await callGemini(config, userPrompt, systemPrompt);
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
    model: config.modelo,
    durationMs,
  };
}

async function callGroq(config: ConfiguracaoIA, messages: ChatMessage[]) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
  if (!res.ok) throw new Error(await extractErr(res));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callOpenAI(config: ConfiguracaoIA, messages: ChatMessage[]) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
  if (!res.ok) throw new Error(await extractErr(res));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callOpenRouter(config: ConfiguracaoIA, messages: ChatMessage[]) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Painel Impressoras BI',
    },
    body: JSON.stringify({
      model: config.modelo,
      messages,
      temperature: config.temperatura,
      max_tokens: config.maxTokens,
    }),
  });
  if (!res.ok) throw new Error(await extractErr(res));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(config: ConfiguracaoIA, userPrompt: string, systemPrompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo}:generateContent?key=${config.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  if (!res.ok) throw new Error(await extractErr(res));
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
}

async function callAnthropic(config: ConfiguracaoIA, messages: ChatMessage[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
  if (!res.ok) throw new Error(await extractErr(res));
  const data = await res.json();
  return data.content?.map((b: { type: string; text?: string }) => b.text || '').join('') || '';
}

async function callOllama(config: ConfiguracaoIA, messages: ChatMessage[]) {
  const url = config.endpointUrl || 'http://localhost:11434/api/chat';
  const res = await fetch(url, {
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
  if (!res.ok) throw new Error(await extractErr(res));
  const data = await res.json();
  return data.message?.content || '';
}

async function extractErr(res: Response | any): Promise<string> {
  if (!res || !res.status) {
    // Erros de rede (fetch failed, timeout, ECONNREFUSED)
    const errObj = res as Error;
    const msg = errObj?.message || 'Erro de rede desconhecido';
    if (msg.includes('fetch failed') || msg.includes('timeout')) {
      return `Falha de rede ao contatar a IA (${msg}). Verifique se a porta 443 (HTTPS) está liberada no firewall do servidor.`;
    }
    return `Erro interno na requisição IA: ${msg}`;
  }

  const text = await res.text().catch(() => '');
  let json: { error?: { message?: string } | string } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    // não é JSON
  }
  const msg = json?.error ? (typeof json.error === 'string' ? json.error : json.error.message) : text;
  return `Erro HTTP ${res.status} do provedor: ${msg || 'sem detalhes'}`.slice(0, 500);
}