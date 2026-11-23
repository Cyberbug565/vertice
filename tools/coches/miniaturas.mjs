// Sirve el proyecto con Vite y pasa la ruta del ejecutable de Chromium para regenerar las miniaturas.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [url, executablePath] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.VERTICE_PLAYWRIGHT ?? 'playwright');
const dest = resolve('client/public/models/vehiculos');
const catalogue = JSON.parse(await readFile('content/cars.json', 'utf8'));
const cars = new Map(catalogue.map(({ model, hover }) => [model, hover]));
const browser = await chromium.launch({ executablePath, args: ['--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForFunction(() => typeof window.renderCar === 'function');
  for (const [model, hover] of cars) {
    const art = await page.evaluate(([id, floats]) => window.renderCar(id, floats), [model, hover]);
    await writeFile(dest + '/' + model + '-calles.webp', Buffer.from(art.atlas, 'base64'));
    await writeFile(dest + '/' + model + '.webp', Buffer.from(art.preview, 'base64'));
  }
} finally {
  await browser.close();
}
