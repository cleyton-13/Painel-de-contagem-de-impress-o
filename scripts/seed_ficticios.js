require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

async function seed() {
  console.log('Iniciando populacao de dados ficticios no schema homolog...');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool, { schema: 'homolog' });
  const prisma = new PrismaClient({ adapter });

  console.log('Limpando schema homolog...');
  await prisma.leituraImpressora.deleteMany();
  await prisma.impressora.deleteMany();
  await prisma.unidadeAlias.deleteMany();
  await prisma.unidade.deleteMany();
  await prisma.perfilFranquia.deleteMany();
  await prisma.configuracaoSLA.deleteMany();
  await prisma.arquivoIngerido.deleteMany();

  console.log('Criando perfis de contrato...');
  const perfFilial = await prisma.perfilFranquia.create({
    data: {
      nome: 'Contrato Padrao Filiais',
      tarifaAvulsaPB: 0.045,
      tarifaAvulsaColor: 0.28,
      temFranquiaFixa: true,
      valorFixoMensal: 750.0,
      cotaPB: 8000,
      cotaColor: 1500,
      excedentePB: 0.05,
      excedenteColor: 0.32,
      precoResmaPapel: 29.90,
    },
  });

  const perfMatriz = await prisma.perfilFranquia.create({
    data: {
      nome: 'Contrato Especial Matriz & Hospitais',
      tarifaAvulsaPB: 0.035,
      tarifaAvulsaColor: 0.22,
      temFranquiaFixa: true,
      valorFixoMensal: 1400.0,
      cotaPB: 25000,
      cotaColor: 6000,
      excedentePB: 0.04,
      excedenteColor: 0.25,
      precoResmaPapel: 27.50,
    },
  });

  const perfAvulso = await prisma.perfilFranquia.create({
    data: {
      nome: 'Tarifado Avulso Ambulatorial',
      tarifaAvulsaPB: 0.065,
      tarifaAvulsaColor: 0.38,
      temFranquiaFixa: false,
      valorFixoMensal: 0,
      cotaPB: 0,
      cotaColor: 0,
      excedentePB: 0.065,
      excedenteColor: 0.38,
      precoResmaPapel: 31.00,
    },
  });

  console.log('Criando unidades com diferentes situacoes de SLA...');
  const unidadesConfig = [
    // 3 unidades que enviaram HOJE (SLA CONFORME)
    { nome: 'AE PERUS', alias: 'PERUS', perfil: perfFilial, situacao: 'hoje', modelo: 'Konica Minolta bizhub C360i', ip: '10.10.1.15', serial: 'KM-C360I-101', pb: 9500, col: 2400 },
    { nome: 'UPA VILA MARIANA', alias: 'V_MARIANA', perfil: perfMatriz, situacao: 'hoje', modelo: 'Konica Minolta bizhub 4050i', ip: '10.20.1.20', serial: 'KM-4050I-102', pb: 18200, col: 0 },
    { nome: 'UPA TATUAPE', alias: 'TATUAPE', perfil: perfFilial, situacao: 'hoje', modelo: 'Konica Minolta bizhub C226i', ip: '10.30.1.18', serial: 'KM-C226I-103', pb: 7600, col: 1850 },

    // 4 unidades que enviaram ONTEM (AGUARDANDO CICLO DE HOJE - DENTRO DO SLA)
    { nome: 'UPA JARDIM ZAIRA', alias: 'ZAIRA', perfil: perfFilial, situacao: 'ontem', modelo: 'Konica Minolta bizhub C360i', ip: '10.40.1.10', serial: 'KM-C360I-201', pb: 8900, col: 2100 },
    { nome: 'UPA VILA MAGINI', alias: 'MAGINI', perfil: perfFilial, situacao: 'ontem', modelo: 'Brother MFC-L6900DW', ip: '10.50.1.12', serial: 'BR-L6900-202', pb: 6400, col: 0 },
    { nome: 'AE SAPOPEMBA', alias: 'SAPOPEMBA', perfil: perfFilial, situacao: 'ontem', modelo: 'Konica Minolta bizhub 4750i', ip: '10.60.1.14', serial: 'KM-4750I-203', pb: 11500, col: 0 },
    { nome: 'AMA HUMBERTO GASTAO BODRA', alias: 'HUMBERTO', perfil: perfAvulso, situacao: 'ontem', modelo: 'Konica Minolta bizhub C226i', ip: '10.70.1.16', serial: 'KM-C226I-204', pb: 5300, col: 1400 },

    // 3 unidades que estao há varios dias sem enviar (OFFLINE PROLONGADO / CRITICO)
    { nome: 'HOSPITAL SAO JOSE - JOINVILLE', alias: 'SAO_JOSE', perfil: perfMatriz, situacao: '4_dias', modelo: 'Konica Minolta bizhub C360i', ip: '10.80.1.30', serial: 'KM-C360I-301', pb: 14200, col: 4800 },
    { nome: 'HOSPITAL DR. RADAMES NARDINI', alias: 'NARDINI', perfil: perfMatriz, situacao: '18_dias', modelo: 'Konica Minolta bizhub 4050i', ip: '10.90.1.40', serial: 'KM-4050I-302', pb: 8300, col: 0 },
    { nome: 'AME AE VILA ZATT', alias: 'VILA_ZATT', perfil: perfAvulso, situacao: '32_dias', modelo: 'Brother MFC-L6900DW', ip: '10.100.1.50', serial: 'BR-L6900-303', pb: 4100, col: 0 },
  ];

  const agora = new Date();

  for (const cfg of unidadesConfig) {
    const unid = await prisma.unidade.create({
      data: {
        nome: cfg.nome,
        nomeSanitizado: cfg.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        perfilFranquiaId: cfg.perfil.id,
        aliases: { create: [{ alias: cfg.alias }] },
      },
    });

    const imp = await prisma.impressora.create({
      data: {
        serial: cfg.serial,
        modelo: cfg.modelo,
        ip: cfg.ip,
        apelido: 'IMPRESSORA PRINCIPAL',
        unidadeId: unid.id,
      },
    });

    // Definir data da ultima leitura
    let diasAtras = 0;
    if (cfg.situacao === 'hoje') diasAtras = 0;
    else if (cfg.situacao === 'ontem') diasAtras = 1;
    else if (cfg.situacao === '4_dias') diasAtras = 4;
    else if (cfg.situacao === '18_dias') diasAtras = 18;
    else if (cfg.situacao === '32_dias') diasAtras = 32;

    // Gerar historico dos ultimos 30 dias para os graficos
    const diasTotal = 30;
    for (let d = diasTotal; d >= diasAtras; d--) {
      const dataLeitura = new Date(agora);
      dataLeitura.setDate(agora.getDate() - d);
      dataLeitura.setHours(8, 15 + (d % 30), 0, 0);

      const pbDia = Math.round(cfg.pb - (d - diasAtras) * (cfg.pb / 60));
      const colDia = Math.round(cfg.col - (d - diasAtras) * (cfg.col / 60));

      await prisma.leituraImpressora.create({
        data: {
          ip: cfg.ip,
          serial: cfg.serial,
          impressoraId: imp.id,
          unidadeId: unid.id,
          dataHora: dataLeitura,
          paginasTotal: Math.max(0, pbDia) + Math.max(0, colDia),
          paginasPB: Math.max(0, pbDia),
          paginasColor: Math.max(0, colDia),
          status: (cfg.situacao.includes('dias') && d === diasAtras) ? 'Offline' : 'Online',
          resetPlaca: false,
        },
      });
    }
  }

  console.log('Configurando SLA padrao...');
  await prisma.configuracaoSLA.create({
    data: {
      id: 'default_config',
      horarioLimite: '17:00',
      alertasAtivos: true,
      emailsDestinatarios: 'suporte.ti@spximagem.com.br, gestao@spximagem.com.br',
    },
  });

  console.log('Gerando historico de envios para a aba Monitor...');
  await prisma.arquivoIngerido.createMany({
    data: [
      { nomeArquivo: 'relatorio_AE_PERUS_20261022_080512.csv', tamanhoBytes: BigInt(18540), status: 'PROCESSADO', novas: 1, atualizadas: 0 },
      { nomeArquivo: 'relatorio_UPA_VILA_MARIANA_20261022_081230.csv', tamanhoBytes: BigInt(22100), status: 'PROCESSADO', novas: 1, atualizadas: 0 },
      { nomeArquivo: 'relatorio_UPA_TATUAPE_20261022_082045.csv', tamanhoBytes: BigInt(19400), status: 'PROCESSADO', novas: 1, atualizadas: 0 },
      { nomeArquivo: 'relatorio_UPA_JARDIM_ZAIRA_20261021_163012.csv', tamanhoBytes: BigInt(20100), status: 'ATUALIZADO', novas: 0, atualizadas: 1 },
      { nomeArquivo: 'relatorio_UPA_VILA_MAGINI_20261021_113000.csv', tamanhoBytes: BigInt(17800), status: 'PROCESSADO', novas: 1, atualizadas: 0 },
      { nomeArquivo: 'relatorio_AE_SAPOPEMBA_20261021_163520.csv', tamanhoBytes: BigInt(21300), status: 'ATUALIZADO', novas: 0, atualizadas: 1 },
      { nomeArquivo: 'relatorio_SAO_JOSE_20261018_080000.csv', tamanhoBytes: BigInt(16500), status: 'DUPLICADO', novas: 0, atualizadas: 0 },
      { nomeArquivo: 'relatorio_VILA_ZATT_20260920_070000.csv', tamanhoBytes: BigInt(14200), status: 'ERRO', erroMensagem: 'SNMP Timeout no IP 10.100.1.50', novas: 0, atualizadas: 0 },
    ],
  });

  await prisma.$disconnect();
  console.log('DADOS_FICTICIOS_HOMOLOG_CRIADOS_COM_SUCESSO');
}

seed().catch(err => {
  console.error('Erro ao popular dados ficticios:', err);
  process.exit(1);
});
