import { prisma } from '@/lib/prisma';
import type { ConfiguracaoIA as ConfiguracaoIAType, ProvedorIA } from './types';

export const IA_CONFIG_ID = 'default_ia';

const VALID_PROVIDERS = new Set<ProvedorIA>([
  'groq',
  'openai',
  'gemini',
  'anthropic',
  'openrouter',
  'ollama',
]);

const DEFAULTS = {
  provedor: 'groq' as ProvedorIA,
  modelo: 'llama-3.3-70b-versatile',
  apiKey: '',
  endpointUrl: '',
  temperatura: 0.7,
  maxTokens: 4096,
  idioma: 'pt-BR',
};

export function maskApiKey(key: string): string {
  const trimmed = (key || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 6) return '••••••••';
  return `••••••••${trimmed.slice(-4)}`;
}

export function validateOllamaEndpoint(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('URL do endpoint Ollama inválida.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Protocolo do endpoint Ollama deve ser http ou https.');
  }

  const allowedEnvBase = process.env.OLLAMA_BASE_URL?.trim();
  if (allowedEnvBase) {
    try {
      const envHost = new URL(allowedEnvBase).hostname.toLowerCase();
      if (parsed.hostname.toLowerCase() === envHost) return parsed.toString();
    } catch {
      // ignora OLLAMA_BASE_URL malformada
    }
  }

  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (!isLoopback) {
    throw new Error(
      'Por segurança (anti-SSRF), o endpoint do Ollama só pode apontar para localhost/127.0.0.1 (ou host definido em OLLAMA_BASE_URL no servidor).'
    );
  }

  return parsed.toString();
}

export async function getConfiguracaoIA(): Promise<ConfiguracaoIAType> {
  let config = await prisma.configuracaoIA.findUnique({
    where: { id: IA_CONFIG_ID },
  });
  if (!config) {
    config = await prisma.configuracaoIA.create({
      data: {
        id: IA_CONFIG_ID,
        provedor: DEFAULTS.provedor,
        modelo: DEFAULTS.modelo,
        apiKey: DEFAULTS.apiKey,
        endpointUrl: DEFAULTS.endpointUrl,
        temperatura: DEFAULTS.temperatura,
        maxTokens: DEFAULTS.maxTokens,
        idioma: DEFAULTS.idioma,
      },
    });
  }

  const rawKey = config.apiKey || '';
  const provedor = VALID_PROVIDERS.has(config.provedor as ProvedorIA)
    ? (config.provedor as ProvedorIA)
    : DEFAULTS.provedor;

  return {
    id: config.id,
    provedor,
    modelo: config.modelo || DEFAULTS.modelo,
    apiKey: rawKey,
    apiKeyConfigurada: Boolean(rawKey.trim()),
    endpointUrl: config.endpointUrl || '',
    temperatura: Number(config.temperatura),
    maxTokens: config.maxTokens,
    idioma: config.idioma || DEFAULTS.idioma,
    updatedAt: config.updatedAt.toISOString(),
  };
}

export function toPublicConfiguracaoIA(config: ConfiguracaoIAType): ConfiguracaoIAType {
  return {
    ...config,
    apiKey: maskApiKey(config.apiKey),
    apiKeyConfigurada: Boolean(config.apiKey?.trim()),
  };
}

export async function setConfiguracaoIA(
  data: Partial<ConfiguracaoIAType> & { clearApiKey?: boolean }
) {
  const update: Record<string, unknown> = {};

  if (typeof data.provedor === 'string' && VALID_PROVIDERS.has(data.provedor as ProvedorIA)) {
    update.provedor = data.provedor;
  }

  if (typeof data.modelo === 'string' && data.modelo.trim()) {
    update.modelo = data.modelo.trim();
  }

  if (data.clearApiKey === true) {
    update.apiKey = '';
  } else if (typeof data.apiKey === 'string') {
    const trimmedKey = data.apiKey.trim();
    // Preserva a chave existente se o campo veio vazio ou mascarado (••••)
    if (trimmedKey !== '' && !trimmedKey.startsWith('••••')) {
      update.apiKey = trimmedKey;
    }
  }

  if (typeof data.endpointUrl === 'string') {
    update.endpointUrl = validateOllamaEndpoint(data.endpointUrl);
  }

  if (typeof data.temperatura === 'number' && !Number.isNaN(data.temperatura)) {
    update.temperatura = Math.min(2, Math.max(0, data.temperatura));
  }

  if (typeof data.maxTokens === 'number' && !Number.isNaN(data.maxTokens)) {
    update.maxTokens = Math.min(32000, Math.max(256, Math.round(data.maxTokens)));
  }

  if (typeof data.idioma === 'string' && data.idioma.trim()) {
    update.idioma = data.idioma.trim();
  }

  const createEndpoint =
    typeof data.endpointUrl === 'string' ? validateOllamaEndpoint(data.endpointUrl) : '';
  const createKey =
    typeof data.apiKey === 'string' && !data.apiKey.trim().startsWith('••••')
      ? data.apiKey.trim()
      : '';

  const saved = await prisma.configuracaoIA.upsert({
    where: { id: IA_CONFIG_ID },
    update,
    create: {
      id: IA_CONFIG_ID,
      provedor:
        typeof data.provedor === 'string' && VALID_PROVIDERS.has(data.provedor as ProvedorIA)
          ? data.provedor
          : DEFAULTS.provedor,
      modelo: typeof data.modelo === 'string' && data.modelo.trim() ? data.modelo.trim() : DEFAULTS.modelo,
      apiKey: createKey,
      endpointUrl: createEndpoint,
      temperatura:
        typeof data.temperatura === 'number' && !Number.isNaN(data.temperatura)
          ? data.temperatura
          : DEFAULTS.temperatura,
      maxTokens:
        typeof data.maxTokens === 'number' && !Number.isNaN(data.maxTokens)
          ? data.maxTokens
          : DEFAULTS.maxTokens,
      idioma: typeof data.idioma === 'string' && data.idioma.trim() ? data.idioma.trim() : DEFAULTS.idioma,
    },
  });

  const rawKey = saved.apiKey || '';
  return {
    id: saved.id,
    provedor: (saved.provedor as ProvedorIA) || DEFAULTS.provedor,
    modelo: saved.modelo || DEFAULTS.modelo,
    apiKey: rawKey,
    apiKeyConfigurada: Boolean(rawKey.trim()),
    endpointUrl: saved.endpointUrl || '',
    temperatura: Number(saved.temperatura),
    maxTokens: saved.maxTokens,
    idioma: saved.idioma || DEFAULTS.idioma,
    updatedAt: saved.updatedAt.toISOString(),
  } satisfies ConfiguracaoIAType;
}

export function iaConfigurado(config: ConfiguracaoIAType): boolean {
  if (config.provedor === 'ollama') return true;
  return Boolean(config.apiKey && config.apiKey.trim().length > 0);
}
