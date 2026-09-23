import { NextResponse } from 'next/server';
import { getConfiguracaoIA, setConfiguracaoIA } from '@/lib/aiConfig';

export async function GET() {
  try {
    const config = await getConfiguracaoIA();
    return NextResponse.json(config);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const config = await setConfiguracaoIA(body || {});
    return NextResponse.json({ success: true, config });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
