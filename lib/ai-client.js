const routes = {
  status: '/api/ai/status',
  reharmonize: '/api/ai/reharmonize',
  organize: '/api/ai/organize',
  'chord-map': '/api/ai/chord-map',
};

export async function requestAi(action, body) {
  const desktopAi = globalThis.window?.cifradorDesktop?.ai;
  if (desktopAi) {
    const result = await desktopAi.request(action, body || {});
    if (!result?.ok) throw new Error(result?.error || 'Não foi possível consultar a IA.');
    return result.payload;
  }

  const route = routes[action];
  if (!route) throw new Error('Ação de IA desconhecida.');
  const response = await fetch(route, action === 'status' ? {
    headers: { Accept: 'application/json' },
  } : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível consultar a IA.');
  return payload;
}
