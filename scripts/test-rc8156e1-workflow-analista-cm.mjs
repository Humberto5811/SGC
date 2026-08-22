/**
 * RC8.15.6E-1 — Definición canónica del workflow del Analista CM.
 * Valida catálogo y aislamiento por orden_entrega_id; no implementa acciones UI.
 */
import pool, { query } from '../server/db.js';
import { EVENTOS, getEventoMeta } from '../shared/workflow/eventos.js';
import { ETAPAS, getEtapaMeta } from '../shared/workflow/etapas.js';
import { getTransition } from '../shared/workflow/transiciones.js';
import { PERFILES_FUNCIONALES } from '../server/utils/userRoleCatalog.js';
import { getEstadoCatalogEntry } from '../src/ui/workflow/estadoCatalogo.js';
import {
  inicializarEstadoResponsableEntregable,
  obtenerEstadoResponsableEntregable,
  transicionarEntregable,
} from '../server/lib/entregableEstadoPersistido.js';

let passed = 0;
let failed = 0;
let ordenId = null;

function ok(condition, message) {
  if (condition) { passed += 1; console.log(`  ✓ ${message}`); }
  else { failed += 1; console.error(`  ✗ ${message}`); }
}

async function snapshotEntregable(id) {
  return JSON.stringify({
    estado: (await query(
      'SELECT * FROM entregable_estado_vigente WHERE orden_entrega_id=$1',
      [id],
    )).rows,
    asignaciones: (await query(
      'SELECT * FROM entregable_asignaciones WHERE orden_entrega_id=$1 ORDER BY id',
      [id],
    )).rows,
    eventos: (await query(
      'SELECT * FROM entregable_eventos WHERE orden_entrega_id=$1 ORDER BY id',
      [id],
    )).rows,
  });
}

async function snapshotGlobal(requerimientoId) {
  return JSON.stringify({
    estado: (await query(
      'SELECT * FROM expediente_estado_vigente WHERE requerimiento_id=$1',
      [requerimientoId],
    )).rows,
    asignaciones: (await query(
      'SELECT * FROM expediente_asignaciones WHERE requerimiento_id=$1 ORDER BY id',
      [requerimientoId],
    )).rows,
    estado_actual: (await query(
      'SELECT estado_actual FROM requerimientos WHERE id=$1',
      [requerimientoId],
    )).rows,
  });
}

function transition(tipo, evento, origen = ETAPAS.REVISION_ANALISTA_CM) {
  return getTransition({
    tipoContratacion: tipo,
    etapaOrigen: origen,
    eventoCodigo: evento,
  });
}

console.log('\n=== RC8.15.6E-1 — Workflow canónico Analista CM ===\n');

const obsServicio = transition('SERVICIO', EVENTOS.ENTREGABLE_OBSERVADO_ANALISTA_CM);
const obsLocacion = transition('LOCACION', EVENTOS.ENTREGABLE_OBSERVADO_ANALISTA_CM);
const obsServicioPep = transition('SERVICIO', EVENTOS.ENTREGABLE_OBSERVADO_ANALISTA_CM, ETAPAS.PREPARACION_EXPEDIENTE_PAGO);
const pagoServicio = transition('SERVICIO', EVENTOS.ENTREGABLE_DERIVADO_PAGO, ETAPAS.PREPARACION_EXPEDIENTE_PAGO);
const pagoLocacion = transition('LOCACION', EVENTOS.ENTREGABLE_DERIVADO_PAGO, ETAPAS.PREPARACION_EXPEDIENTE_PAGO);

ok(EVENTOS.ENTREGABLE_OBSERVADO_ANALISTA_CM
  && getEventoMeta(EVENTOS.ENTREGABLE_OBSERVADO_ANALISTA_CM)?.tipo === 'DEVOLUCION',
'A. existe evento canónico de observación del Analista CM');
ok(obsServicio != null, 'B. Servicio admite observación desde Revisión Analista CM');
ok(obsLocacion != null, 'C. Locación admite observación desde Revisión Analista CM');
ok(obsServicio?.etapa_destino === ETAPAS.PRESENTACION_ENTREGABLES
  && obsLocacion?.etapa_destino === ETAPAS.PRESENTACION_ENTREGABLES,
'D. observación pasa temporalmente a Presentación Entregables');
ok(obsServicio?.responsable_destino === PERFILES_FUNCIONALES.AREA_USUARIA
  && obsLocacion?.responsable_destino === PERFILES_FUNCIONALES.AREA_USUARIA,
'E. responsable funcional temporal es AREA_USUARIA');

ok(EVENTOS.ENTREGABLE_DERIVADO_PAGO
  && getEventoMeta(EVENTOS.ENTREGABLE_DERIVADO_PAGO)?.tipo === 'DERIVACION'
  && EVENTOS.ENTREGABLE_DERIVADO_PAGO !== EVENTOS.EXPEDIENTE_DERIVADO_PAGO,
'F. Pago usa evento específico de scope entregable');
ok(obsServicioPep != null, 'B2. Preparación Pago admite observación Analista CM');
ok(pagoServicio?.etapa_destino === ETAPAS.DERIVACION_PAGO,
  'G. Servicio deriva desde Preparación Pago a DERIVACION_PAGO');
ok(pagoLocacion?.etapa_destino === ETAPAS.DERIVACION_PAGO,
  'H. Locación deriva desde Preparación Pago a DERIVACION_PAGO');
