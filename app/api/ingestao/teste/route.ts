import { POST as diretoPOST } from '../direto/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// O endpoint /teste atua como um alias para /direto
// Isso garante compatibilidade com agentes antigos que possuem a URL /teste salva no config.local.ps1
export const POST = diretoPOST;
