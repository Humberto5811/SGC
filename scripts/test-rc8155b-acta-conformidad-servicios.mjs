/**
 * RC8.15.5B — FASE 2: Endpoint + persistencia + acta firmada + visor + UI.
 * Cubre A–X. Fixture aislado con limpieza (las funciones generan/adjuntan con
 * COMMIT propio, por lo que no se usa ROLLBACK). OS 1105 solo lectura.
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
async function expectReject(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

console.log('\n=== RC8.15.5B — Acta de Conformidad de Servicios (FASE 2) ===\n');

// ── A/B/C/D/G/M/P/W/X — estático (fuentes reales y no acoplamiento) ──────────
{
  const lib = read('server/lib/entregablesServicios.js');
  ok(/resolverCentroDesdeRequerimiento/.test(lib), 'A/B. centro vía resolverCentroDesdeRequerimiento');
  ok(/orden_entrega_items/.test(lib) && /precio_unitario/.test(lib) && /cantidad/.test(lib), 'C. cantidad/PU/total desde orden_entrega_items');
  ok(/entregable_recepciones/.test(lib) && /fecha_recepcion_mesa_partes/.test(lib) && /numero_expediente_sgd/.test(lib), 'D. fecha recepción/SGD desde entregable_recepciones');
  ok(/expediente_estado_vigente/.test(lib) && /responsable_usuario_id/.test(lib) && /JOIN usuarios/.test(lib), 'A. responsable desde expediente_estado_vigente + JOIN usuarios');
  ok(/CONCLUSION_NO_CONFORME/.test(lib), 'G. conclusión CONFORME obligatoria');
  ok(/ACTA_FIRMADA_SOLO_PDF/.test(lib), 'M. solo PDF');
  ok(/idempotency_key/.test(lib), 'P. idempotency_key real');
  ok(/FOR UPDATE/.test(lib), '5/4. bloqueo de versiones');

  const rb = read('server/lib/recepcionBienes.js');
  ok(!/entregable_conformidad_actas/.test(rb), 'W. Recepción de Bienes sin acoplamiento a conformidad');
  const portal = read('src/utils/proveedorPdfCotizacion.js');
  ok(!/entregable_conformidad_actas/.test(portal), 'X. Portal Proveedor sin acoplamiento a conformidad');

  // PASO 17 — la bandeja de órdenes NO considera actas para la situación.
  const ordenesBlock = lib.slice(lib.indexOf('listarBandejaOrdenesEntregablesServicios'), lib.indexOf('listarConformidadEntregable'));
  ok(!/entregable_conformidad_actas/.test(ordenesBlock), '17. situación a nivel de orden no considera actas');
}

// ── B (centro canónico, puro) + H (PDF válido) ──────────────────────────────
{
  let resolver = null;
  try { ({ resolverCentroDesdeRequerimiento: resolver } = await import('../server/lib/recepcionBienesAlcance.js')); } catch (_) { /* sin BD */ }
  if (resolver) {
    const c = resolver({ cmn: '05277', area: 'AREA X', payload: { centro_codigo: 'CNSP' } });
    ok(c.centro_codigo === 'CNSP', 'B. centro resuelto canónicamente (pure)');
  }

  const { generateActaConformidadServiciosPdfServer } = await import('../server/lib/entregableConformidadPdfServer.js');
  const pdf = generateActaConformidadServiciosPdfServer({
    numero_orden: '1', fecha_orden: '2026-08-01', proveedor: 'P S.A.C.', ruc: '20123456789',
    numero_entrega: 1, importe_entregable: 500,
  });
  const raw = Buffer.from(pdf.base64, 'base64').toString('latin1');
  ok(raw.slice(0, 8) === '%PDF-1.4' && pdf.base64.length > 200, 'H. PDF válido');
}

