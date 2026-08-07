/**
 * Cuadro Comparativo (RC8.1–RC8.8) — bandeja + matriz + Anexo 8A + firma + CCP.
 * La salida APTO → CUADRO_COMPARATIVO permanece en validacionesCotizacion.js.
 * Derivación a CCP usa Workflow oficial (CUADRO_COMPARATIVO → CCP).
 */
import { query } from '../db.js';
import {
  buildMatrizComparativaBienes,
  validateEconomiaCuadro,
  mergeObservacionesCuadro,
  stripArchivosFromDatosJson,
  attachPrimeraFuenteFromCotizaciones,
} from './cuadroComparativoMapper.js';
import {
  aplicarRecomendacionesMatriz,
  mergeAdjudicacionCuadro,
  aplicarAdjudicacionMatriz,
  MODALIDAD_ADJUDICACION,
} from './cuadroComparativoAdjudicacion.js';
import { registrarTrazaPortal } from './invitaciones.js';
import { syncRequerimientosSolicitudWorkflow } from './cotizacionWorkflowSync.js';
import { resolveCentrosTextoSolicitud, esCodigoCmnCentro } from './validacionesCotizacion.js';
import {
  calcularResultadoCotizacion,
  normalizeTipoValidacion,
} from './validacionFormatos.js';
import { TRANSICIONES_POR_ACCION } from '../../core/workflowEngine/WorkflowTransitions.js';
import { ETAPAS } from '../../core/workflowEngine/WorkflowState.js';
import {
  ESTADOS_REVISION_CUADRO,
  ESTADOS_REVISION_LABEL,
  findTransicionRevision,
  syncRevisionCuadroWorkflow,
  registrarEventoCuadroCcp,
  EVENTOS_TRAZA_CUADRO_CCP,
  accionesDisponiblesRevision,
  resolveRolRevision,
  resolveRolEfectivoRevision,
  resolveModoAperturaExpediente,
  labelRolRevision,
  assertSalidaCcpOficial,
  RESPONSABLES_REVISION,
  BANDEJA_ESTADOS_POR_ROL,
  responsableBandejaPorEstado,
} from './cuadroComparativoRevision.js';
import {
  crearNuevaVersionPorObservacion,
  metaVersionDesdeRow,
} from './cuadroComparativoVersionado.js';
import { emitirObservacion } from './observacionesWorkflow.js';
import { enrichEstadoResponsableForBandeja } from './enrichEstadoResponsable.js';
import {
  resolveEstadoExpedienteVigente,
  getLabelEstado,
  normalizeEstadoCode,
} from '../../shared/estadoExpedienteVigente.js';

/**
 * RC8.5-D1 — Persiste observación del cuadro en el historial institucional
 * (requerimientos.payload.observaciones). Sin tabla nueva.
 */
async function registrarObservacionInstitucionalDesdeCuadro(solicitudId, {
  motivo,
  usuario,
  origen_submodulo,
  destino_submodulo,
  destino_etapa,
  destino_persona,
  observacion_padre_id,
  accionRevision,
} = {}) {
  const sid = parseInt(solicitudId, 10);
  const texto = String(motivo || '').trim();
  if (!Number.isFinite(sid) || !texto) return { registrados: 0 };

  const origen = String(origen_submodulo || (
    String(accionRevision || '').includes('DEC') ? 'DEC' : 'Cuadro Comparativo'
  )).trim() || 'Cuadro Comparativo';

  const { rows } = await query(`
    SELECT r.id, r.payload
    FROM solicitud_requerimientos sr
    JOIN requerimientos r ON r.id = sr.requerimiento_id
    WHERE sr.solicitud_id = $1
    ORDER BY r.id ASC
  `, [sid]);

  let registrados = 0;
  for (const row of rows) {
    let payload = {};
    try { payload = JSON.parse(row.payload || '{}'); } catch (_) { payload = {}; }
    emitirObservacion(payload, {
      motivo: texto,
      gerente: String(usuario || '').slice(0, 150) || 'Sistema',
      origen,
      origen_submodulo: origen,
      destino_submodulo: String(destino_submodulo || 'Cuadro Comparativo'),
      destino_etapa: String(destino_etapa || 'CUADRO_COMPARATIVO'),
      destino_persona: String(destino_persona || ''),
      observacion_padre_id: observacion_padre_id || null,
    });
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [
      row.id,
      JSON.stringify(payload),
    ]);
    registrados += 1;
  }
  return { registrados };
}

/**
 * RC8.8 — Gates para Generar / Derivar CCP.
 * Exige aprobaciones Coord+DEC, versión vigente y PDFs firmados.
 */
export function evaluarListoParaCcp(row) {
  const estado = String(row?.estado || '').toUpperCase();
  const datos = typeof row?.datos_json === 'string'
    ? (() => { try { return JSON.parse(row.datos_json || '{}'); } catch (_) { return {}; } })()
    : (row?.datos_json || {});
  const faltantes = [];
  if (estado === 'ANULADO') faltantes.push('versión vigente (cuadro anulado)');
  if (!['APROBADO_DEC', 'PENDIENTE_CCP'].includes(estado)) {
    faltantes.push('estado APROBADO_DEC (aprobación completa)');
  }
  if (!datos.revision_coordinador?.conformidad) faltantes.push('aprobación Coordinador');
  if (!datos.revision_dec?.conformidad) faltantes.push('aprobación DEC');
  if (!(row?.firmado_contenido || row?.firmado_nombre || row?.tiene_pdf_firmado)) {
    faltantes.push('PDF firmado Coordinador');
  }
  if (!(row?.firmado_dec_contenido || row?.firmado_dec_nombre || row?.tiene_pdf_firmado_dec)) {
    faltantes.push('PDF firmado DEC');
  }
  if (!(row?.pdf_contenido || row?.pdf_nombre || row?.tiene_pdf)) {
    faltantes.push('PDF del Anexo generado');
  }
  return {
    ok: faltantes.length === 0,
    faltantes,
    vigente: estado !== 'ANULADO',
    conformidad_coordinador: !!datos.revision_coordinador?.conformidad,
    conformidad_dec: !!datos.revision_dec?.conformidad,
  };
}

export function assertCuadroListoParaCcp(row, accionLabel = 'Generar CCP') {
  const ev = evaluarListoParaCcp(row);
  if (!ev.ok) {
    throw new Error(
      `No se puede ${accionLabel}: falta ${ev.faltantes.join(', ')}.`,
    );
  }
  return ev;
}

/** Conserva «Se dedica al objeto…» elegido en UI sobre primera_fuente fresca. */
function overlayDedicadoObjeto(matriz, incomingPrimera = []) {
  if (!matriz || !Array.isArray(incomingPrimera) || !incomingPrimera.length) return matriz;
  const base = Array.isArray(matriz.primera_fuente) ? matriz.primera_fuente : [];
  if (!base.length) return matriz;
  const primera = base.map((f) => {
    const prev = incomingPrimera.find((x) => Number(x.proveedor_id) === Number(f.proveedor_id)
      || Number(x.cotizacion_id) === Number(f.cotizacion_id)
      || String(x.id || x.id_fuente) === String(f.id || f.id_fuente));
    if (prev?.acciones_administrativas == null
      || prev.acciones_administrativas.dedicado_objeto == null) return f;
    return {
      ...f,
      acciones_administrativas: {
        ...(f.acciones_administrativas || {}),
        dedicado_objeto: prev.acciones_administrativas.dedicado_objeto,
      },
    };
  });
  return { ...matriz, primera_fuente: primera };
}

/** Destino oficial de salida del Cuadro (catálogo Workflow APROBAR). */
export const DESTINO_SALIDA_CUADRO = Object.freeze({
  code: ETAPAS.CCP || 'CCP',
  label: 'CCP',
  etapa_ejecutor: ETAPAS.CUADRO_COMPARATIVO || 'CUADRO_COMPARATIVO',
});

const MAX_PDF_FIRMADO_BYTES = 10 * 1024 * 1024;

function bytesFromBase64(b64) {
  if (!b64) return null;
  const s = String(b64);
  const padding = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - padding);
}

/** Estados documentales del cuadro (independientes de la etapa Workflow). */
export const ESTADOS_CUADRO = Object.freeze({
  PENDIENTE_ELABORAR: 'PENDIENTE_ELABORAR',
  BORRADOR: 'BORRADOR',
  EN_ELABORACION: 'EN_ELABORACION',
  CUADRO_BORRADOR: ESTADOS_REVISION_CUADRO.CUADRO_BORRADOR,
  GENERADO: 'GENERADO',
  GENERADO_PRELIMINAR: 'GENERADO_PRELIMINAR',
  ADJUDICADO: 'ADJUDICADO',
  OBSERVADO: 'OBSERVADO',
  PENDIENTE_COORDINADOR: ESTADOS_REVISION_CUADRO.PENDIENTE_COORDINADOR,
  OBSERVADO_COORDINADOR: ESTADOS_REVISION_CUADRO.OBSERVADO_COORDINADOR,
  FIRMADO_COORDINADOR: ESTADOS_REVISION_CUADRO.FIRMADO_COORDINADOR,
  PENDIENTE_DEC: ESTADOS_REVISION_CUADRO.PENDIENTE_DEC,
  OBSERVADO_DEC: ESTADOS_REVISION_CUADRO.OBSERVADO_DEC,
  APROBADO_DEC: ESTADOS_REVISION_CUADRO.APROBADO_DEC,
  PENDIENTE_CCP: ESTADOS_REVISION_CUADRO.PENDIENTE_CCP,
  FIRMADO: 'FIRMADO',
  DERIVADO_CCP: 'DERIVADO_CCP',
  ENVIADA_OPPM: 'ENVIADA_OPPM',
  CCP_REGISTRADO: 'CCP_REGISTRADO',
  CCP_REGISTRADA: 'CCP_REGISTRADA',
  ANULADO: 'ANULADO',
});

/** Etiquetas dinámicas del workflow (mismo texto en API, bandejas y detalle). */
export const ESTADOS_CUADRO_LABEL = Object.freeze({
  [ESTADOS_CUADRO.PENDIENTE_ELABORAR]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.BORRADOR]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.EN_ELABORACION]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.CUADRO_BORRADOR]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.GENERADO]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.GENERADO_PRELIMINAR]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.ADJUDICADO]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.OBSERVADO]: 'C.C. en Coordinación CM - Observado',
  [ESTADOS_CUADRO.PENDIENTE_COORDINADOR]: 'C.C. en Coordinación CM',
  [ESTADOS_CUADRO.OBSERVADO_COORDINADOR]: 'C.C. en Coordinación CM - Observado',
  [ESTADOS_CUADRO.FIRMADO_COORDINADOR]: 'C.C. en Coordinación CM',
  [ESTADOS_CUADRO.PENDIENTE_DEC]: 'C.C. en DEC',
  [ESTADOS_CUADRO.OBSERVADO_DEC]: 'C.C. en DEC - Observado',
  [ESTADOS_CUADRO.APROBADO_DEC]: 'C.C. aprobado',
  [ESTADOS_CUADRO.PENDIENTE_CCP]: 'C.C. aprobado',
  [ESTADOS_CUADRO.FIRMADO]: 'C.C. aprobado',
  [ESTADOS_CUADRO.DERIVADO_CCP]: 'Derivado a CCP',
  [ESTADOS_CUADRO.ENVIADA_OPPM]: 'Solicitud enviada a OPPM',
  [ESTADOS_CUADRO.CCP_REGISTRADO]: 'CCP registrada',
  [ESTADOS_CUADRO.CCP_REGISTRADA]: 'CCP registrada',
  [ESTADOS_CUADRO.ANULADO]: 'Anulado',
});

const TIPO_BIENES = 'BIENES';
const TIPO_SERVICIOS = 'SERVICIOS';

function parseJson(val, fallback = {}) {
  if (val && typeof val === 'object') return val;
  try { return JSON.parse(val || 'null') ?? fallback; } catch (_) { return fallback; }
}

function parseInforme(cot) {
  return parseJson(cot?.validacion_informe, {});
}

/**
 * Resultado por cotización: prioriza filas de matriz_v2 del informe (fuente de verdad
 * del submódulo Validaciones). Evita mostrar APTO cuando el estado de columna fue
 * sobrescrito con el resultado del expediente.
 */
function resolveValidacionEstadoCotizacion(cot, tipoSolicitud = '') {
  const stored = String(cot?.validacion_estado || '').toUpperCase();
  const inf = parseInforme(cot);
  const tipoKey = normalizeTipoValidacion(tipoSolicitud || cot?.solicitud_tipo || cot?.tipo)
    || normalizeTipoValidacion(inf.matriz_v2?.tipo)
    || 'BIENES';
  const filas = Array.isArray(inf.matriz_v2?.filas) ? inf.matriz_v2.filas : [];
  const filasOwn = filas.filter((f) => !f.cotizacion_id
    || String(f.cotizacion_id) === String(cot.id || cot.cotizacion_id));
  const calc = calcularResultadoCotizacion(tipoKey, filasOwn.length ? filasOwn : filas);
  if (calc.estado === 'APTO' || calc.estado === 'NO_APTO') return calc.estado;

  const items = Array.isArray(inf.formulario_07a?.items) ? inf.formulario_07a.items : [];
  if (items.length) {
    const algunaNeg = items.some((it) => {
      const r = String(it?.resultado || '');
      return /NO\s*V[ÁA]LID/i.test(r) || /NO\s*VALIDA/i.test(r.normalize('NFD').replace(/\p{Diacritic}/gu, ''));
    });
    if (algunaNeg) return 'NO_APTO';
    if (items.every((it) => String(it?.resultado || '').trim())) return 'APTO';
  }
  return stored;
}

function normalizeTipoContratacion(tipo) {
  const t = String(tipo || '').trim().toUpperCase();
  if (t === 'B' || t === 'BIEN' || t === 'BIENES') return 'Bien';
  if (t === 'S' || t === 'SERVICIO' || t === 'SERVICIOS') return 'Servicio';
  if (t === 'L' || t === 'LOCADOR' || t === 'LOCADORES' || /LOCACI/i.test(t)) return 'Locador';
  return tipo || '—';
}

/** Código persistido en cuadros_comparativos.tipo */
function tipoCuadroDb(tipoRaw) {
  const t = normalizeTipoContratacion(tipoRaw);
  if (t === 'Servicio') return TIPO_SERVICIOS;
  if (t === 'Bien') return TIPO_BIENES;
  return null;
}

