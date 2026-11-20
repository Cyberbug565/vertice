const TOKEN_KEY = 'vertice.token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let r: Response;
  try { r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error('No se pudo contactar con el servidor. Comprueba la conexión y vuelve a intentarlo.'); }
  let j: any = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(j.error ?? (r.status >= 500 ? 'El servidor no está disponible. Revisa que siga encendido y que el enlace sea el actual.' : `Error ${r.status}`)); (e as any).status = r.status; throw e; }
  return j as T;
}
