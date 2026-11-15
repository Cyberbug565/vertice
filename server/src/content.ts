import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleContent, validateContent, type Content } from '@vertice/shared';

export const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../content');

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (f.endsWith('.json')) out.push(p); }
  return out;
}

export function loadContentFromDisk(dir = CONTENT_DIR): { content: Content; hash: string } {
  const files: Record<string, unknown> = {};
  for (const p of walk(dir)) files[relative(dir, p).split('\\').join('/')] = JSON.parse(readFileSync(p, 'utf8'));
  return assembleContent(files);
}

export function loadValidatedContent(): { content: Content; hash: string } {
  const r = loadContentFromDisk();
  const errs = validateContent(r.content);
  if (errs.length) throw new Error('Errores de contenido:\n  ' + errs.join('\n  '));
  return r;
}
