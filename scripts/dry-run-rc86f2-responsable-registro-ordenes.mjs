/**
 * RC8.6F.2 dry-run (legado) — redirige a RC8.6F.3 (evidencia de ejecución).
 * Ya no propone Registro de Órdenes solo por existir una orden si hay recepción.
 *
 *   node scripts/dry-run-rc86f2-responsable-registro-ordenes.mjs
 *   node scripts/dry-run-rc86f2-responsable-registro-ordenes.mjs --apply
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = join(__dirname, 'reconcile-rc86f3-etapa-responsable-ejecucion.mjs');
const args = process.argv.slice(2);
console.log('RC8.6F.2 → delega a RC8.6F.3 (precedencia por evidencia de ejecución)\n');
const r = spawnSync(process.execPath, [target, ...args], {
  cwd: join(__dirname, '..'),
  encoding: 'utf8',
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
