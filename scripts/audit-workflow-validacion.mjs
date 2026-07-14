/**
 * RC7.6.4 — Auditoría y reparación controlada de sincronización Workflow Validación AU.
 * Uso:
 *   node scripts/audit-workflow-validacion.mjs --codigo 00016
 *   node scripts/audit-workflow-validacion.mjs --codigo 00016 --fix
 */
import { query } from '../server/db.js';
import { enrichRequerimientoRow, registrarMovimiento, ETAPAS } from '../server/lib/trazabilidad.js';
import { syncRequerimientosSolicitudWorkflow } from '../server/lib/cotizacionWorkflowSync.js';
import { enrichReqRow } from '../src/utils/trazabilidad.js';
import { buildEstadoVisual } from '../src/utils/estadoVisualPresenter.js';

const args = process.argv.slice(2);
const codigoArg = args.find((a) => a.startsWith('--codigo='))?.split('=')[1]
  || (args.includes('--codigo') ? args[args.indexOf('--codigo') + 1] : null);
const doFix = args.includes('--fix');

if (!codigoArg) {
  console.error('Uso: node scripts/audit-workflow-validacion.mjs --codigo 00016 [--fix]');
  process.exit(1);
}

const codigo = codigoArg.includes('REQ-') ? codigoArg : `REQ-${String(codigoArg).padStart(5, '0')}`;

async function loadReq() {
  const { rows } = await query('SELECT * FROM requerimientos WHERE codigo = $1', [codigo]);
  return rows[0] || null;
}

async function loadCotizaciones(reqId) {
  const { rows } = await query(`
    SELECT cot.id, cot.solicitud_id, cot.requerimiento_id, cot.estado, cot.validacion_estado,
           cot.validacion_responsable, cot.fecha_presentacion, cot.updated_at,
           sc.codigo AS solicitud_codigo
    FROM cotizaciones_proveedor cot
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    WHERE cot.requerimiento_id = $1
       OR cot.solicitud_id IN (SELECT solicitud_id FROM solicitud_requerimientos WHERE requerimiento_id = $1)
    ORDER BY cot.updated_at DESC
  `, [reqId]);
  return rows;
}

async function loadUltimoEvento(reqId) {
  const { rows } = await query(`
    SELECT evento, detalle, usuario, created_at
    FROM trazabilidad_portal
    WHERE requerimiento_id = $1
    ORDER BY created_at DESC LIMIT 5
  `, [reqId]).catch(() => ({ rows: [] }));
  return rows;
}

function parsePayload(row) {
  try {
    return typeof row?.payload === 'string' ? JSON.parse(row.payload || '{}') : (row?.payload || {});
  } catch (_) {
    return {};
  }
}

function etapaEsperada(cotizaciones) {
  const derivada = cotizaciones.find((c) => String(c.validacion_estado || '').toUpperCase() === 'DERIVADA');
  if (derivada) return { etapa: 'VALIDACION_USUARIO', responsable: derivada.validacion_responsable };
  const presentada = cotizaciones.find((c) => String(c.estado || '').toUpperCase() === 'COTIZACION_PRESENTADA');
  if (presentada) return { etapa: 'RECEPCION_COTIZACIONES', responsable: ETAPAS.RECEPCION_COTIZACIONES.responsable };
  return null;
}

function reportChain(label, row) {
  const serverEnriched = enrichRequerimientoRow(row);
  const clientEnriched = enrichReqRow(row);
  const visual = buildEstadoVisual(row);
  console.log(`\n--- ${label} ---`);
  console.log('persistencia:', {
    estado: row.estado,
    estado_actual: row.estado_actual,
    sub_modulo_actual: row.sub_modulo_actual,
    responsable_actual: row.responsable_actual,
    workflowSnapshot: parsePayload(row).workflowSnapshot || null,
  });
  console.log('API enrichRequerimientoRow:', {
    estado_actual: serverEnriched.estado_actual,
    sub_modulo_actual: serverEnriched.sub_modulo_actual,
    responsable_actual: serverEnriched.responsable_actual,
  });
  console.log('client enrichReqRow:', {
    estado_actual: clientEnriched.estado_actual,
    subModuloActual: clientEnriched.subModuloActual,
    responsableActual: clientEnriched.responsableActual,
  });
  console.log('Presenter buildEstadoVisual:', {
    workflowActual: visual.workflowActual,
    textoPrincipal: visual.textoPrincipal,
    moduloResponsable: visual.moduloResponsable,
  });
}

const row = await loadReq();
if (!row) {
  console.error(`No se encontró ${codigo}`);
  process.exit(1);
}

const cotizaciones = await loadCotizaciones(row.id);
const eventos = await loadUltimoEvento(row.id);
const esperado = etapaEsperada(cotizaciones);

console.log(`\n=== AUDITORÍA ${codigo} (id=${row.id}) ===`);
console.log('Cotizaciones:', cotizaciones.length ? cotizaciones : 'ninguna');
console.log('Últimos eventos portal:', eventos.length ? eventos : 'ninguno');
console.log('Etapa esperada según cotización:', esperado || '—');

reportChain('CADENA evento → persistencia → API → enrich → Presenter → render', row);

const actualEtapa = String(row.estado_actual || '').toUpperCase();
const necesitaReparacion = esperado && actualEtapa !== esperado.etapa;
console.log('\n¿Requiere reparación?', necesitaReparacion ? 'SÍ' : 'NO');

if (doFix && necesitaReparacion && esperado) {
  const solicitudId = cotizaciones[0]?.solicitud_id;
  if (!solicitudId) {
    console.error('No hay solicitud_id para reparar');
    process.exit(1);
  }
  console.log('\n=== MODO --fix (idempotente) ===');
  await syncRequerimientosSolicitudWorkflow(solicitudId, {
    etapaDestino: esperado.etapa,
    usuario: 'Script RC7.6.4',
    observacion: `Reparación controlada — sincronizar ${codigo} a ${esperado.etapa}`,
    etapaEjecutor: actualEtapa || 'RECEPCION_COTIZACIONES',
    responsable: esperado.responsable,
    forzar: false,
  });
  const fresh = await loadReq();
  reportChain('DESPUÉS DE --fix', fresh);
  console.log('\nReparación aplicada.');
} else if (doFix) {
  console.log('Sin cambios (--fix omitido: ya sincronizado o sin etapa esperada).');
}

process.exit(0);