function assertTipoCuadroHabilitado(tipoRaw) {
  const t = normalizeTipoContratacion(tipoRaw);
  if (t !== 'Bien' && t !== 'Servicio') {
    throw new Error(
      `El cuadro comparativo elabora Bienes (08-A) y Servicios (08-B). Tipo actual: ${t || tipoRaw || '—'}.`,
    );
  }
  return t;
}

/** Normaliza código de estado documental del cuadro. */
export function normalizeCuadroEstado(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!s) return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
  if (s === 'PENDIENTE' || s === 'PENDIENTE_DE_ELABORAR' || s === 'PENDIENTE_ELABORAR') {
    return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
  }
  if (s === 'BORRADOR' || s === 'EN_ELABORACION' || s === 'ELABORACION' || s === 'CUADRO_BORRADOR') {
    return ESTADOS_CUADRO.CUADRO_BORRADOR;
  }
  if (s === 'GENERADO' || s === 'GENERADA') return ESTADOS_CUADRO.GENERADO;
  if (s === 'GENERADO_PRELIMINAR') return ESTADOS_CUADRO.GENERADO_PRELIMINAR;
  if (s === 'ADJUDICADO') return ESTADOS_CUADRO.ADJUDICADO;
  if (s === 'OBSERVADO') return ESTADOS_CUADRO.OBSERVADO;
  if (s === 'PENDIENTE_COORDINADOR') return ESTADOS_CUADRO.PENDIENTE_COORDINADOR;
  if (s === 'OBSERVADO_COORDINADOR') return ESTADOS_CUADRO.OBSERVADO_COORDINADOR;
  if (s === 'FIRMADO_COORDINADOR') return ESTADOS_CUADRO.FIRMADO_COORDINADOR;
  if (s === 'PENDIENTE_DEC') return ESTADOS_CUADRO.PENDIENTE_DEC;
  if (s === 'OBSERVADO_DEC') return ESTADOS_CUADRO.OBSERVADO_DEC;
  if (s === 'APROBADO_DEC') return ESTADOS_CUADRO.APROBADO_DEC;
  if (s === 'PENDIENTE_CCP') return ESTADOS_CUADRO.PENDIENTE_CCP;
  if (s === 'FIRMADO' || s === 'FIRMADA') return ESTADOS_CUADRO.FIRMADO;
  if (s === 'DERIVADO_CCP' || s === 'DERIVADO_A_CCP' || s === 'CCP') return ESTADOS_CUADRO.DERIVADO_CCP;
  if (s === 'ENVIADA_OPPM' || s === 'ENVIADO_OPPM') return ESTADOS_CUADRO.ENVIADA_OPPM;
  if (s === 'CCP_REGISTRADO' || s === 'REGISTRADO_CCP' || s === 'CCP_REGISTRADA') {
    return ESTADOS_CUADRO.CCP_REGISTRADA;
  }
  if (s === 'ANULADO') return ESTADOS_CUADRO.ANULADO;
  const canon = normalizeEstadoCode(s);
  if (ESTADOS_CUADRO_LABEL[canon] || ESTADOS_CUADRO_LABEL[s]) return canon || s;
  if (getLabelEstado(canon)) return canon;
  return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
}

export function labelCuadroEstado(code, opts = {}) {
  const n = normalizeCuadroEstado(code);
  const tieneRespuesta = !!(opts.subsanado
    || String(opts.respuesta_observaciones || opts.respuesta || '').trim());
  if (tieneRespuesta && (
    n === ESTADOS_CUADRO.OBSERVADO_COORDINADOR
    || n === ESTADOS_CUADRO.OBSERVADO_DEC
    || n === ESTADOS_CUADRO.OBSERVADO
    || n === 'CUADRO_EN_COORDINACION_CM'
    || n === 'CUADRO_EN_DEC'
  )) {
    return 'C.C. subsanado';
  }
  return getLabelEstado(n)
    || ESTADOS_CUADRO_LABEL[n]
    || ESTADOS_CUADRO_LABEL[ESTADOS_CUADRO.PENDIENTE_ELABORAR];
}

function mapEstadoDbABandeja(estadoDb) {
  if (!estadoDb) return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
  return normalizeCuadroEstado(estadoDb);
}

