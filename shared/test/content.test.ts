import { describe, it, expect } from 'vitest';
import { loadContentFromDisk } from '../../server/src/content.js';
import { validateContent } from '../src/index.js';

describe('contenido', () => {
  it('se ensambla y pasa la validación cruzada', () => {
    const { content } = loadContentFromDisk();
    expect(validateContent(content)).toEqual([]);
  });
});
