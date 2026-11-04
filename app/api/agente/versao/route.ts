import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DISTRIBUTABLE_FILES = [
  'monitor.ps1',
  'executar_agente.ps1',
  'enviar_homolog.ps1',
  'GestaoHomolog.ps1',
  'spx-agent.exe',
];

type HashCacheEntry = {
  mtimeMs: number;
  size: number;
  sha256: string;
};

const hashCache = new Map<string, HashCacheEntry>();

async function getCachedFileHash(filePath: string, stat: fs.Stats): Promise<string> {
  const cached = hashCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.sha256;
  }

  const sha256 = await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });

  hashCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, sha256 });
  return sha256;
}

export async function GET() {
  const agenteDir = path.join(process.cwd(), 'public', 'agente');
  const manifest: Record<string, { sha256: string; tamanhoBytes: number }> = {};

  for (const file of DISTRIBUTABLE_FILES) {
    const fullPath = path.join(agenteDir, file);
    try {
      const stat = await fs.promises.stat(fullPath);
      if (!stat.isFile()) continue;
      const sha256 = await getCachedFileHash(fullPath, stat);
      manifest[file] = {
        sha256,
        tamanhoBytes: stat.size,
      };
    } catch {
      // Arquivo opcional ausente no diretório de distribuição
    }
  }

  return NextResponse.json({
    versao: '2.2.0',
    dataAtualizacao: new Date().toISOString(),
    arquivos: manifest,
    notas: 'Motor SNMP resiliente (32/64-bit, RFC/Konica/Brother), agendador multi-dia persistente e auto-update via stream.',
  });
}