async function loadEstadosCuadroPorSolicitudes(solicitudIds) {
  const map = new Map();
  if (!solicitudIds.length) return map;
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (solicitud_id)
        id, solicitud_id, tipo, estado, version, actualizado_at
      FROM cuadros_comparativos
      WHERE solicitud_id = ANY($1::int[])
        AND tipo IN ($2, $3)
        AND estado <> 'ANULADO'
      ORDER BY solicitud_id, version DESC
    `, [solicitudIds, TIPO_BIENES, TIPO_SERVICIOS]);
    rows.forEach((r) => {
      map.set(r.solicitud_id, {
        cuadro_id: r.id,
        tipo: r.tipo,
        estado_db: r.estado,
        estado_cuadro: mapEstadoDbABandeja(r.estado),
        version: r.version,
        actualizado_at: r.actualizado_at,
      });
    });
  } catch (err) {
    // Tabla aún no migrada: bandeja sigue operativa como RC8.1
    if (!/cuadros_comparativos/i.test(err.message || '')) throw err;
  }
  return map;
}

function badgeClassCuadro(estadoCode) {
  const e = normalizeCuadroEstado(estadoCode);
  if (e === ESTADOS_CUADRO.PENDIENTE_ELABORAR) return 'warning';
  if (e === ESTADOS_CUADRO.EN_ELABORACION || e === ESTADOS_CUADRO.CUADRO_BORRADOR) return 'info';
  if (e === ESTADOS_CUADRO.GENERADO || e === ESTADOS_CUADRO.GENERADO_PRELIMINAR) return 'primary';
  if (e === ESTADOS_CUADRO.ADJUDICADO) return 'success';
  if (e === ESTADOS_CUADRO.OBSERVADO
    || e === ESTADOS_CUADRO.OBSERVADO_COORDINADOR
    || e === ESTADOS_CUADRO.OBSERVADO_DEC) return 'warning';
  if (e === ESTADOS_CUADRO.PENDIENTE_COORDINADOR
    || e === ESTADOS_CUADRO.PENDIENTE_DEC
    || e === ESTADOS_CUADRO.PENDIENTE_CCP) return 'info';
  if (e === ESTADOS_CUADRO.FIRMADO_COORDINADOR
    || e === ESTADOS_CUADRO.APROBADO_DEC
    || e === ESTADOS_CUADRO.FIRMADO) return 'success';
  // OD33 — morado CCP (mismo #6f42c1 que Invitaciones); no gris
  if (e === ESTADOS_CUADRO.DERIVADO_CCP) return 'ccp-morado';
  return 'secondary';
}

async function loadRequerimientosPorSolicitudes(solicitudIds) {
  if (!solicitudIds.length) return new Map();
  // payload es TEXT (no JSONB): no usar -> / ->> en SQL; parsear en Node.
  const { rows } = await query(`
    SELECT sr.solicitud_id, r.id, r.codigo, r.denominacion, r.area, r.cmn, r.responsable, r.estado, r.payload
    FROM solicitud_requerimientos sr
    JOIN requerimientos r ON r.id = sr.requerimiento_id
    WHERE sr.solicitud_id = ANY($1::int[])
    ORDER BY r.codigo ASC
  `, [solicitudIds]);
  const map = new Map();
  for (const r of rows) {
    const payload = parseJson(r.payload, {});
    const cmnHint = String(r.cmn || payload.cmn || '').trim();
    // Centro organizacional: nunca el CMN (05277). Preferir display/nombre/responsable.
    const candidatos = [
      payload.centro_display,
      payload.centro_nombre,
      payload.centro,
      r.responsable,
      payload.responsable,
    ];
    let centro = '';
    for (const cand of candidatos) {
      const s = String(cand || '').trim();
      if (s && !esCodigoCmnCentro(s, cmnHint)) {
        centro = s;
        break;
      }
    }
    const list = map.get(r.solicitud_id) || [];
    list.push({
      id: r.id,
      codigo: r.codigo || '',
      descripcion: r.denominacion || '',
      centro,
      cmn: cmnHint,
      area_usuaria: r.area || '',
      estado: r.estado || '',
      etapa_workflow: payload?.workflowSnapshot?.etapaActual || '',
    });
    map.set(r.solicitud_id, list);
  }
  return map;
}

function areaUsuariaFromReqs(reqs, scArea) {
  const areas = [...new Set((reqs || []).map((r) => String(r.area_usuaria || '').trim()).filter(Boolean))];
  if (areas.length) return areas.join(', ');
  return String(scArea || '').trim();
}

function requerimientosTexto(reqs) {
  return (reqs || []).map((r) => r.codigo).filter(Boolean).join(', ');
}

/**
 * Listado legacy: una fila por cotización APTO (compatibilidad endpoint actual).
 */
export async function listarCuadroComparativo() {
  const { rows } = await query(`
    SELECT cot.*, p.ruc, p.razon_social, sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto,
      sc.estado AS solicitud_estado
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    WHERE cot.validacion_estado = 'APTO'
    ORDER BY sc.codigo ASC, cot.fecha_presentacion DESC NULLS LAST
  `);
  return rows.map((r) => {
    const eco = parseJson(r.propuesta_economica, {});
    const inf = parseInforme(r);
    return {
      id: r.id,
      solicitud_id: r.solicitud_id,
      proveedor_id: r.proveedor_id,
      estado: r.estado,
      validacion_estado: r.validacion_estado || '',
      validacion_responsable: r.validacion_responsable || '',
      fecha_presentacion: r.fecha_presentacion,
      created_at: r.created_at,
      monto: eco.monto ?? null,
      moneda: eco.moneda || 'PEN',
      ruc: r.ruc,
      razon_social: r.razon_social,
      solicitud_codigo: r.solicitud_codigo,
      denominacion: r.denominacion,
      objeto: r.objeto,
      solicitud_estado: r.solicitud_estado,
      tiene_pdf_validacion: !!inf.pdf_firmado?.base64,
      resultado_validacion: inf.formulario_07a?.resultado_global || 'APTO',
      validado_por: inf.formulario_07a?.profesional || r.validacion_responsable,
      validado_at: inf.enviado_at || r.updated_at,
    };
  });
}

/**
 * Bandeja RC8.1: una fila por Solicitud de Cotización.
 * Inclusión operativa: ≥1 cotización APTO.
 * No extrae JSON de requerimientos.payload (TEXT): evita "text -> unknown".
 * Tampoco carga propuesta_economica / detalle_items (eso es RC8.2).
 */
export async function listarCuadroComparativoExpedientes() {
  const { rows } = await query(`
    SELECT
      sc.id AS solicitud_id,
      sc.codigo AS solicitud_codigo,
      sc.denominacion,
      sc.objeto,
      sc.tipo,
      sc.estado AS solicitud_estado,
      sc.area_usuaria,
      sc.updated_at AS solicitud_updated_at,
      COUNT(DISTINCT cot.proveedor_id) FILTER (
        WHERE cot.estado = 'COTIZACION_PRESENTADA'
      )::int AS total_proveedores,
      COUNT(cot.id) FILTER (
        WHERE cot.estado = 'COTIZACION_PRESENTADA'
      )::int AS total_cotizaciones,
      COUNT(DISTINCT cot.proveedor_id) FILTER (
        WHERE cot.validacion_estado = 'APTO'
      )::int AS proveedores_aptos,
      COUNT(DISTINCT cot.proveedor_id) FILTER (
        WHERE cot.validacion_estado IN ('NO_APTO', 'OBSERVADO')
      )::int AS proveedores_no_aptos,
      COUNT(DISTINCT cot.proveedor_id) FILTER (
        WHERE cot.validacion_estado IN ('DERIVADA', 'EN_PROCESO', 'PENDIENTE')
          OR COALESCE(cot.validacion_estado, '') = ''
      )::int AS proveedores_pendientes,
      MIN(
        CASE WHEN cot.validacion_estado = 'APTO' THEN
          COALESCE(
            NULLIF(cot.validacion_informe->>'enviado_at', '')::timestamptz,
            cot.updated_at,
            cot.fecha_presentacion
          )
        END
      ) AS fecha_ingreso_cuadro,
      STRING_AGG(DISTINCT p.razon_social, ' | ' ORDER BY p.razon_social) AS proveedores_nombres,
      STRING_AGG(DISTINCT p.ruc, ' | ' ORDER BY p.ruc) AS proveedores_rucs
    FROM solicitudes_cotizacion sc
    JOIN cotizaciones_proveedor cot ON cot.solicitud_id = sc.id
    JOIN proveedores p ON p.id = cot.proveedor_id
    WHERE cot.estado = 'COTIZACION_PRESENTADA'
      AND UPPER(TRIM(COALESCE(sc.tipo, ''))) NOT LIKE 'LOCAC%'
    GROUP BY sc.id, sc.codigo, sc.denominacion, sc.objeto, sc.tipo, sc.estado,
      sc.area_usuaria, sc.updated_at
    HAVING
      COUNT(DISTINCT cot.proveedor_id) FILTER (WHERE cot.validacion_estado = 'APTO') >= 1
      OR sc.estado = 'EN_CUADRO_COMPARATIVO'
    ORDER BY
      MIN(
        CASE WHEN cot.validacion_estado = 'APTO' THEN
          COALESCE(
            NULLIF(cot.validacion_informe->>'enviado_at', '')::timestamptz,
            cot.updated_at,
            cot.fecha_presentacion
          )
        END
      ) DESC NULLS LAST,
      sc.codigo DESC
  `);

  // Regla operativa RC8.1: no listar sin al menos un APTO (aunque haya etapa de cuadro).
  const elegibles = rows.filter((r) => Number(r.proveedores_aptos) >= 1);
  const ids = elegibles.map((r) => r.solicitud_id);
  const reqMap = await loadRequerimientosPorSolicitudes(ids);
  const estadoMap = await loadEstadosCuadroPorSolicitudes(ids);
  const centroBySid = new Map();
  await Promise.all(ids.map(async (sid) => {
    const key = Number(sid);
    try {
      centroBySid.set(key, await resolveCentrosTextoSolicitud(sid));
    } catch (_) {
      centroBySid.set(key, '');
    }
  }));

  let ccpBySid = new Map();
  try {
    const { loadCcpFlagsBySolicitudIds } = await import('./ccpEstadoFlags.js');
    ccpBySid = await loadCcpFlagsBySolicitudIds(ids);
  } catch (_) { /* noop */ }

  const result = elegibles.map((r) => {
    const reqs = reqMap.get(r.solicitud_id) || [];
    const persisted = estadoMap.get(r.solicitud_id);
    const ccpFlags = ccpBySid.get(Number(r.solicitud_id)) || {};
    // RC8.1G — evidencia de recepción de bienes (desde ccpFlags).
    const recepcionEstadoGlobal = ccpFlags.recepcion_estado_global || '';
    const recepcionEstadoInterno = ccpFlags.recepcion_estado_interno || '';
    const recepcionBienesExpedienteId = ccpFlags.recepcion_bienes_expediente_id ?? null;
    // Estado global vía resolvedor central (órdenes > CCP > cuadro)
    const vigente = resolveEstadoExpedienteVigente({
      estado_cuadro: persisted?.estado_cuadro || ESTADOS_CUADRO.PENDIENTE_ELABORAR,
      solicitud_estado: r.solicitud_estado || '',
      codigo_ccp: ccpFlags.codigo_ccp || '',
      ccp_activo: !!ccpFlags.ccp_activo,
      enviada_oppm: !!ccpFlags.enviada_oppm,
      orden_id: ccpFlags.orden_id || null,
      orden_estado: ccpFlags.orden_estado || '',
      enviado_proveedor_at: ccpFlags.enviado_proveedor_at || null,
      recibido_proveedor_at: ccpFlags.recibido_proveedor_at || null,
      derivado_ejecucion_at: ccpFlags.derivado_ejecucion_at || null,
      orden_resuelta: !!ccpFlags.orden_resuelta,
      expediente_derivado_pago: !!ccpFlags.expediente_derivado_pago,
      recepcion_estado_global: recepcionEstadoGlobal,
      recepcion_estado_interno: recepcionEstadoInterno,
      recepcion_bienes_expediente_id: recepcionBienesExpedienteId,
    });
    const estadoCode = vigente.codigo || persisted?.estado_cuadro || ESTADOS_CUADRO.PENDIENTE_ELABORAR;
    const estadoLabel = vigente.label || labelCuadroEstado(estadoCode);
    const area = areaUsuariaFromReqs(reqs, r.area_usuaria);
    const reqTexto = requerimientosTexto(reqs);
    const sidKey = Number(r.solicitud_id);
    let centrosTexto = String(centroBySid.get(sidKey) || '').trim();
    if (!centrosTexto || esCodigoCmnCentro(centrosTexto)) {
      centrosTexto = [...new Set(
        reqs
          .map((q) => {
            const c = String(q.centro || '').trim();
            return c && !esCodigoCmnCentro(c, q.cmn) ? c : '';
          })
          .filter(Boolean),
      )].join(', ');
    }
    const reqsConCentro = reqs.map((q) => ({
      id: q.id,
      codigo: q.codigo,
      descripcion: q.descripcion,
      centro: centrosTexto || (esCodigoCmnCentro(q.centro, q.cmn) ? '' : q.centro),
      area_usuaria: q.area_usuaria,
    }));
    return {
      solicitud_id: r.solicitud_id,
      solicitud_codigo: r.solicitud_codigo || '',
      denominacion: r.denominacion || r.objeto || '',
      objeto: r.objeto || '',
      tipo: normalizeTipoContratacion(r.tipo),
      tipo_raw: r.tipo || '',
      requerimientos: reqsConCentro,
      requerimientos_texto: reqTexto,
      requerimientos_codigos: reqTexto,
      centros_texto: centrosTexto,
      centro: centrosTexto,
      area_usuaria: area,
      total_proveedores: Number(r.total_proveedores) || 0,
      total_cotizaciones: Number(r.total_cotizaciones) || Number(r.total_proveedores) || 0,
      proveedores_aptos: Number(r.proveedores_aptos) || 0,
      proveedores_no_aptos: Number(r.proveedores_no_aptos) || 0,
      proveedores_pendientes: Number(r.proveedores_pendientes) || 0,
      proveedores_nombres: r.proveedores_nombres || '',
      proveedor_display: String(r.proveedores_nombres || '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)[0] || '—',
      fecha_ingreso_cuadro: r.fecha_ingreso_cuadro || r.solicitud_updated_at || null,
      estado_cuadro: estadoCode,
      estado_cuadro_label: estadoLabel,
      estado_cuadro_badge: badgeClassCuadro(estadoCode),
      estado_codigo: estadoCode,
      etiqueta_estado: estadoLabel,
      estado_vigente: estadoCode,
      estado_vigente_label: estadoLabel,
      estadoVigente: vigente.estadoVigente,
      situacion: vigente.situacion
        ? { codigo: vigente.situacion.codigo, label: vigente.situacion.label }
        : null,
      estadoInterno: vigente.estadoInterno || null,
      // RC8.1G — propagar evidencia de recepción de bienes en el JSON de la fila.
      recepcion_estado_global: recepcionEstadoGlobal,
      recepcion_estado_interno: recepcionEstadoInterno,
      recepcion_bienes_expediente_id: recepcionBienesExpedienteId,
      codigo_ccp: ccpFlags.codigo_ccp || '',
      ccp_activo: !!ccpFlags.ccp_activo,
      ccp_registrado: vigente.ccpRegistrado === true || estadoCode === 'CCP_REGISTRADA',
      derivado_ccp: !!vigente.derivadoCcp,
      orden_estado: ccpFlags.orden_estado || '',
      enviado_proveedor_at: ccpFlags.enviado_proveedor_at || null,
      cuadro_id: persisted?.cuadro_id || null,
      version: persisted?.version != null ? Number(persisted.version) : null,
      fecha_actualizacion: persisted?.actualizado_at || r.fecha_ingreso_cuadro || null,
      responsable_actual: responsableBandejaPorEstado(estadoCode),
      solicitud_estado: r.solicitud_estado || '',
      // RC8.4A: en revisión externa no se edita; Analista solo Ver/Descargar/Trazabilidad
      puede_elaborar: estadoCode !== ESTADOS_CUADRO.ANULADO
        && ![
          ESTADOS_CUADRO.PENDIENTE_COORDINADOR,
          ESTADOS_CUADRO.FIRMADO_COORDINADOR,
          ESTADOS_CUADRO.PENDIENTE_DEC,
          ESTADOS_CUADRO.DERIVADO_CCP,
          ESTADOS_CUADRO.CCP_REGISTRADO,
          ESTADOS_CUADRO.CCP_REGISTRADA,
          ESTADOS_CUADRO.ENVIADA_OPPM,
          ESTADOS_CUADRO.FIRMADO,
          'ORDEN_REGISTRADA', 'ORDEN_NOTIFICADA', 'ORDEN_LISTA_NOTIFICACION',
          'REGISTRO_ORDENES', 'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO',
          'EN_EJECUCION', 'ORDEN_RECEPCION_CONFIRMADA',
        ].includes(estadoCode),
      solo_lectura: [
        ESTADOS_CUADRO.DERIVADO_CCP,
        ESTADOS_CUADRO.CCP_REGISTRADO,
        ESTADOS_CUADRO.CCP_REGISTRADA,
        ESTADOS_CUADRO.ENVIADA_OPPM,
        ESTADOS_CUADRO.FIRMADO,
        ESTADOS_CUADRO.PENDIENTE_COORDINADOR,
        ESTADOS_CUADRO.FIRMADO_COORDINADOR,
        ESTADOS_CUADRO.PENDIENTE_DEC,
      ].includes(estadoCode),
      en_revision_externa: [
        ESTADOS_CUADRO.PENDIENTE_COORDINADOR,
        ESTADOS_CUADRO.FIRMADO_COORDINADOR,
        ESTADOS_CUADRO.PENDIENTE_DEC,
      ].includes(estadoCode),
      accion_cuadro_label: ([
        ESTADOS_CUADRO.DERIVADO_CCP,
        ESTADOS_CUADRO.FIRMADO,
        ESTADOS_CUADRO.PENDIENTE_COORDINADOR,
        ESTADOS_CUADRO.FIRMADO_COORDINADOR,
        ESTADOS_CUADRO.PENDIENTE_DEC,
      ].includes(estadoCode))
        ? 'Ver cuadro'
        : 'Elaborar cuadro',
      search_text: [
        r.solicitud_codigo,
        reqTexto,
        r.denominacion,
        r.objeto,
        area,
        r.proveedores_nombres,
        r.proveedores_rucs,
        responsableBandejaPorEstado(estadoCode),
      ].filter(Boolean).join(' ').toLowerCase(),
    };
  });

  // RC8.4E — anexar estado_responsable_vigente en batch
  await enrichEstadoResponsableForBandeja(result, 'requerimiento_id');

  return result;
}

/**
 * Detalle de expediente para modales Ver expediente / Ver validaciones (sin económica).
 */
export async function getCuadroComparativoExpediente(solicitudId) {
  const sid = parseInt(solicitudId, 10);
  if (!Number.isFinite(sid)) throw new Error('Solicitud inválida');

  const lista = await listarCuadroComparativoExpedientes();
  const base = lista.find((e) => e.solicitud_id === sid);
  if (!base) throw new Error('Expediente no encontrado en Cuadro Comparativo');

  const { rows } = await query(`
    SELECT cot.id, cot.proveedor_id, cot.estado, cot.validacion_estado, cot.validacion_responsable,
      cot.validacion_informe, cot.fecha_presentacion, cot.updated_at,
      p.ruc, p.razon_social
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    WHERE cot.solicitud_id = $1
      AND cot.estado = 'COTIZACION_PRESENTADA'
    ORDER BY
      CASE UPPER(COALESCE(cot.validacion_estado, ''))
        WHEN 'APTO' THEN 1
        WHEN 'NO_APTO' THEN 2
        WHEN 'OBSERVADO' THEN 3
        ELSE 4
      END,
      p.razon_social ASC
  `, [sid]);

  const proveedores = rows.map((r) => {
    const inf = parseInforme(r);
    const validacion_estado = resolveValidacionEstadoCotizacion(
      r,
      base?.tipo_raw || base?.tipo || '',
    );
    return {
      cotizacion_id: r.id,
      proveedor_id: r.proveedor_id,
      ruc: r.ruc || '',
      razon_social: r.razon_social || '',
      estado: r.estado,
      validacion_estado,
      validacion_responsable: r.validacion_responsable || '',
      validado_por: inf.formulario_07a?.profesional || r.validacion_responsable || '',
      validado_at: inf.enviado_at || r.updated_at || null,
      fecha_presentacion: r.fecha_presentacion,
      tiene_pdf_validacion: !!inf.pdf_firmado?.base64,
    };
  });

  return {
    ...base,
    proveedores,
  };
}

async function loadSolicitudRow(solicitudId) {
  const { rows } = await query(`
    SELECT id, codigo, denominacion, objeto, tipo, estado, detalle_items, area_usuaria, cmn
    FROM solicitudes_cotizacion WHERE id = $1
  `, [solicitudId]);
  if (!rows.length) throw new Error('Solicitud no encontrada');
  return rows[0];
}

async function loadCotizacionesPresentadas(solicitudId) {
  // Fecha / cantidad de invitaciones: misma fuente que pestaña 4 — Invitaciones
  // (listarProveedoresSolicitud: fecha_envio + proveedores.cantidad_invitaciones).
  const { rows: scRows } = await query(
    `SELECT tipo FROM solicitudes_cotizacion WHERE id = $1`,
    [solicitudId],
  );
  const tipoSol = scRows[0]?.tipo || '';
  const { rows } = await query(`
    SELECT cot.id, cot.solicitud_id, cot.proveedor_id, cot.estado, cot.validacion_estado,
      cot.propuesta_tecnica, cot.propuesta_economica, cot.validacion_informe,
      cot.fecha_presentacion, cot.updated_at,
      p.ruc, p.razon_social,
      p.telefono, p.correo, p.persona_contacto, p.emails,
      p.cantidad_invitaciones AS cantidad_invitaciones_proveedor,
      inv.fecha_envio_invitacion,
      inv.n_invitaciones_solicitud
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    LEFT JOIN LATERAL (
      SELECT
        MIN(ip.fecha_envio) AS fecha_envio_invitacion,
        COUNT(*) FILTER (WHERE ip.fecha_envio IS NOT NULL)::int AS n_invitaciones_solicitud
      FROM invitacion_proveedores ip
      WHERE ip.proveedor_id = cot.proveedor_id
        AND (
          ip.solicitud_id = cot.solicitud_id
          OR ip.requerimiento_id IN (
            SELECT sr.requerimiento_id
            FROM solicitud_requerimientos sr
            WHERE sr.solicitud_id = cot.solicitud_id
          )
        )
    ) inv ON TRUE
    WHERE cot.solicitud_id = $1
      AND cot.estado = 'COTIZACION_PRESENTADA'
    ORDER BY
      CASE UPPER(COALESCE(cot.validacion_estado, ''))
        WHEN 'APTO' THEN 1
        WHEN 'NO_APTO' THEN 2
        WHEN 'OBSERVADO' THEN 3
        ELSE 4
      END,
      p.razon_social ASC
  `, [solicitudId]);
  const mapped = rows.map((r) => {
    const fechaSol = r.fecha_envio_invitacion || null;
    const nSolicitud = Number(r.n_invitaciones_solicitud) || 0;
    const nProveedor = Number(r.cantidad_invitaciones_proveedor) || 0;
    // Prioriza conteo de envíos de esta solicitud; si no hay filas, usa el dato de pestaña 4
    const reiteraciones = nSolicitud > 0 ? nSolicitud : (fechaSol ? Math.max(nProveedor, 1) : nProveedor);
    const validacion_estado = resolveValidacionEstadoCotizacion(r, tipoSol);
    return {
      ...r,
      validacion_estado,
      solicitud_tipo: tipoSol,
      fecha_solicitud: fechaSol,
      reiteraciones,
    };
  });
  // Reordenar con el estado resuelto (filas de Validaciones), no solo columna DB.
  const rank = (est) => {
    const u = String(est || '').toUpperCase();
    if (u === 'APTO') return 1;
    if (u === 'NO_APTO') return 2;
    if (u === 'OBSERVADO') return 3;
    return 4;
  };
  mapped.sort((a, b) => rank(a.validacion_estado) - rank(b.validacion_estado)
    || String(a.razon_social || '').localeCompare(String(b.razon_social || ''), 'es'));
  return mapped;
}

async function getCuadroActivoRow(solicitudId, tipoDb = TIPO_BIENES) {
  const { rows } = await query(`
    SELECT * FROM cuadros_comparativos
    WHERE solicitud_id = $1 AND tipo = $2 AND estado <> 'ANULADO'
    ORDER BY version DESC
    LIMIT 1
  `, [solicitudId, tipoDb]);
  return rows[0] || null;
}

function buildMatrizFromSources(sc, cotizaciones, requerimientos) {
  const tipoNorm = normalizeTipoContratacion(sc.tipo);
  const base = buildMatrizComparativaBienes({
    solicitud: {
      id: sc.id,
      codigo: sc.codigo,
      denominacion: sc.denominacion,
      objeto: sc.objeto,
      tipo: sc.tipo,
      tipo_contratacion: tipoNorm,
    },
    detalleItems: parseJson(sc.detalle_items, []),
    cotizaciones,
    requerimientos,
  });
  base.meta = {
    ...(base.meta || {}),
    tipo_contratacion: tipoNorm,
    anexo_codigo: tipoNorm === 'Servicio' ? '8B' : '8A',
  };
  const withRec = aplicarRecomendacionesMatriz(base);
  return attachPrimeraFuenteFromCotizaciones(withRec, cotizaciones);
}

/** OD32 — bloqueo controlado de mutaciones tras DERIVADO_CCP. */
export function assertNoMutacionTrasDerivadoCcp(estado, accionLabel = 'modificar') {
  const e = String(estado || '').toUpperCase();
  if (e === ESTADOS_CUADRO.DERIVADO_CCP || e === 'DERIVADO_A_CCP') {
    const err = new Error(
      `Expediente derivado a CCP: no se puede ${accionLabel}. Estado: Derivado a CCP.`,
    );
    err.code = 'DERIVADO_CCP_READONLY';
    err.status = 409;
    throw err;
  }
}

function mapCuadroRow(row) {
  if (!row) return null;
  const estado = String(row.estado || '').toUpperCase();
  const tienePdf = !!(row.pdf_contenido || row.tiene_pdf || row.pdf_nombre);
  const tieneFirmado = !!(row.firmado_contenido || row.tiene_pdf_firmado || row.firmado_nombre);
  const tieneFirmadoDec = !!(row.firmado_dec_contenido || row.tiene_pdf_firmado_dec || row.firmado_dec_nombre);
  const datosJson = parseJson(row.datos_json, {});
  const respuestaObs = String(datosJson.respuesta_observaciones || '').trim();
  const derivado = estado === ESTADOS_CUADRO.DERIVADO_CCP;
  const derivacionCcp = datosJson.derivacion_ccp || null;
  const enRevisionExterna = [
    ESTADOS_CUADRO.PENDIENTE_COORDINADOR,
    ESTADOS_CUADRO.FIRMADO_COORDINADOR,
    ESTADOS_CUADRO.PENDIENTE_DEC,
    ESTADOS_CUADRO.PENDIENTE_CCP,
  ].includes(estado);
  const soloLectura = derivado
    || estado === ESTADOS_CUADRO.FIRMADO
    || estado === ESTADOS_CUADRO.ANULADO
    || enRevisionExterna;
  return {
    id: row.id,
    solicitud_id: row.solicitud_id,
    tipo: row.tipo,
    version: row.version,
    estado: row.estado,
    estado_cuadro: mapEstadoDbABandeja(row.estado),
    estado_cuadro_label: derivado
      ? 'Derivado a CCP'
      : labelCuadroEstado(row.estado, { respuesta_observaciones: respuestaObs }),
    estado_vigente: derivado ? 'DERIVADO_CCP' : mapEstadoDbABandeja(row.estado),
    estado_vigente_label: derivado
      ? 'Derivado a CCP'
      : labelCuadroEstado(row.estado, { respuesta_observaciones: respuestaObs }),
    respuesta_observaciones: respuestaObs || undefined,
    datos_json: datosJson,
    derivacion_ccp: derivacionCcp,
    proveedor_ganador_id: row.proveedor_ganador_id,
    criterio_seleccion: row.criterio_seleccion,
    sustento_decision: row.sustento_decision,
    valor_adjudicado: row.valor_adjudicado != null ? Number(row.valor_adjudicado) : null,
    usuario_adjudicacion: row.usuario_adjudicacion || '',
    fecha_adjudicacion: row.fecha_adjudicacion || null,
    modalidad_adjudicacion: row.modalidad_adjudicacion || MODALIDAD_ADJUDICACION,
    pdf_nombre: row.pdf_nombre || '',
    tiene_pdf: tienePdf,
    firmado_nombre: row.firmado_nombre || '',
    tiene_pdf_firmado: tieneFirmado,
    firmado_por: row.firmado_por || '',
    firmado_at: row.firmado_at || null,
    firmado_dec_nombre: row.firmado_dec_nombre || '',
    tiene_pdf_firmado_dec: tieneFirmadoDec,
    firmado_dec_por: row.firmado_dec_por || '',
    firmado_dec_at: row.firmado_dec_at || null,
    creado_por: row.creado_por,
    actualizado_por: row.actualizado_por,
    creado_at: row.creado_at,
    actualizado_at: row.actualizado_at,
    derivado_at: row.derivado_at,
    derivado_por: row.derivado_por || '',
    responsable_ccp_id: row.responsable_ccp_id != null ? Number(row.responsable_ccp_id) : null,
    responsable_ccp_nombre: row.responsable_ccp_nombre || '',
    solo_lectura: soloLectura,
    puede_adjuntar_firmado: !derivado
      && ['GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO', 'APROBADO_DEC', 'PENDIENTE_CCP',
        'PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'].includes(estado)
      && tienePdf,
    puede_adjuntar_firmado_dec: !derivado
      && ['PENDIENTE_DEC', 'FIRMADO_COORDINADOR'].includes(estado)
      && tieneFirmado,
    puede_eliminar_firmado: !derivado && tieneFirmado && estado === ESTADOS_CUADRO.FIRMADO,
    // RC8.8 — Generar/Derivar CCP solo con aprobación completa
    puede_generar_ccp: !derivado
      && ['APROBADO_DEC', 'PENDIENTE_CCP'].includes(estado)
      && tienePdf
      && tieneFirmado
      && tieneFirmadoDec
      && !!(datosJson.revision_coordinador?.conformidad)
      && !!(datosJson.revision_dec?.conformidad),
    puede_derivar_ccp: !derivado
      && ['APROBADO_DEC', 'PENDIENTE_CCP'].includes(estado)
      && tienePdf
      && tieneFirmado
      && tieneFirmadoDec
      && !!(datosJson.revision_coordinador?.conformidad)
      && !!(datosJson.revision_dec?.conformidad),
    ccp_gates: {
      conformidad_coordinador: !!(datosJson.revision_coordinador?.conformidad),
      conformidad_dec: !!(datosJson.revision_dec?.conformidad),
      version_vigente: estado !== ESTADOS_CUADRO.ANULADO,
      pdf_firmado: tieneFirmado,
      pdf_firmado_dec: tieneFirmadoDec,
      pdf_anexo: tienePdf,
    },
    puede_regenerar_pdf: !derivado
      && estado !== ESTADOS_CUADRO.FIRMADO
      && estado !== ESTADOS_CUADRO.ANULADO
      && ['ADJUDICADO', 'GENERADO', 'GENERADO_PRELIMINAR'].includes(estado),
    // RC8.5 — Coordinador CM
    conformidad_coordinador: !!(datosJson.revision_coordinador?.conformidad),
    revision_coordinador: datosJson.revision_coordinador || null,
    puede_derivar_dec: !derivado
      && ['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'].includes(estado)
      && !!tieneFirmado
      && !!(datosJson.revision_coordinador?.conformidad),
    // RC8.6 — DEC
    conformidad_dec: !!(datosJson.revision_dec?.conformidad),
    revision_dec: datosJson.revision_dec || null,
    puede_derivar_analista: !derivado
      && ['PENDIENTE_DEC', 'FIRMADO_COORDINADOR'].includes(estado)
      && !!tieneFirmado
      && !!tieneFirmadoDec
      && !!(datosJson.revision_dec?.conformidad),
    // RC8.7 — Versionado
    vigente: estado !== ESTADOS_CUADRO.ANULADO,
    observacion_pendiente: datosJson.observacion_pendiente || null,
    respuesta_observaciones: datosJson.respuesta_observaciones || '',
    historial_versiones: Array.isArray(datosJson.historial_versiones)
      ? datosJson.historial_versiones
      : [],
    version_meta: datosJson.version_meta || null,
  };
}

export function validarMatrizCuadro(payload) {
  const datos = payload?.datos_json || payload || {};
  return validateEconomiaCuadro(datos);
}

/**
 * Detalle completo: matriz fresca + overlay de borrador persistido.
 * No cambia Workflow.
 */
export async function obtenerDetalleCuadro(solicitudId) {
  const sid = parseInt(solicitudId, 10);
  if (!Number.isFinite(sid)) throw new Error('Solicitud inválida');

  const sc = await loadSolicitudRow(sid);
  assertTipoCuadroHabilitado(sc.tipo);
  const tipoDb = tipoCuadroDb(sc.tipo);
  const cotizaciones = await loadCotizacionesPresentadas(sid);
  const aptos = cotizaciones.filter((c) => String(c.validacion_estado || '').toUpperCase() === 'APTO');
  if (!aptos.length) throw new Error('La solicitud no tiene cotizaciones APTO para el cuadro');

  const reqMap = await loadRequerimientosPorSolicitudes([sid]);
  const requerimientos = reqMap.get(sid) || [];
  let matriz = buildMatrizFromSources(sc, cotizaciones, requerimientos);

  let cuadro = null;
  try {
    cuadro = await getCuadroActivoRow(sid, tipoDb);
  } catch (err) {
    if (!/cuadros_comparativos/i.test(err.message || '')) throw err;
  }

  if (cuadro?.datos_json) {
    const saved = parseJson(cuadro.datos_json, {});
    matriz = mergeObservacionesCuadro(matriz, saved);
    matriz = mergeAdjudicacionCuadro(matriz, saved);
    matriz = attachPrimeraFuenteFromCotizaciones(matriz, cotizaciones);
    const val = validateEconomiaCuadro(matriz);
    matriz.meta = {
      ...matriz.meta,
      ...val,
      puede_seleccionar_ganador: val.items_incompletos === 0 && (matriz.items || []).length > 0,
      puede_pdf_oficial: false,
      pdf_modo: 'BORRADOR',
    };
  }

  const bandeja = (await listarCuadroComparativoExpedientes())
    .find((e) => e.solicitud_id === sid) || null;

  return {
    expediente: bandeja,
    cuadro: mapCuadroRow(cuadro),
    matriz,
    validacion: validateEconomiaCuadro(matriz),
    proveedores: cotizaciones.map((c) => ({
      cotizacion_id: c.id,
      proveedor_id: c.proveedor_id,
      ruc: c.ruc,
      razon_social: c.razon_social,
      validacion_estado: c.validacion_estado || '',
      cumple_tecnicamente: String(c.validacion_estado || '').toUpperCase() === 'APTO',
    })),
  };
}

/**
 * Crea borrador EN_ELABORACION o retorna el activo existente.
 */
export async function crearOBuscarBorrador(solicitudId, usuario = '') {
  const sid = parseInt(solicitudId, 10);
  if (!Number.isFinite(sid)) throw new Error('Solicitud inválida');

  const sc = await loadSolicitudRow(sid);
  assertTipoCuadroHabilitado(sc.tipo);
  const tipoDb = tipoCuadroDb(sc.tipo);
  const cotizaciones = await loadCotizacionesPresentadas(sid);
  if (!cotizaciones.some((c) => String(c.validacion_estado || '').toUpperCase() === 'APTO')) {
    throw new Error('Se requiere al menos una cotización APTO');
  }

  let existing = null;
  try {
    existing = await getCuadroActivoRow(sid, tipoDb);
  } catch (err) {
    if (/cuadros_comparativos/i.test(err.message || '')) {
      throw new Error('Tabla cuadros_comparativos no disponible. Ejecute migraciones (020).');
    }
    throw err;
  }

  if (existing) {
    const detalle = await obtenerDetalleCuadro(sid);
    return { ...detalle, created: false };
  }

  const reqMap = await loadRequerimientosPorSolicitudes([sid]);
  const matriz = buildMatrizFromSources(sc, cotizaciones, reqMap.get(sid) || []);
  const datos = stripArchivosFromDatosJson(matriz);
  const user = String(usuario || '').slice(0, 150);

  const { rows } = await query(`
    INSERT INTO cuadros_comparativos (
      solicitud_id, tipo, version, estado, datos_json,
      creado_por, actualizado_por, creado_at, actualizado_at
    ) VALUES ($1, $2, 1, 'CUADRO_BORRADOR', $3::jsonb, $4, $4, NOW(), NOW())
    RETURNING *
  `, [sid, tipoDb, JSON.stringify(datos), user]);

  const detalle = await obtenerDetalleCuadro(sid);
  return { ...detalle, cuadro: mapCuadroRow(rows[0]), created: true };
}

/**
 * Guarda borrador. Concurrencia por actualizado_at (ISO).
 * No altera Workflow ni precios de oferta (solo notas/observaciones analista).
 */
export async function guardarBorradorCuadro(cuadroId, payload = {}, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');

  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estadoCur = String(cur.estado || '').toUpperCase();
  assertNoMutacionTrasDerivadoCcp(estadoCur, 'guardar borrador');
  // Tras generar PDF / firmar / derivar no se edita borrador (evita degradar GENERADO → EN_ELABORACION).
  if (['GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO', 'ANULADO'].includes(estadoCur)) {
    throw new Error(`El cuadro en estado ${cur.estado} no admite edición de borrador`);
  }

  const clientUpdated = payload.actualizado_at || payload.updated_at || null;
  if (clientUpdated) {
    const serverTs = new Date(cur.actualizado_at).getTime();
    const clientTs = new Date(clientUpdated).getTime();
    if (Number.isFinite(clientTs) && Number.isFinite(serverTs) && clientTs < serverTs) {
      const err = new Error('Existe una versión más reciente del cuadro. Recargue antes de guardar.');
      err.code = 'CONFLICT_VERSION';
      err.status = 409;
      throw err;
    }
  }

  // Reconstruir matriz fresca y aplicar solo campos editables del payload
  const sc = await loadSolicitudRow(cur.solicitud_id);
  const cotizaciones = await loadCotizacionesPresentadas(cur.solicitud_id);
  const reqMap = await loadRequerimientosPorSolicitudes([cur.solicitud_id]);
  let matriz = buildMatrizFromSources(sc, cotizaciones, reqMap.get(cur.solicitud_id) || []);

  const incoming = payload.datos_json || payload.matriz || {};
  const prevSaved = parseJson(cur.datos_json, {});
  // Conservar AA editables (p. ej. dedicado_objeto) y segunda fuente del cliente
  matriz = mergeObservacionesCuadro(matriz, {
    items: incoming.items,
    notas_internas: incoming.notas_internas ?? payload.notas_internas ?? '',
    primera_fuente: incoming.primera_fuente,
    segunda_fuente: incoming.segunda_fuente,
  });
  matriz = mergeAdjudicacionCuadro(matriz, {
    ...incoming,
    adjudicacion: prevSaved.adjudicacion,
    historial_adjudicacion: prevSaved.historial_adjudicacion,
  });
  if (payload.notas_internas != null) matriz.notas_internas = String(payload.notas_internas);
  else if (incoming.notas_internas != null) matriz.notas_internas = String(incoming.notas_internas);

  const val = validateEconomiaCuadro(matriz);
  matriz.meta = {
    ...matriz.meta,
    ...val,
    puede_seleccionar_ganador: val.items_incompletos === 0 && (matriz.items || []).length > 0,
  };
  const datos = stripArchivosFromDatosJson(matriz);
  // RC8.7 — conservar metadatos de versión / respuesta a observaciones
  datos.historial_versiones = prevSaved.historial_versiones || datos.historial_versiones;
  datos.historial_revision = prevSaved.historial_revision || datos.historial_revision;
  datos.version_meta = prevSaved.version_meta || datos.version_meta;
  datos.observacion_pendiente = prevSaved.observacion_pendiente || null;
  if (payload.respuesta_observaciones != null || incoming.respuesta_observaciones != null) {
    datos.respuesta_observaciones = String(
      payload.respuesta_observaciones ?? incoming.respuesta_observaciones ?? '',
    ).trim();
  } else if (prevSaved.respuesta_observaciones != null) {
    datos.respuesta_observaciones = prevSaved.respuesta_observaciones;
  }
  const user = String(usuario || '').slice(0, 150);
  const nextEstado = [
    'ADJUDICADO', 'OBSERVADO', 'OBSERVADO_COORDINADOR', 'OBSERVADO_DEC',
    'PENDIENTE_COORDINADOR', 'PENDIENTE_DEC', 'FIRMADO_COORDINADOR',
    'APROBADO_DEC', 'PENDIENTE_CCP', 'GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO',
  ].includes(estadoCur)
    ? estadoCur
    : 'CUADRO_BORRADOR';

  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET datos_json = $2::jsonb,
        estado = $4,
        actualizado_por = $3,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, JSON.stringify(datos), user, nextEstado]);

  return {
    cuadro: mapCuadroRow(rows[0]),
    matriz: datos,
    validacion: val,
    saved: true,
  };
}

/**
 * Guarda adjudicación por ítem. No deriva a CCP ni altera Workflow/precios.
 */
export async function guardarAdjudicacionCuadro(cuadroId, payload = {}, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');

  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estadoAdj = String(cur.estado || '').toUpperCase();
  assertNoMutacionTrasDerivadoCcp(estadoAdj, 'guardar adjudicación');
  if (['GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO', 'ANULADO'].includes(estadoAdj)) {
    throw new Error(`El cuadro en estado ${cur.estado} no admite adjudicación`);
  }

  const clientUpdated = payload.actualizado_at || payload.updated_at || null;
  if (clientUpdated) {
    const serverTs = new Date(cur.actualizado_at).getTime();
    const clientTs = new Date(clientUpdated).getTime();
    if (Number.isFinite(clientTs) && Number.isFinite(serverTs) && clientTs < serverTs) {
      const err = new Error('Existe una versión más reciente del cuadro. Recargue antes de guardar.');
      err.code = 'CONFLICT_VERSION';
      err.status = 409;
      throw err;
    }
  }

  const sc = await loadSolicitudRow(cur.solicitud_id);
  const cotizaciones = await loadCotizacionesPresentadas(cur.solicitud_id);
  const reqMap = await loadRequerimientosPorSolicitudes([cur.solicitud_id]);
  let matriz = buildMatrizFromSources(sc, cotizaciones, reqMap.get(cur.solicitud_id) || []);
  const saved = parseJson(cur.datos_json, {});
  const incoming = payload.datos_json || {};
  // Overlay: datos guardados + payload (dedicado_objeto / segunda fuente del DOM)
  matriz = mergeObservacionesCuadro(matriz, {
    ...saved,
    ...incoming,
    items: incoming.items || saved.items,
    primera_fuente: incoming.primera_fuente || saved.primera_fuente,
    segunda_fuente: incoming.segunda_fuente || saved.segunda_fuente,
    notas_internas: incoming.notas_internas ?? saved.notas_internas,
  });
  matriz = mergeAdjudicacionCuadro(matriz, {
    ...saved,
    ...incoming,
    items: incoming.items || saved.items,
  });

  if (incoming.notas_internas != null) matriz.notas_internas = String(incoming.notas_internas);
  // Aplicar selecciones desde payload
  const selecciones = Array.isArray(payload.selecciones)
    ? payload.selecciones
    : (matriz.items || []).map((it) => {
      const fromDom = (incoming.items || []).find((x) => x.item_key === it.item_key);
      return {
        item_key: it.item_key,
        proveedor_adjudicado_id: fromDom?.proveedor_adjudicado_id ?? it.proveedor_adjudicado_id,
      };
    });

  matriz = aplicarAdjudicacionMatriz(matriz, {
    ...payload,
    selecciones,
    criterio_seleccion: payload.criterio_seleccion,
    sustento_decision: payload.sustento_decision,
    observacion_analista: payload.observacion_analista,
    observacion_area_usuaria: payload.observacion_area_usuaria,
  }, usuario);

  // Reaplicar AA editable tras adjudicación (no perder «Se dedica al objeto…»)
  matriz = overlayDedicadoObjeto(matriz, incoming.primera_fuente);

  const adj = matriz.adjudicacion || {};
  const datos = stripArchivosFromDatosJson(matriz);
  const user = String(usuario || '').slice(0, 150);

  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET datos_json = $2::jsonb,
        estado = 'ADJUDICADO',
        proveedor_ganador_id = $3,
        criterio_seleccion = $4,
        sustento_decision = $5,
        valor_adjudicado = $6,
        usuario_adjudicacion = $7,
        fecha_adjudicacion = NOW(),
        modalidad_adjudicacion = $8,
        actualizado_por = $7,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    id,
    JSON.stringify(datos),
    adj.proveedor_ganador_id,
    adj.criterio_seleccion || '',
    adj.sustento_decision || '',
    adj.valor_adjudicado,
    user,
    MODALIDAD_ADJUDICACION,
  ]);

  const ganador = (adj.resumen_proveedores || [])[0];
  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: adj.proveedor_ganador_id || null,
    evento: 'CUADRO_COMPARATIVO_ADJUDICADO',
    detalle: JSON.stringify({
      cuadro_id: id,
      solicitud_codigo: sc.codigo,
      ganador_id: adj.proveedor_ganador_id,
      ganador_ruc: ganador?.ruc || '',
      ganador_razon_social: ganador?.razon_social || '',
      valor: adj.valor_adjudicado,
      criterio: adj.criterio_seleccion,
      modalidad: MODALIDAD_ADJUDICACION,
      usuario: user,
      fecha: adj.fecha_adjudicacion,
      no_deriva_ccp: true,
    }).slice(0, 2000),
    usuario: user,
  });

  return {
    cuadro: mapCuadroRow(rows[0]),
    matriz: datos,
    adjudicacion: adj,
    saved: true,
    derivado_ccp: false,
  };
}

export async function listarVersionesCuadro(solicitudId) {
  const sid = parseInt(solicitudId, 10);
  if (!Number.isFinite(sid)) throw new Error('Solicitud inválida');
  const sc = await loadSolicitudRow(sid);
  const tipoDb = tipoCuadroDb(sc.tipo) || TIPO_BIENES;
  const { rows } = await query(`
    SELECT id, solicitud_id, tipo, version, estado, creado_por, actualizado_por,
      creado_at, actualizado_at, derivado_at, datos_json,
      proveedor_ganador_id, criterio_seleccion, pdf_nombre, firmado_nombre, firmado_dec_nombre
    FROM cuadros_comparativos
    WHERE solicitud_id = $1 AND tipo = $2
    ORDER BY version DESC
  `, [sid, tipoDb]);
  return rows.map((r) => {
    const meta = metaVersionDesdeRow(r);
    const mapped = mapCuadroRow(r);
    return {
      ...mapped,
      datos_json: undefined,
      vigente: meta.vigente,
      motivo: meta.motivo,
      usuario_version: meta.usuario_version,
      fecha_version: meta.fecha_version,
      observacion: meta.observacion,
      respuesta_observaciones: meta.respuesta_observaciones,
      version_origen: meta.version_origen,
      accion_origen: meta.accion_origen,
    };
  });
}

/** Alias API RC8.2 */
export async function getDetalleCuadro(solicitudId) {
  return obtenerDetalleCuadro(solicitudId);
}

/**
 * Payload para Anexo 8A: solo datos persistidos (no reconstruye desde UI).
 */
export async function obtenerDatosPdfCuadro(cuadroId) {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!rows.length) throw new Error('Cuadro no encontrado');
  const row = rows[0];
  const estado = String(row.estado || '').toUpperCase();
  if (!['ADJUDICADO', 'GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO',
    'OBSERVADO', 'OBSERVADO_COORDINADOR', 'OBSERVADO_DEC'].includes(estado)) {
    throw new Error('El Anexo 8A/8B requiere cuadro ADJUDICADO o GENERADO');
  }
  const sc = await loadSolicitudRow(row.solicitud_id);
  assertTipoCuadroHabilitado(sc.tipo);
  const reqMap = await loadRequerimientosPorSolicitudes([row.solicitud_id]);
  const requerimientos = reqMap.get(row.solicitud_id) || [];
  const cotizaciones = await loadCotizacionesPresentadas(row.solicitud_id);
  const saved = parseJson(row.datos_json, {});

  // Matriz fresca (AA invitaciones/recepción/validación) + overlay de adjudicación / SF / dedicado_objeto
  let matriz = buildMatrizFromSources(sc, cotizaciones, requerimientos);
  matriz = mergeObservacionesCuadro(matriz, saved);
  matriz = mergeAdjudicacionCuadro(matriz, saved);
  matriz = attachPrimeraFuenteFromCotizaciones(matriz, cotizaciones);
  if (Array.isArray(saved.segunda_fuente)) {
    matriz.segunda_fuente = saved.segunda_fuente;
  }
  if (saved.adjudicacion) matriz.adjudicacion = saved.adjudicacion;
  if (saved.solicitud) matriz.solicitud = saved.solicitud;
  if (Array.isArray(saved.requerimientos) && saved.requerimientos.length) {
    matriz.requerimientos = saved.requerimientos;
  } else {
    matriz.requerimientos = requerimientos;
  }

  const expediente = {
    solicitud_codigo: sc.codigo,
    denominacion: sc.denominacion || sc.objeto,
    area_usuaria: sc.area_usuaria || '',
    cmn: sc.cmn || '',
    requerimientos,
  };
  return {
    cuadro: mapCuadroRow(row),
    datos_json: matriz,
    matriz,
    adjudicacion: matriz.adjudicacion || null,
    expediente,
    solicitud_codigo: sc.codigo,
    cmn: sc.cmn || '',
    area_usuaria: sc.area_usuaria || '',
  };
}

/**
 * Persiste PDF Anexo 8A. Incrementa versión si ya estaba GENERADO (antes de firma).
 * No altera matriz económica ni ganador.
 */
export async function guardarPdfCuadro(cuadroId, payload = {}, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estado = String(cur.estado || '').toUpperCase();
  // OD34 — no regenerar ni sobrescribir PDF si ya hay firma o el flujo avanzó
  if (estado === 'FIRMADO' || cur.firmado_contenido || cur.firmado_nombre) {
    const err = new Error(
      'Existe un PDF firmado persistido: no se regenera ni sobrescribe. '
      + 'Para aplicar un nuevo formato se requiere reapertura explícita / nueva versión.',
    );
    err.code = 'PDF_FIRMADO_INMUTABLE';
    err.status = 409;
    throw err;
  }
  if (['DERIVADO_CCP', 'ANULADO', 'APROBADO_DEC', 'PENDIENTE_CCP',
    'PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR', 'PENDIENTE_DEC'].includes(estado)) {
    const err = new Error(`El cuadro en estado ${estado} no admite generación de PDF dinámico`);
    err.code = 'PDF_ESTADO_BLOQUEADO';
    err.status = 409;
    throw err;
  }
  if (!['ADJUDICADO', 'GENERADO', 'GENERADO_PRELIMINAR',
    'OBSERVADO', 'OBSERVADO_COORDINADOR', 'OBSERVADO_DEC'].includes(estado)) {
    throw new Error('Debe adjudicar el cuadro antes de generar el Anexo 8A');
  }

  const base64 = payload.pdf_contenido || payload.base64 || payload.contenido_base64;
  if (!base64) throw new Error('PDF vacío');
  const nombre = String(payload.pdf_nombre || payload.nombre || 'Anexo_08A.pdf').slice(0, 300);
  const user = String(usuario || '').slice(0, 150);
  const datos = parseJson(cur.datos_json, {});
  const hist = Array.isArray(datos.pdf_versiones) ? [...datos.pdf_versiones] : [];
  const prevVersion = Number(cur.version || 1);
  if (cur.pdf_nombre || cur.pdf_contenido) {
    hist.push({
      version: prevVersion,
      pdf_nombre: cur.pdf_nombre,
      generado_at: cur.actualizado_at,
      generado_por: cur.actualizado_por,
      reemplazado_por: prevVersion + 1,
      vigente: false,
    });
  }
  // No guardar base64 histórico completo (solo metadata); vigente en columnas
  datos.pdf_versiones = hist.slice(-20);
  // OD34 — nueva versión documental al regenerar (no pisa firmados: ya bloqueados arriba)
  const nextVersion = (cur.pdf_nombre || cur.pdf_contenido) ? prevVersion + 1 : prevVersion;
  datos.pdf_meta = {
    nombre,
    generado_at: new Date().toISOString(),
    generado_por: user,
    vigente: true,
    version: nextVersion,
  };

  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET pdf_nombre = $2,
        pdf_contenido = $3,
        datos_json = $4::jsonb,
        estado = 'GENERADO',
        version = $6,
        actualizado_por = $5,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING id, solicitud_id, tipo, version, estado, pdf_nombre,
      proveedor_ganador_id, criterio_seleccion, valor_adjudicado,
      creado_por, actualizado_por, creado_at, actualizado_at
  `, [id, nombre, base64, JSON.stringify(datos), user, nextVersion]);

  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: cur.proveedor_ganador_id || null,
    evento: 'CUADRO_COMPARATIVO_GENERADO',
    detalle: JSON.stringify({
      cuadro_id: id,
      pdf_nombre: nombre,
      version: nextVersion,
      usuario: user,
      fecha: new Date().toISOString(),
    }).slice(0, 2000),
    usuario: user,
  });

  return {
    cuadro: mapCuadroRow({ ...rows[0], datos_json: datos, pdf_contenido: undefined }),
    pdf_nombre: nombre,
    version: nextVersion,
    estado: 'GENERADO',
    saved: true,
  };
}

