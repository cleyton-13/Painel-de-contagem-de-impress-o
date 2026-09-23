"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    console.log('Limpando banco de dados...');
    await prisma.leituraImpressora.deleteMany();
    await prisma.impressora.deleteMany();
    await prisma.unidadeAlias.deleteMany();
    await prisma.unidade.deleteMany();
    await prisma.perfilFranquia.deleteMany();
    await prisma.configuracaoSLA.deleteMany();
    await prisma.arquivoIngerido.deleteMany();
    // ============================================================
    // PERFIS DE FRANQUIA
    // ============================================================
    console.log('Criando perfis de franquia...');
    const perf1 = await prisma.perfilFranquia.create({
        data: {
            nome: 'Contrato Padrão Filiais',
            tarifaAvulsaPB: 0.04,
            tarifaAvulsaColor: 0.25,
            temFranquiaFixa: true,
            valorFixoMensal: 650.0,
            cotaPB: 8000,
            cotaColor: 1500,
            excedentePB: 0.05,
            excedenteColor: 0.3,
            precoResmaPapel: 28.5,
        },
    });
    const perf2 = await prisma.perfilFranquia.create({
        data: {
            nome: 'Contrato Especial Matriz',
            tarifaAvulsaPB: 0.03,
            tarifaAvulsaColor: 0.2,
            temFranquiaFixa: true,
            valorFixoMensal: 1200.0,
            cotaPB: 20000,
            cotaColor: 5000,
            excedentePB: 0.04,
            excedenteColor: 0.22,
            precoResmaPapel: 26.0,
        },
    });
    const perf3 = await prisma.perfilFranquia.create({
        data: {
            nome: 'Tarifado Avulso Sem Franquia',
            tarifaAvulsaPB: 0.06,
            tarifaAvulsaColor: 0.35,
            temFranquiaFixa: false,
            valorFixoMensal: 0,
            cotaPB: 0,
            cotaColor: 0,
            excedentePB: 0.06,
            excedenteColor: 0.35,
            precoResmaPapel: 30.0,
        },
    });
    // ============================================================
    // UNIDADES
    // ============================================================
    console.log('Criando unidades...');
    const unid1 = await prisma.unidade.create({
        data: {
            nome: 'Santana de Parnaíba',
            nomeSanitizado: 'SANTANA DE PARNAIBA',
            perfilFranquiaId: perf1.id,
            aliases: { create: [{ alias: 'SANTANA' }] },
        },
    });
    const unid2 = await prisma.unidade.create({
        data: {
            nome: 'Alphaville Central',
            nomeSanitizado: 'ALPHAVILLE CENTRAL',
            perfilFranquiaId: perf2.id,
            aliases: { create: [{ alias: 'ALPHA' }] },
        },
    });
    const unid3 = await prisma.unidade.create({
        data: {
            nome: 'Barueri Matriz',
            nomeSanitizado: 'BARUERI MATRIZ',
            perfilFranquiaId: perf2.id,
            aliases: { create: [{ alias: 'BARUERI' }] },
        },
    });
    const unid4 = await prisma.unidade.create({
        data: {
            nome: 'Osasco Centro',
            nomeSanitizado: 'OSASCO CENTRO',
            perfilFranquiaId: perf1.id,
        },
    });
    const unid5 = await prisma.unidade.create({
        data: {
            nome: 'Tamboré Shopping',
            nomeSanitizado: 'TAMBORE SHOPPING',
            perfilFranquiaId: perf1.id,
        },
    });
    const unid6 = await prisma.unidade.create({
        data: {
            nome: 'Cotia Logística',
            nomeSanitizado: 'COTIA LOGISTICA',
            perfilFranquiaId: perf3.id,
        },
    });
    // ============================================================
    // IMPRESSORAS + LEITURAS HISTÓRICAS
    // ============================================================
    console.log('Criando impressoras e leituras...');
    const printers = [
        { serial: 'KM-C360I-99201', modelo: 'Konica Minolta bizhub C360i', ip: '192.168.10.45', apelido: 'KONICA RECEPÇÃO', unidade: unid1, pbBase: 4250, colBase: 1120, reset: false },
        { serial: 'KM-4050I-88112', modelo: 'Konica Minolta bizhub 4050i', ip: '192.168.10.46', apelido: 'BIZHUB RECRUTAMENTO', unidade: unid1, pbBase: 3100, colBase: 0, reset: false },
        { serial: 'KM-C226I-77403', modelo: 'Konica Minolta bizhub C226i', ip: '192.168.20.12', apelido: 'DIRETORIA EXECUTIVA', unidade: unid2, pbBase: 8900, colBase: 3450, reset: false },
        { serial: 'KM-C360I-55104', modelo: 'Konica Minolta bizhub C360i', ip: '192.168.20.14', apelido: 'DEPT VENDAS & MARKETING', unidade: unid2, pbBase: 11200, colBase: 4100, reset: false },
        { serial: 'KM-4750I-33905', modelo: 'Konica Minolta bizhub 4750i', ip: '192.168.30.10', apelido: 'EXPEDIÇÃO & LOGÍSTICA', unidade: unid3, pbBase: 14500, colBase: 0, reset: true },
        { serial: 'KM-C360I-11206', modelo: 'Konica Minolta bizhub C360i', ip: '192.168.30.15', apelido: 'FINANCEIRO & CONTROLADORIA', unidade: unid3, pbBase: 9400, colBase: 2800, reset: false },
        { serial: 'KM-C226I-99807', modelo: 'Konica Minolta bizhub C226i', ip: '192.168.40.8', apelido: 'ATENDIMENTO AO CLIENTE', unidade: unid4, pbBase: 1850, colBase: 420, reset: false },
        { serial: 'KM-4050I-44308', modelo: 'Konica Minolta bizhub 4050i', ip: '192.168.50.22', apelido: 'LOJA SHOPPING KIOSK', unidade: unid5, pbBase: 2900, colBase: 650, reset: false },
        { serial: 'KM-4750I-22109', modelo: 'Konica Minolta bizhub 4750i', ip: '192.168.60.5', apelido: 'GALPÃO DE CARGAS', unidade: unid6, pbBase: 0, colBase: 0, reset: false },
    ];
    const now = new Date();
    for (let i = 0; i < printers.length; i++) {
        const p = printers[i];
        const imp = await prisma.impressora.create({
            data: {
                serial: p.serial,
                modelo: p.modelo,
                ip: p.ip,
                apelido: p.apelido,
                unidadeId: p.unidade.id,
            },
        });
        // Gera leitura inicial (contadores absolutos) + leituras diárias
        // Simula acumulação: 90 dias de histórico
        let pb = 5000 + i * 1000;
        let col = 300 + i * 200;
        const dPBDiario = Math.max(20, Math.round(p.pbBase / 60));
        const dColDiario = p.colBase > 0 ? Math.max(5, Math.round(p.colBase / 60)) : 0;
        for (let day = 90; day >= 0; day--) {
            const date = new Date(now);
            date.setDate(now.getDate() - day);
            date.setHours(9 + (day % 8), 0, 0, 0);
            // Reset de placa na metade do histórico (badge "Placa Resetada no Período")
            if (p.reset && day === 45) {
                pb = 120;
                col = 30;
            }
            pb += dPBDiario;
            if (p.colBase > 0)
                col += dColDiario;
            const isOffline = p.serial === 'KM-C226I-99807' && day === 0;
            const isErroSNMP = p.serial === 'KM-4750I-22109' && day === 0;
            const status = isOffline ? 'Offline' : isErroSNMP ? 'Erro SNMP' : 'Online';
            await prisma.leituraImpressora.create({
                data: {
                    ip: p.ip,
                    serial: p.serial,
                    impressoraId: imp.id,
                    unidadeId: p.unidade.id,
                    dataHora: date,
                    paginasTotal: pb + col,
                    paginasPB: pb,
                    paginasColor: col,
                    status,
                    resetPlaca: p.reset && day === 45,
                },
            });
        }
    }
    // ============================================================
    // CONFIG SLA
    // ============================================================
    console.log('Criando ConfiguracaoSLA...');
    await prisma.configuracaoSLA.create({
        data: {
            id: 'default_config',
            horarioLimite: '17:00',
            alertasAtivos: true,
            emailsDestinatarios: 'admin@empresa.com, ti@empresa.com, diretoria@empresa.com',
        },
    });
    // ============================================================
    // ARQUIVOS INGERIDOS (mock para aba armazenamento)
    // ============================================================
    console.log('Criando ArquivoIngerido...');
    await prisma.arquivoIngerido.createMany({
        data: [
            { nomeArquivo: 'relatorio_impressoras_Santana_2026-08-03_09-00-00.csv', tamanhoBytes: 154200, status: 'PROCESSADO' },
            { nomeArquivo: 'relatorio_impressoras_Alphaville_2026-08-03_09-15-00.csv', tamanhoBytes: 248900, status: 'PROCESSADO' },
            { nomeArquivo: 'relatorio_impressoras_Barueri_2026-08-03_09-30-00.csv', tamanhoBytes: 310500, status: 'PROCESSADO' },
            { nomeArquivo: 'relatorio_impressoras_Osasco_2026-08-02_16-45-00.csv', tamanhoBytes: 98400, status: 'PROCESSADO' },
            { nomeArquivo: 'relatorio_impressoras_Tambore_2026-08-03_10-00-00.csv', tamanhoBytes: 112000, status: 'PROCESSADO' },
            { nomeArquivo: 'relatorio_impressoras_Cotia_2026-08-01_14-20-00.csv', tamanhoBytes: 87300, status: 'ERRO', erroMensagem: 'Falha SNMP no serial KM-4750I-22109' },
        ],
    });
    console.log('Seed concluído com sucesso!');
}
main()
    .catch(e => {
    console.error('Erro no seed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
