// El cliente empaqueta el mismo contenido que valida el servidor; la huella se compara en el saludo.
import { assembleContent, type Content } from '@vertice/shared';

const raw = import.meta.glob('../../content/**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const files: Record<string, unknown> = {};
for (const [k, v] of Object.entries(raw)) files[k.replace(/^.*?\/content\//, '')] = v;

const assembled = assembleContent(files);
export const content: Content = assembled.content;
export const contentHash: string = assembled.hash;
export const roleById = (id: string) => content.roles.find((r) => r.id === id);
export const factionName = (id: string) => content.factions.find((f) => f.id === id)?.name ?? id;
