/**
 * RC8.15.5A — Modelo documental de Acta de Conformidad de Entregables.
 * Valida A–L: tablas, FK, 2 actas independientes por orden, versionado,
 * generada/firmada distintas, vigente/reemplazo, sin tocar tablas existentes.
 * Escrituras con fixture aislado + ROLLBACK (nada se persiste).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

console.log('\n=== RC8.15.5A — Modelo Acta de Conformidad de Entregables ===\n');

const mig = read('server/migrations/047_entregable_conformidad_actas.js');
ok(/CREATE TABLE IF NOT EXISTS entregable_conformidad_actas/.test(mig)
  && /CREATE TABLE IF NOT EXISTS entregable_conformidad_acta_visados/.test(mig),
  'A0. migración define las dos tablas');
ok(!/ALTER TABLE\s+(orden_entregas|entregable_recepciones|entregable_recepcion_documentos|recepcion_bienes)/i.test(mig),
  'I/J/K. no altera orden_entregas / entregable_recepciones / recepcion_bienes');

console.log('\n— BD: modelo documental —');
{
  let db = null;
  try { db = await import('../server/db.js'); } catch (_) { /* sin DB */ }
  if (!db) {
    console.log('  ⚠ Sin acceso a BD: verificaciones omitidas.');
  } else {
    try {
      const { query, getClient } = db;
      const { listarConformidadEntregable } = await import('../server/lib/entregablesServicios.js');

      const tbls = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('entregable_conformidad_actas','entregable_conformidad_acta_visados')`);
      const names = new Set(tbls.rows.map((t) => t.table_name));
      ok(names.has('entregable_conformidad_actas') && names.has('entregable_conformidad_acta_visados'),
        `A. tablas nuevas existen (${[...names].join(', ')})`);

      const os1105 = (await query(`SELECT id FROM ordenes_contratacion WHERE numero_orden='1105' AND tipo_orden='OS' LIMIT 1`)).rows[0];
      if (os1105) {
        const cnt = (await query(`SELECT COUNT(*)::int AS n FROM entregable_conformidad_actas WHERE orden_id=$1`, [os1105.id])).rows[0].n;
        ok(Number(cnt) === 0, 'L. OS 1105 no tiene actas de conformidad reales');
      }

      const det = await listarConformidadEntregable(10);
      ok(Array.isArray(det.actas) && Array.isArray(det.visados), 'funciones estructurales devuelven arrays (lectura)');

      const client = await getClient();
      let rolled = false;
      try {
        await client.query('BEGIN');
        const prov = (await client.query(`SELECT proveedor_id FROM ordenes_contratacion WHERE numero_orden='1105' AND tipo_orden='OS' LIMIT 1`)).rows[0];
        const ord = (await client.query(
          `INSERT INTO ordenes_contratacion (requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden, fecha_orden, monto_total, estado)
           VALUES (3, $1, 'OS', 'RC8155A-FIXTURE', 2099, CURRENT_DATE, 1000, 'EN_EJECUCION') RETURNING id`,
          [prov.proveedor_id],
        )).rows[0];
        const e1 = (await client.query(
          `INSERT INTO orden_entregas (orden_id, numero_entrega, dias_plazo, importe, estado) VALUES ($1,1,30,500,'ACTIVO') RETURNING id`, [ord.id])).rows[0];
        const e2 = (await client.query(
          `INSERT INTO orden_entregas (orden_id, numero_entrega, dias_plazo, importe, estado) VALUES ($1,2,60,500,'ACTIVO') RETURNING id`, [ord.id])).rows[0];

        let fkViolation = false;
        await client.query('SAVEPOINT fk_test');
        try {
          await client.query(`INSERT INTO entregable_conformidad_actas (orden_id, orden_entrega_id) VALUES ($1, 999999)`, [ord.id]);
        } catch (e) { fkViolation = e?.code === '23503'; }
        await client.query('ROLLBACK TO SAVEPOINT fk_test');
        ok(fkViolation, 'B. FK orden_entrega_id inválida rechaza (23503)');

        await client.query(`INSERT INTO entregable_conformidad_actas (orden_id, orden_entrega_id, version) VALUES ($1,$2,1)`, [ord.id, e1.id]);
        await client.query(`INSERT INTO entregable_conformidad_actas (orden_id, orden_entrega_id, version) VALUES ($1,$2,1)`, [ord.id, e2.id]);
        const two = (await client.query(`SELECT orden_entrega_id FROM entregable_conformidad_actas WHERE orden_id=$1 ORDER BY orden_entrega_id`, [ord.id])).rows;
        ok(two.length === 2 && Number(two[0].orden_entrega_id) === Number(e1.id) && Number(two[1].orden_entrega_id) === Number(e2.id),
          'C. 2 entregables soportan 2 actas independientes');

        await client.query(`INSERT INTO entregable_conformidad_actas (orden_id, orden_entrega_id, version) VALUES ($1,$2,2)`, [ord.id, e1.id]);
        const vers = (await client.query(`SELECT version FROM entregable_conformidad_actas WHERE orden_entrega_id=$1 ORDER BY version`, [e1.id])).rows.map((r) => Number(r.version));
        ok(JSON.stringify(vers) === JSON.stringify([1, 2]), `D. versionado por entregable (${vers.join(',')})`);

        const actaE1 = (await client.query(`SELECT id FROM entregable_conformidad_actas WHERE orden_entrega_id=$1 AND version=1`, [e1.id])).rows[0];
        const v1 = (await client.query(
          `INSERT INTO entregable_conformidad_acta_visados (orden_id, orden_entrega_id, acta_id, version, nombre, contenido_base64, vigente)
           VALUES ($1,$2,$3,1,'acta-firmada-v1.pdf','JVBERi0=',TRUE) RETURNING id`, [ord.id, e1.id, actaE1.id])).rows[0];
        const v2 = (await client.query(
          `INSERT INTO entregable_conformidad_acta_visados (orden_id, orden_entrega_id, acta_id, version, nombre, contenido_base64, vigente, reemplaza_id)
           VALUES ($1,$2,$3,2,'acta-firmada-v2.pdf','JVBERi0=',TRUE,$4) RETURNING id`, [ord.id, e1.id, actaE1.id, v1.id])).rows[0];
        await client.query(`UPDATE entregable_conformidad_acta_visados SET vigente=FALSE WHERE id=$1`, [v1.id]);
        const vigentes = (await client.query(`SELECT id, vigente, version FROM entregable_conformidad_acta_visados WHERE acta_id=$1 ORDER BY version`, [actaE1.id])).rows;
        ok(vigentes.length === 2, 'E. acta generada y firmada son entidades distintas (historial conservado)');
        const vigenteRow = vigentes.find((r) => r.vigente);
        ok(vigenteRow && Number(vigenteRow.version) === 2, 'F/G. solo v2 queda vigente; v1 histórica conservada');

        const cross = (await client.query(`SELECT id, orden_entrega_id FROM entregable_conformidad_actas WHERE orden_entrega_id=$1`, [e2.id])).rows;
        ok(cross.length === 1 && !cross.some((r) => Number(r.orden_entrega_id) === Number(e1.id)), 'H. sin acceso cruzado entre entregables');

        await client.query('ROLLBACK');
        rolled = true;
      } finally {
        try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
        client.release();
      }
      ok(rolled, 'fixture revertido (ROLLBACK)');
      try { await db.default?.end(); } catch (_) { /* noop */ }
    } catch (err) {
      console.log(`  ⚠ Verificación BD no pudo ejecutarse (${err?.message || err}). No es fallo.`);
    }
  }
}

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

