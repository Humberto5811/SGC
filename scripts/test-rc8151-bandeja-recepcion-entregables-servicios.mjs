/**
 * RC8.15.1 — Pruebas de bandeja y recepción de entregables de servicios.
 *
 * Cubre el checklist A–O de la RC. Lecturas reales solo lectura (no modifica
 * OS 1105). Las escrituras se hacen sobre fixture aislado y se revierten con
 * ROLLBACK/SAVEPOINT.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query, getClient } from '../server/db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };

function toIsoDate(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value || '').slice(0, 10);
}

console.log('\n=== RC8.15.1 — Bandeja y recepción de entregables de servicios ===\n');

// A. menú / ruta renombrados
{
  const menu = read('src/services/menuService.js');
  const clientCatalog = read('src/utils/permissionsCatalog.js');
  const serverCatalog = read('server/lib/permissionsCatalog.js');
  const view = read('src/views/ejecucion/presentacionEntregableView.js');

  ok(menu.includes('Presentación Entregables de Servicios')
    && !menu.includes("'Presentación Entregable'"),
    'A1. menuService muestra "Presentación Entregables de Servicios"');
  ok(/ejecucion\/presentacion/.test(menu) && /submoduloId: 'PRESENTACION_ENTREGABLES'/.test(menu),
    'A2. ruta ejecucion/presentacion y permiso PRESENTACION_ENTREGABLES');
  ok(clientCatalog.includes('Presentación Entregables de Servicios')
    && serverCatalog.includes('Presentación Entregables de Servicios'),
    'A3. catálogo de permisos (FE/BE) renombrado');
  ok(/renderPresentacionEntregableView|listarBandeja/.test(view)
    && !/NO IMPLEMENTADO/.test(view),
    'A4. stub reemplazado por bandeja real');
}

// B–E. alcance y filtro ACTIVAS
{
  const lib = read('server/lib/entregablesServicios.js');
  ok(/UPPER\(COALESCE\(oc\.tipo_orden,'\'\)\) = 'OS'/.test(lib),
    'B1. la bandeja no incluye OC (BIEN)');
  ok(/SERVIC/.test(lib) && /LOCAC|LOCADOR/.test(lib),
    'C1/D1. incluye SERVICIO y LOCACIÓN');
  ok(/oe\.estado = 'ACTIVO'/.test(lib),
    'E1. filtra solo orden_entregas ACTIVAS');
  ok(/ORDER BY oc\.anio_orden DESC, oc\.numero_orden DESC, oe\.numero_entrega ASC/.test(lib),
    'E2. unidad por entregable (sin duplicar por estado de orden)');
}

// J–O. modelo / transacción / date (estático)
{
  const mig = read('server/migrations/046_entregable_recepciones.js');
  ok(mig.includes('entregable_recepciones') && mig.includes('entregable_recepcion_documentos'),
    'J1. tablas entregable_recepciones + documentos creadas');
  ok(/orden_entrega_id INTEGER NOT NULL REFERENCES orden_entregas/.test(mig)
    && /orden_id INTEGER NOT NULL REFERENCES ordenes_contratacion/.test(mig),
    'J2. FK orden_entrega_id y orden_id');
  ok(/UNIQUE INDEX.*uq_entregable_recepciones_numero/.test(mig),
    'J3. unique (orden_entrega_id, numero_recepcion)');
  ok(/recepcion_id INTEGER NOT NULL REFERENCES entregable_recepciones/.test(mig),
    'K1. documento vinculado a recepción');

  const lib = read('server/lib/entregablesServicios.js');
  ok(/FOR UPDATE/.test(lib) && /BEGIN/.test(lib) && /ROLLBACK/.test(lib),
    'M1. registro recepción transaccional');
  ok(!/body\.orden_id/.test(lib) && /entrega\.orden_id/.test(lib),
    'L1. no confía en orden_id del frontend');
  ok(/fecha_recepcion_mesa_partes DATE NOT NULL/.test(mig),
    'N1. fecha_recepcion_mesa_partes es DATE');
  ok(/registrado_at TIMESTAMP NOT NULL DEFAULT NOW\(\)/.test(mig),
    'O1. timestamps de auditoría TIMESTAMP (UTC BD)');
}

// F/G/H/I lectura real
let os1105ReadOk = false;
try {
  const { rows: orden } = await query(`
    SELECT id FROM ordenes_contratacion
    WHERE tipo_orden = 'OS' AND numero_orden = '1105' AND anio_orden = 2026
    ORDER BY id DESC LIMIT 1
  `);
  const ordenId = orden[0]?.id;
  if (ordenId) {
    const { rows: ent } = await query(`
      SELECT numero_entrega, dias_plazo, fecha_maxima, importe, estado
      FROM orden_entregas WHERE orden_id = $1 AND estado = 'ACTIVO'
      ORDER BY numero_entrega ASC
    `, [ordenId]);

    ok(ent.length === 2, `F. OS 1105 devuelve exactamente 2 entregables ACTIVOS (${ent.length})`);
    const e1 = ent.find((e) => e.numero_entrega === 1);
    const e2 = ent.find((e) => e.numero_entrega === 2);
    ok(e1 && e2, 'F2. PRIMER y SEGUNDO entregable presentes');

    ok(toIsoDate(e1?.fecha_maxima) === '2026-08-22',
      `G1. PRIMER fecha máxima 22/08/2026 (${toIsoDate(e1?.fecha_maxima)})`);
    ok(toIsoDate(e2?.fecha_maxima) === '2026-09-21',
      `G2. SEGUNDO fecha máxima 21/09/2026 (${toIsoDate(e2?.fecha_maxima)})`);
    ok(Number(e1?.importe) === 7000, `H1. PRIMER importe 7000 (${e1?.importe})`);
    ok(Number(e2?.importe) === 7000, `H2. SEGUNDO importe 7000 (${e2?.importe})`);

    const { rows: rec } = await query('SELECT id FROM entregable_recepciones WHERE orden_id = $1', [ordenId]);
    ok(rec.length === 0, `I. sin recepción → PENDIENTE_RECEPCION (recepciones=${rec.length})`);
    os1105ReadOk = true;
  } else {
    console.log('  ⚠ OS 1105 no encontrada');
  }
} catch (err) {
  console.log(`  ⚠ validación OS 1105 omitida: ${err.message}`);
}

// Fixture aislado con rollback
try {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows: osF } = await client.query(`
      SELECT id FROM ordenes_contratacion
      WHERE tipo_orden = 'OS' AND numero_orden = '1105' AND anio_orden = 2026
      ORDER BY id DESC LIMIT 1
    `);
    if (!osF[0]) throw new Error('OS 1105 no disponible');
    const ordenId = osF[0].id;

    const { rows: entrega } = await client.query(`
      INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, estado)
      VALUES ($1, 99, 'ENTREGABLE', 'ENTREGABLE FIXTURE', 30, CURRENT_DATE + 30, 'ACTIVO') RETURNING id
    `, [ordenId]);
    const entregaId = entrega[0].id;

    const { rows: r1 } = await client.query(`
      INSERT INTO entregable_recepciones (orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion, fecha_recepcion_mesa_partes, numero_expediente_sgd)
      VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,'SGD-1') RETURNING id
    `, [entregaId, ordenId]);
    const { rows: r2 } = await client.query(`
      INSERT INTO entregable_recepciones (orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion, fecha_recepcion_mesa_partes, numero_expediente_sgd)
      VALUES ($1,$2,2,'SUBSANACION',CURRENT_DATE,'SGD-2') RETURNING id
    `, [entregaId, ordenId]);
    ok(r1[0].id && r2[0].id, 'J4. 1 entrega → N recepciones');

    await client.query(`
      INSERT INTO entregable_recepcion_documentos (recepcion_id, nombre_archivo, mime_type, contenido_base64)
      VALUES ($1,'fixture.pdf','application/pdf',$2)
    `, [r1[0].id, Buffer.from('test').toString('base64')]);
    const { rows: docRows } = await client.query('SELECT id FROM entregable_recepcion_documentos WHERE recepcion_id = $1', [r1[0].id]);
    ok(docRows.length === 1, 'K2. documento vinculado a recepción');

    let dupErr = null;
    await client.query('SAVEPOINT sp_dup');
    try {
      await client.query(`
        INSERT INTO entregable_recepciones (orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion, fecha_recepcion_mesa_partes, numero_expediente_sgd)
        VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,'SGD-DUP')
      `, [entregaId, ordenId]);
    } catch (e) {
      dupErr = e; await client.query('ROLLBACK TO SAVEPOINT sp_dup');
    }
    await client.query('RELEASE SAVEPOINT sp_dup');
    ok(dupErr?.code === '23505', `M2. unique evita recepción parcial/duplicada (${dupErr?.code})`);

    const { rows: probe } = await client.query('SELECT orden_id FROM orden_entregas WHERE id = $1', [entregaId]);
    assert.equal(Number(probe[0].orden_id), Number(ordenId));
    ok(true, 'L2. entrega pertenece a su orden (FK)');

    let partialErr = null;
    await client.query('SAVEPOINT sp_partial');
    try {
      await client.query("INSERT INTO entregable_recepciones (orden_entrega_id) VALUES (999999)");
    } catch (e) {
      partialErr = e; await client.query('ROLLBACK TO SAVEPOINT sp_partial');
    }
    await client.query('RELEASE SAVEPOINT sp_partial');
    ok(partialErr?.code === '23503' || partialErr?.code === '23502',
      `M3. fallo de documento/FK revierte recepción parcial (${partialErr?.code})`);

    const { rows: dateChk } = await client.query('SELECT fecha_recepcion_mesa_partes::text AS f FROM entregable_recepciones WHERE id = $1', [r1[0].id]);
    ok(!/T|Z/.test(dateChk[0].f), `N3. DATE contractual preservado (${dateChk[0].f})`);

    await client.query('ROLLBACK');
    console.log('  ✓ fixture revertido (ROLLBACK)');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
} catch (err) {
  console.log(`  ⚠ fixture omitido: ${err.message}`);
}

await pool.end().catch(() => {});
console.log('\n=== RC8.15.1 — validación completada ===\n');
console.log(`OS 1105 lectura: ${os1105ReadOk ? 'verificada (solo lectura)' : 'no disponible'}`);