export async function resolverPdfCuadro(cuadroId) {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows } = await query(`
    SELECT id, pdf_nombre, pdf_contenido, estado, version
    FROM cuadros_comparativos WHERE id = $1
  `, [id]);
  if (!rows.length) throw new Error('Cuadro no encontrado');
  const row = rows[0];
  if (!row.pdf_contenido) throw new Error('PDF del Anexo 8A no encontrado');
  return {
    nombre_archivo: row.pdf_nombre || 'Anexo_08A.pdf',
    mime_type: 'application/pdf',
    contenido_base64: row.pdf_contenido,
    version: row.version,
    estado: row.estado,
  };
}

/**
 * Adjunta Anexo 8A firmado. Pasa a FIRMADO. No altera Workflow.
 */
export async function adjuntarPdfFirmadoCuadro(cuadroId, payload = {}, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estado = String(cur.estado || '').toUpperCase();
  if (estado === 'DERIVADO_CCP') {
    throw new Error('Cuadro derivado a CCP: no se puede reemplazar el PDF firmado');
  }
  if (estado === 'ANULADO') throw new Error('Cuadro anulado');
  const estadosFirmaOk = [
    'GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO', 'APROBADO_DEC', 'PENDIENTE_CCP',
    'PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR',
  ];
  if (!estadosFirmaOk.includes(estado)) {
    throw new Error('Debe generar el Anexo antes de adjuntar el PDF firmado');
  }
  if (!cur.pdf_contenido) throw new Error('No hay PDF generado del Anexo');

  const base64 = payload.pdf_firmado?.base64 || payload.base64 || payload.firmado_contenido || payload.contenido_base64;
  if (!base64) throw new Error('PDF firmado obligatorio');
  const mime = String(payload.pdf_firmado?.mime_type || payload.mime_type || 'application/pdf').toLowerCase();
  const nombre = String(payload.pdf_firmado?.nombre || payload.nombre || payload.firmado_nombre || 'Anexo_08A_firmado.pdf').slice(0, 300);
  if (mime && mime !== 'application/pdf' && !/\.pdf$/i.test(nombre)) {
    throw new Error('Solo se aceptan archivos PDF');
  }
  const size = payload.pdf_firmado?.tamaño_bytes || payload.tamaño_bytes || bytesFromBase64(base64);
  if (size != null && size > MAX_PDF_FIRMADO_BYTES) {
    throw new Error('El PDF supera el tamaño máximo permitido (10 MB)');
  }

  // RC8.5: en revisión Coordinador se conserva el estado (no pasa a FIRMADO final)
  const enCoord = ['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'].includes(estado);
  const nextEstado = enCoord ? estado : 'FIRMADO';

  const user = String(usuario || '').slice(0, 150);
  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET firmado_nombre = $2,
        firmado_contenido = $3,
        firmado_por = $4,
        firmado_at = NOW(),
        estado = $5,
        actualizado_por = $4,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING id, solicitud_id, tipo, version, estado, pdf_nombre, firmado_nombre,
      firmado_por, firmado_at, proveedor_ganador_id, criterio_seleccion, valor_adjudicado,
      creado_por, actualizado_por, creado_at, actualizado_at, derivado_at,
      derivado_por, responsable_ccp_id, responsable_ccp_nombre, datos_json,
      usuario_adjudicacion, fecha_adjudicacion, modalidad_adjudicacion, sustento_decision
  `, [id, nombre, base64, user, nextEstado]);

  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: cur.proveedor_ganador_id || null,
    evento: 'CUADRO_COMPARATIVO_FIRMADO',
    detalle: JSON.stringify({
      cuadro_id: id,
      firmado_nombre: nombre,
      version: cur.version,
      usuario: user,
      fecha: new Date().toISOString(),
    }).slice(0, 2000),
    usuario: user,
  });

  return {
    cuadro: mapCuadroRow({
      ...rows[0],
      tiene_pdf: true,
      tiene_pdf_firmado: true,
      firmado_contenido: undefined,
      pdf_contenido: undefined,
    }),
    pdf_firmado: {
      nombre,
      mime_type: 'application/pdf',
      tamaño_bytes: size,
      uploaded_at: rows[0].firmado_at,
    },
    estado: nextEstado,
    saved: true,
  };
}

/** Elimina PDF firmado solo antes de derivar; restaura estado según etapa. */
export async function eliminarPdfFirmadoCuadro(cuadroId, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estado = String(cur.estado || '').toUpperCase();
  if (estado === 'DERIVADO_CCP') {
    throw new Error('Cuadro derivado a CCP: no se puede eliminar el PDF firmado');
  }
  if (!['FIRMADO', 'PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR', 'APROBADO_DEC', 'PENDIENTE_CCP'].includes(estado)) {
    throw new Error('No se puede eliminar el PDF firmado en el estado actual');
  }
  if (!cur.firmado_contenido && !cur.firmado_nombre) throw new Error('No hay PDF firmado');

  // Coordinador: permanece en revisión; Analista post-generación vuelve a GENERADO
  const nextEstado = ['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'].includes(estado)
    ? 'PENDIENTE_COORDINADOR'
    : (estado === 'APROBADO_DEC' || estado === 'PENDIENTE_CCP' ? estado : 'GENERADO');

  const user = String(usuario || '').slice(0, 150);
  const datos = parseJson(cur.datos_json, {});
  if (datos.revision_coordinador) {
    datos.revision_coordinador = {
      ...datos.revision_coordinador,
      conformidad: false,
      conformidad_at: null,
      conformidad_por: '',
    };
  }
  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET firmado_nombre = NULL,
        firmado_contenido = NULL,
        firmado_por = NULL,
        firmado_at = NULL,
        estado = $2,
        datos_json = $3::jsonb,
        actualizado_por = $4,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING id, solicitud_id, tipo, version, estado, pdf_nombre, firmado_nombre,
      firmado_por, firmado_at, proveedor_ganador_id, criterio_seleccion, valor_adjudicado,
      creado_por, actualizado_por, creado_at, actualizado_at, derivado_at,
      derivado_por, responsable_ccp_id, responsable_ccp_nombre, datos_json,
      usuario_adjudicacion, fecha_adjudicacion, modalidad_adjudicacion, sustento_decision
  `, [id, nextEstado, JSON.stringify(datos), user]);

  return {
    cuadro: mapCuadroRow({
      ...rows[0],
      tiene_pdf: !!cur.pdf_contenido || !!cur.pdf_nombre,
      tiene_pdf_firmado: false,
    }),
    estado: nextEstado,
    removed: true,
  };
}

