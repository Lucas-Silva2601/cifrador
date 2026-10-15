import { NextResponse } from 'next/server';
import { executeOllamaAction, getOllamaStatus } from '@/lib/server/ollama';

function ollamaEnv() {
  return {
    OLLAMA_API_KEY: process.env.OLLAMA_API_KEY ?? '',
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? '',
    OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? '',
  };
}

export async function GET() {
  const status = getOllamaStatus(ollamaEnv());
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
}
