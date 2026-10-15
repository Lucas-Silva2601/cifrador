import { NextResponse } from 'next/server';
import { executeOllamaAction } from '@/lib/server/ollama';

export const runtime = 'nodejs';

const ALLOWED = new Set(['reharmonize', 'organize', 'chord-map']);

function ollamaEnv() {
  return {
    OLLAMA_API_KEY: process.env.OLLAMA_API_KEY ?? '',
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? '',
    OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? '',
  };
}

export async function POST(request, { params }) {
  const action = params?.action;
  if (!ALLOWED.has(action)) {
    return NextResponse.json({ error: 'Ação de IA não encontrada.' }, { status: 404 });
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  try {
    const payload = await executeOllamaAction(ollamaEnv(), action, body);
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = Number(error.status) || 500;
    const message = status >= 500 ? `Falha ao consultar o Ollama: ${error.message}` : error.message;
    return NextResponse.json({ error: message }, { status });
  }
}