export async function resolverPdfFirmadoCuadro(cuadroId) {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows } = await query(`
    SELECT id, firmado_nombre, firmado_contenido, estado, version, firmado_por, firmado_at
    FROM cuadros_comparativos WHERE id = $1
  `, [id]);
  if (!rows.length) throw new Error('Cuadro no encontrado');
  const row = rows[0];
  if (!row.firmado_contenido) throw new Error('PDF firmado no encontrado');
  return {
    nombre_archivo: row.firmado_nombre || 'Anexo_08A_firmado.pdf',
    mime_type: 'application/pdf',
    contenido_base64: row.firmado_contenido,
    version: row.version,
    estado: row.estado,
    firmado_por: row.firmado_por || '',
    firmado_at: row.firmado_at,
  };
}

/**
 * RC8.6 — Adjunta PDF firmado por el DEC (no altera firmado del Coordinador ni Workflow).
 */
export async function adjuntarPdfFirmadoDecCuadro(cuadroId, payload = {}, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estado = String(cur.estado || '').toUpperCase();
  if (estado === 'DERIVADO_CCP') throw new Error('Cuadro derivado a CCP: no se puede adjuntar firma DEC');
  if (estado === 'ANULADO') throw new Error('Cuadro anulado');
  if (!['PENDIENTE_DEC', 'FIRMADO_COORDINADOR'].includes(estado)) {
    throw new Error('Solo el DEC puede adjuntar su firma en estado Pendiente DEC');
  }
  if (!cur.firmado_contenido && !cur.firmado_nombre) {
    throw new Error('Debe existir el PDF firmado por el Coordinador antes de adjuntar la firma DEC');
  }

  const base64 = payload.pdf_firmado?.base64 || payload.base64 || payload.firmado_dec_contenido || payload.contenido_base64;
  if (!base64) throw new Error('PDF firmado DEC obligatorio');
  const mime = String(payload.pdf_firmado?.mime_type || payload.mime_type || 'application/pdf').toLowerCase();
  const nombre = String(payload.pdf_firmado?.nombre || payload.nombre || payload.firmado_dec_nombre || 'Anexo_08A_firmado_DEC.pdf').slice(0, 300);
  if (mime && mime !== 'application/pdf' && !/\.pdf$/i.test(nombre)) {
    throw new Error('Solo se aceptan archivos PDF');
  }
  const size = payload.pdf_firmado?.tamaño_bytes || payload.tamaño_bytes || bytesFromBase64(base64);
  if (size != null && size > MAX_PDF_FIRMADO_BYTES) {
    throw new Error('El PDF supera el tamaño máximo permitido (10 MB)');
  }

  const user = String(usuario || '').slice(0, 150);
  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET firmado_dec_nombre = $2,
        firmado_dec_contenido = $3,
        firmado_dec_por = $4,
        firmado_dec_at = NOW(),
        actualizado_por = $4,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, nombre, base64, user]);

  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: cur.proveedor_ganador_id || null,
    evento: 'CUADRO_COMPARATIVO_FIRMADO_DEC',
    detalle: JSON.stringify({
      cuadro_id: id,
      firmado_dec_nombre: nombre,
      version: cur.version,
      usuario: user,
      fecha: new Date().toISOString(),
    }).slice(0, 2000),
    usuario: user,
  });

  return {
    cuadro: mapCuadroRow({
      ...rows[0],
      tiene_pdf: true,
      tiene_pdf_firmado: true,
      tiene_pdf_firmado_dec: true,
      firmado_contenido: undefined,
      firmado_dec_contenido: undefined,
      pdf_contenido: undefined,
    }),
    pdf_firmado_dec: {
      nombre,
      mime_type: 'application/pdf',
      tamaño_bytes: size,
      uploaded_at: rows[0].firmado_dec_at,
    },
    estado,
    saved: true,
  };
}

