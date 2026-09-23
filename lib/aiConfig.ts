import { prisma } from '@/lib/prisma';
import type { ConfiguracaoIA as ConfiguracaoIAType, ProvedorIA } from './types';

export const IA_CONFIG_ID = 'default_ia';

const DEFAULTS = {
  provedor: 'groq' as ProvedorIA,
  modelo: 'llama-3.3-70b-versatile',
  apiKey: '',
  endpointUrl: '',
  temperatura: 0.7,
  maxTokens: 4096,
  idioma: 'pt-BR',
};

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
  return {
    id: config.id,
    provedor: (config.provedor as ProvedorIA) || DEFAULTS.provedor,
    modelo: config.modelo || DEFAULTS.modelo,
    apiKey: config.apiKey || '',
    endpointUrl: config.endpointUrl || '',
    temperatura: Number(config.temperatura),
    maxTokens: config.maxTokens,
    idioma: config.idioma || DEFAULTS.idioma,
    updatedAt: config.updatedAt.toISOString(),
  };
}

export async function setConfiguracaoIA(data: Partial<ConfiguracaoIAType>) {
  const current = await getConfiguracaoIA();
  const update: Record<string, unknown> = {};
  if (typeof data.provedor === 'string') update.provedor = data.provedor;
  if (typeof data.modelo === 'string' && data.modelo.trim()) update.modelo = data.modelo.trim();
  if (typeof data.apiKey === 'string') update.apiKey = data.apiKey.trim();
  if (typeof data.endpointUrl === 'string') update.endpointUrl = data.endpointUrl.trim();
  if (typeof data.temperatura === 'number') update.temperatura = Math.min(2, Math.max(0, data.temperatura));
  if (typeof data.maxTokens === 'number') update.maxTokens = Math.min(32000, Math.max(256, data.maxTokens));
  if (typeof data.idioma === 'string' && data.idioma.trim()) update.idioma = data.idioma.trim();

  // campos vazios usam defaults se vierem como string vazia
  if (String(data.modelo ?? '') === '') update.modelo = DEFAULTS.modelo;
  if (String(data.apiKey ?? '') === '') update.apiKey = '';

  const saved = await prisma.configuracaoIA.upsert({
    where: { id: IA_CONFIG_ID },
    update,
    create: {
      id: IA_CONFIG_ID,
      provedor: (data.provedor as string) || DEFAULTS.provedor,
      modelo: (data.modelo as string) || DEFAULTS.modelo,
      apiKey: (data.apiKey as string) || '',
      endpointUrl: (data.endpointUrl as string) || '',
      temperatura: typeof data.temperatura === 'number' ? data.temperatura : DEFAULTS.temperatura,
      maxTokens: typeof data.maxTokens === 'number' ? data.maxTokens : DEFAULTS.maxTokens,
      idioma: (data.idioma as string) || DEFAULTS.idioma,
    },
  });

  return {
    id: saved.id,
    provedor: (saved.provedor as ProvedorIA) || DEFAULTS.provedor,
    modelo: saved.modelo || DEFAULTS.modelo,
    apiKey: saved.apiKey || '',
    endpointUrl: saved.endpointUrl || '',
    temperatura: Number(saved.temperatura),
    maxTokens: saved.maxTokens,
    idioma: saved.idioma || DEFAULTS.idioma,
    updatedAt: saved.updatedAt.toISOString(),
  } as ConfiguracaoIAType;
}

export function iaConfigurado(config: ConfiguracaoIAType): boolean {
  return Boolean(config.apiKey);
}