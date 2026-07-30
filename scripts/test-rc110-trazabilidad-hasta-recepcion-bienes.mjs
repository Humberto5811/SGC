/**
 * RC110 — Trazabilidad central hasta Registro de Órdenes y Recepción de Bienes.
 * Valida cabecera (estadoVigente), recorrido completo y compatibilidad RC104–RC109.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { resolveEstadoExpedienteVigente } from '../shared/estadoExpedienteVigente.js';
import {
  sanitizeMovimientosTrasOrden,
  dedupeMovimientosTrazabilidad,
  sortMovimientosFechaDesc,
  resolveExpedienteEntityIds,
  obtenerTrazabilidad,
} from '../server/lib/trazabilidad.js';
import pool from '../server/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}

// collapseNotificacionDuplicates is not exported — re-test via sanitize + obtenerTrazabilidad
async function main() {
  console.log('\n=== RC110 — Trazabilidad hasta Recepción de Bienes ===\n');

  // —— Casos de resolvedor (sin BD) ——
  {
    const ccp = resolveEstadoExpedienteVigente({
      codigo_ccp: 'CCP-1',
      ccp_activo: true,
      estado_actual: 'CCP',
      workflowEtapa: 'CCP',
    });
    assert.equal(ccp.codigo, 'CCP_REGISTRADA');
    ok('1. Expediente solo hasta CCP → CCP_REGISTRADA');
  }
  {
    const v = resolveEstadoExpedienteVigente({
      codigo_ccp: 'CCP-1',
      ccp_activo: true,
      orden_id: 9,
      orden_estado: 'ORDEN_REGISTRADA',
    });
    assert.equal(v.codigo, 'ORDEN_REGISTRADA');
    ok('2. Expediente con orden registrada → ORDEN_REGISTRADA');
  }
  {
    const v = resolveEstadoExpedienteVigente({
      codigo_ccp: 'CCP-1',
      ccp_activo: true,
      orden_id: 9,
      orden_estado: 'ORDEN_NOTIFICADA',
      enviado_proveedor_at: '2026-07-28T05:14:48.000Z',
    });
    assert.equal(v.codigo, 'ORDEN_NOTIFICADA');
    ok('3. Expediente con orden notificada → ORDEN_NOTIFICADA');
  }
  {
    const v = resolveEstadoExpedienteVigente({
      codigo_ccp: 'CCP-1',
      ccp_activo: true,
      orden_id: 1,
      orden_estado: 'ORDEN_NOTIFICADA',
      enviado_proveedor_at: '2026-07-28T05:14:48.000Z',
      derivado_ejecucion_at: '2026-07-29T04:14:36.000Z',
      recepcion_bienes_expediente_id: 1,
      recepcion_estado_global: 'RECEPCION_BIENES_PENDIENTE',
    });
    assert.equal(v.codigo, 'RECEPCION_BIENES_PENDIENTE');
    assert.equal(v.label, 'OC pendiente de recepción');
    ok('4. Ingresado a Recepción de Bienes → RECEPCION_BIENES_PENDIENTE');
  }

  // —— Sanitize: no CCP “futuro” tras orden ——
  {
    const movs = [
      { fecha: '2026-07-27T10:00:00.000Z', accion: 'DERIVADO', etapa: 'CCP', fuente: 'historial' },
      {
        fecha: '2026-07-28T03:01:10.000Z', accion: 'ORDEN_REGISTRADA', etapa: 'REGISTRO_ORDEN',
        fuente: 'orden_eventos', id: 'orden-1',
      },
      {
        fecha: '2026-07-29T04:14:36.000Z', accion: 'ORDEN_INGRESADA_RECEPCION_BIENES',
        etapa: 'RECEPCION_BIENES', fuente: 'recepcion_bienes_eventos', id: 'rb-1',
      },
      { fecha: '2026-08-02T08:33:17.000Z', accion: 'DERIVADO', etapa: 'CCP', fuente: 'historial' },
    ];
    const clean = sanitizeMovimientosTrasOrden(movs);
    assert.ok(!clean.some((m) => m.fecha && m.fecha.startsWith('2026-08-02')), 'sin CCP post-orden');
    assert.ok(clean.some((m) => m.accion === 'ORDEN_INGRESADA_RECEPCION_BIENES'));
    const desc = sortMovimientosFechaDesc(clean);
    assert.equal(desc[0].accion, 'ORDEN_INGRESADA_RECEPCION_BIENES');
    ok('Sanitize + orden DESC: evento superior = ingreso Recepción');
  }

  // —— Dedup ——
  {
    const d = dedupeMovimientosTrazabilidad([
      { id: 'orden-1', fuente: 'orden_eventos', accion: 'ORDEN_REGISTRADA', fecha: '2026-07-28T03:01:10.000Z', estadoNuevo: 'ORDEN_REGISTRADA' },
      { id: 'orden-1', fuente: 'orden_eventos', accion: 'ORDEN_REGISTRADA', fecha: '2026-07-28T03:01:10.000Z', estadoNuevo: 'ORDEN_REGISTRADA' },
    ]);
    assert.equal(d.length, 1);
    ok('Dedup por fuente+id');
  }

  // —— Archivos FE: badge usa estadoVigente ——
  {
    assertFileContains(
      'src/views/requerimiento/reqShared.js',
      /renderEstadoExpedienteHtml\(estadoVigente\)/,
      'badge desde estadoVigente',
    );
    assertFileContains(
      'src/views/requerimiento/reqShared.js',
      /estadoVigente/,
      'contrato estadoVigente en modal',
    );
    assert.doesNotMatch(
      fs.readFileSync(path.join(root, 'src/views/requerimiento/reqShared.js'), 'utf8'),
      /estadoActualBadge\(\{\s*\.\.\.req/,
      'no badge legacy con spread req',
    );
    ok('5. Cabecera no usa estadoActualBadge(req) legacy');
  }

  // —— Caso real REQ-00001 / OC 717 ——
  let t;
  try {
    t = await obtenerTrazabilidad(1);
  } catch (e) {
    console.error('  ⚠ No se pudo cargar trazabilidad REQ 1:', e.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
  assert.ok(t, 'trazabilidad REQ-00001');

  const ids = await resolveExpedienteEntityIds({ requerimientoId: 1 });
  console.log('  IDs:', JSON.stringify(ids));

  const codigoVigente = t.estadoVigente?.codigo || t.estadoActual;
  assert.ok(
    ['RECEPCION_BIENES_PENDIENTE', 'BIEN_RECIBIDO_ALMACEN', 'RECEPCION_BIENES_OBSERVADA', 'CONFORMIDAD_PENDIENTE_AU'].includes(codigoVigente),
    `cabecera en etapa recepción, got ${codigoVigente}`,
  );
  assert.notEqual(String(t.estadoVigente?.label || ''), 'Derivado a CCP');
  ok('5b. Cabecera API ≠ Derivado a CCP');

  const subLabel = typeof t.expediente?.submoduloVigente === 'object'
    ? t.expediente.submoduloVigente.label
    : t.expediente?.submoduloVigente;
  assert.equal(subLabel || t.subModuloActual, 'Recepción de Bienes');
  ok('6. Submódulo = Recepción de Bienes');

  assert.match(String(t.expediente?.responsableActual || t.responsableActual || ''), /Almac[eé]n|Área Usuaria|AU/i);
  ok('7. Responsable = Almacén (o AU si ya derivado)');

  const movs = t.historialMovimientos || [];
  const acciones = new Set(movs.map((m) => String(m.accion || '').toUpperCase()));
  assert.ok(acciones.has('ORDEN_REGISTRADA'), 'contiene ORDEN_REGISTRADA');
  ok('8. Recorrido contiene ORDEN_REGISTRADA');
  assert.ok(acciones.has('CRONOGRAMA_ACTUALIZADO'), 'contiene CRONOGRAMA_ACTUALIZADO');
  ok('9. Contiene CRONOGRAMA_ACTUALIZADO');
  assert.ok(acciones.has('ORDEN_FIRMADA_ADJUNTADA'), 'contiene ORDEN_FIRMADA_ADJUNTADA');
  ok('10. Contiene ORDEN_FIRMADA_ADJUNTADA');
  assert.ok(acciones.has('ORDEN_NOTIFICADA'), 'contiene ORDEN_NOTIFICADA');
  ok('11. Contiene ORDEN_NOTIFICADA');
  assert.ok(acciones.has('ORDEN_INGRESADA_RECEPCION_BIENES'), 'contiene ingreso recepción');
  ok('12. Contiene ORDEN_INGRESADA_RECEPCION_BIENES');

  const topAccion = String(movs[0]?.accion || '').toUpperCase();
  assert.ok(
    /ORDEN_INGRESADA_RECEPCION_BIENES|RECEPCION_REGISTRADA|RECEPCION_OBSERVADA|ACTA_|DERIVADO|EXPEDIENTE_DERIVADO/.test(topAccion),
    `evento reciente en etapa recepción/acta, got ${topAccion}`,
  );
  ok('13. Evento más reciente pertenece a recepción/acta/derivación');

  const fi = t.expediente?.fechaInicioEtapa || t.fechaEstadoActual;
  assert.ok(fi, 'fecha inicio etapa');
  assert.ok(new Date(fi).getTime() >= new Date('2026-07-29T00:00:00.000Z').getTime(), 'inicio ≥ ingreso recepción');
  ok('14. Días en etapa desde Recepción de Bienes');

  const notifs = movs.filter((m) => String(m.accion).toUpperCase() === 'ORDEN_NOTIFICADA');
  assert.ok(notifs.length <= 1, `notificaciones globales ≤ 1, hay ${notifs.length}`);
  ok('15. No duplica intentos de notificación como transiciones globales');

  // Compat contratos RC104–RC109
  assertFileContains('shared/estadoExpedienteVigente.js', /RECEPCION_BIENES_PENDIENTE/, 'RC104 catalog');
  assertFileContains('server/lib/trazabilidad.js', /sanitizeMovimientosTrasOrden/, 'RC110 sanitize');
  assertFileContains('shared/expedienteDocumentos.js', /dedupeDocumentos|buildDocsCotizacionAdjudicada/, 'RC109 docs');
  ok('16. Compatibilidad estructural RC104–RC109');

  console.log('\n  Diagnóstico OC 717 / REQ-00001:');
  console.log(JSON.stringify({
    requerimientoId: ids.requerimientoId,
    ccpId: ids.ccpId,
    ordenId: ids.ordenId,
    recepcionBienesId: ids.recepcionBienesId,
    estadoVigente: t.estadoVigente,
    submoduloVigente: t.expediente?.submoduloVigente,
    responsableActual: t.expediente?.responsableActual,
    fechaInicioEtapa: t.expediente?.fechaInicioEtapa,
    diasEnEtapa: t.expediente?.diasEnEtapa,
    fuentesEventos: t.fuentesEventos,
    totalEventos: movs.length,
    eventoMasReciente: t.eventoMasReciente,
    top5: movs.slice(0, 5).map((m) => ({
      fecha: m.fecha, accion: m.accion, etiqueta: m.etiquetaAccion, fuente: m.fuente,
    })),
  }, null, 2));

  console.log('\n=== RC110 OK ===\n');
  await pool.end();
}

main().catch(async (e) => {
  console.error('\nRC110 FAIL:', e);
  await pool.end().catch(() => {});
  process.exit(1);
});