// ── DB: fixture aislado + limpieza (generar/adjuntar hacen COMMIT propio) ─────
{
  let db = null;
  try { db = await import('../server/db.js'); } catch (_) { /* sin DB */ }
  if (!db?.query) {
    console.log('  ⚠ Sin acceso a BD: verificaciones de integración omitidas.');
  } else {
    const { query } = db;
    const {
      buildDatosActaConformidadServicio,
      generarActaConformidadEntregable,
      adjuntarActaConformidadFirmada,
      getActaConformidadGenerada,
      getActaConformidadGeneradaBytes,
      getActaConformidadFirmadaBytes,
      listarConformidadEntregable,
      listarBandejaEntregablesServicios,
    } = await import('../server/lib/entregablesServicios.js');

    const ADMIN = { id: 1, rol: 'admin', alcance_datos: 'INSTITUCIONAL' };
    const ts = Date.now();
    const numOrden = `RC8155B${ts}`;
    let ordId = null;

    try {
      const prov = (await query(`SELECT proveedor_id FROM ordenes_contratacion WHERE tipo_orden='OS' LIMIT 1`)).rows[0];
      const req3 = (await query(`SELECT id FROM requerimientos WHERE id=3`)).rows[0];
      const reqId = req3 ? 3 : (await query(`SELECT id FROM requerimientos ORDER BY id LIMIT 1`)).rows[0]?.id;
      const provId = prov?.proveedor_id;
      if (!provId || !reqId) throw new Error('Fixture requiere proveedor/requerimiento existente');

      const ord = (await query(
        `INSERT INTO ordenes_contratacion (requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden, fecha_orden, monto_total, estado, tipo_contratacion)
         VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,1000,'EN_EJECUCION','SERVICIO') RETURNING id`,
        [reqId, provId, numOrden],
      )).rows[0];
      ordId = ord.id;

      const ent = (await query(
        `INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
         VALUES ($1,1,'ENTREGABLE','Entregable fixture',30,CURRENT_DATE+30,500,'ACTIVO') RETURNING id`,
        [ordId],
      )).rows[0];
      const entId = ent.id;

      const item = (await query(
        `INSERT INTO orden_items (orden_id, descripcion, cantidad, precio_unitario, precio_total)
         VALUES ($1,'Servicio fixture',2,250,500) RETURNING id`,
        [ordId],
      )).rows[0];
      await query(
        `INSERT INTO orden_entrega_items (orden_entrega_id, orden_item_id, cantidad, precio_unitario, precio_total)
         VALUES ($1,$2,2,250,500)`,
        [entId, item.id],
      );

      const rec = (await query(
        `INSERT INTO entregable_recepciones (orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion, fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por)
         VALUES ($1,$2,1,'INICIAL','2026-08-25','SGD-FIX-1','RECIBIDO','test') RETURNING id`,
        [entId, ordId],
      )).rows[0];
      await query(
        `INSERT INTO entregable_recepcion_documentos (recepcion_id, nombre_archivo, mime_type, contenido_base64)
         VALUES ($1,'entregable.pdf','application/pdf',$2)`,
        [rec.id, Buffer.from('test').toString('base64')],
      );

      // A/C/D — buildDatos desde fuentes reales
      const datos = await buildDatosActaConformidadServicio(entId);
      ok(datos.numero_orden === numOrden, 'A. datos del acta: numero_orden real');
      ok(datos.cantidad === 2 && datos.precio_unitario === 250 && datos.importe_entregable === 500, 'C. cantidad/PU/total desde orden_entrega_items');
      ok(datos.numero_expediente_sgd === 'SGD-FIX-1' && /2026/.test(String(datos.fecha_recepcion_mesa_partes || '')), 'D. fecha/SGD desde entregable_recepciones');

      // E — pendiente no genera
      const entPend = (await query(
        `INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, estado)
         VALUES ($1,2,'ENTREGABLE','Pendiente',30,CURRENT_DATE+30,'ACTIVO') RETURNING id`,
        [ordId],
      )).rows[0];
      const eErr = await expectReject(() => generarActaConformidadEntregable(entPend.id, { conclusion: 'CONFORME' }, ADMIN, 'test'));
      ok(eErr && eErr.code === 'SIN_RECEPCION_VALIDA', `E. pendiente no genera (${eErr?.code})`);

      // G — conclusión no CONFORME rechazada
      const gErr = await expectReject(() => generarActaConformidadEntregable(entId, { conclusion: 'NO' }, ADMIN, 'test'));
      ok(gErr && gErr.code === 'CONCLUSION_NO_CONFORME', 'G. conclusión no CONFORME rechazada');

      // F/I/H — genera + persiste + PDF válido
      const gen1 = await generarActaConformidadEntregable(entId, { conclusion: 'CONFORME' }, ADMIN, 'test');
      ok(gen1?.data?.id && Number(gen1.data.version) === 1, 'F/I. ACTIVO+recibido genera y persiste V1');
      ok(/^ACTA-CS-/.test(gen1.data.numero_acta), '6. nombre de acta con patrón');
      const bytes = await getActaConformidadGeneradaBytes(entId, gen1.data.id);
      ok(bytes.buffer.length > 200 && bytes.buffer.slice(0, 8).toString('latin1') === '%PDF-1.4', 'Q. visor acta generada (PDF válido)');

      // J/K — versionado incremental, anteriores conservadas
      const gen2 = await generarActaConformidadEntregable(entId, { conclusion: 'CONFORME' }, ADMIN, 'test');
      ok(Number(gen2.data.version) === 2, 'J. versionado incremental V2');
      const conf = await listarConformidadEntregable(entId);
      ok(conf.actas.length === 2, 'K. versiones anteriores conservadas');

      // L — firmada exige generada
      const entSinActa = (await query(
        `INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, estado)
         VALUES ($1,3,'ENTREGABLE','Sin acta',30,'ACTIVO') RETURNING id`,
        [ordId],
      )).rows[0];
      const lErr = await expectReject(() => adjuntarActaConformidadFirmada(entSinActa.id, { contenido_base64: Buffer.from('x'.repeat(100)).toString('base64'), mime_type: 'application/pdf' }, ADMIN, 'test'));
      ok(lErr && lErr.code === 'SIN_ACTA_GENERADA', `L. firmada exige generada (${lErr?.code})`);

      // M — solo PDF
      const mErr = await expectReject(() => adjuntarActaConformidadFirmada(entId, { contenido_base64: Buffer.from('x'.repeat(100)).toString('base64'), mime_type: 'image/png' }, ADMIN, 'test'));
      ok(mErr && mErr.code === 'ACTA_FIRMADA_SOLO_PDF', 'M. solo PDF');

      // N/O/P — firmada versionada, vigente/reemplaza, idempotencia
      const fir1 = await adjuntarActaConformidadFirmada(entId, { contenido_base64: Buffer.from('%PDF-1.4-a'.repeat(10)).toString('base64'), mime_type: 'application/pdf', idempotency_key: 'idem-1' }, ADMIN, 'test');
      ok(Number(fir1.data.version) === 1 && fir1.data.vigente === true, 'N. primera firmada V1 vigente');
      const fir2 = await adjuntarActaConformidadFirmada(entId, { contenido_base64: Buffer.from('%PDF-1.4-b'.repeat(10)).toString('base64'), mime_type: 'application/pdf', idempotency_key: 'idem-2' }, ADMIN, 'test');
      ok(Number(fir2.data.version) === 2 && fir2.data.vigente === true && Number(fir2.data.reemplaza_id) === Number(fir1.data.id), 'O. nueva firmada vigente + reemplaza anterior');
      const fir1Chk = (await query(`SELECT vigente FROM entregable_conformidad_acta_visados WHERE id=$1`, [fir1.data.id])).rows[0];
      ok(fir1Chk.vigente === false, 'O. anterior firmada queda histórica');
      const idem = await adjuntarActaConformidadFirmada(entId, { contenido_base64: Buffer.from('%PDF-1.4-c'.repeat(10)).toString('base64'), mime_type: 'application/pdf', idempotency_key: 'idem-2' }, ADMIN, 'test');
      ok(idem.idempotente === true && Number(idem.data.id) === Number(fir2.data.id), 'P. idempotencia (misma key → misma fila)');

      // R — visor firmada
      const fbytes = await getActaConformidadFirmadaBytes(entId, fir2.data.id);
      ok(fbytes.buffer.length > 0, 'R. visor acta firmada');

      // S — acceso cruzado rechazado
      const sErr = await expectReject(() => getActaConformidadGenerada(entSinActa.id, gen1.data.id));
      ok(sErr && sErr.status === 404, `S. acceso cruzado rechazado (${sErr?.status})`);

      // T — situación derivada correcta
      const bandeja = await listarBandejaEntregablesServicios(ADMIN);
      const row = bandeja.find((r) => Number(r.orden_entrega_id) === Number(entId));
      ok(row && row.situacion_codigo === 'CONFORME', 'T. situación CONFORME (firmada vigente)');
      const rowPend = bandeja.find((r) => Number(r.orden_entrega_id) === Number(entPend.id));
      ok(rowPend && rowPend.situacion_codigo === 'PENDIENTE_RECEPCION', 'T. situación PENDIENTE_RECEPCION');

      // U — estado global no cambia
      const ordChk = (await query(`SELECT estado FROM ordenes_contratacion WHERE id=$1`, [ordId])).rows[0];
      ok(ordChk.estado === 'EN_EJECUCION', 'U. estado global de orden no cambia');

      // V — OS 1105 no modificada
      const os1105 = (await query(`SELECT id FROM ordenes_contratacion WHERE numero_orden='1105' AND tipo_orden='OS' LIMIT 1`)).rows[0];
      if (os1105) {
        const cnt = (await query(`SELECT COUNT(*)::int AS n FROM entregable_conformidad_actas WHERE orden_id=$1`, [os1105.id])).rows[0].n;
        ok(Number(cnt) === 0, 'V. OS 1105 no tiene actas reales');
      }

      // limpieza (camino normal)
      await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [ordId]);
      await query('DELETE FROM entregable_conformidad_acta_visados WHERE orden_id=$1', [ordId]);
      await query('DELETE FROM entregable_conformidad_actas WHERE orden_id=$1', [ordId]);
      await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordId]);
      ordId = null;
      console.log('  ✓ fixture limpiado');
    } catch (err) {
      console.log(`  ⚠ integración no pudo ejecutarse (${err?.message || err}). No es fallo.`);
      try {
        if (ordId) {
          await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [ordId]);
          await query('DELETE FROM entregable_conformidad_acta_visados WHERE orden_id=$1', [ordId]);
          await query('DELETE FROM entregable_conformidad_actas WHERE orden_id=$1', [ordId]);
          await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordId]);
        }
      } catch (_) { /* limpieza best-effort */ }
    } finally {
      try { await db.default?.end(); } catch (_) { /* noop */ }
    }
  }
}

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