export async function eliminarPdfFirmadoDecCuadro(cuadroId, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estado = String(cur.estado || '').toUpperCase();
  if (estado === 'DERIVADO_CCP' || estado === 'APROBADO_DEC') {
    throw new Error('No se puede eliminar la firma DEC en el estado actual');
  }
  if (!['PENDIENTE_DEC', 'FIRMADO_COORDINADOR'].includes(estado)) {
    throw new Error('No se puede eliminar la firma DEC en el estado actual');
  }
  if (!cur.firmado_dec_contenido && !cur.firmado_dec_nombre) throw new Error('No hay PDF firmado DEC');

  const user = String(usuario || '').slice(0, 150);
  const datos = parseJson(cur.datos_json, {});
  if (datos.revision_dec) {
    datos.revision_dec = {
      ...datos.revision_dec,
      conformidad: false,
      conformidad_at: null,
      conformidad_por: '',
    };
  }
  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET firmado_dec_nombre = NULL,
        firmado_dec_contenido = NULL,
        firmado_dec_por = NULL,
        firmado_dec_at = NULL,
        datos_json = $2::jsonb,
        actualizado_por = $3,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, JSON.stringify(datos), user]);

  return {
    cuadro: mapCuadroRow({
      ...rows[0],
      tiene_pdf: !!cur.pdf_contenido || !!cur.pdf_nombre,
      tiene_pdf_firmado: !!cur.firmado_contenido || !!cur.firmado_nombre,
      tiene_pdf_firmado_dec: false,
    }),
    estado,
    removed: true,
  };
}

export async function resolverPdfFirmadoDecCuadro(cuadroId) {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  const { rows } = await query(`
    SELECT id, firmado_dec_nombre, firmado_dec_contenido, estado, version, firmado_dec_por, firmado_dec_at
    FROM cuadros_comparativos WHERE id = $1
  `, [id]);
  if (!rows.length) throw new Error('Cuadro no encontrado');
  const row = rows[0];
  if (!row.firmado_dec_contenido) throw new Error('PDF firmado DEC no encontrado');
  return {
    nombre_archivo: row.firmado_dec_nombre || 'Anexo_08A_firmado_DEC.pdf',
    mime_type: 'application/pdf',
    contenido_base64: row.firmado_dec_contenido,
    version: row.version,
    estado: row.estado,
    firmado_por: row.firmado_dec_por || '',
    firmado_at: row.firmado_dec_at,
  };
}

/**
 * Deriva cuadro FIRMADO a CCP vía Workflow oficial (registrarMovimiento).
 * Idempotente si ya está DERIVADO_CCP.
 */
