import { prisma } from '@/lib/prisma';

const CONFIG_ID = 'default';

export async function getConfiguracaoSistema() {
  let config = await prisma.configuracaoSistema.findUnique({
    where: { id: CONFIG_ID },
  });
  if (!config) {
    config = await prisma.configuracaoSistema.create({
      data: { id: CONFIG_ID },
    });
  }
  return config;
}

// Config de contagem (modo separação de cores / faturamento)
export async function getConfigContagem() {
  const config = await getConfiguracaoSistema();
  return {
    usarSeparacaoCores: config.usarSeparacaoCores,
    faturamentoHabilitado: config.faturamentoHabilitado,
    tarifaUnica: Number(config.tarifaUnica),
  };
}

export async function setConfigContagem(patch: {
  usarSeparacaoCores?: boolean;
  faturamentoHabilitado?: boolean;
  tarifaUnica?: number;
}) {
  await prisma.configuracaoSistema.upsert({
    where: { id: CONFIG_ID },
    update: {
      ...(patch.usarSeparacaoCores !== undefined && { usarSeparacaoCores: patch.usarSeparacaoCores }),
      ...(patch.faturamentoHabilitado !== undefined && { faturamentoHabilitado: patch.faturamentoHabilitado }),
      ...(patch.tarifaUnica !== undefined && { tarifaUnica: patch.tarifaUnica }),
    },
    create: {
      id: CONFIG_ID,
      ...(patch.usarSeparacaoCores !== undefined && { usarSeparacaoCores: patch.usarSeparacaoCores }),
      ...(patch.faturamentoHabilitado !== undefined && { faturamentoHabilitado: patch.faturamentoHabilitado }),
      ...(patch.tarifaUnica !== undefined && { tarifaUnica: patch.tarifaUnica }),
    },
  });
}