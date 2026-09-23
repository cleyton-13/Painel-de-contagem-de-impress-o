const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function sanitizarNome(nome) {
  return nome.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function getOrCreateUnidade(nome) {
  const nomeSanitizado = sanitizarNome(nome);
  let unidade = await prisma.unidade.findUnique({ where: { nomeSanitizado } });
  if (!unidade) {
    unidade = await prisma.unidade.create({
      data: {
        nome,
        nomeSanitizado,
      }
    });
    console.log(`Unidade criada: ${nome} (${unidade.id})`);
  } else {
    console.log(`Unidade encontrada: ${nome} (${unidade.id})`);
  }
  return unidade;
}

async function moveImpressoras(ip, unidadeDestino) {
  const impressoras = await prisma.impressora.findMany({ where: { ip } });
  console.log(`Encontradas ${impressoras.length} impressoras com o IP ${ip}`);

  for (const imp of impressoras) {
    if (imp.unidadeId !== unidadeDestino.id) {
      await prisma.impressora.update({
        where: { id: imp.id },
        data: { unidadeId: unidadeDestino.id }
      });
      console.log(`Impressora ${imp.serial} (${imp.ip}) movida para ${unidadeDestino.nome}`);
    }
  }

  // Mover também as leituras associadas a esse IP (que eventualmente ainda não estão linkadas à impressora, ou que estão com a unidadeId antiga)
  const leituras = await prisma.leituraImpressora.updateMany({
    where: { ip, unidadeId: { not: unidadeDestino.id } },
    data: { unidadeId: unidadeDestino.id }
  });
  console.log(`Atualizadas ${leituras.count} leituras do IP ${ip} para ${unidadeDestino.nome}`);
}

async function main() {
  const unidadeSantana = await getOrCreateUnidade('Santana de parnaiba');
  const unidadeTaubate = await getOrCreateUnidade('clinica de taubate');

  await moveImpressoras('192.168.50.70', unidadeSantana);
  await moveImpressoras('192.168.110.151', unidadeTaubate);

  console.log('Remapeamento concluido.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