export async function derivarCuadroACcp(cuadroId, body = {}, usuario = '') {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');

  const destinoOficial = TRANSICIONES_POR_ACCION.APROBAR?.[ETAPAS.CUADRO_COMPARATIVO]
    || DESTINO_SALIDA_CUADRO.code;
  if (String(destinoOficial).toUpperCase() !== 'CCP') {
    throw new Error('Transición Workflow CUADRO_COMPARATIVO → CCP no disponible en catálogo');
  }

  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estado = String(cur.estado || '').toUpperCase();
  const user = String(usuario || '').slice(0, 150);

  if (estado === 'DERIVADO_CCP') {
    return {
      ok: true,
      idempotente: true,
      cuadro: mapCuadroRow({
        ...cur,
        tiene_pdf: !!cur.pdf_contenido || !!cur.pdf_nombre,
        tiene_pdf_firmado: !!cur.firmado_contenido || !!cur.firmado_nombre,
        firmado_contenido: undefined,
        pdf_contenido: undefined,
      }),
      destino: DESTINO_SALIDA_CUADRO,
      responsable: {
        id: cur.responsable_ccp_id,
        nombre: cur.responsable_ccp_nombre || '',
      },
      workflow: {
        etapaDestino: DESTINO_SALIDA_CUADRO.code,
        etapaEjecutor: DESTINO_SALIDA_CUADRO.etapa_ejecutor,
      },
    };
  }

  // RC8.8: Derivar CCP solo con cuadro plenamente aprobado
  assertCuadroListoParaCcp(cur, 'Derivar CCP');
  if (cur.valor_adjudicado == null && !cur.proveedor_ganador_id) {
    const datos = parseJson(cur.datos_json, {});
    const items = Array.isArray(datos.items) ? datos.items : [];
    const sinAdj = items.some((it) => it.proveedor_adjudicado_id == null);
    if (sinAdj || !items.length) throw new Error('El cuadro debe estar adjudicado antes de derivar');
  }

  const respId = parseInt(body.responsable_destino_id || body.responsable_id || body.responsable_ccp_id, 10);
  const respNombre = String(
    body.responsable_destino_nombre || body.responsable_nombre || body.responsable_ccp_nombre || '',
  ).trim();
  if (!Number.isFinite(respId) || respId <= 0) {
    throw new Error('Seleccione el usuario responsable de CCP');
  }
  if (!respNombre) {
    throw new Error('Nombre del responsable CCP es obligatorio');
  }

  const observacion = String(body.observacion_derivacion || body.observacion || '').trim();
  if (!observacion || observacion.length < 3) {
    throw new Error('La observación es obligatoria para derivar a CCP');
  }
  const rolDerivacion = String(body.rol_derivacion || body.rol || 'ANALISTA').slice(0, 80);
  const fechaDeriv = new Date().toISOString();
  const datosPrev = parseJson(cur.datos_json, {});
  const historialRev = Array.isArray(datosPrev.historial_revision) ? [...datosPrev.historial_revision] : [];
  historialRev.push({
    tipo: 'DERIVAR_CCP',
    accion: 'DERIVAR_CCP',
    usuario: user,
    rol: rolDerivacion,
    fecha: fechaDeriv,
    observacion,
    responsable_ccp_id: respId,
    responsable_ccp_nombre: respNombre,
  });
  const datosNext = {
    ...datosPrev,
    historial_revision: historialRev,
    derivacion_ccp: {
      usuario: user,
      rol: rolDerivacion,
      fecha: fechaDeriv,
      observacion,
      responsable_id: respId,
      responsable_nombre: respNombre,
    },
  };

  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET estado = 'DERIVADO_CCP',
        derivado_at = NOW(),
        derivado_por = $2,
        responsable_ccp_id = $3,
        responsable_ccp_nombre = $4,
        datos_json = $5::jsonb,
        actualizado_por = $2,
        actualizado_at = NOW()
    WHERE id = $1 AND estado IN ('APROBADO_DEC', 'PENDIENTE_CCP')
    RETURNING id, solicitud_id, tipo, version, estado, pdf_nombre, firmado_nombre,
      firmado_por, firmado_at, proveedor_ganador_id, criterio_seleccion, valor_adjudicado,
      creado_por, actualizado_por, creado_at, actualizado_at, derivado_at,
      derivado_por, responsable_ccp_id, responsable_ccp_nombre, datos_json,
      usuario_adjudicacion, fecha_adjudicacion, modalidad_adjudicacion, sustento_decision
  `, [id, user, respId, respNombre.slice(0, 200), JSON.stringify(datosNext)]);

  if (!rows.length) {
    // Carrera: otro proceso derivó
    const { rows: again } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
    if (String(again[0]?.estado || '').toUpperCase() === 'DERIVADO_CCP') {
      return derivarCuadroACcp(id, body, usuario);
    }
    throw new Error('No se pudo derivar el cuadro (estado no editable)');
  }

  const updated = rows[0];

  await query(`
    UPDATE solicitudes_cotizacion SET estado = 'EN_CCP', updated_at = NOW()
    WHERE id = $1 AND estado NOT IN ('CERRADA')
  `, [cur.solicitud_id]);

  const sync = await syncRequerimientosSolicitudWorkflow(cur.solicitud_id, {
    etapaDestino: DESTINO_SALIDA_CUADRO.code,
    evento: 'CUADRO_APROBADO_DEC',
    usuario: user,
    observacion,
    etapaEjecutor: DESTINO_SALIDA_CUADRO.etapa_ejecutor || 'CUADRO_COMPARATIVO',
    responsable: respNombre,
    usuarioDestinoId: respId,
  });

  // RC8.6A.1 — fuente única ya persistida por sync; sin segunda escritura.
  const eventoDeriv = { actualizados: sync.actualizados || 0, evento: 'CUADRO_APROBADO_DEC' };

  const detalleObs = JSON.stringify({
    cuadro_id: id,
    destino: DESTINO_SALIDA_CUADRO.code,
    responsable_id: respId,
    responsable: respNombre,
    usuario: user,
    rol: rolDerivacion,
    fecha: fechaDeriv,
    observacion,
    workflow_actualizados: sync?.actualizados,
    evento: EVENTOS_TRAZA_CUADRO_CCP.CCP_DERIVADO,
  }).slice(0, 2000);

  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: cur.proveedor_ganador_id || null,
    evento: 'CUADRO_COMPARATIVO_DERIVADO',
    detalle: detalleObs,
    usuario: user,
  });

  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: cur.proveedor_ganador_id || null,
    evento: 'CCP_DERIVADO',
    detalle: `[${rolDerivacion}] ${user} · ${observacion} → CCP (${respNombre})`.slice(0, 2000),
    usuario: user,
  });

  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: cur.proveedor_ganador_id || null,
    evento: 'DERIVADO_A_CCP',
    detalle: `[${rolDerivacion}] ${user} · ${fechaDeriv} · ${observacion}`.slice(0, 2000),
    usuario: user,
  });

  return {
    ok: true,
    idempotente: false,
    cuadro: mapCuadroRow({
      ...updated,
      tiene_pdf: true,
      tiene_pdf_firmado: true,
    }),
    destino: DESTINO_SALIDA_CUADRO,
    responsable: { id: respId, nombre: respNombre },
    workflow: {
      etapaDestino: DESTINO_SALIDA_CUADRO.code,
      etapaEjecutor: DESTINO_SALIDA_CUADRO.etapa_ejecutor,
      sync,
    },
    trazabilidad: { evento: EVENTOS_TRAZA_CUADRO_CCP.CCP_DERIVADO, ...eventoDeriv },
    estado: 'DERIVADO_CCP',
  };
}

/**
 * RC8.4 — Transición de revisión (Analista ↔ Coordinador CM ↔ DEC).
 * Actualiza estado documental + responsable/snapshot vía registrarMovimiento.
 * No cambia la etapa Workflow (permanece CUADRO_COMPARATIVO) salvo Generar CCP.
 */
export async function transitarRevisionCuadro(cuadroId, body = {}, usuario = '', userCtx = {}) {
  const id = parseInt(cuadroId, 10);
  if (!Number.isFinite(id)) throw new Error('Cuadro inválido');
  assertSalidaCcpOficial();

  const accion = String(body.accion || '').toUpperCase();
  const { rows: curRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
  if (!curRows.length) throw new Error('Cuadro no encontrado');
  const cur = curRows[0];
  const estado = String(cur.estado || '').toUpperCase();
  // OD32 — tras DERIVADO_CCP solo lectura (salvo consulta idempotente de derivar)
  if (estado === 'DERIVADO_CCP' && accion !== 'DERIVAR_CCP' && accion !== 'GENERAR_CCP') {
    assertNoMutacionTrasDerivadoCcp(estado, `ejecutar ${accion || 'revisión'}`);
  }
  // RC8.5-G — actuar_como solo desde body (nunca query); solo Administrador real (headers)
  // actuar_como solo modo prueba Admin (opcional). Sin UI operativa: Admin real
  // puede ejecutar la transición válida del estado (supervisión, sin suplantar en cliente).
  const { rolEfectivo, rolReal, actuarComo, modoPrueba } = resolveRolEfectivoRevision(
    userCtx,
    body.actuar_como || body.contexto_rol || '',
  );
  const tr = findTransicionRevision(accion, estado);
  if (!tr) {
    throw new Error(`Transición ${accion || '—'} no permitida desde estado ${estado}`);
  }
  const esAdminReal = rolReal === 'ADMINISTRADOR';
  const rol = (esAdminReal && !modoPrueba) ? tr.rol : rolEfectivo;
  if (tr.rol !== rol) {
    throw new Error(
      modoPrueba
        ? `La acción ${accion} corresponde al rol ${tr.rol} (Administrador actuando como: ${rolEfectivo})`
        : `La acción ${accion} corresponde al rol ${tr.rol} (perfil actual: ${rolEfectivo || rolReal})`,
    );
  }

  // RC8.5-D1 — mismo contrato institucional: Motivo (componente unificado)
  let motivoObs = String(body.motivo || body.motivo_observacion || '').trim();
  let observacion = String(body.observacion || body.sustento || '').trim();
  const descripcionObs = String(body.descripcion || body.descripcion_observacion || observacion || motivoObs).trim();
  const comentarioObs = String(body.comentario || body.comentario_observacion || observacion || motivoObs).trim();
  if (accion === 'OBSERVAR_COORDINADOR' || accion === 'OBSERVAR_DEC'
    || accion === 'OBSERVAR_DEC_A_COORD'
    || tr.requireObservacionEstructurada || tr.requireObservacionDecEstructurada
    || tr.requireMotivoInstitucional) {
    if (!motivoObs && !observacion) {
      throw new Error('Motivo requerido');
    }
    if (!motivoObs) motivoObs = observacion;
    if (!observacion) observacion = motivoObs;
  }

  if (accion === 'DERIVAR_COORDINADOR' && !cur.pdf_contenido) {
    throw new Error('Genere el PDF del Anexo antes de derivar al Coordinador');
  }

  // RC8.7 — Tras observación, siempre al Coordinador (nunca directo al DEC)
  if (accion === 'DERIVAR_DEC' && ['OBSERVADO_COORDINADOR', 'OBSERVADO_DEC', 'CUADRO_BORRADOR', 'ADJUDICADO'].includes(estado)) {
    throw new Error('Tras una observación debe derivar al Coordinador CM, no directamente al DEC');
  }

  const datosPrev = parseJson(cur.datos_json, {});
  const revCoord = datosPrev.revision_coordinador || {};
  const revDec = datosPrev.revision_dec || {};
  const tieneConformidad = !!revCoord.conformidad;
  const tieneConformidadDec = !!revDec.conformidad;
  const tieneFirmado = !!(cur.firmado_contenido || cur.firmado_nombre);
  const tieneFirmadoDec = !!(cur.firmado_dec_contenido || cur.firmado_dec_nombre);

  if (accion === 'DERIVAR_COORDINADOR'
    && ['OBSERVADO_COORDINADOR', 'OBSERVADO_DEC'].includes(estado)) {
    const respuesta = String(
      body.respuesta_observaciones
      || datosPrev.respuesta_observaciones
      || '',
    ).trim();
    if (!respuesta) {
      throw new Error('Debe registrar la respuesta a las observaciones antes de derivar al Coordinador');
    }
  }

  // RC8.7 — Observar crea versión N+1 (archiva la anterior sin eliminarla)
  if (accion === 'OBSERVAR_COORDINADOR' || accion === 'OBSERVAR_DEC'
    || accion === 'OBSERVAR_DEC_A_COORD') {
    const userObs = String(usuario || '').slice(0, 150);
    const destinoLabel = accion === 'OBSERVAR_DEC_A_COORD'
      ? 'Coordinador CM'
      : 'Analista';
    const creado = await crearNuevaVersionPorObservacion(cur, {
      accion,
      user: userObs,
      motivo: motivoObs,
      descripcion: descripcionObs,
      observacion,
      comentario: comentarioObs,
      estadoDestino: tr.to,
    });
    const sync = await syncRevisionCuadroWorkflow(cur.solicitud_id, {
      revisionEstado: tr.to,
      responsable: tr.responsable,
      usuario: userObs,
      observacion: observacion || `${accion} → ${tr.to} (v${creado.version_nueva})`,
      accion: 'derivado',
    });
    // RC8.5-D1 — historial general del expediente (payload.observaciones)
    const histInst = await registrarObservacionInstitucionalDesdeCuadro(cur.solicitud_id, {
      motivo: motivoObs || observacion,
      usuario: userObs,
      origen_submodulo: body.origen_submodulo || (accion.startsWith('OBSERVAR_DEC') ? 'DEC' : 'Cuadro Comparativo'),
      destino_submodulo: body.destino_submodulo
        || (accion === 'OBSERVAR_DEC_A_COORD' ? 'Cuadro Comparativo' : 'Cuadro Comparativo'),
      destino_etapa: body.destino_etapa || tr.to,
      destino_persona: body.destino_persona || destinoLabel,
      observacion_padre_id: body.observacion_padre_id || body.observacionPadreId,
      accionRevision: accion,
    });
    await registrarTrazaPortal({
      solicitud_id: cur.solicitud_id,
      proveedor_id: cur.proveedor_ganador_id || null,
      evento: `CUADRO_REVISION_${accion}`,
      detalle: JSON.stringify({
        cuadro_origen_id: cur.id,
        cuadro_nuevo_id: creado.cuadroNuevo.id,
        version_origen: cur.version,
        version_nueva: creado.version_nueva,
        desde: estado,
        hacia: tr.to,
        motivo: motivoObs,
        observacion,
        destinatario: destinoLabel,
        historial_institucional: histInst,
        workflow: sync,
      }).slice(0, 2000),
      usuario: userObs,
    });
    return {
      ok: true,
      versionado: true,
      cuadro: mapCuadroRow(creado.cuadroNuevo),
      version_anterior: {
        id: creado.cuadroArchivado.id,
        version: creado.cuadroArchivado.version,
        estado: 'ANULADO',
      },
      version_nueva: creado.version_nueva,
      observacion: creado.observacion,
      historial_institucional: histInst,
      revision: {
        accion,
        estado_origen: estado,
        estado_destino: tr.to,
        responsable: tr.responsable,
        rol,
        destinatario: destinoLabel,
        acciones: accionesDisponiblesRevision(tr.to, rol),
      },
      workflow: {
        etapa: ETAPAS.CUADRO_COMPARATIVO,
        sync,
      },
    };
  }

  // RC8.4C — Dar Conformidad exige PDF firmado (luego auto-deriva al DEC)
  if (accion === 'CONFORMIDAD_COORDINADOR' || accion === 'APROBAR_COORDINADOR' || tr.autoDerivarDec) {
    if (!tieneFirmado) {
      throw new Error('Debe adjuntar el Cuadro Comparativo firmado antes de dar conformidad y derivar al DEC');
    }
  }

  if (accion === 'DERIVAR_DEC' || tr.requireConformidad) {
    if ((tr.requireFirmado || accion === 'DERIVAR_DEC') && !tieneFirmado) {
      throw new Error('Debe adjuntar el PDF firmado del Anexo antes de derivar al DEC');
    }
    // Derivar a DEC: si hay firma vigente, la conformidad se registra automáticamente.
    if (tr.requireConformidad && !tieneConformidad && accion !== 'DERIVAR_DEC') {
      throw new Error('Debe registrar la conformidad del Coordinador antes de derivar al DEC');
    }
  }

  // DEC: aprobar y derivar a CCP (acción única)
  if (accion === 'APROBAR_DERIVAR_CCP') {
    if (!tieneFirmado) {
      throw new Error('Debe existir el PDF firmado por el Coordinador');
    }
    if (!tieneFirmadoDec) {
      throw new Error('Debe adjuntar el PDF firmado por el DEC');
    }
    const userApr = String(usuario || '').slice(0, 150);
    const datosApr = { ...datosPrev };
    const histApr = Array.isArray(datosApr.historial_revision) ? [...datosApr.historial_revision] : [];
    // Auto-conformidades (Coord si faltaba; DEC al aprobar)
    datosApr.revision_coordinador = {
      ...(datosApr.revision_coordinador || {}),
      conformidad: true,
      conformidad_at: datosApr.revision_coordinador?.conformidad_at || new Date().toISOString(),
      conformidad_por: datosApr.revision_coordinador?.conformidad_por || userApr,
    };
    datosApr.revision_dec = {
      ...(datosApr.revision_dec || {}),
      conformidad: true,
      conformidad_at: new Date().toISOString(),
      conformidad_por: userApr,
    };
    histApr.push({
      at: new Date().toISOString(),
      usuario: userApr,
      accion: 'APROBAR_DEC',
      estado: ESTADOS_REVISION_CUADRO.APROBADO_DEC,
      observacion: observacion || 'Aprobado por DEC',
      rol,
    });
    histApr.push({
      at: new Date().toISOString(),
      usuario: userApr,
      accion: 'GENERAR_CCP',
      estado: ESTADOS_REVISION_CUADRO.PENDIENTE_CCP,
      observacion: observacion || 'CCP generado tras aprobación DEC',
      rol,
    });
    datosApr.historial_revision = histApr.slice(-40);

    // Idempotencia: ya derivado
    if (estado === 'DERIVADO_CCP') {
      return derivarCuadroACcp(id, body, usuario);
    }

    await query(`
      UPDATE cuadros_comparativos
      SET estado = 'PENDIENTE_CCP',
          datos_json = $2::jsonb,
          actualizado_por = $3,
          actualizado_at = NOW()
      WHERE id = $1 AND estado IN ('PENDIENTE_DEC', 'FIRMADO_COORDINADOR', 'APROBADO_DEC', 'PENDIENTE_CCP')
    `, [id, JSON.stringify(datosApr), userApr]);

    const { rows: midRows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
    if (!midRows.length) throw new Error('No se pudo aprobar el cuadro');
    // Re-validar gates con conformidades ya persistidas
    assertCuadroListoParaCcp(midRows[0], 'Aprobar y derivar a CCP');

    await registrarEventoCuadroCcp(cur.solicitud_id, {
      evento: EVENTOS_TRAZA_CUADRO_CCP.CUADRO_APROBADO_DEC,
      usuario: userApr,
      observacion: observacion || `CUADRO_APROBADO_DEC cuadro #${id} v${cur.version}`,
      responsable: RESPONSABLES_REVISION.DEC,
    });
    await registrarEventoCuadroCcp(cur.solicitud_id, {
      evento: EVENTOS_TRAZA_CUADRO_CCP.CCP_GENERADO,
      usuario: userApr,
      observacion: observacion || `CCP_GENERADO cuadro #${id} v${cur.version}`,
      responsable: RESPONSABLES_REVISION.CCP,
    });

    const dest = await derivarCuadroACcp(id, {
      ...body,
      observacion_derivacion: body.observacion_derivacion || observacion
        || 'Cuadro Comparativo aprobado por DEC y derivado a CCP',
    }, usuario);
    return {
      ...dest,
      aprobado_dec: true,
      ccp_generado: true,
      revision: {
        accion,
        estado_origen: estado,
        estado_destino: 'DERIVADO_CCP',
        responsable: RESPONSABLES_REVISION.CCP,
        rol,
      },
    };
  }

  // RC8.6 — gates DEC (conformidad / firmas Coordinador + DEC)
  if (accion === 'CONFORMIDAD_DEC' || accion === 'DERIVAR_ANALISTA' || accion === 'APROBAR_DEC'
    || tr.requireFirmadoDec || tr.requireConformidadDec) {
    if (!tieneFirmado) {
      throw new Error('Debe existir el PDF firmado por el Coordinador');
    }
    if (!tieneFirmadoDec) {
      throw new Error('Debe adjuntar el PDF firmado por el DEC');
    }
    if ((accion === 'DERIVAR_ANALISTA' || accion === 'APROBAR_DEC' || tr.requireConformidadDec)
      && accion !== 'CONFORMIDAD_DEC' && !tieneConformidadDec) {
      throw new Error('Debe registrar la conformidad del DEC antes de derivar al Analista');
    }
  }

  // RC8.8 — Generar CCP: gates + PENDIENTE_CCP + evento CCP_GENERADO (sin derivar aún)
  if (accion === 'GENERAR_CCP') {
    assertCuadroListoParaCcp(cur, 'Generar CCP');
    const userGen = String(usuario || '').slice(0, 150);
    await query(`
      UPDATE cuadros_comparativos
      SET estado = 'PENDIENTE_CCP', actualizado_por = $2, actualizado_at = NOW()
      WHERE id = $1
    `, [id, userGen]);
    await syncRevisionCuadroWorkflow(cur.solicitud_id, {
      revisionEstado: ESTADOS_REVISION_CUADRO.PENDIENTE_CCP,
      responsable: RESPONSABLES_REVISION.ANALISTA,
      usuario: userGen,
      observacion: observacion || 'CCP generado — pendiente de derivación',
      accion: 'derivado',
    });
    const eventoGen = await registrarEventoCuadroCcp(cur.solicitud_id, {
      evento: EVENTOS_TRAZA_CUADRO_CCP.CCP_GENERADO,
      usuario: userGen,
      observacion: observacion || `CCP_GENERADO cuadro #${id} v${cur.version}`,
      responsable: RESPONSABLES_REVISION.ANALISTA,
    });
    await registrarTrazaPortal({
      solicitud_id: cur.solicitud_id,
      proveedor_id: cur.proveedor_ganador_id || null,
      evento: EVENTOS_TRAZA_CUADRO_CCP.CCP_GENERADO,
      detalle: JSON.stringify({
        cuadro_id: id,
        version: cur.version,
        estado: 'PENDIENTE_CCP',
      }).slice(0, 2000),
      usuario: userGen,
    });
    // Derivación explícita solo si el cliente envía responsable (Derivar CCP)
    if (body.derivar === true && (body.responsable_destino_id || body.responsable_ccp_id)) {
      return derivarCuadroACcp(id, body, usuario);
    }
    const { rows } = await query('SELECT * FROM cuadros_comparativos WHERE id = $1', [id]);
    return {
      ok: true,
      ccp_generado: true,
      cuadro: mapCuadroRow(rows[0]),
      revision: {
        accion,
        estado_destino: ESTADOS_REVISION_CUADRO.PENDIENTE_CCP,
        responsable: RESPONSABLES_REVISION.ANALISTA,
      },
      trazabilidad: { evento: EVENTOS_TRAZA_CUADRO_CCP.CCP_GENERADO, ...eventoGen },
    };
  }

  const user = String(usuario || '').slice(0, 150);
  const labelCtx = modoPrueba ? labelRolRevision(actuarComo) : '';
  const obsAudit = modoPrueba
    ? [observacion, `[Prueba Admin → ${labelCtx}]`].filter(Boolean).join(' ').trim()
    : observacion;
  const histMeta = modoPrueba
    ? {
      usuario_real: user,
      usuario_real_rol: rolReal,
      contexto: actuarComo,
      contexto_label: labelCtx,
      modo_prueba: true,
    }
    : {};
  const datos = { ...datosPrev };
  const hist = Array.isArray(datos.historial_revision) ? [...datos.historial_revision] : [];
  if (tr.via) {
    hist.push({
      at: new Date().toISOString(),
      usuario: user,
      accion,
      estado: tr.via,
      observacion: obsAudit || '',
      ...histMeta,
    });
  }
  hist.push({
    at: new Date().toISOString(),
    usuario: user,
    accion,
    estado: tr.to,
    observacion: obsAudit || '',
    motivo: motivoObs || undefined,
    descripcion: descripcionObs || undefined,
    comentario: comentarioObs || undefined,
    ...histMeta,
  });
  datos.historial_revision = hist.slice(-40);

  if (accion === 'CONFORMIDAD_COORDINADOR' || accion === 'APROBAR_COORDINADOR'
    || accion === 'DERIVAR_DEC') {
    // DERIVAR_DEC registra conformidad automáticamente si hay PDF firmado vigente
    datos.revision_coordinador = {
      ...(datos.revision_coordinador || {}),
      conformidad: true,
      conformidad_at: (datos.revision_coordinador || {}).conformidad_at || new Date().toISOString(),
      conformidad_por: (datos.revision_coordinador || {}).conformidad_por || user,
      ...(modoPrueba ? { conformidad_contexto: actuarComo, conformidad_usuario_real_rol: rolReal } : {}),
    };
  }
  if (accion === 'CONFORMIDAD_DEC') {
    datos.revision_dec = {
      ...(datos.revision_dec || {}),
      conformidad: true,
      conformidad_at: new Date().toISOString(),
      conformidad_por: user,
      ...(modoPrueba ? { conformidad_contexto: actuarComo, conformidad_usuario_real_rol: rolReal } : {}),
    };
  }
  if (accion === 'DERIVAR_COORDINADOR') {
    const respuesta = String(
      body.respuesta_observaciones || datos.respuesta_observaciones || '',
    ).trim();
    if (respuesta) {
      datos.respuesta_observaciones = respuesta;
      if (datos.observacion_pendiente) {
        datos.observacion_pendiente = {
          ...datos.observacion_pendiente,
          respuesta: respuesta,
          respondido_at: new Date().toISOString(),
          respondido_por: user,
        };
      }
    }
  }

  const { rows } = await query(`
    UPDATE cuadros_comparativos
    SET estado = $2,
        datos_json = $3::jsonb,
        actualizado_por = $4,
        actualizado_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, tr.to, JSON.stringify(datos), user]);

  // Siempre 'derivado' para actualizar responsable_actual (observado no cambia responsable)
  const sync = await syncRevisionCuadroWorkflow(cur.solicitud_id, {
    revisionEstado: tr.to,
    responsable: tr.responsable,
    usuario: user,
    observacion: obsAudit || `${accion} → ${tr.to}`,
    accion: 'derivado',
  });

  let eventoAprob = null;
  if ((accion === 'DERIVAR_ANALISTA' || accion === 'APROBAR_DEC')
    && tr.to === ESTADOS_REVISION_CUADRO.APROBADO_DEC) {
    eventoAprob = await registrarEventoCuadroCcp(cur.solicitud_id, {
      evento: EVENTOS_TRAZA_CUADRO_CCP.CUADRO_APROBADO_DEC,
      usuario: user,
      observacion: observacion || `CUADRO_APROBADO_DEC cuadro #${id} v${cur.version}`,
      responsable: RESPONSABLES_REVISION.ANALISTA,
    });
    await registrarTrazaPortal({
      solicitud_id: cur.solicitud_id,
      proveedor_id: cur.proveedor_ganador_id || null,
      evento: EVENTOS_TRAZA_CUADRO_CCP.CUADRO_APROBADO_DEC,
      detalle: JSON.stringify({
        cuadro_id: id,
        version: cur.version,
        desde: estado,
        hacia: tr.to,
      }).slice(0, 2000),
      usuario: user,
    });
  }

  await registrarTrazaPortal({
    solicitud_id: cur.solicitud_id,
    proveedor_id: cur.proveedor_ganador_id || null,
    evento: `CUADRO_REVISION_${accion}`,
    detalle: JSON.stringify({
      cuadro_id: id,
      desde: estado,
      hacia: tr.to,
      via: tr.via || null,
      responsable: tr.responsable,
      observacion,
      workflow: sync,
    }).slice(0, 2000),
    usuario: user,
  });

  const autoDerivoDec = !!(tr.autoDerivarDec || (
    (accion === 'CONFORMIDAD_COORDINADOR' || accion === 'APROBAR_COORDINADOR')
    && tr.to === ESTADOS_REVISION_CUADRO.PENDIENTE_DEC
  ));

  return {
    ok: true,
    derivado_dec: autoDerivoDec || accion === 'DERIVAR_DEC',
    cuadro: mapCuadroRow(rows[0]),
    revision: {
      accion,
      estado_origen: estado,
      estado_destino: tr.to,
      via: tr.via || null,
      responsable: tr.responsable,
      rol,
      acciones: accionesDisponiblesRevision(tr.to, rol),
      auto_derivado_dec: autoDerivoDec,
    },
    workflow: {
      etapa: ETAPAS.CUADRO_COMPARATIVO,
      sync,
      flujo: 'Coordinador CM → DEC → Analista',
    },
    trazabilidad: eventoAprob
      ? { evento: EVENTOS_TRAZA_CUADRO_CCP.CUADRO_APROBADO_DEC, ...eventoAprob }
      : undefined,
  };
}

