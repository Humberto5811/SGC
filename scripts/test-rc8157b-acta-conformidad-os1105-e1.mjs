/**
 * RC8.15.7B — Acta Conformidad OS 1105 / Entregable 1 (solo lectura + generación).
 */
import assert from 'node:assert/strict';
import pool, { query } from '../server/db.js';
import { toIsoDateString } from '../server/lib/diasPlazo.js';
import { buildDatosActaConformidadServicio } from '../server/lib/entregablesServicios.js';
import { generateActaConformidadServiciosPdfServer } from '../server/lib/entregableConformidadPdfServer.js';

let passed = 0;
let failed = 0;
function ok(c, m) { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.error(`  ✗ ${m}`); } }

console.log('\n=== RC8.15.7B — Acta Conformidad OS 1105 / E1 ===\n');

const ctx = (await query(`
  SELECT
    oe.id AS orden_entrega_id,
    oe.etiqueta_entrega,
    oe.descripcion,
    r.denominacion,
    er_ini.fecha_recepcion_mesa_partes,
    er_ini.numero_expediente_sgd
  FROM orden_entregas oe
  JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
  JOIN requerimientos r ON r.id = oc.requerimiento_id
  LEFT JOIN entregable_recepciones er_ini
    ON er_ini.orden_entrega_id = oe.id
   AND UPPER(COALESCE(er_ini.tipo_recepcion, '')) = 'INICIAL'
  WHERE oc.tipo_orden = 'OS'
    AND oc.numero_orden = '1105'
    AND oe.numero_entrega = 1
    AND oe.estado = 'ACTIVO'
  ORDER BY oe.id
  LIMIT 1
`)).rows[0];

if (!ctx) {
  ok(false, 'fixture OS 1105 / Entregable 1 disponible');
} else {
  const e1 = Number(ctx.orden_entrega_id);
  const datos = await buildDatosActaConformidadServicio(e1);
  const pdf = generateActaConformidadServiciosPdfServer({ ...datos, version: 99 });
  const raw = Buffer.from(pdf.base64, 'base64').toString('latin1');
  const fechaIni = toIsoDateString(ctx.fecha_recepcion_mesa_partes);
  const servicioEsperado = String(ctx.denominacion || ctx.descripcion || '').trim();
  const etiquetaEsperada = String(ctx.etiqueta_entrega || '').trim();

  ok(fechaIni === '2026-08-20', '1. recepción INICIAL productiva = 20/08/2026');
  ok(pdf.fields.fecha_culminacion === '20/08/2026', '2. acta muestra fecha culminación 20/08/2026');
  ok(Boolean(servicioEsperado), '3. denominación contractual disponible');
  ok(datos.servicio_prestado === servicioEsperado, '4. servicio prestado = descripción real del requerimiento');
  ok(datos.servicio_prestado !== etiquetaEsperada || !etiquetaEsperada,
    '5. servicio prestado no usa etiqueta del entregable');
  ok(datos.informe_productos === etiquetaEsperada, '6. informe/productos = etiqueta del entregable');
  ok(pdf.fields.penalidad === 'NO CORRESPONDE', '7. penalidad = NO CORRESPONDE');
  assert.doesNotMatch(raw, /ACTA N\./);
  assert.doesNotMatch(raw, /N\. ENTREGABLE/);
  ok(true, '8. PDF sin ACTA N. ni N. ENTREGABLE');
  assert.match(pdf.nombre, /^ACTA-CS-1105-E1-V99\.pdf$/);
  ok(true, '9. versionado conservado en nombre de archivo');
}

await pool.end();
console.log(`\n=== Resultado 7B: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);
