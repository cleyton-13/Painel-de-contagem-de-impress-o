import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Allowlist estrita: impede download de arquivos de configuração ou segredos
const ALLOWED_AGENT_FILES = new Set([
  'spx-agent.exe',
  'monitor.ps1',
  'executar_agente.ps1',
  'enviar_homolog.ps1',
  'GestaoHomolog.ps1',
  'spx_gui.ps1',
  'config.example.ps1',
]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const arquivo = searchParams.get('arquivo');

  if (!arquivo) {
    return NextResponse.json({ error: 'Parâmetro arquivo é obrigatório.' }, { status: 400 });
  }

  const safeName = path.basename(arquivo);
  if (!ALLOWED_AGENT_FILES.has(safeName)) {
    return NextResponse.json({ error: 'Arquivo não permitido para distribuição.' }, { status: 403 });
  }

  const filePath = path.join(process.cwd(), 'public', 'agente', safeName);

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Arquivo inválido.' }, { status: 404 });
    }
  } catch {
    return NextResponse.json(
      { error: 'Arquivo não encontrado no repositório de distribuição.' },
      { status: 404 }
    );
  }

  const isBinary = safeName.endsWith('.exe') || safeName.endsWith('.zip');
  const contentType = isBinary ? 'application/octet-stream' : 'text/plain; charset=utf-8';

  const nodeStream = fs.createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': stat.size.toString(),
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