export function filtrarBandejaPorRolRevision(expedientes = [], userCtx = {}) {
  const rol = resolveRolRevision(userCtx);
  const allowed = new Set(
    (BANDEJA_ESTADOS_POR_ROL[rol] || BANDEJA_ESTADOS_POR_ROL.ANALISTA)
      .map((s) => String(s).toUpperCase()),
  );
  return {
    rol,
    data: (expedientes || []).filter((e) => {
      const est = String(e.estado_cuadro || e.estado || '').toUpperCase();
      // Admin: supervisión de todos los expedientes
      if (rol === 'ADMINISTRADOR') return true;
      // Analista también ve pendientes de elaborar sin cuadro aún
      if (rol === 'ANALISTA' && (!est || est === 'PENDIENTE_ELABORAR')) return true;
      return allowed.has(est);
    }).map((e) => {
      const est = e.estado_cuadro || e.estado;
      return {
        ...e,
        rol_revision: rol,
        acciones_revision: accionesDisponiblesRevision(est, rol),
        // Responsable del expediente (quién tiene la pelota), no el rol del visor
        responsable_actual: e.responsable_actual || responsableBandejaPorEstado(est),
        responsable_revision: responsableBandejaPorEstado(est),
        modo_apertura: resolveModoAperturaExpediente(est, rol),
      };
    }),
  };
}

