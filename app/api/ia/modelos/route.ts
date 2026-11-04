import { NextResponse } from 'next/server';
import { MODELOS_IA, NOMES_PROVEDOR } from '@/lib/aiProviders';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    providers: NOMES_PROVEDOR,
    models: MODELOS_IA,
  });
}