ok(pagoServicio?.responsable_destino === PERFILES_FUNCIONALES.ANALISTA_PAGO
  && pagoLocacion?.responsable_destino === PERFILES_FUNCIONALES.ANALISTA_PAGO,
'I. destino funcional de Pago es ANALISTA_PAGO');
ok(PERFILES_FUNCIONALES.ANALISTA_PAGO === 'ANALISTA_PAGO'
  && !Object.prototype.hasOwnProperty.call(PERFILES_FUNCIONALES, 'ANALISTA_PAGOS')
  && getEtapaMeta(ETAPAS.DERIVACION_PAGO)?.responsableCodigo === 'ANALISTA_PAGO',
'J. no se crea perfil ANALISTA_PAGOS');
ok(transition('BIEN', EVENTOS.ENTREGABLE_OBSERVADO_ANALISTA_CM) == null
  && transition('BIEN', EVENTOS.ENTREGABLE_DERIVADO_PAGO) == null,
'K. Bienes no adquiere transiciones del Analista CM');

const visualPrepPago = getEstadoCatalogEntry(ETAPAS.PREPARACION_EXPEDIENTE_PAGO);
const visualPago = getEstadoCatalogEntry(ETAPAS.DERIVACION_PAGO);
ok(visualPrepPago.categoria === 'DERIVADO'
  && visualPrepPago.icono !== 'bi-question-circle',
'L. PREPARACION_EXPEDIENTE_PAGO tiene representación visual conocida');
ok(visualPago.categoria === 'DERIVADO'
  && visualPago.icono !== 'bi-question-circle',
'M. DERIVACION_PAGO tiene representación visual conocida');

try {
  const base = (await query(`
    SELECT oc.requerimiento_id, oc.proveedor_id
    FROM ordenes_contratacion oc
    WHERE oc.requerimiento_id IS NOT NULL AND oc.proveedor_id IS NOT NULL
    ORDER BY oc.id LIMIT 1
  `)).rows[0];
  const usuario = (await query(`
    SELECT id, username FROM usuarios WHERE activo=TRUE ORDER BY id LIMIT 1
  `)).rows[0];
  if (!base || !usuario) throw new Error('No existe base mínima para fixture RC8.15.6E-1');

  ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,300,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156E1${Date.now()}`])).rows[0].id);

  async function crearEntrega(numero) {
    const id = Number((await query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        dias_plazo, fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO')
      RETURNING id
    `, [ordenId, numero, `Fixture E1 ${numero}`])).rows[0].id);
    await inicializarEstadoResponsableEntregable(id, { actualizadoPor: 'test-e1' });
    return id;
  }

  async function llevarARevisionAnalista(id) {
    await transicionarEntregable({
      ordenEntregaId: id,
      evento: EVENTOS.ENTREGABLE_DERIVADO_COORDINADOR_CM,
      usuarioOrigenId: usuario.id,
      ejecutadoPor: 'test-e1',
      usuarioDestinoId: usuario.id,
      unidadDestino: 'COORDINADOR_CM',
    });
    return transicionarEntregable({
      ordenEntregaId: id,
      evento: EVENTOS.ENTREGABLE_DERIVADO_ANALISTA_CM,
      usuarioOrigenId: usuario.id,
      ejecutadoPor: 'test-e1',
      usuarioDestinoId: usuario.id,
      unidadDestino: 'ANALISTA_CONTRATACIONES',
    });
  }

  const eObservacion = await crearEntrega(1);
  const ePago = await crearEntrega(2);
  const e2 = await crearEntrega(3);
  await llevarARevisionAnalista(eObservacion);
  await llevarARevisionAnalista(ePago);
  const e2Before = await snapshotEntregable(e2);
  const globalBefore = await snapshotGlobal(base.requerimiento_id);

  const retorno = await transicionarEntregable({
    ordenEntregaId: eObservacion,
    evento: EVENTOS.ENTREGABLE_OBSERVADO_ANALISTA_CM,
    usuarioOrigenId: usuario.id,
    ejecutadoPor: 'test-e1',
    usuarioDestinoId: usuario.id,
    unidadDestino: 'AREA_USUARIA',
    motivo: 'Fixture observación Analista CM',
  });
  const estadoRetorno = await obtenerEstadoResponsableEntregable(eObservacion);
  ok(retorno.estado?.etapa_codigo === ETAPAS.PRESENTACION_ENTREGABLES
    && estadoRetorno.etapaCodigo === ETAPAS.PRESENTACION_ENTREGABLES
    && await snapshotEntregable(e2) === e2Before,
  'N. observación transiciona solo el entregable afectado');

  const pago = await transicionarEntregable({
    ordenEntregaId: ePago,
    evento: EVENTOS.ENTREGABLE_DERIVADO_PAGO,
    usuarioOrigenId: usuario.id,
    ejecutadoPor: 'test-e1',
    usuarioDestinoId: usuario.id,
    unidadDestino: 'ANALISTA_PAGO',
    motivo: 'Fixture derivación Pago',
  });
  const estadoPago = await obtenerEstadoResponsableEntregable(ePago);
  ok(pago.estado?.etapa_codigo === ETAPAS.DERIVACION_PAGO
    && estadoPago.etapaCodigo === ETAPAS.DERIVACION_PAGO
    && estadoPago.responsableTipo === 'PERSONA'
    && await snapshotEntregable(e2) === e2Before,
  'O. Pago transiciona solo el entregable afectado');
  ok(await snapshotGlobal(base.requerimiento_id) === globalBefore,
    'P/Q. expediente_estado_vigente y requerimientos.estado_actual permanecen intactos');
} catch (error) {
  ok(false, `integración completada sin error inesperado (${error.message})`);
} finally {
  if (ordenId) {
    await query('DELETE FROM entregable_eventos WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_asignaciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_estado_vigente WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM orden_entregas WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordenId]);
  }
  await pool.end();
}

console.log(`\n=== Resultado RC8.15.6E-1: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
