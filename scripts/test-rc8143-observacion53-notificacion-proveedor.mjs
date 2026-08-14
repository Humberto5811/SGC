/**
 * RC8.14.3 — Observación 53 — documentos de notificación y cronograma.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listarDocsNotificacion,
  getDocNotificacion,
} from '../server/lib/ordenesContratacion.js';
import pool, { query } from '../server/db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (condition, message) => {
  assert.ok(condition, message);
  console.log(`  ✓ ${message}`);
};

console.log('\n=== RC8.14.3 — Observación 53 · Notificación al proveedor ===\n');

const modal = read('src/utils/registroOrdenModal.js');
const server = read('server/lib/ordenesContratacion.js');

ok(modal.includes('Documentos adjuntos'), '1. título “Documentos adjuntos”');
ok(!modal.includes('<th>Versión</th>') && !modal.includes('<th>Estado</th>'),
  '2. tabla sin columnas Versión ni Estado');
ok(/COTIZACION:\s*esServicioOLocacion \? 'Anexo 11'/.test(modal),
  '3. OS/LOCACIÓN identifica la propuesta económica como Anexo 11');
ok(/esServicioOLocacion[\s\S]*\[ordenFirmadaDoc, cronogramaDoc, cotizacionDoc\]/.test(server),
  '4. OS/LOCACIÓN adjunta orden firmada, cronograma y Anexo 11');
ok(/\[ordenFirmadaDoc, requerimientoDoc, cotizacionDoc, cronogramaDoc\]/.test(server),
  '5. BIEN conserva su composición documental previa');

for (const header of [
  'N°', 'Entregable', 'Descripción del entregable', 'Cantidad', 'Precio unitario',
  'Precio total', 'Días', 'Tipo días', 'Fecha inicio', 'Fecha máxima',
]) {
  ok(server.includes(`<th>${header}</th>`), `6. cronograma incluye columna ${header}`);
}
ok(/<tfoot>[\s\S]*TOTAL[\s\S]*totalImporte\.toFixed\(2\)/.test(server),
  '7. cronograma incluye total de precios totales');
ok(/fechaDocumento\(fila\.fechaInicio\)/.test(server)
  && /fechaDocumento\(fila\.fechaMaxima\)/.test(server),
'8. fechas de inicio y máxima usan formato documental sin hora');

// ---------------------------------------------------------------------------
// Validación real (solo lectura) contra la OS 1105. La orden se resuelve por
// su identidad lógica (tipo + número + año) y NO por un id físico.
// ---------------------------------------------------------------------------
const OS_TIPO = 'OS';
const OS_NUMERO = '1105';
const OS_ANIO = 2026;
let realOk = false;

try {
  const { rows } = await query(
    `SELECT id FROM ordenes_contratacion
     WHERE tipo_orden = $1 AND numero_orden = $2 AND anio_orden = $3
     ORDER BY id ASC
     LIMIT 1`,
    [OS_TIPO, OS_NUMERO, OS_ANIO],
  );
  const orden = rows[0];
  if (!orden) {
    throw new Error(
      `OS ${OS_NUMERO}/${OS_ANIO} (tipo ${OS_TIPO}) no encontrada en ordenes_contratacion`,
    );
  }
  const ordenId = Number(orden.id);

  const meta = await listarDocsNotificacion(ordenId);
  const tipos = meta.documentos.map((d) => d.tipo);
  assert.deepEqual(tipos, ['ORDEN_FIRMADA', 'CRONOGRAMA', 'COTIZACION']);
  ok(true, '9. OS 1105 devuelve exactamente los tres documentos requeridos');
  ok(!tipos.includes('REQUERIMIENTO'), '10. OS 1105 no incluye adjuntos/declaración del requerimiento');
  ok(/Anexo_11/i.test(meta.documentos.find((d) => d.tipo === 'COTIZACION')?.nombre || ''),
    '11. documento económico real es Anexo 11');

  const cron = await getDocNotificacion(ordenId, 'CRONOGRAMA', { includeContent: true });
  const html = Buffer.from(cron.contenido_base64, 'base64').toString('utf8');
  ok(/24\/07\/2026/.test(html), '12. fecha de inicio en dd/mm/yyyy');
  ok(/22\/08\/2026/.test(html) && /21\/09\/2026/.test(html),
    '13. fechas máximas en dd/mm/yyyy');
  ok(!/T\d{2}:\d{2}|GMT|00:00:00/.test(html), '14. cronograma no muestra horas');
  ok(/<th>14000\.00<\/th>/.test(html), '15. total de precios totales = 14000.00');

  realOk = true;
} catch (error) {
  console.log(`  ✗ Validación real FALLÓ: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

console.log(realOk
  ? '\n=== RC8.14.3 — pruebas OK ===\n'
  : '\n=== RC8.14.3 — pruebas FALLARON ===\n');
