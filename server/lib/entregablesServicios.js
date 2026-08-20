/**
 * RC8.15.1 — Ejecución → Presentación Entregables de Servicios.
 *
 * Unidad operativa = EL ENTREGABLE (orden_entregas activa).
 * Aplica solo a SERVICIO / LOCACIÓN (OS). BIEN (OC) sigue en Recepción de Bienes.
 *
 * La bandeja NO persiste filas "pendientes": deriva entregables ACTIVOS de órdenes
 * notificadas (o estados posteriores compatibles). Mientras no exista observación
 * formal, cada entregable conserva una sola recepción INICIAL editable.
 */
import { getClient, query } from '../db.js';
import { buildEntregaContract } from '../../shared/entregaContractual.js';
import {
  resolveAreaUsuaria,
  resolveOrdenFechaNotificacion,
} from '../../shared/ordenCronogramaContractual.js';
import { toIsoDateString } from './diasPlazo.js';
import { resolverCentroDesdeRequerimiento } from './recepcionBienesAlcance.js';
import { generateActaConformidadServiciosPdfServer } from './entregableConformidadPdfServer.js';
import {
  listarEstadosResponsablesEntregables,
  obtenerEstadoResponsableEntregable,
  reasignarResponsableEntregableMismaEtapa,
  transicionarEntregable,
} from './entregableEstadoPersistido.js';
import {
  CATALOGO_DESTINOS_OBSERVACION,
  clasificarObservacionEntregable,
  esEmisorObservacionEntregable,
  listarDestinatariosObservacion,
  obtenerDestinoObservacion,
  registrarRoutingObservacionEntregable,
} from './observacionesEntregableRouting.js';
import { buildEstadoLabels } from './expedienteEstadoPersistido.js';
import { ETAPAS } from '../../shared/workflow/etapas.js';
import { EVENTOS } from '../../shared/workflow/eventos.js';
import {
  PERFILES_FUNCIONALES,
  resolveFunctionalProfiles,
} from '../utils/userRoleCatalog.js';

export {
  inicializarEstadoResponsableEntregable,
  listarEstadosResponsablesEntregables,
  obtenerEstadoResponsableEntregable,
  reasignarResponsableEntregableMismaEtapa,
  transicionarEntregable,
} from './entregableEstadoPersistido.js';
export {
  CATALOGO_DESTINOS_OBSERVACION,
  listarDestinatariosObservacion,
} from './observacionesEntregableRouting.js';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MIME_ALOWED = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
]);

function httpError(message, status = 400, code = 'ENTREGABLE_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function isServicioOLocacion(tipoOrden, tipoContratacion, reqTipo) {
  const to = String(tipoOrden || '').toUpperCase();
  if (to === 'OC') return false;
  if (to === 'OS') return true;
  const txt = `${String(tipoContratacion || '')} ${String(reqTipo || '')}`.toUpperCase();
  return /SERVIC|LOCAC|LOCADOR/.test(txt);
}

function stripDataUrl(b64) {
  const s = String(b64 || '');
  const i = s.indexOf('base64,');
  return i >= 0 ? s.slice(i + 7) : s;
}

function validateArchivo({ contenido_base64, nombre_archivo, mime_type }) {
  const raw = stripDataUrl(contenido_base64);
  if (!raw || raw.length < 20) {
    throw httpError('Archivo del entregable inválido o vacío', 400, 'ARCHIVO_VACIO');
  }
  const approxBytes = Math.floor((raw.length * 3) / 4);
  if (approxBytes > MAX_FILE_BYTES) {
    throw httpError('El archivo supera el tamaño máximo permitido (25 MB)', 400, 'ARCHIVO_TAMANO');
  }
  const mime = String(mime_type || 'application/pdf').toLowerCase();
  if (!MIME_ALOWED.has(mime)) {
    throw httpError(`Tipo de archivo no permitido: ${mime_type}`, 400, 'ARCHIVO_MIME');
  }
  return { raw, bytes: approxBytes };
}

/** Unidad de bandeja por entregable (fila de orden_entregas ACTIVA). */
export function mapEntregableBandejaRow(row) {
  const entregaId = Number(row.orden_entrega_id);
  const recepcionesCount = Number(row.numero_recepciones || 0);
  const ultimaRecepcion = row.ultima_recepcion || null;
  const fechaMaxima = toIsoDateString(row.fecha_maxima) || row.fecha_maxima || null;
  const fechaBase = toIsoDateString(row.fecha_base) || row.fecha_base || null;

  const contract = buildEntregaContract({
    id: entregaId,
    numero_entrega: row.numero_entrega,
    tipo_entrega: row.tipo_entrega,
    descripcion: row.descripcion,
    etiqueta_entrega: row.etiqueta_entrega,
    codigo_entrega: row.codigo_entrega,
    dias_plazo: row.dias_plazo,
    fecha_base: fechaBase,
    fecha_maxima: fechaMaxima,
    importe: row.importe,
  }, { totalEntregas: Number(row.total_entregas || 1) });

  // RC8.15.5B — situación DERIVADA del entregable (desde tablas reales, sin duplicar estado workflow).
  const actaGeneradaVersion = row.acta_generada_version != null ? Number(row.acta_generada_version) : 0;
  const firmadaVigenteCount = row.firmada_vigente_count != null ? Number(row.firmada_vigente_count) : 0;
  const observacionAbierta = row.observacion_abierta || null;
  let estadoEjecucion = recepcionesCount > 0 ? 'RECIBIDO' : 'PENDIENTE_RECEPCION';
  if (observacionAbierta) estadoEjecucion = 'OBSERVADO';
  else if (actaGeneradaVersion > 0) estadoEjecucion = 'ACTA_GENERADA';
  else if (ultimaRecepcion?.tipo_recepcion === 'SUBSANACION') estadoEjecucion = 'SUBSANADO';
  if (!observacionAbierta && firmadaVigenteCount > 0) estadoEjecucion = 'CONFORME';
  const situacionLabel = {
    PENDIENTE_RECEPCION: 'Pendiente de recepción',
    RECIBIDO: 'Recibido',
    OBSERVADO: 'Observado',
    SUBSANADO: 'Subsanado',
    ACTA_GENERADA: 'Acta generada',
    CONFORME: 'Conforme',
  }[estadoEjecucion] || 'Recibido';

  return {
    orden_id: row.orden_id,
    orden_entrega_id: entregaId,
    requerimiento_id: row.requerimiento_id,
    requerimiento_codigo: row.requerimiento_codigo || '',
    tipo_orden: row.tipo_orden || 'OS',
    numero_orden: row.numero_orden || '',
    anio_orden: row.anio_orden || null,
    proveedor_id: row.proveedor_id || null,
    proveedor_ruc: row.proveedor_ruc || '',
    proveedor_razon_social: row.proveedor_razon_social || '',
    area_usuaria: row.area_usuaria || null,
    responsable: row.responsable || '',
    responsable_tipo: row.responsable_tipo || 'PENDIENTE',
    responsable_usuario_id: row.responsable_usuario_id || null,
    // RC8.15.1F — separar concepto de etapa del expediente vs situación del entregable.
    estado_etapa_codigo: row.estado_etapa_codigo || 'PRESENTACION_ENTREGABLES',
    estado_etapa_label: row.estado_etapa_label || 'Presentación de Entregables',
    etapa_label: row.estado_etapa_label || row.etapa_label || 'Presentación de Entregables',
    situacion_codigo: estadoEjecucion,
    situacion_label: situacionLabel,
    numero_entrega: row.numero_entrega,
    etiqueta_entrega: contract.etiquetaEntrega,
    descripcion: contract.descripcionEntrega,
    tipo_entregable: contract.tipoEntrega,
    dias_plazo: Number(row.dias_plazo || 0),
    fecha_base: fechaBase,
    fecha_maxima: fechaMaxima,
    importe: money(row.importe),
    numero_recepciones: recepcionesCount,
    fecha_recepcion_mesa_partes: ultimaRecepcion?.fecha_recepcion_mesa_partes || null,
    numero_expediente_sgd: ultimaRecepcion?.numero_expediente_sgd || null,
    ultima_recepcion: ultimaRecepcion,
    observacion_abierta: observacionAbierta,
    estado_ejecucion: estadoEjecucion,
    estado_ejecucion_label: situacionLabel,
    // RC8.15.3 — datos de orden y de ítem contractual por entregable.
    fecha_orden: toIsoDateString(row.fecha_orden) || row.fecha_orden || null,
    monto_orden: money(row.monto_total),
    moneda: row.moneda || 'PEN',
    cantidad: row.cantidad != null ? Number(row.cantidad) : null,
    precio_unitario: row.precio_unitario != null ? money(row.precio_unitario) : null,
    precio_total: row.precio_total != null ? money(row.precio_total) : null,
    acta_generada_version: actaGeneradaVersion,
    firmada_vigente: firmadaVigenteCount > 0,
    puede_registrar_recepcion: true,
  };
}

/**
 * Bandeja de entregables de SERVICIO/LOCACIÓN.
 * Devuelve cada entregable ACTIVO (unidad separada), sin duplicar por cambios de
 * estado de la orden (se agrupa por orden_entrega).
 */
export async function listarBandejaEntregablesServicios(userCtx = null) {
  const { rows } = await query(`
    SELECT
      oe.id AS orden_entrega_id,
      oe.orden_id,
      oe.numero_entrega,
      oe.tipo_entrega,
      oe.descripcion,
      oe.etiqueta_entrega,
      oe.codigo_entrega,
      oe.dias_plazo,
      oe.fecha_base,
      oe.fecha_maxima,
      oe.importe,
      oe.estado AS entrega_estado,
      oc.requerimiento_id,
      oc.tipo_orden,
      oc.numero_orden,
      oc.anio_orden,
      oc.tipo_contratacion,
      oc.fecha_orden,
      oc.monto_total,
      oc.moneda,
      oc.proveedor_id,
      oc.estado AS orden_estado,
      oc.enviado_proveedor_at,
      r.codigo AS requerimiento_codigo,
      r.area AS req_area,
      r.denominacion,
      p.ruc AS proveedor_ruc,
      p.razon_social AS proveedor_razon_social,
      (
        SELECT COUNT(*)::int FROM entregable_recepciones er
        WHERE er.orden_entrega_id = oe.id
      ) AS numero_recepciones,
      (
        SELECT json_build_object(
          'id', er.id,
          'numero_recepcion', er.numero_recepcion,
          'tipo_recepcion', er.tipo_recepcion,
          'fecha_recepcion_mesa_partes', er.fecha_recepcion_mesa_partes,
          'numero_expediente_sgd', er.numero_expediente_sgd,
          'estado', er.estado,
          'registrado_por', er.registrado_por,
          'registrado_at', er.registrado_at
        )
        FROM entregable_recepciones er
        WHERE er.orden_entrega_id = oe.id
        ORDER BY er.numero_recepcion DESC, er.id DESC
        LIMIT 1
      ) AS ultima_recepcion,
      (
        SELECT COUNT(*)::int FROM orden_entregas oe2
        WHERE oe2.orden_id = oc.id AND oe2.estado = 'ACTIVO'
      ) AS total_entregas,
      (
        SELECT json_build_object(
          'id', eo.id,
          'recepcion_id', eo.recepcion_id,
          'motivo', eo.motivo,
          'estado', eo.estado,
          'observado_por', eo.observado_por,
          'observado_at', eo.observado_at,
          'workflow_observacion_id', eo.workflow_observacion_id,
          'usuario_origen_id', wo.usuario_origen_id,
          'usuario_destino_id', wo.usuario_destino_id,
          'destino_submodulo_codigo', wo.destino_submodulo_codigo,
          'origen_submodulo_codigo', wo.origen_submodulo_codigo,
          'recepcion_subsanacion_id', eo.recepcion_subsanacion_id
        )
        FROM entregable_observaciones eo
        LEFT JOIN workflow_observaciones wo ON wo.id = eo.workflow_observacion_id
        WHERE eo.orden_entrega_id = oe.id
          AND eo.estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION')
        ORDER BY eo.observado_at DESC, eo.id DESC
        LIMIT 1
      ) AS observacion_abierta,
      oei.cantidad,
      oei.precio_unitario,
      oei.precio_total,
      (
        SELECT MAX(eca.version)::int FROM entregable_conformidad_actas eca
        WHERE eca.orden_entrega_id = oe.id
          AND eca.recepcion_id = (
            SELECT er.id FROM entregable_recepciones er
            WHERE er.orden_entrega_id = oe.id
              AND UPPER(COALESCE(er.estado,'')) IN ('RECIBIDO','SUBSANADO','CONFORME')
            ORDER BY er.numero_recepcion DESC, er.id DESC
            LIMIT 1
          )
      ) AS acta_generada_version,
      (
        SELECT COUNT(*)::int
        FROM entregable_conformidad_acta_visados ecav
        JOIN entregable_conformidad_actas eca ON eca.id = ecav.acta_id
        WHERE ecav.orden_entrega_id = oe.id
          AND ecav.vigente = TRUE
          AND ecav.deleted_at IS NULL
          AND eca.recepcion_id = (
            SELECT er.id FROM entregable_recepciones er
            WHERE er.orden_entrega_id = oe.id
              AND UPPER(COALESCE(er.estado,'')) IN ('RECIBIDO','SUBSANADO','CONFORME')
            ORDER BY er.numero_recepcion DESC, er.id DESC
            LIMIT 1
          )
      ) AS firmada_vigente_count
    FROM orden_entregas oe
    JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    LEFT JOIN proveedores p ON p.id = oc.proveedor_id
    LEFT JOIN LATERAL (
      SELECT oei.cantidad, oei.precio_unitario, oei.precio_total
      FROM orden_entrega_items oei
      WHERE oei.orden_entrega_id = oe.id
      ORDER BY oei.id
      LIMIT 1
    ) oei ON TRUE
    WHERE oe.estado = 'ACTIVO'
      AND UPPER(COALESCE(oc.estado,'')) <> 'ORDEN_ANULADA'
      AND (
        UPPER(COALESCE(oc.tipo_orden,'')) = 'OS'
        OR (
          UPPER(COALESCE(oc.tipo_orden,'')) = ''
          AND (
            UPPER(COALESCE(r.tipo,'')) ~ 'SERVIC|LOCAC|LOCADOR'
            OR UPPER(COALESCE(oc.tipo_contratacion,'')) ~ 'SERVIC|LOCAC|LOCADOR'
          )
        )
      )
      AND (
        oc.enviado_proveedor_at IS NOT NULL
        OR UPPER(COALESCE(oc.estado,'')) IN (
          'ORDEN_NOTIFICADA','ORDEN_ENVIADA_PENDIENTE_CONFIRMACION',
          'ORDEN_RECEPCION_CONFIRMADA','ORDEN_EN_EJECUCION','EN_EJECUCION',
          'DERIVADO_EJECUCION','ORDEN_RESUELTA','EXPEDIENTE_DERIVADO_PAGO'
        )
      )
    ORDER BY oc.anio_orden DESC, oc.numero_orden DESC, oe.numero_entrega ASC, oe.id ASC
  `);

  const list = rows.map((row) => {
    const areaUsuaria = resolveAreaUsuaria({
      requerimientoArea: row.req_area,
      solicitudAreaUsuaria: '',
      payloadArea: null,
      centroCosto: '',
      centro: '',
    });
    return mapEntregableBandejaRow({
      ...row,
      area_usuaria: areaUsuaria,
    });
  });

  const estadosPorEntregable = await listarEstadosResponsablesEntregables(
    list.map((item) => item.orden_entrega_id),
  );
  for (const item of list) {
    const erv = estadosPorEntregable.get(Number(item.orden_entrega_id)) || null;
    item.estado_responsable_vigente = erv;
    item.responsable = erv?.responsableNombre
      || erv?.responsableUsername
      || erv?.responsableUnidad
      || (erv?.responsableTipo === 'PENDIENTE' ? 'Pendiente' : '');
    item.responsable_tipo = erv?.responsableTipo || 'PENDIENTE';
    item.responsable_usuario_id = erv?.responsableUsuarioId ?? null;
    const responsableId = Number(item.responsable_usuario_id);
    const autorizado = esAdmin(userCtx)
      || (Number.isFinite(responsableId) && responsableId > 0 && Number(userCtx?.id) === responsableId);
    const responsablePersonaActual = Number.isFinite(responsableId)
      && responsableId > 0
      && Number(userCtx?.id) === responsableId;
    const perfilesUsuario = resolveFunctionalProfiles(userCtx);
    const etapaCodigo = String(erv?.etapaCodigo || erv?.estadoCodigo || '').toUpperCase();
    const enPresentacion = etapaCodigo === 'PRESENTACION_ENTREGABLES';
    const enRevisionCoordinador = etapaCodigo === 'REVISION_COORDINADOR_CM';
    const enRevisionAnalista = etapaCodigo === 'REVISION_ANALISTA_CM';
    const enDerivacionPago = etapaCodigo === 'DERIVACION_PAGO';
    const analistaCMResponsable = esAdmin(userCtx)
      || (responsablePersonaActual
        && perfilesUsuario.includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES));
    const obs = item.observacion_abierta || null;
    const clasificacion = clasificarObservacionEntregable(obs);
    item.observacion_clase = clasificacion;
    const routingActivo = clasificacion === 'DIRIGIDA_CANONICA';
    const esEmisor = esEmisorObservacionEntregable(obs, userCtx);
    const esOrigenDirigida = routingActivo && esEmisor;
    item.routing_observacion_activo = routingActivo;
    item.solo_lectura_routing_origen = esOrigenDirigida && !responsablePersonaActual;
    item.solo_lectura_legacy_emisor = clasificacion === 'LEGACY_SIN_ROUTING'
      && Boolean(obs?.id)
      && esEmisor;
    const soloLecturaEmisor = item.solo_lectura_routing_origen || item.solo_lectura_legacy_emisor;
    const tieneRecepcion = Boolean(item.ultima_recepcion?.id);
    const sinObservacionAbierta = !obs;
    item.puede_registrar_recepcion = autorizado
      && enPresentacion
      && !soloLecturaEmisor
      && !tieneRecepcion;
    item.puede_modificar_entregable = autorizado
      && enPresentacion
      && !soloLecturaEmisor
      && tieneRecepcion
      && sinObservacionAbierta
      && ['RECIBIDO', 'SUBSANADO'].includes(item.situacion_codigo);
    item.puede_gestionar_conformidad = autorizado
      && enPresentacion
      && !soloLecturaEmisor
      && sinObservacionAbierta
      && ['RECIBIDO', 'SUBSANADO'].includes(item.situacion_codigo);
    item.puede_observar = autorizado
      && enPresentacion
      && !soloLecturaEmisor
      && tieneRecepcion
      && sinObservacionAbierta
      && ['RECIBIDO', 'SUBSANADO', 'ACTA_GENERADA', 'CONFORME'].includes(item.situacion_codigo);
    item.puede_subsanar = autorizado
      && enPresentacion
      && routingActivo
      && Number(obs?.usuario_destino_id) === Number(userCtx?.id)
      && responsablePersonaActual
      && item.situacion_codigo === 'OBSERVADO';
    item.puede_derivar_coordinador_cm = autorizado
      && enPresentacion
      && !soloLecturaEmisor
      && item.situacion_codigo === 'CONFORME'
      && item.acta_generada_version > 0
      && item.firmada_vigente
      && sinObservacionAbierta;
    item.puede_ver_observacion_abierta = Boolean(obs?.id)
      && (soloLecturaEmisor
        || (routingActivo && Number(obs?.usuario_destino_id) === Number(userCtx?.id)));
    item.puede_ver_observacion_dirigida = item.puede_ver_observacion_abierta && routingActivo;
    item.puede_retirar_observacion = Boolean(obs?.id)
      && obs.estado === 'OBS_EMITIDA'
      && esEmisor
      && !obs.recepcion_subsanacion_id;
    item.puede_adjuntar_acta_firmada = autorizado
      && enPresentacion
      && !soloLecturaEmisor
      && sinObservacionAbierta
      && item.acta_generada_version > 0
      && !item.firmada_vigente;
    item.puede_ver_acta_generada = autorizado
      && enPresentacion
      && !soloLecturaEmisor
      && item.acta_generada_version > 0;
    item.puede_ver_acta_firmada = autorizado
      && enPresentacion
      && !soloLecturaEmisor
      && item.firmada_vigente;
    item.puede_observar_coordinador_cm = responsablePersonaActual
      && perfilesUsuario.includes(PERFILES_FUNCIONALES.COORDINADOR_CM)
      && enRevisionCoordinador
      && !item.observacion_abierta;
    item.puede_derivar_analista_cm = responsablePersonaActual
      && perfilesUsuario.includes(PERFILES_FUNCIONALES.COORDINADOR_CM)
      && enRevisionCoordinador
      && item.situacion_codigo === 'CONFORME'
      && !item.observacion_abierta;
    item.puede_observar_analista_cm = analistaCMResponsable
      && enRevisionAnalista
      && item.situacion_codigo === 'CONFORME'
      && !item.observacion_abierta;
    item.puede_derivar_pago = analistaCMResponsable
      && enRevisionAnalista
      && item.situacion_codigo === 'CONFORME'
      && item.acta_generada_version > 0
      && item.firmada_vigente
      && !item.observacion_abierta;
    item.puede_ver_trazabilidad = Boolean(erv)
      && (enPresentacion || enRevisionCoordinador || enRevisionAnalista || enDerivacionPago);
    // Etapa canónica del entregable (específica o fallback histórico).
    if (erv) {
      const etapaCodigoCanon = erv.etapaCodigo || erv.estadoCodigo || 'PRESENTACION_ENTREGABLES';
      const labelsCanon = buildEstadoLabels(etapaCodigoCanon, erv.estadoCodigo || etapaCodigoCanon);
      item.estado_etapa_codigo = etapaCodigoCanon;
      item.estado_etapa_label = labelsCanon.etapaLabel;
      item.etapa_label = labelsCanon.etapaLabel;
      item.estado_responsable_vigente = {
        ...erv,
        etapaCodigo: etapaCodigoCanon,
        etapaLabel: labelsCanon.etapaLabel,
        estadoCodigo: labelsCanon.estadoCodigo,
        estadoLabel: labelsCanon.estadoLabel,
      };
    }
  }
  return list;
}

/** Resumen conservador de workflow para una orden con uno o más entregables. */
export function agregarEstadoResponsableOrden(contratos = []) {
  const vigentes = contratos.filter(Boolean);
  const estados = new Map();
  const responsables = new Map();
  for (const contrato of vigentes) {
    const etapaCodigo = contrato.etapaCodigo || contrato.estadoCodigo || '';
    const etapaLabel = contrato.etapaLabel || contrato.estadoLabel || etapaCodigo;
    const estadoKey = `${etapaCodigo}|${etapaLabel}`;
    const estado = estados.get(estadoKey) || {
      codigo: etapaCodigo,
      label: etapaLabel,
      cantidad: 0,
    };
    estado.cantidad += 1;
    estados.set(estadoKey, estado);

    const nombre = contrato.responsableNombre
      || contrato.responsableUsername
      || contrato.responsableUnidad
      || (contrato.responsableTipo === 'PENDIENTE' ? 'Pendiente' : '');
    const responsableKey = `${contrato.responsableTipo}|${contrato.responsableUsuarioId || ''}|${contrato.responsableUnidad || ''}|${nombre}`;
    const responsable = responsables.get(responsableKey) || {
      tipo: contrato.responsableTipo,
      usuario_id: contrato.responsableUsuarioId,
      unidad: contrato.responsableUnidad,
      nombre,
      cantidad: 0,
    };
    responsable.cantidad += 1;
    responsables.set(responsableKey, responsable);
  }

  const estadosEntregables = [...estados.values()];
  const responsablesEntregables = [...responsables.values()];
  const uniforme = estados.size === 1 && responsables.size === 1;
  const estado = uniforme ? estadosEntregables[0] : null;
  const responsable = uniforme ? responsablesEntregables[0] : null;
  return {
    estados_entregables: estadosEntregables,
    responsables_entregables: responsablesEntregables,
    estado_agregado_heterogeneo: estados.size > 1 || responsables.size > 1,
    // Los componentes visuales centrales solo leen este contrato anidado.
    // Es seguro exponerlo únicamente cuando no mezcla entregables distintos.
    estado_responsable_vigente: uniforme ? vigentes[0] : null,
    estado_etapa_codigo: estado?.codigo || '',
    estado_etapa_label: estado?.label || '',
    responsable: responsable?.nombre || '',
    responsable_tipo: responsable?.tipo || 'PENDIENTE',
    responsable_usuario_id: responsable?.usuario_id ?? null,
  };
}

/** RC8.15.3 — Bandeja pestaña Órdenes: una fila por orden (SERVICIO/LOCACIÓN). */
export async function listarBandejaOrdenesEntregablesServicios(userCtx = null) {
  const { rows } = await query(`
    SELECT
      oc.id AS orden_id,
      oc.requerimiento_id,
      oc.tipo_orden,
      oc.numero_orden,
      oc.anio_orden,
      oc.fecha_orden,
      oc.monto_total,
      oc.moneda,
      oc.tipo_contratacion,
      oc.proveedor_id,
      oc.estado AS orden_estado,
      oc.enviado_proveedor_at,
      r.codigo AS requerimiento_codigo,
      r.cmn AS requerimiento_cmn,
      r.area AS req_area,
      r.payload AS requerimiento_payload,
      p.ruc AS proveedor_ruc,
      p.razon_social AS proveedor_razon_social,
      (
        SELECT COUNT(*)::int FROM orden_entregas oe2
        WHERE oe2.orden_id = oc.id AND oe2.estado = 'ACTIVO'
      ) AS total_entregables,
      (
        SELECT COUNT(DISTINCT er.orden_entrega_id)::int
        FROM entregable_recepciones er
        JOIN orden_entregas oe3 ON oe3.id = er.orden_entrega_id
        WHERE oe3.orden_id = oc.id AND oe3.estado = 'ACTIVO'
          AND er.estado IN ('RECIBIDO', 'CONFORME')
      ) AS entregables_recibidos,
      (
        SELECT MAX(oe4.dias_plazo) FROM orden_entregas oe4
        WHERE oe4.orden_id = oc.id AND oe4.estado = 'ACTIVO'
      ) AS plazo_total_dias
    FROM ordenes_contratacion oc
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    LEFT JOIN proveedores p ON p.id = oc.proveedor_id
    WHERE UPPER(COALESCE(oc.estado,'')) <> 'ORDEN_ANULADA'
      AND (
        UPPER(COALESCE(oc.tipo_orden,'')) = 'OS'
        OR (
          UPPER(COALESCE(oc.tipo_orden,'')) = ''
          AND (
            UPPER(COALESCE(r.tipo,'')) ~ 'SERVIC|LOCAC|LOCADOR'
            OR UPPER(COALESCE(oc.tipo_contratacion,'')) ~ 'SERVIC|LOCAC|LOCADOR'
          )
        )
      )
      AND EXISTS (
        SELECT 1 FROM orden_entregas oe5
        WHERE oe5.orden_id = oc.id AND oe5.estado = 'ACTIVO'
      )
      AND (
        oc.enviado_proveedor_at IS NOT NULL
        OR UPPER(COALESCE(oc.estado,'')) IN (
          'ORDEN_NOTIFICADA','ORDEN_ENVIADA_PENDIENTE_CONFIRMACION',
          'ORDEN_RECEPCION_CONFIRMADA','ORDEN_EN_EJECUCION','EN_EJECUCION',
          'DERIVADO_EJECUCION','ORDEN_RESUELTA','EXPEDIENTE_DERIVADO_PAGO'
        )
      )
    ORDER BY oc.fecha_orden DESC, oc.id DESC
  `);

  const list = rows.map((row) => {
    const total = Number(row.total_entregables || 0);
    const recibidos = Number(row.entregables_recibidos || 0);
    let situacionCodigo = 'PENDIENTE_RECEPCION';
    let situacionLabel = 'Pendiente de recepción';
    if (total > 0 && recibidos >= total) {
      situacionCodigo = 'RECIBIDO';
      situacionLabel = 'Recibido';
    } else if (recibidos > 0) {
      situacionCodigo = 'RECIBIDO_PARCIAL';
      situacionLabel = 'Recibido parcial';
    }

    let centro = '';
    try {
      const c = resolverCentroDesdeRequerimiento({
        cmn: row.requerimiento_cmn,
        area: row.req_area,
        payload: row.requerimiento_payload,
      });
      centro = c.centro_codigo || c.centro_nombre || '';
    } catch (_) {
      centro = '';
    }

    return {
      orden_id: row.orden_id,
      requerimiento_id: row.requerimiento_id,
      requerimiento_codigo: row.requerimiento_codigo || '',
      tipo_orden: row.tipo_orden || 'OS',
      numero_orden: row.numero_orden || '',
      anio_orden: row.anio_orden || null,
      fecha_orden: toIsoDateString(row.fecha_orden) || row.fecha_orden || null,
      monto_total: money(row.monto_total),
      moneda: row.moneda || 'PEN',
      proveedor_id: row.proveedor_id || null,
      proveedor_ruc: row.proveedor_ruc || '',
      proveedor_razon_social: row.proveedor_razon_social || '',
      centro,
      plazo_total_dias: Number(row.plazo_total_dias || 0),
      total_entregables: total,
      entregables_recibidos: recibidos,
      situacion_codigo: situacionCodigo,
      situacion_label: situacionLabel,
    };
  });

  const ordenIds = list.map((item) => Number(item.orden_id));
  const entregasPorOrden = new Map(ordenIds.map((id) => [id, []]));
  if (ordenIds.length) {
    const { rows: entregas } = await query(`
      SELECT id, orden_id
      FROM orden_entregas
      WHERE orden_id = ANY($1::int[]) AND estado='ACTIVO'
      ORDER BY orden_id, numero_entrega, id
    `, [ordenIds]);
    for (const entrega of entregas) {
      entregasPorOrden.get(Number(entrega.orden_id))?.push(Number(entrega.id));
    }
  }
  const todosLosEntregables = [...new Set([...entregasPorOrden.values()].flat())];
  const estadosPorEntregable = await listarEstadosResponsablesEntregables(todosLosEntregables);
  for (const item of list) {
    const contratos = (entregasPorOrden.get(Number(item.orden_id)) || [])
      .map((id) => estadosPorEntregable.get(id))
      .filter(Boolean);
    Object.assign(item, agregarEstadoResponsableOrden(contratos));
  }
  return list;
}

/** RC8.15.5A — Conformidad del entregable: lectura estructural (solo lectura). */
export async function listarConformidadEntregable(ordenEntregaId) {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  const eid = Number(ordenEntregaId);
  const [recepcionVigente, actasRes, visadosRes] = await Promise.all([
    obtenerRecepcionVigenteEntregable(eid),
    query(
      `SELECT a.id, a.orden_id, a.orden_entrega_id, a.recepcion_id, a.numero_acta,
              a.version, a.estado_documental, a.documento_nombre, a.documento_mime,
              a.generado_at, a.generado_por, a.created_at, a.updated_at,
              r.numero_recepcion, r.tipo_recepcion, r.fecha_recepcion_mesa_partes,
              r.numero_expediente_sgd
       FROM entregable_conformidad_actas a
       LEFT JOIN entregable_recepciones r ON r.id = a.recepcion_id
       WHERE a.orden_entrega_id = $1
       ORDER BY a.version DESC, a.id DESC`,
      [eid],
    ),
    query(
      `SELECT v.id, v.orden_id, v.orden_entrega_id, v.acta_id, v.version, v.nombre, v.mime_type,
              v.tamano_bytes, v.estado_documental, v.vigente, v.reemplaza_id, v.created_by, v.created_at,
              a.recepcion_id, a.version AS acta_version, r.numero_recepcion, r.tipo_recepcion,
              r.fecha_recepcion_mesa_partes, r.numero_expediente_sgd
       FROM entregable_conformidad_acta_visados v
       JOIN entregable_conformidad_actas a ON a.id = v.acta_id
       LEFT JOIN entregable_recepciones r ON r.id = a.recepcion_id
       WHERE v.orden_entrega_id = $1 AND v.deleted_at IS NULL
       ORDER BY a.version DESC, v.version DESC, v.id DESC`,
      [eid],
    ),
  ]);
  const metadataVigencia = (recepcionId) => {
    if (recepcionId == null) {
      return { vigente_operativa: false, vigencia_razon: 'LEGACY_SIN_RECEPCION' };
    }
    const vigente = Number(recepcionId) === Number(recepcionVigente?.id);
    return {
      vigente_operativa: vigente,
      vigencia_razon: vigente ? 'PRESENTACION_VIGENTE' : 'PRESENTACION_ANTERIOR',
    };
  };
  const actas = actasRes.rows.map((acta) => ({ ...acta, ...metadataVigencia(acta.recepcion_id) }));
  const visados = visadosRes.rows.map((visado) => {
    const metadata = metadataVigencia(visado.recepcion_id);
    return {
      ...visado,
      vigente_operativa: Boolean(visado.vigente) && metadata.vigente_operativa,
      vigencia_razon: metadata.vigencia_razon,
    };
  });
  return {
    orden_id: entrega.orden_id,
    orden_entrega_id: eid,
    recepcion_vigente_id: recepcionVigente?.id || null,
    actas,
    visados,
    acta_generada_vigente: actas.find((acta) => acta.vigente_operativa) || null,
    acta_firmada_vigente: visados.find((visado) => visado.vigente_operativa) || null,
  };
}

export async function obtenerActaGeneradaVigente(ordenEntregaId, { client = null } = {}) {
  if (!client) await getEntregableOrThrow(ordenEntregaId);
  const recepcion = await obtenerRecepcionVigenteEntregable(ordenEntregaId, { client });
  if (!recepcion) return null;
  const runQuery = client ? client.query.bind(client) : query;
  const { rows } = await runQuery(
    `SELECT * FROM entregable_conformidad_actas
     WHERE orden_entrega_id = $1 AND recepcion_id = $2
     ORDER BY version DESC, id DESC LIMIT 1`,
    [Number(ordenEntregaId), Number(recepcion.id)],
  );
  return rows[0] || null;
}

export async function obtenerActaFirmadaVigente(ordenEntregaId, { client = null } = {}) {
  if (!client) await getEntregableOrThrow(ordenEntregaId);
  const recepcion = await obtenerRecepcionVigenteEntregable(ordenEntregaId, { client });
  if (!recepcion) return null;
  const runQuery = client ? client.query.bind(client) : query;
  const { rows } = await runQuery(
    `SELECT v.*, a.recepcion_id
     FROM entregable_conformidad_acta_visados v
     JOIN entregable_conformidad_actas a ON a.id = v.acta_id
     WHERE v.orden_entrega_id = $1
       AND v.vigente = TRUE
       AND v.deleted_at IS NULL
       AND a.recepcion_id = $2
     ORDER BY v.version DESC, v.id DESC LIMIT 1`,
    [Number(ordenEntregaId), Number(recepcion.id)],
  );
  return rows[0] || null;
}

async function getEntregableOrThrow(ordenEntregaId) {
  const eid = parseInt(ordenEntregaId, 10);
  if (!Number.isFinite(eid)) throw httpError('orden_entrega_id inválido');
  const { rows } = await query(`
    SELECT oe.*, oc.requerimiento_id, oc.tipo_orden, oc.numero_orden, oc.anio_orden,
      oc.tipo_contratacion, oc.estado AS orden_estado, oc.enviado_proveedor_at,
      oc.proveedor_id, oc.fecha_orden, oc.moneda, oc.monto_total,
      r.codigo AS requerimiento_codigo, r.area AS req_area, r.denominacion, r.tipo AS req_tipo,
      r.cmn AS requerimiento_cmn, r.payload AS requerimiento_payload,
      p.ruc AS proveedor_ruc, p.razon_social AS proveedor_razon_social,
      oei.cantidad, oei.precio_unitario, oei.precio_total
    FROM orden_entregas oe
    JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    LEFT JOIN proveedores p ON p.id = oc.proveedor_id
    LEFT JOIN LATERAL (
      SELECT oei.cantidad, oei.precio_unitario, oei.precio_total
      FROM orden_entrega_items oei
      WHERE oei.orden_entrega_id = oe.id
      ORDER BY oei.id
      LIMIT 1
    ) oei ON TRUE
    WHERE oe.id = $1
  `, [eid]);
  if (!rows.length) throw httpError('Entregable no encontrado', 404);
  return rows[0];
}

/** Detalle/expediente del entregable (sin duplicar documentos: reutiliza expediente de la orden). */
export async function getDetalleEntregableServicio(ordenEntregaId) {
  const entrega = await getEntregableOrThrow(ordenEntregaId);

  const [recepcionesRes, documentosRes, observacionesRes, recepcionCanonica] = await Promise.all([
    query(`
      SELECT er.*,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', d.id,
            'recepcion_id', d.recepcion_id,
            'nombre_archivo', d.nombre_archivo,
            'mime_type', d.mime_type,
            'tamanio_bytes', d.tamanio_bytes,
            'vigente', d.vigente,
            'reemplaza_id', d.reemplaza_id,
            'created_at', d.created_at
          ) ORDER BY d.id DESC)
          FROM entregable_recepcion_documentos d WHERE d.recepcion_id = er.id
        ), '[]'::json) AS documentos
      FROM entregable_recepciones er
      WHERE er.orden_entrega_id = $1
      ORDER BY er.numero_recepcion DESC, er.id DESC
    `, [ordenEntregaId]),
    query(`
      SELECT d.id, d.recepcion_id, d.nombre_archivo, d.mime_type, d.tamanio_bytes,
        d.vigente, d.reemplaza_id, d.created_at
      FROM entregable_recepcion_documentos d
      JOIN entregable_recepciones er ON er.id = d.recepcion_id
      WHERE er.orden_entrega_id = $1
      ORDER BY d.id DESC
    `, [ordenEntregaId]),
    query(`
      SELECT eo.*
      FROM entregable_observaciones eo
      WHERE eo.orden_entrega_id = $1
      ORDER BY eo.observado_at DESC, eo.id DESC
    `, [ordenEntregaId]),
    obtenerRecepcionVigenteEntregable(ordenEntregaId),
  ]);

  // Expediente de la orden (Anexo 11 / cotización adjudicada, orden firmada, CCP, etc.).
  let expediente = null;
  try {
    const { getExpedienteOrdenCompleto } = await import('./ordenesContratacion.js');
    expediente = await getExpedienteOrdenCompleto(entrega.orden_id);
  } catch (_) {
    expediente = null;
  }

  const notif = resolveOrdenFechaNotificacion({ enviado_proveedor_at: entrega.enviado_proveedor_at }, []);
  const contract = buildEntregaContract(entrega, { totalEntregas: 1 });

  const recepciones = recepcionesRes.rows || [];
  const recepcionVigente = recepciones.find(
    (recepcion) => Number(recepcion.id) === Number(recepcionCanonica?.id),
  ) || null;
  const documentoVigente = recepcionVigente?.documentos?.find((d) => d.vigente) || null;
  const observaciones = observacionesRes.rows || [];
  const observacionAbierta = observaciones.find(
    (o) => o.estado === 'OBS_EMITIDA' || o.estado === 'OBS_EN_ATENCION',
  ) || null;

  return {
    orden_id: entrega.orden_id,
    orden_entrega_id: Number(ordenEntregaId),
    requerimiento_id: entrega.requerimiento_id,
    requerimiento_codigo: entrega.requerimiento_codigo || '',
    tipo_orden: entrega.tipo_orden,
    numero_orden: entrega.numero_orden,
    anio_orden: entrega.anio_orden,
    proveedor_ruc: entrega.proveedor_ruc || '',
    proveedor_razon_social: entrega.proveedor_razon_social || '',
    area_usuaria: resolveAreaUsuaria({ requerimientoArea: entrega.req_area }),
    numero_entrega: entrega.numero_entrega,
    etiqueta_entrega: contract.etiquetaEntrega,
    descripcion: contract.descripcionEntrega,
    dias_plazo: Number(entrega.dias_plazo || 0),
    fecha_base: toIsoDateString(entrega.fecha_base) || entrega.fecha_base,
    fecha_maxima: toIsoDateString(entrega.fecha_maxima) || entrega.fecha_maxima,
    importe: money(entrega.importe),
    fecha_notificacion: notif.fechaNotificacion,
    recepciones,
    recepcion_vigente: recepcionVigente,
    documento_vigente: documentoVigente,
    documentos_entregable: documentosRes.rows || [],
    observaciones,
    observacion_abierta: observacionAbierta,
    expediente: expediente,
  };
}

function permisosUsuario(row) {
  if (row?.permisos && typeof row.permisos === 'object') return row.permisos;
  try { return JSON.parse(row?.permisos || '{}'); } catch (_) { return {}; }
}

function esCoordinadorCMActivo(row) {
  return row?.activo === true && resolveFunctionalProfiles({
    ...row,
    permisos: permisosUsuario(row),
  }).includes(PERFILES_FUNCIONALES.COORDINADOR_CM);
}

function esAnalistaCMActivo(row) {
  return row?.activo === true && resolveFunctionalProfiles({
    ...row,
    permisos: permisosUsuario(row),
  }).includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES);
}

function esAnalistaPagoActivo(row) {
  return row?.activo === true && resolveFunctionalProfiles({
    ...row,
    permisos: permisosUsuario(row),
  }).includes(PERFILES_FUNCIONALES.ANALISTA_PAGO);
}

function mapCoordinadorCM(row) {
  return {
    id: Number(row.id),
    nombre: String(row.nombre || [row.nombres, row.apellidos].filter(Boolean).join(' ') || '').trim(),
    username: row.username || row.dni || '',
    cargo: row.cargo || '',
    centro: row.centro || row.descripcion_area || '',
    unidad: row.codigo_centro_costo || '',
  };
}

function assertCoordinadorCMResponsable(userCtx, estado) {
  const perfiles = resolveFunctionalProfiles(userCtx);
  if (Number(userCtx?.id) !== Number(estado?.responsableUsuarioId)
    || estado?.responsableTipo !== 'PERSONA'
    || !perfiles.includes(PERFILES_FUNCIONALES.COORDINADOR_CM)) {
    throw httpError(
      'Solo el Coordinador CM responsable del entregable puede realizar esta acción',
      403,
      'COORDINADOR_CM_NO_AUTORIZADO',
    );
  }
}

function assertAnalistaCMResponsable(userCtx, estado) {
  if (esAdmin(userCtx)) return;
  const perfiles = resolveFunctionalProfiles(userCtx);
  if (Number(userCtx?.id) !== Number(estado?.responsableUsuarioId)
    || estado?.responsableTipo !== 'PERSONA'
    || !perfiles.includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES)) {
    throw httpError(
      'Solo el Analista CM responsable del entregable puede realizar esta acción',
      403,
      'ANALISTA_CM_NO_AUTORIZADO',
    );
  }
}

async function obtenerResponsableAreaUsuariaAnterior(client, ordenEntregaId) {
  const { rows } = await client.query(`
    SELECT a.*, u.activo AS usuario_activo
    FROM entregable_asignaciones a
    JOIN usuarios u ON u.id=a.usuario_id
    WHERE a.orden_entrega_id=$1
      AND a.etapa_codigo='PRESENTACION_ENTREGABLES'
      AND a.tipo_responsable='PERSONA'
      AND a.usuario_id IS NOT NULL
      AND a.activo=FALSE
      AND a.cerrado_at IS NOT NULL
    ORDER BY a.cerrado_at DESC, a.id DESC
    LIMIT 1
    FOR UPDATE OF a
  `, [Number(ordenEntregaId)]);
  const anterior = rows[0] || null;
  if (!anterior || anterior.usuario_activo !== true) {
    throw httpError(
      'No se pudo resolver de forma confiable al responsable anterior del Área Usuaria',
      409,
      'RESPONSABLE_AU_ANTERIOR_NO_DISPONIBLE',
    );
  }
  return anterior;
}

function assertAccesoDerivacion(userCtx, estado, entrega) {
  if (esAdmin(userCtx)) return;
  const uid = Number(userCtx?.id);
  if (estado?.responsableTipo === 'PERSONA'
    && uid > 0
    && uid === Number(estado.responsableUsuarioId)) return;

  const perfiles = resolveFunctionalProfiles(userCtx);
  if (estado?.responsableTipo === 'UNIDAD'
    && perfiles.includes(PERFILES_FUNCIONALES.AREA_USUARIA)) {
    let centroEntrega = '';
    try {
      const centro = resolverCentroDesdeRequerimiento({
        cmn: entrega.requerimiento_cmn,
        area: entrega.req_area,
        payload: entrega.requerimiento_payload,
      });
      centroEntrega = String(centro.centro_codigo || centro.centro_nombre || '').trim().toUpperCase();
    } catch (_) { centroEntrega = ''; }
    const centrosUsuario = [
      userCtx?.centro,
      userCtx?.codigo_centro_costo,
    ].map((value) => String(value || '').trim().toUpperCase()).filter(Boolean);
    if (centroEntrega && centrosUsuario.includes(centroEntrega)) return;
  }
  throw httpError(
    'Solo el responsable actual del entregable puede derivarlo',
    403,
    'DERIVACION_NO_AUTORIZADA',
  );
}

function assertEtapaPresentacion(estado) {
  if (String(estado?.etapaCodigo || estado?.estadoCodigo || '').toUpperCase()
    !== 'PRESENTACION_ENTREGABLES') {
    throw httpError(
      'El entregable ya no está en Presentación de Entregables',
      409,
      'ETAPA_ENTREGABLE_NO_COMPATIBLE',
    );
  }
}

function assertEtapaGestionOperativa(estado) {
  if (estado?.fuenteEstado !== 'ENTREGABLE') return;
  assertEtapaPresentacion(estado);
}

async function listarUsuariosCoordinadorCM(client = { query }) {
  const { rows } = await client.query(`
    SELECT id, dni, username, nombre, nombres, apellidos, cargo, centro,
      codigo_centro_costo, descripcion_area, rol, permisos, alcance_datos, activo
    FROM usuarios
    WHERE activo=TRUE
    ORDER BY COALESCE(NULLIF(TRIM(nombre),''), NULLIF(TRIM(username),''), dni), id
  `);
  return rows.filter(esCoordinadorCMActivo);
}

async function listarUsuariosAnalistaCM(client = { query }) {
  const { rows } = await client.query(`
    SELECT id, dni, username, nombre, nombres, apellidos, cargo, centro,
      codigo_centro_costo, descripcion_area, rol, permisos, alcance_datos, activo
    FROM usuarios
    WHERE activo=TRUE
    ORDER BY COALESCE(NULLIF(TRIM(nombre),''), NULLIF(TRIM(username),''), dni), id
  `);
  return rows.filter(esAnalistaCMActivo);
}

async function listarUsuariosAnalistaPago(client = { query }) {
  const { rows } = await client.query(`
    SELECT id, dni, username, nombre, nombres, apellidos, cargo, centro,
      codigo_centro_costo, descripcion_area, rol, permisos, alcance_datos, activo
    FROM usuarios
    WHERE activo=TRUE
    ORDER BY COALESCE(NULLIF(TRIM(nombre),''), NULLIF(TRIM(username),''), dni), id
  `);
  return rows.filter(esAnalistaPagoActivo);
}

async function obtenerCoordinadorCMRetorno(client, ordenEntregaId) {
  const { rows } = await client.query(`
    SELECT a.*, u.dni, u.username, u.nombre, u.nombres, u.apellidos, u.cargo,
      u.centro, u.codigo_centro_costo, u.descripcion_area, u.rol, u.permisos,
      u.alcance_datos, u.activo AS usuario_activo
    FROM entregable_asignaciones a
    JOIN usuarios u ON u.id=a.usuario_id
    WHERE a.orden_entrega_id=$1
      AND a.etapa_codigo='REVISION_COORDINADOR_CM'
      AND a.tipo_responsable='PERSONA'
      AND a.usuario_id IS NOT NULL
      AND a.activo=FALSE
      AND a.cerrado_at IS NOT NULL
    ORDER BY a.cerrado_at DESC, a.id DESC
    LIMIT 1
    FOR UPDATE OF a
  `, [Number(ordenEntregaId)]);
  const anterior = rows[0] || null;
  const usuario = anterior ? { ...anterior, id: anterior.usuario_id, activo: anterior.usuario_activo } : null;
  if (!anterior || !esCoordinadorCMActivo(usuario)) {
    throw httpError(
      'No se pudo resolver de forma confiable al Coordinador CM anterior',
      409,
      'COORDINADOR_CM_RETORNO_NO_RESUELTO',
    );
  }
  return { asignacion: anterior, usuario };
}

/** Destinatarios PERSONA activos con perfil funcional COORDINADOR_CM. */
export async function listarCoordinadoresCMEntregable(ordenEntregaId, userCtx = null) {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  if (String(entrega.estado || '').toUpperCase() !== 'ACTIVO') {
    throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
  }
  const estado = await obtenerEstadoResponsableEntregable(ordenEntregaId);
  assertEtapaPresentacion(estado);
  assertAccesoDerivacion(userCtx, estado, entrega);
  const coordinadores = await listarUsuariosCoordinadorCM();
  return coordinadores.map(mapCoordinadorCM);
}

async function validarPrecondicionesDerivacion(client, entrega) {
  if (String(entrega.estado || '').toUpperCase() !== 'ACTIVO') {
    throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
  }
  if (String(entrega.orden_estado || '').toUpperCase() === 'ORDEN_ANULADA') {
    throw httpError('La orden asociada está anulada', 409, 'ORDEN_ANULADA');
  }
  if (!isServicioOLocacion(entrega.tipo_orden, entrega.tipo_contratacion, entrega.req_tipo)) {
    throw httpError('El entregable no corresponde a un servicio/locación', 409, 'ENTREGABLE_NO_SERVICIO');
  }

  const recepcion = await obtenerRecepcionVigenteEntregable(entrega.id, { client, lock: true });
  if (!recepcion) {
    throw httpError('El entregable no tiene una recepción vigente', 409, 'SIN_RECEPCION_VIGENTE');
  }

  const observaciones = (await client.query(`
    SELECT *
    FROM entregable_observaciones
    WHERE orden_entrega_id=$1
    ORDER BY observado_at DESC, id DESC
    FOR UPDATE
  `, [Number(entrega.id)])).rows;
  if (observaciones.some((obs) => ['OBS_EMITIDA', 'OBS_EN_ATENCION'].includes(obs.estado))) {
    throw httpError(
      'El entregable tiene una observación formal abierta',
      409,
      'ENTREGABLE_OBSERVADO',
    );
  }
  const ultimaObservacion = observaciones[0] || null;
  if (ultimaObservacion
    && (!['OBS_SUBSANADA', 'OBS_CERRADA'].includes(ultimaObservacion.estado)
      || (ultimaObservacion.estado === 'OBS_SUBSANADA'
        && Number(ultimaObservacion.recepcion_subsanacion_id) !== Number(recepcion.id)))) {
    throw httpError(
      'La última observación del entregable no está subsanada',
      409,
      'OBSERVACION_NO_SUBSANADA',
    );
  }

  const acta = (await client.query(`
    SELECT *
    FROM entregable_conformidad_actas
    WHERE orden_entrega_id=$1
      AND recepcion_id=$2
      AND estado_documental='ACTA_CONFORMIDAD_GENERADA'
    ORDER BY version DESC, id DESC
    LIMIT 1
    FOR UPDATE
  `, [Number(entrega.id), Number(recepcion.id)])).rows[0];
  if (!acta) {
    throw httpError(
      'Debe existir un Acta de Conformidad generada',
      409,
      'SIN_ACTA_GENERADA',
    );
  }
  const firmada = (await client.query(`
    SELECT v.*
    FROM entregable_conformidad_acta_visados v
    JOIN entregable_conformidad_actas a ON a.id = v.acta_id
    WHERE v.orden_entrega_id=$1
      AND a.recepcion_id=$2
      AND v.acta_id=$3
      AND v.estado_documental='ACTA_CONFORMIDAD_FIRMADA'
      AND v.vigente=TRUE
      AND v.deleted_at IS NULL
    ORDER BY v.version DESC, v.id DESC
    LIMIT 1
    FOR UPDATE OF v
  `, [Number(entrega.id), Number(recepcion.id), Number(acta.id)])).rows[0];
  if (!firmada) {
    throw httpError(
      'Debe existir un Acta de Conformidad firmada vigente',
      409,
      'SIN_ACTA_FIRMADA_VIGENTE',
    );
  }
  return { recepcion, ultimaObservacion, acta, firmada };
}

/** Derivación real y transaccional de un único orden_entrega_id. */
export async function derivarEntregableCoordinadorCM(
  ordenEntregaId,
  body = {},
  userCtx = null,
  usuario = '',
) {
  const eid = parseInt(ordenEntregaId, 10);
  const responsableId = parseInt(body?.responsable_id, 10);
  if (!Number.isFinite(eid)) throw httpError('orden_entrega_id inválido');
  if (!Number.isFinite(responsableId)) {
    throw httpError(
      'Debe seleccionar un Coordinador CM',
      422,
      'RESPONSABLE_DESTINO_REQUERIDO',
    );
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT oe.*, oc.requerimiento_id, oc.tipo_orden, oc.numero_orden, oc.anio_orden,
        oc.tipo_contratacion, oc.estado AS orden_estado,
        r.tipo AS req_tipo, r.area AS req_area, r.cmn AS requerimiento_cmn,
        r.payload AS requerimiento_payload
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id=oe.orden_id
      LEFT JOIN requerimientos r ON r.id=oc.requerimiento_id
      WHERE oe.id=$1
      FOR UPDATE OF oe
    `, [eid]);
    const entrega = rows[0];
    if (!entrega) throw httpError('Entregable no encontrado', 404, 'ENTREGABLE_NO_ENCONTRADO');

    const estadoAnterior = await obtenerEstadoResponsableEntregable(eid, { client });
    assertEtapaPresentacion(estadoAnterior);
    assertAccesoDerivacion(userCtx, estadoAnterior, entrega);
    const precondiciones = await validarPrecondicionesDerivacion(client, entrega);

    const coordinador = (await listarUsuariosCoordinadorCM(client))
      .find((item) => Number(item.id) === responsableId);
    if (!coordinador) {
      throw httpError(
        'El destinatario no es un Coordinador CM activo',
        422,
        'COORDINADOR_CM_INVALIDO',
      );
    }

    const transicion = await transicionarEntregable({
      ordenEntregaId: eid,
      evento: EVENTOS.ENTREGABLE_DERIVADO_COORDINADOR_CM,
      usuarioOrigenId: Number(userCtx?.id),
      ejecutadoPor: usuario || userCtx?.username || userCtx?.id,
      usuarioDestinoId: responsableId,
      unidadDestino: 'COORDINADOR_CM',
      motivo: 'Derivación del entregable a Coordinador CM',
      metadata: {
        acta_id: Number(precondiciones.acta.id),
        acta_firmada_id: Number(precondiciones.firmada.id),
        recepcion_id: Number(precondiciones.recepcion.id),
      },
      client,
    });
    const estado = await obtenerEstadoResponsableEntregable(eid, { client });
    await client.query('COMMIT');
    return {
      estado,
      asignacion: transicion.asignacion,
      evento: transicion.evento,
      coordinador: mapCoordinadorCM(coordinador),
      expediente_global_actualizado: false,
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw error;
  } finally {
    client.release();
  }
}

/** Destinatarios PERSONA activos con perfil ANALISTA_CONTRATACIONES. */
export async function listarAnalistasCMEntregable(ordenEntregaId, userCtx = null) {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  const estado = await obtenerEstadoResponsableEntregable(ordenEntregaId);
  if (String(estado?.etapaCodigo || '').toUpperCase() !== 'REVISION_COORDINADOR_CM') {
    throw httpError(
      'El entregable no está en Revisión Coordinador CM',
      409,
      'ETAPA_ENTREGABLE_NO_COMPATIBLE',
    );
  }
  assertCoordinadorCMResponsable(userCtx, estado);
  if (String(entrega.estado || '').toUpperCase() !== 'ACTIVO') {
    throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
  }
  return (await listarUsuariosAnalistaCM()).map(mapCoordinadorCM);
}

/** Deriva un único entregable desde Coordinador CM hacia Analista CM. */
export async function derivarEntregableAnalistaCM(
  ordenEntregaId,
  body = {},
  userCtx = null,
  usuario = '',
) {
  const eid = parseInt(ordenEntregaId, 10);
  const responsableId = parseInt(body?.responsable_id, 10);
  if (!Number.isFinite(eid)) throw httpError('orden_entrega_id inválido');
  if (!Number.isFinite(responsableId)) {
    throw httpError('Debe seleccionar un Analista CM', 422, 'RESPONSABLE_DESTINO_REQUERIDO');
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT oe.*, oc.requerimiento_id, oc.tipo_orden, oc.tipo_contratacion,
        oc.estado AS orden_estado, r.tipo AS req_tipo
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id=oe.orden_id
      LEFT JOIN requerimientos r ON r.id=oc.requerimiento_id
      WHERE oe.id=$1
      FOR UPDATE OF oe
    `, [eid]);
    const entrega = rows[0];
    if (!entrega) throw httpError('Entregable no encontrado', 404, 'ENTREGABLE_NO_ENCONTRADO');
    const estadoAnterior = await obtenerEstadoResponsableEntregable(eid, { client });
    if (String(estadoAnterior?.etapaCodigo || '').toUpperCase() !== 'REVISION_COORDINADOR_CM') {
      throw httpError(
        'El entregable no está en Revisión Coordinador CM',
        409,
        'ETAPA_ENTREGABLE_NO_COMPATIBLE',
      );
    }
    assertCoordinadorCMResponsable(userCtx, estadoAnterior);
    const precondiciones = await validarPrecondicionesDerivacion(client, entrega);
    const analista = (await listarUsuariosAnalistaCM(client))
      .find((item) => Number(item.id) === responsableId);
    if (!analista) {
      throw httpError(
        'El destinatario no es un Analista CM activo',
        422,
        'ANALISTA_CM_INVALIDO',
      );
    }
    const transicion = await transicionarEntregable({
      ordenEntregaId: eid,
      evento: EVENTOS.ENTREGABLE_DERIVADO_ANALISTA_CM,
      usuarioOrigenId: Number(userCtx?.id),
      ejecutadoPor: usuario || userCtx?.username || userCtx?.id,
      usuarioDestinoId: responsableId,
      unidadDestino: 'ANALISTA_CONTRATACIONES',
      motivo: 'Derivación del entregable a Analista CM',
      metadata: {
        origen: 'COORDINADOR_CM',
        acta_id: Number(precondiciones.acta.id),
        acta_firmada_id: Number(precondiciones.firmada.id),
        recepcion_id: Number(precondiciones.recepcion.id),
      },
      client,
    });
    const estado = await obtenerEstadoResponsableEntregable(eid, { client });
    await client.query('COMMIT');
    return {
      estado,
      asignacion: transicion.asignacion,
      evento: transicion.evento,
      analista: mapCoordinadorCM(analista),
      expediente_global_actualizado: false,
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw error;
  } finally {
    client.release();
  }
}

/** Destinatarios PERSONA activos con perfil funcional ANALISTA_PAGO. */
export async function listarAnalistasPagoEntregable(ordenEntregaId, userCtx = null) {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  const estado = await obtenerEstadoResponsableEntregable(ordenEntregaId);
  if (estado?.fuenteEstado !== 'ENTREGABLE'
    || String(estado?.etapaCodigo || '').toUpperCase() !== 'REVISION_ANALISTA_CM') {
    throw httpError(
      'El entregable no está en Revisión Analista CM',
      409,
      'ETAPA_ENTREGABLE_NO_COMPATIBLE',
    );
  }
  assertAnalistaCMResponsable(userCtx, estado);
  if (String(entrega.estado || '').toUpperCase() !== 'ACTIVO') {
    throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
  }
  return (await listarUsuariosAnalistaPago()).map(mapCoordinadorCM);
}

/** Observación atómica del Analista CM con retorno al último Coordinador confiable. */
export async function observarEntregableAnalistaCM(
  ordenEntregaId,
  body = {},
  userCtx = null,
  usuario = '',
) {
  const eid = parseInt(ordenEntregaId, 10);
  const motivo = String(body?.motivo || '').trim();
  if (!Number.isFinite(eid)) throw httpError('orden_entrega_id inválido');
  if (!motivo) {
    throw httpError(
      'El motivo de observación es obligatorio',
      400,
      'MOTIVO_OBSERVACION_REQUERIDO',
    );
  }
  const observadoPor = String(usuario || userCtx?.username || userCtx?.id || '').trim();
  if (!observadoPor) {
    throw httpError('No se pudo identificar al usuario observador', 400, 'USUARIO_OBSERVADOR_REQUERIDO');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT oe.*, oc.requerimiento_id, oc.tipo_orden, oc.tipo_contratacion,
        oc.estado AS orden_estado, r.tipo AS req_tipo
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id=oe.orden_id
      LEFT JOIN requerimientos r ON r.id=oc.requerimiento_id
      WHERE oe.id=$1
      FOR UPDATE OF oe
    `, [eid]);
    const entrega = rows[0];
    if (!entrega) throw httpError('Entregable no encontrado', 404, 'ENTREGABLE_NO_ENCONTRADO');
    const estadoAnterior = await obtenerEstadoResponsableEntregable(eid, { client });
    if (estadoAnterior?.fuenteEstado !== 'ENTREGABLE'
      || String(estadoAnterior?.etapaCodigo || '').toUpperCase() !== 'REVISION_ANALISTA_CM') {
      throw httpError(
        'El entregable no está en Revisión Analista CM',
        409,
        'ETAPA_ENTREGABLE_NO_COMPATIBLE',
      );
    }
    assertAnalistaCMResponsable(userCtx, estadoAnterior);
    const precondiciones = await validarPrecondicionesDerivacion(client, entrega);
    const coordinadorRetorno = await obtenerCoordinadorCMRetorno(client, eid);

    const { rows: observaciones } = await client.query(`
      INSERT INTO entregable_observaciones (
        orden_id, orden_entrega_id, recepcion_id, motivo, estado,
        observado_por, observado_at
      ) VALUES ($1,$2,$3,$4,'OBS_EMITIDA',$5,NOW())
      RETURNING *
    `, [
      Number(entrega.orden_id),
      eid,
      Number(precondiciones.recepcion.id),
      motivo,
      observadoPor.slice(0, 150),
    ]);
    const transicion = await transicionarEntregable({
      ordenEntregaId: eid,
      evento: EVENTOS.ENTREGABLE_OBSERVADO_ANALISTA_CM,
      usuarioOrigenId: Number(userCtx?.id),
      ejecutadoPor: observadoPor,
      usuarioDestinoId: Number(coordinadorRetorno.asignacion.usuario_id),
      unidadDestino: 'COORDINADOR_CM',
      motivo,
      metadata: {
        origen: 'ANALISTA_CM',
        observacion_id: Number(observaciones[0].id),
        recepcion_id: Number(precondiciones.recepcion.id),
        asignacion_coordinador_anterior_id: Number(coordinadorRetorno.asignacion.id),
        acta_id: Number(precondiciones.acta.id),
        acta_firmada_id: Number(precondiciones.firmada.id),
      },
      client,
    });
    const estado = await obtenerEstadoResponsableEntregable(eid, { client });
    await client.query('COMMIT');
    return {
      observacion: observaciones[0],
      estado,
      asignacion: transicion.asignacion,
      evento: transicion.evento,
      coordinador: mapCoordinadorCM(coordinadorRetorno.usuario),
      expediente_global_actualizado: false,
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw error;
  } finally {
    client.release();
  }
}

/** Derivación atómica de un entregable conforme hacia un Analista de Pago. */
export async function derivarEntregablePago(
  ordenEntregaId,
  body = {},
  userCtx = null,
  usuario = '',
) {
  const eid = parseInt(ordenEntregaId, 10);
  const usuarioDestinoId = parseInt(body?.usuarioDestinoId, 10);
  if (!Number.isFinite(eid)) throw httpError('orden_entrega_id inválido');
  if (!Number.isFinite(usuarioDestinoId)) {
    throw httpError(
      'Debe seleccionar un Analista de Pago',
      422,
      'RESPONSABLE_DESTINO_REQUERIDO',
    );
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT oe.*, oc.requerimiento_id, oc.tipo_orden, oc.tipo_contratacion,
        oc.estado AS orden_estado, r.tipo AS req_tipo
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id=oe.orden_id
      LEFT JOIN requerimientos r ON r.id=oc.requerimiento_id
      WHERE oe.id=$1
      FOR UPDATE OF oe
    `, [eid]);
    const entrega = rows[0];
    if (!entrega) throw httpError('Entregable no encontrado', 404, 'ENTREGABLE_NO_ENCONTRADO');
    const estadoAnterior = await obtenerEstadoResponsableEntregable(eid, { client });
    if (estadoAnterior?.fuenteEstado !== 'ENTREGABLE'
      || String(estadoAnterior?.etapaCodigo || '').toUpperCase() !== 'REVISION_ANALISTA_CM') {
      throw httpError(
        'El entregable no está en Revisión Analista CM',
        409,
        'ETAPA_ENTREGABLE_NO_COMPATIBLE',
      );
    }
    assertAnalistaCMResponsable(userCtx, estadoAnterior);
    const precondiciones = await validarPrecondicionesDerivacion(client, entrega);
    const analistaPago = (await listarUsuariosAnalistaPago(client))
      .find((item) => Number(item.id) === usuarioDestinoId);
    if (!analistaPago) {
      throw httpError(
        'El destinatario no es un Analista de Pago activo',
        422,
        'ANALISTA_PAGO_INVALIDO',
      );
    }
    const transicion = await transicionarEntregable({
      ordenEntregaId: eid,
      evento: EVENTOS.ENTREGABLE_DERIVADO_PAGO,
      usuarioOrigenId: Number(userCtx?.id),
      ejecutadoPor: usuario || userCtx?.username || userCtx?.id,
      usuarioDestinoId,
      unidadDestino: 'ANALISTA_PAGO',
      motivo: 'Derivación del entregable conforme a Pago',
      metadata: {
        origen: 'ANALISTA_CM',
        recepcion_id: Number(precondiciones.recepcion.id),
        acta_id: Number(precondiciones.acta.id),
        acta_firmada_id: Number(precondiciones.firmada.id),
      },
      client,
    });
    const estado = await obtenerEstadoResponsableEntregable(eid, { client });
    await client.query('COMMIT');
    return {
      estado,
      asignacion: transicion.asignacion,
      evento: transicion.evento,
      analista_pago: mapCoordinadorCM(analistaPago),
      expediente_global_actualizado: false,
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw error;
  } finally {
    client.release();
  }
}

/** Timeline canónico del entregable, sin mezclar eventos del requerimiento. */
export async function listarTrazabilidadEntregable(ordenEntregaId, userCtx = null) {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  const estado = await obtenerEstadoResponsableEntregable(ordenEntregaId);
  const userId = Number(userCtx?.id);
  const accesoRouting = Number.isInteger(userId) && userId > 0
    ? Number((await query(`
        SELECT COUNT(*)::int AS n
        FROM entregable_observaciones eo
        JOIN workflow_observaciones wo ON wo.id=eo.workflow_observacion_id
        WHERE eo.orden_entrega_id=$1 AND eo.orden_id=$2
          AND wo.usuario_destino_id=$3
      `, [Number(entrega.id), Number(entrega.orden_id), userId])).rows[0]?.n || 0) > 0
    : false;
  if (!esAdmin(userCtx)
    && userId !== Number(estado?.responsableUsuarioId)
    && !accesoRouting) {
    throw httpError(
      'Solo el responsable actual o destinatario de una observación puede consultar la trazabilidad',
      403,
      'TRAZABILIDAD_ENTREGABLE_NO_AUTORIZADA',
    );
  }
  const { rows } = await query(`
    SELECT ev.*,
      ua.nombre AS responsable_anterior_nombre,
      un.nombre AS responsable_nuevo_nombre,
      ue.nombre AS ejecutado_usuario_nombre
    FROM entregable_eventos ev
    LEFT JOIN usuarios ua ON ua.id=ev.responsable_anterior_usuario
    LEFT JOIN usuarios un ON un.id=ev.responsable_nuevo_usuario
    LEFT JOIN usuarios ue ON ue.id=ev.ejecutado_usuario_id
    WHERE ev.orden_entrega_id=$1 AND ev.orden_id=$2
    ORDER BY ev.ocurrido_at DESC, ev.id DESC
  `, [Number(entrega.id), Number(entrega.orden_id)]);
  const { rows: routings } = await query(`
    SELECT
      ('routing-' || wo.id::text) AS id,
      'ENTREGABLE_OBSERVACION_DIRIGIDA' AS evento_codigo,
      wo.origen_submodulo_codigo AS etapa_anterior_codigo,
      wo.destino_submodulo_codigo AS etapa_nueva_codigo,
      uo.nombre AS responsable_anterior_nombre,
      ud.nombre AS responsable_nuevo_nombre,
      uo.nombre AS ejecutado_usuario_nombre,
      wo.emitida_por AS ejecutado_por,
      wo.motivo,
      wo.emitida_at AS ocurrido_at,
      wo.id AS workflow_observacion_id,
      wo.estado AS estado_observacion
    FROM entregable_observaciones eo
    JOIN workflow_observaciones wo ON wo.id=eo.workflow_observacion_id
    LEFT JOIN usuarios uo ON uo.id=wo.usuario_origen_id
    LEFT JOIN usuarios ud ON ud.id=wo.usuario_destino_id
    WHERE eo.orden_entrega_id=$1 AND eo.orden_id=$2
  `, [Number(entrega.id), Number(entrega.orden_id)]);
  return [...rows, ...routings].sort(
    (a, b) => new Date(b.ocurrido_at || 0).getTime() - new Date(a.ocurrido_at || 0).getTime(),
  );
}

/** Historial formal de observaciones de todas las presentaciones del entregable. */
export async function listarObservacionesEntregable(ordenEntregaId) {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  const { rows } = await query(`
    SELECT eo.*
    FROM entregable_observaciones eo
    WHERE eo.orden_entrega_id = $1
      AND eo.orden_id = $2
    ORDER BY eo.observado_at DESC, eo.id DESC
  `, [Number(entrega.id), Number(entrega.orden_id)]);
  return rows;
}

/** Única observación formal abierta del entregable, si existe. */
export async function obtenerObservacionAbierta(ordenEntregaId) {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  const { rows } = await query(`
    SELECT eo.*
    FROM entregable_observaciones eo
    WHERE eo.orden_entrega_id = $1
      AND eo.orden_id = $2
      AND eo.estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION')
    ORDER BY eo.observado_at DESC, eo.id DESC
    LIMIT 1
  `, [Number(entrega.id), Number(entrega.orden_id)]);
  return rows[0] || null;
}

/** Historial formal asociado a una recepción concreta. */
export async function obtenerObservacionesRecepcion(recepcionId) {
  const rid = parseInt(recepcionId, 10);
  if (!Number.isFinite(rid)) throw httpError('recepcion_id inválido');
  const { rows } = await query(`
    SELECT eo.*
    FROM entregable_observaciones eo
    JOIN entregable_recepciones er
      ON er.id = eo.recepcion_id
     AND er.orden_entrega_id = eo.orden_entrega_id
     AND er.orden_id = eo.orden_id
    WHERE eo.recepcion_id = $1
    ORDER BY eo.observado_at DESC, eo.id DESC
  `, [rid]);
  return rows;
}

/**
 * RC8.15.6F-2 — Observación dirigida productiva con routing F-1 y cambio de responsable.
 */
export async function observarEntregableDirigido(
  ordenEntregaId,
  body = {},
  userCtx = null,
  usuario = '',
  externalClient = null,
) {
  const eid = parseInt(ordenEntregaId, 10);
  if (!Number.isFinite(eid)) throw httpError('orden_entrega_id inválido');
  const origenUid = Number(userCtx?.id);
  if (!Number.isInteger(origenUid) || origenUid <= 0) {
    throw httpError('Autenticación requerida', 401, 'AUTH_REQUIRED');
  }
  const destinoSubmodulo = String(body.destino_submodulo_codigo || '').trim();
  const destinoUid = Number(body.usuario_destino_id);
  const motivo = String(body.motivo || '').trim();
  if (!destinoSubmodulo) {
    throw httpError('El submódulo destino es obligatorio', 400, 'SUBMODULO_DESTINO_REQUERIDO');
  }
  if (!Number.isInteger(destinoUid) || destinoUid <= 0) {
    throw httpError('usuario_destino_id debe ser un ID real', 400, 'USUARIO_DESTINO_ID_INVALIDO');
  }
  if (!motivo) {
    throw httpError('El motivo de observación es obligatorio', 400, 'MOTIVO_OBSERVACION_REQUERIDO');
  }
  const ejecutadoPor = String(usuario || userCtx?.nombre || userCtx?.username || '').trim()
    || String(origenUid);

  const work = async (tx) => {
    const { rows: entregaRows } = await tx.query(`
      SELECT oe.id, oe.orden_id, oe.estado, oc.requerimiento_id,
        oc.tipo_orden, oc.tipo_contratacion, oc.estado AS orden_estado,
        r.tipo AS req_tipo
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
      LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
      WHERE oe.id = $1
      FOR UPDATE OF oe
    `, [eid]);
    const entrega = entregaRows[0];
    if (!entrega) throw httpError('Entregable no encontrado', 404);
    if (String(entrega.estado || '').toUpperCase() !== 'ACTIVO') {
      throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
    }
    if (String(entrega.orden_estado || '').toUpperCase() === 'ORDEN_ANULADA') {
      throw httpError('La orden asociada está anulada', 409, 'ORDEN_ANULADA');
    }
    if (!isServicioOLocacion(entrega.tipo_orden, entrega.tipo_contratacion, entrega.req_tipo)) {
      throw httpError('El entregable no corresponde a un servicio/locación', 409, 'ENTREGABLE_NO_SERVICIO');
    }

    const estadoEntregable = await obtenerEstadoResponsableEntregable(eid, { client: tx });
    assertEtapaGestionOperativa(estadoEntregable);
    const etapaCodigo = String(estadoEntregable?.etapaCodigo || '').toUpperCase();
    if (etapaCodigo !== 'PRESENTACION_ENTREGABLES') {
      throw httpError(
        'La observación dirigida solo aplica en Presentación de Entregables',
        409,
        'ETAPA_ENTREGABLE_NO_COMPATIBLE',
      );
    }
    assertPuedeObservarEntregable(userCtx, {
      responsable_usuario_id: estadoEntregable?.responsableUsuarioId,
    });

    const { rows: recepcionRows } = await tx.query(`
      SELECT *
      FROM entregable_recepciones
      WHERE orden_entrega_id = $1
        AND orden_id = $2
        AND UPPER(COALESCE(estado,'')) IN ('RECIBIDO','SUBSANADO','CONFORME')
      ORDER BY numero_recepcion DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `, [eid, Number(entrega.orden_id)]);
    const recepcion = recepcionRows[0];
    if (!recepcion) {
      throw httpError(
        'El entregable no tiene una recepción vigente para observar',
        409,
        'SIN_RECEPCION_VIGENTE',
      );
    }

    const { rows: abiertas } = await tx.query(`
      SELECT id
      FROM entregable_observaciones
      WHERE orden_entrega_id=$1
        AND estado IN ('OBS_EMITIDA','OBS_EN_ATENCION')
      LIMIT 1
      FOR UPDATE
    `, [eid]);
    if (abiertas.length) {
      throw httpError(
        'El entregable ya tiene una observación formal abierta',
        409,
        'OBSERVACION_ABIERTA_EXISTE',
      );
    }

    const destino = obtenerDestinoObservacion(destinoSubmodulo);
    const routing = await registrarRoutingObservacionEntregable({
      requerimientoId: Number(entrega.requerimiento_id),
      ordenId: Number(entrega.orden_id),
      ordenEntregaId: eid,
      recepcionId: Number(recepcion.id),
      destinoSubmoduloCodigo: destino.submodulo_codigo,
      usuarioOrigenId: origenUid,
      usuarioDestinoId: destinoUid,
      motivo,
      client: tx,
    });
    const reasignacion = await reasignarResponsableEntregableMismaEtapa({
      ordenEntregaId: eid,
      usuarioDestinoId: destinoUid,
      usuarioOrigenId: origenUid,
      ejecutadoPor,
      motivo,
      metadata: {
        origen: 'OBSERVACION_DIRIGIDA',
        workflow_observacion_id: Number(routing.workflow_observacion.id),
        entregable_observacion_id: Number(routing.entregable_observacion.id),
        destino_submodulo_codigo: destino.submodulo_codigo,
        destino_submodulo_label: destino.label,
        recepcion_id: Number(recepcion.id),
      },
      client: tx,
    });

    return {
      workflow_observacion: routing.workflow_observacion,
      entregable_observacion: routing.entregable_observacion,
      destinatario: routing.destinatario,
      reasignacion,
      cambio_responsable: {
        preparado: true,
        ejecutado: true,
        usuario_origen_id: origenUid,
        usuario_destino_id: destinoUid,
        submodulo_destino_codigo: destino.submodulo_codigo,
        etapa_conservada: reasignacion.etapa_conservada,
      },
    };
  };

  if (externalClient) return work(externalClient);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * RC8.15.6F-2A — Retiro seguro de observación emitida por el emisor.
 * Usa OBS_CERRADA institucional; no DELETE. Restaura responsable solo si F-2 lo cambió.
 */
export async function retirarObservacionEntregable(
  ordenEntregaId,
  observacionId,
  body = {},
  userCtx = null,
  usuario = '',
  externalClient = null,
) {
  const eid = parseInt(ordenEntregaId, 10);
  const oid = parseInt(observacionId, 10);
  if (!Number.isFinite(eid) || !Number.isFinite(oid)) {
    throw httpError('Identificadores inválidos', 400, 'IDENTIFICADORES_INVALIDOS');
  }
  const uid = Number(userCtx?.id);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw httpError('Autenticación requerida', 401, 'AUTH_REQUIRED');
  }
  const motivoRetiro = String(body.motivo || '').trim();
  if (!motivoRetiro) {
    throw httpError('El motivo de retiro es obligatorio', 400, 'MOTIVO_RETIRO_REQUERIDO');
  }
  const ejecutadoPor = String(usuario || userCtx?.nombre || userCtx?.username || '').trim()
    || String(uid);

  const work = async (tx) => {
    const { rows: obsRows } = await tx.query(`
      SELECT eo.*,
        wo.id AS workflow_id,
        wo.estado AS workflow_estado,
        wo.usuario_origen_id,
        wo.usuario_destino_id,
        wo.destino_submodulo_codigo
      FROM entregable_observaciones eo
      LEFT JOIN workflow_observaciones wo ON wo.id=eo.workflow_observacion_id
      WHERE eo.id=$1 AND eo.orden_entrega_id=$2
      FOR UPDATE OF eo
    `, [oid, eid]);
    const observacion = obsRows[0];
    if (!observacion) {
      throw httpError('Observación no encontrada para el entregable', 404, 'OBSERVACION_NO_ENCONTRADA');
    }
    if (observacion.estado !== 'OBS_EMITIDA') {
      throw httpError(
        'Solo se puede retirar una observación aún emitida y sin atención',
        409,
        'OBSERVACION_NO_RETIRABLE',
      );
    }
    if (observacion.recepcion_subsanacion_id) {
      throw httpError('La observación ya tiene subsanación vinculada', 409, 'OBSERVACION_CON_RESPUESTA');
    }
    const obsCtx = {
      ...observacion,
      workflow_observacion_id: observacion.workflow_observacion_id,
      usuario_origen_id: observacion.usuario_origen_id,
      usuario_destino_id: observacion.usuario_destino_id,
      observado_por: observacion.observado_por,
    };
    if (!esEmisorObservacionEntregable(obsCtx, userCtx)) {
      throw httpError('Solo el emisor puede retirar la observación', 403, 'RETIRO_OBSERVACION_NO_AUTORIZADO');
    }

    const clasificacion = clasificarObservacionEntregable(obsCtx);
    const { rows: cerradas } = await tx.query(`
      UPDATE entregable_observaciones
      SET estado='OBS_CERRADA', updated_at=NOW()
      WHERE id=$1 AND estado='OBS_EMITIDA'
      RETURNING *
    `, [oid]);
    if (!cerradas.length) {
      throw httpError('La observación ya no está disponible para retiro', 409, 'OBSERVACION_NO_RETIRABLE');
    }

    if (observacion.workflow_id) {
      await tx.query(`
        UPDATE workflow_observaciones
        SET estado='OBS_CERRADA', cerrada_at=NOW()
        WHERE id=$1 AND estado='OBS_EMITIDA'
      `, [Number(observacion.workflow_id)]);
    }

    let reasignacion = null;
    if (clasificacion === 'DIRIGIDA_CANONICA'
      && Number(observacion.usuario_origen_id) > 0
      && Number(observacion.usuario_destino_id) > 0) {
      const estadoActual = await obtenerEstadoResponsableEntregable(eid, { client: tx });
      if (Number(estadoActual?.responsableUsuarioId) === Number(observacion.usuario_destino_id)) {
        reasignacion = await reasignarResponsableEntregableMismaEtapa({
          ordenEntregaId: eid,
          usuarioDestinoId: Number(observacion.usuario_origen_id),
          eventoCodigo: 'ENTREGABLE_OBSERVACION_RETIRADA',
          usuarioOrigenId: uid,
          ejecutadoPor,
          motivo: motivoRetiro,
          metadata: {
            origen: 'RETIRO_EMISOR',
            observacion_id: oid,
            workflow_observacion_id: observacion.workflow_id ? Number(observacion.workflow_id) : null,
            clasificacion,
          },
          client: tx,
        });
      }
    }

    let eventoRetiro = reasignacion?.evento || null;
    if (!eventoRetiro) {
      const estadoActual = await obtenerEstadoResponsableEntregable(eid, { client: tx });
      const labelsDefault = buildEstadoLabels(ETAPAS.PRESENTACION_ENTREGABLES);
      const respTipo = String(estadoActual?.responsableTipo || 'PENDIENTE');
      const respUsuario = estadoActual?.responsableUsuarioId != null
        ? Number(estadoActual.responsableUsuarioId)
        : null;
      const respUnidad = estadoActual?.responsableUnidad || null;
      const estadoCodigo = estadoActual?.estadoCodigo || labelsDefault.estadoCodigo;
      const estadoLabel = estadoActual?.estadoLabel || labelsDefault.estadoLabel;
      const etapaCodigo = estadoActual?.etapaCodigo || labelsDefault.etapaCodigo;
      const eventoMetadata = JSON.stringify({
        origen: 'RETIRO_EMISOR',
        clasificacion,
        observacion_id: oid,
        workflow_observacion_id: observacion.workflow_id ? Number(observacion.workflow_id) : null,
      });
      const { rows: eventos } = await tx.query(`
        INSERT INTO entregable_eventos (
          orden_id, orden_entrega_id, requerimiento_id, evento_codigo,
          estado_anterior_codigo, estado_anterior_label,
          estado_nuevo_codigo, estado_nuevo_label,
          etapa_anterior_codigo, etapa_nueva_codigo,
          responsable_anterior_tipo, responsable_anterior_usuario, responsable_anterior_unidad,
          responsable_nuevo_tipo, responsable_nuevo_usuario, responsable_nuevo_unidad,
          ejecutado_usuario_id, ejecutado_por, motivo, metadata_json
        )
        SELECT
          eo.orden_id, eo.orden_entrega_id, oc.requerimiento_id,
          'ENTREGABLE_OBSERVACION_RETIRADA',
          $7, $8, $7, $8, $9, $9,
          $10, $11, $12, $10, $11, $12,
          $3, $4, $5, $6::jsonb
        FROM entregable_observaciones eo
        JOIN ordenes_contratacion oc ON oc.id=eo.orden_id
        WHERE eo.id=$1 AND eo.orden_entrega_id=$2
        RETURNING *
      `, [
        oid,
        eid,
        uid,
        ejecutadoPor,
        motivoRetiro,
        eventoMetadata,
        estadoCodigo,
        estadoLabel,
        etapaCodigo,
        respTipo,
        respUsuario,
        respUnidad,
      ]);
      eventoRetiro = eventos[0] || null;
    }

    return {
      observacion: cerradas[0],
      clasificacion,
      reasignacion,
      evento: eventoRetiro,
      expediente_global_actualizado: false,
    };
  };

  if (externalClient) return work(externalClient);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Registra una observación formal sobre la presentación vigente sin alterar
 * la recepción, sus documentos ni la etapa global del expediente.
 */
export async function observarEntregable(
  ordenEntregaId,
  body = {},
  userCtx = null,
  usuario = '',
) {
  const eid = parseInt(ordenEntregaId, 10);
  if (!Number.isFinite(eid)) throw httpError('orden_entrega_id inválido');
  const motivo = String(body.motivo || '').trim();
  if (!motivo) {
    throw httpError('El motivo de observación es obligatorio', 400, 'MOTIVO_OBSERVACION_REQUERIDO');
  }
  const observadoPor = String(usuario || '').trim();
  if (!observadoPor) {
    throw httpError('No se pudo identificar al usuario observador', 400, 'USUARIO_OBSERVADOR_REQUERIDO');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows: entregaRows } = await client.query(`
      SELECT oe.id, oe.orden_id, oe.estado, oc.requerimiento_id,
        oc.tipo_orden, oc.tipo_contratacion, oc.estado AS orden_estado,
        r.tipo AS req_tipo
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
      LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
      WHERE oe.id = $1
      FOR UPDATE OF oe
    `, [eid]);
    const entrega = entregaRows[0];
    if (!entrega) throw httpError('Entregable no encontrado', 404);
    if (String(entrega.estado || '').toUpperCase() !== 'ACTIVO') {
      throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
    }
    if (String(entrega.orden_estado || '').toUpperCase() === 'ORDEN_ANULADA') {
      throw httpError('La orden asociada está anulada', 409, 'ORDEN_ANULADA');
    }
    if (!isServicioOLocacion(entrega.tipo_orden, entrega.tipo_contratacion, entrega.req_tipo)) {
      throw httpError('El entregable no corresponde a un servicio/locación', 409, 'ENTREGABLE_NO_SERVICIO');
    }

    const estadoEntregable = await obtenerEstadoResponsableEntregable(eid, { client });
    if (String(estadoEntregable?.etapaCodigo || '').toUpperCase() === 'REVISION_COORDINADOR_CM') {
      assertCoordinadorCMResponsable(userCtx, estadoEntregable);
      const responsableAnterior = await obtenerResponsableAreaUsuariaAnterior(client, eid);
      const { rows: recepcionRows } = await client.query(`
        SELECT *
        FROM entregable_recepciones
        WHERE orden_entrega_id=$1 AND orden_id=$2
          AND estado IN ('RECIBIDO','SUBSANADO','CONFORME')
        ORDER BY numero_recepcion DESC, id DESC
        LIMIT 1
        FOR UPDATE
      `, [eid, Number(entrega.orden_id)]);
      const recepcion = recepcionRows[0];
      if (!recepcion) {
        throw httpError(
          'El entregable no tiene una recepción vigente para observar',
          409,
          'SIN_RECEPCION_VIGENTE',
        );
      }
      if (body.recepcion_id != null && Number(body.recepcion_id) !== Number(recepcion.id)) {
        throw httpError(
          'La recepción indicada no es la presentación vigente del entregable',
          409,
          'RECEPCION_NO_PERTENECE',
        );
      }
      const { rows: abiertas } = await client.query(`
        SELECT id
        FROM entregable_observaciones
        WHERE orden_entrega_id=$1
          AND estado IN ('OBS_EMITIDA','OBS_EN_ATENCION')
        LIMIT 1
        FOR UPDATE
      `, [eid]);
      if (abiertas.length) {
        throw httpError(
          'El entregable ya tiene una observación formal abierta',
          409,
          'OBSERVACION_ABIERTA_EXISTE',
        );
      }
      const { rows: observaciones } = await client.query(`
        INSERT INTO entregable_observaciones (
          orden_id, orden_entrega_id, recepcion_id, motivo, estado,
          observado_por, observado_at
        ) VALUES ($1,$2,$3,$4,'OBS_EMITIDA',$5,NOW())
        RETURNING *
      `, [
        Number(entrega.orden_id),
        eid,
        Number(recepcion.id),
        motivo,
        observadoPor.slice(0, 150),
      ]);
      const transicion = await transicionarEntregable({
        ordenEntregaId: eid,
        evento: EVENTOS.ENTREGABLE_OBSERVADO_COORDINADOR_CM,
        usuarioOrigenId: Number(userCtx?.id),
        ejecutadoPor: observadoPor,
        usuarioDestinoId: Number(responsableAnterior.usuario_id),
        unidadDestino: responsableAnterior.unidad_codigo || 'AREA_USUARIA',
        motivo,
        metadata: {
          origen: 'COORDINADOR_CM',
          observacion_id: Number(observaciones[0].id),
          recepcion_id: Number(recepcion.id),
          asignacion_area_usuaria_anterior_id: Number(responsableAnterior.id),
        },
        client,
      });
      await client.query('COMMIT');
      return {
        ...observaciones[0],
        origen: 'COORDINADOR_CM',
        transicion,
      };
    }
    assertEtapaGestionOperativa(estadoEntregable);
    const responsable = {
      responsable_usuario_id: estadoEntregable?.responsableUsuarioId,
    };
    assertPuedeObservarEntregable(userCtx, responsable);

    const { rows: actaRows } = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM entregable_conformidad_actas
        WHERE orden_entrega_id = $1
      ) AS tiene_acta
    `, [eid]);
    if (actaRows[0]?.tiene_acta) {
      throw httpError(
        'El entregable ya tiene un Acta de Conformidad',
        409,
        'ENTREGABLE_NO_OBSERVABLE',
      );
    }

    const { rows: recepcionRows } = await client.query(`
      SELECT * FROM entregable_recepciones
      WHERE orden_entrega_id = $1
        AND orden_id = $2
        AND estado = 'RECIBIDO'
      ORDER BY numero_recepcion DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `, [eid, Number(entrega.orden_id)]);
    const recepcion = recepcionRows[0];
    if (!recepcion) {
      throw httpError(
        'El entregable no tiene una recepción vigente para observar',
        409,
        'SIN_RECEPCION_VIGENTE',
      );
    }
    if (body.recepcion_id != null
      && Number(body.recepcion_id) !== Number(recepcion.id)) {
      throw httpError(
        'La recepción indicada no es la presentación vigente del entregable',
        409,
        'RECEPCION_NO_PERTENECE',
      );
    }

    const { rows: abiertas } = await client.query(`
      SELECT id FROM entregable_observaciones
      WHERE recepcion_id = $1
        AND estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION')
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
    `, [recepcion.id]);
    if (abiertas.length) {
      throw httpError(
        'La recepción ya tiene una observación formal abierta',
        409,
        'OBSERVACION_ABIERTA_EXISTE',
      );
    }

    const { rows: observaciones } = await client.query(`
      INSERT INTO entregable_observaciones (
        orden_id, orden_entrega_id, recepcion_id, motivo, estado,
        observado_por, observado_at
      ) VALUES ($1,$2,$3,$4,'OBS_EMITIDA',$5,NOW())
      RETURNING *
    `, [
      Number(entrega.orden_id),
      eid,
      Number(recepcion.id),
      motivo,
      observadoPor.slice(0, 150),
    ]);

    await client.query('COMMIT');
    return observaciones[0];
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Registra una nueva presentación SUBSANACION para atender exactamente una
 * observación formal abierta. No edita ni versiona la presentación observada.
 */
export async function subsanarEntregable(
  ordenEntregaId,
  body = {},
  userCtx = null,
  usuario = '',
) {
  const eid = parseInt(ordenEntregaId, 10);
  if (!Number.isFinite(eid)) throw httpError('orden_entrega_id inválido');
  const fechaRecepcion = toIsoDateString(body.fecha_recepcion_mesa_partes);
  const expedienteSgd = String(body.numero_expediente_sgd || '').trim();
  const comentario = String(body.observacion || body.comentario || '').trim();
  const archivos = Array.isArray(body.documentos) && body.documentos.length
    ? body.documentos.filter((a) => String(a?.contenido_base64 || '').trim())
    : (String(body.contenido_base64 || '').trim() ? [{
        nombre_archivo: body.nombre_archivo,
        mime_type: body.mime_type,
        contenido_base64: body.contenido_base64,
      }] : []);
  if (!fechaRecepcion) {
    throw httpError('fecha_recepcion_mesa_partes es obligatoria y debe ser válida');
  }
  if (!expedienteSgd) throw httpError('numero_expediente_sgd es obligatorio');
  if (archivos.length !== 1) {
    throw httpError(
      archivos.length ? 'Solo se permite un PDF por subsanación' : 'El PDF de subsanación es obligatorio',
      400,
      archivos.length ? 'DOCUMENTO_VIGENTE_MULTIPLE' : 'PDF_SUBSANACION_REQUERIDO',
    );
  }
  const archivo = archivos[0];
  const documentoValidado = validateArchivo({
    contenido_base64: archivo.contenido_base64,
    nombre_archivo: archivo.nombre_archivo || archivo.nombre,
    mime_type: archivo.mime_type || 'application/pdf',
  });
  const subsanadoPor = String(usuario || '').trim();
  if (!subsanadoPor) {
    throw httpError('No se pudo identificar al usuario que subsana', 400, 'USUARIO_SUBSANACION_REQUERIDO');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows: entregaRows } = await client.query(`
      SELECT oe.id, oe.orden_id, oe.estado, oc.requerimiento_id,
        oc.tipo_orden, oc.tipo_contratacion, oc.estado AS orden_estado,
        r.tipo AS req_tipo
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
      LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
      WHERE oe.id = $1
      FOR UPDATE OF oe
    `, [eid]);
    const entrega = entregaRows[0];
    if (!entrega) throw httpError('Entregable no encontrado', 404);
    if (String(entrega.estado || '').toUpperCase() !== 'ACTIVO') {
      throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
    }
    if (String(entrega.orden_estado || '').toUpperCase() === 'ORDEN_ANULADA') {
      throw httpError('La orden asociada está anulada', 409, 'ORDEN_ANULADA');
    }
    if (!isServicioOLocacion(entrega.tipo_orden, entrega.tipo_contratacion, entrega.req_tipo)) {
      throw httpError('El entregable no corresponde a un servicio/locación', 409, 'ENTREGABLE_NO_SERVICIO');
    }

    const estadoEntregable = await obtenerEstadoResponsableEntregable(eid, { client });
    assertEtapaGestionOperativa(estadoEntregable);
    const responsable = {
      responsable_usuario_id: estadoEntregable?.responsableUsuarioId,
    };
    assertPuedeSubsanarEntregable(userCtx, responsable);

    const { rows: observaciones } = await client.query(`
      SELECT eo.*, er.numero_recepcion AS numero_recepcion_observada
      FROM entregable_observaciones eo
      JOIN entregable_recepciones er
        ON er.id = eo.recepcion_id
       AND er.orden_entrega_id = eo.orden_entrega_id
       AND er.orden_id = eo.orden_id
      WHERE eo.orden_entrega_id = $1
        AND eo.orden_id = $2
        AND eo.estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION')
      ORDER BY eo.observado_at DESC, eo.id DESC
      LIMIT 1
      FOR UPDATE OF eo, er
    `, [eid, Number(entrega.orden_id)]);
    const observacion = observaciones[0];
    if (!observacion) {
      throw httpError(
        'El entregable no tiene una observación formal abierta',
        409,
        'SIN_OBSERVACION_ABIERTA',
      );
    }
    if (body.observacion_id != null
      && Number(body.observacion_id) !== Number(observacion.id)) {
      throw httpError(
        'La observación indicada no pertenece al entregable o ya no está abierta',
        409,
        'OBSERVACION_NO_PERTENECE',
      );
    }
    if (observacion.recepcion_subsanacion_id != null) {
      throw httpError(
        'La observación ya tiene una subsanación registrada',
        409,
        'OBSERVACION_YA_SUBSANADA',
      );
    }

    const { rows: ultimaRows } = await client.query(`
      SELECT id, numero_recepcion
      FROM entregable_recepciones
      WHERE orden_entrega_id = $1 AND orden_id = $2
      ORDER BY numero_recepcion DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `, [eid, Number(entrega.orden_id)]);
    const ultimaRecepcion = ultimaRows[0];
    if (!ultimaRecepcion
      || Number(ultimaRecepcion.id) !== Number(observacion.recepcion_id)) {
      throw httpError(
        'La recepción observada ya no es la presentación vigente',
        409,
        'RECEPCION_OBSERVADA_NO_VIGENTE',
      );
    }
    const numeroRecepcion = Number(ultimaRecepcion.numero_recepcion) + 1;

    const { rows: nuevasRecepciones } = await client.query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, observacion,
        estado, registrado_por
      ) VALUES ($1,$2,$3,'SUBSANACION',$4,$5,$6,'RECIBIDO',$7)
      RETURNING *
    `, [
      eid,
      Number(entrega.orden_id),
      numeroRecepcion,
      fechaRecepcion,
      expedienteSgd.slice(0, 120),
      comentario || null,
      subsanadoPor.slice(0, 150),
    ]);
    const nuevaRecepcion = nuevasRecepciones[0];

    const { rows: nuevosDocumentos } = await client.query(`
      INSERT INTO entregable_recepcion_documentos (
        recepcion_id, nombre_archivo, mime_type, contenido_base64,
        tamanio_bytes, vigente, reemplaza_id
      ) VALUES ($1,$2,$3,$4,$5,TRUE,NULL)
      RETURNING id, recepcion_id, nombre_archivo, mime_type, tamanio_bytes,
        vigente, reemplaza_id, created_at
    `, [
      nuevaRecepcion.id,
      String(archivo.nombre_archivo || archivo.nombre || 'subsanacion.pdf').slice(0, 300),
      String(archivo.mime_type || 'application/pdf').slice(0, 120),
      documentoValidado.raw,
      documentoValidado.bytes,
    ]);

    const { rows: observacionesActualizadas } = await client.query(`
      UPDATE entregable_observaciones
      SET estado = 'OBS_SUBSANADA',
          subsanado_por = $2,
          subsanado_at = NOW(),
          recepcion_subsanacion_id = $3,
          updated_at = NOW()
      WHERE id = $1
        AND estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION')
        AND recepcion_subsanacion_id IS NULL
      RETURNING *
    `, [observacion.id, subsanadoPor.slice(0, 150), nuevaRecepcion.id]);
    if (!observacionesActualizadas.length) {
      throw httpError(
        'La observación ya fue atendida',
        409,
        'OBSERVACION_YA_SUBSANADA',
      );
    }

    await client.query('COMMIT');
    return {
      recepcion: nuevaRecepcion,
      documento: nuevosDocumentos[0],
      observacion: observacionesActualizadas[0],
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Registra la recepción INICIAL de un entregable (transaccional: recepción + documento).
 * Una recepción ya existente se modifica mediante modificarRecepcionEntregable.
 */
export async function registrarRecepcionEntregable(ordenEntregaId, body = {}, usuario = '', rol = '') {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  if (entrega.estado !== 'ACTIVO') {
    throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
  }
  if (String(entrega.orden_estado || '').toUpperCase() === 'ORDEN_ANULADA') {
    throw httpError('La orden asociada está anulada', 409, 'ORDEN_ANULADA');
  }
  if (!isServicioOLocacion(entrega.tipo_orden, entrega.tipo_contratacion, entrega.req_tipo)) {
    throw httpError('El entregable no corresponde a un servicio/locación', 409, 'ENTREGABLE_NO_SERVICIO');
  }

  const fechaRecepcion = toIsoDateString(body.fecha_recepcion_mesa_partes)
    || body.fecha_recepcion_mesa_partes;
  const expedienteSgd = String(body.numero_expediente_sgd || '').trim();
  const observacion = String(body.observacion || '').trim();
  const archivos = Array.isArray(body.documentos) && body.documentos.length
    ? body.documentos
    : [{
        nombre_archivo: body.nombre_archivo,
        mime_type: body.mime_type,
        contenido_base64: body.contenido_base64,
      }];

  if (!fechaRecepcion) throw httpError('fecha_recepcion_mesa_partes es obligatoria');
  if (!expedienteSgd) throw httpError('numero_expediente_sgd es obligatorio');
  if (!archivos.length || !archivos.some((a) => String(a?.contenido_base64 || '').trim())) {
    throw httpError('Archivo del entregable es obligatorio');
  }
  if (archivos.filter((a) => String(a?.contenido_base64 || '').trim()).length > 1) {
    throw httpError('Solo se permite un PDF vigente por recepción', 400, 'DOCUMENTO_VIGENTE_MULTIPLE');
  }
  const docsValidados = archivos.map((a) => validateArchivo({
    contenido_base64: a?.contenido_base64,
    nombre_archivo: a?.nombre_archivo || a?.nombre,
    mime_type: a?.mime_type || 'application/pdf',
  }));

  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Serializa el alta/edición del entregable para impedir recepciones duplicadas.
    const { rows: entregaRows } = await client.query(`
      SELECT oe.estado, oc.estado AS orden_estado
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
      WHERE oe.id = $1
      FOR UPDATE OF oe
    `, [ordenEntregaId]);
    if (!entregaRows.length) throw httpError('Entregable no encontrado', 404);
    if (String(entregaRows[0].estado || '').toUpperCase() !== 'ACTIVO') {
      throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
    }
    if (String(entregaRows[0].orden_estado || '').toUpperCase() === 'ORDEN_ANULADA') {
      throw httpError('La orden asociada está anulada', 409, 'ORDEN_ANULADA');
    }
    assertEtapaGestionOperativa(
      await obtenerEstadoResponsableEntregable(ordenEntregaId, { client }),
    );

    const { rows: existentes } = await client.query(
      `SELECT id FROM entregable_recepciones
       WHERE orden_entrega_id = $1
       ORDER BY id
       LIMIT 1
       FOR UPDATE`,
      [ordenEntregaId],
    );
    if (existentes.length) {
      throw httpError(
        'El entregable ya tiene una recepción INICIAL; use la modificación',
        409,
        'RECEPCION_YA_EXISTE',
      );
    }
    const numeroRecepcion = 1;
    const tipoRecepcion = 'INICIAL';

    const { rows: recepcionRows } = await client.query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, observacion, estado,
        registrado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'RECIBIDO',$8)
      RETURNING *
    `, [
      ordenEntregaId,
      entrega.orden_id,
      numeroRecepcion,
      tipoRecepcion,
      fechaRecepcion,
      expedienteSgd.slice(0, 120),
      observacion || null,
      String(usuario || '').slice(0, 150),
    ]);

    for (let i = 0; i < archivos.length; i += 1) {
      const a = archivos[i];
      const v = docsValidados[i];
      await client.query(`
        INSERT INTO entregable_recepcion_documentos (
          recepcion_id, nombre_archivo, mime_type, contenido_base64, tamanio_bytes, vigente
        ) VALUES ($1,$2,$3,$4,$5,TRUE)
      `, [
        recepcionRows[0].id,
        String(a?.nombre_archivo || a?.nombre || `entregable-${i + 1}.pdf`).slice(0, 300),
        String(a?.mime_type || 'application/pdf').slice(0, 120),
        v.raw,
        v.bytes,
      ]);
    }

    await client.query('COMMIT');
    return {
      id: recepcionRows[0].id,
      orden_entrega_id: ordenEntregaId,
      orden_id: entrega.orden_id,
      numero_recepcion: numeroRecepcion,
      tipo_recepcion: tipoRecepcion,
      fecha_recepcion_mesa_partes: fechaRecepcion,
      numero_expediente_sgd: expedienteSgd,
      estado: 'RECIBIDO',
      registrado_por: String(usuario || '').slice(0, 150),
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Modifica la misma recepción INICIAL. Un PDF nuevo crea una versión documental
 * y deja el anterior como histórico; sin PDF, conserva el documento vigente.
 */
export async function modificarRecepcionEntregable(ordenEntregaId, body = {}, usuario = '', rol = '') {
  const eid = parseInt(ordenEntregaId, 10);
  if (!Number.isFinite(eid)) throw httpError('orden_entrega_id inválido');

  const fechaRecepcion = toIsoDateString(body.fecha_recepcion_mesa_partes)
    || body.fecha_recepcion_mesa_partes;
  const expedienteSgd = String(body.numero_expediente_sgd || '').trim();
  const observacion = String(body.observacion || '').trim();
  const archivos = Array.isArray(body.documentos)
    ? body.documentos.filter((a) => String(a?.contenido_base64 || '').trim())
    : (String(body.contenido_base64 || '').trim() ? [{
        nombre_archivo: body.nombre_archivo,
        mime_type: body.mime_type,
        contenido_base64: body.contenido_base64,
      }] : []);

  if (!fechaRecepcion) throw httpError('fecha_recepcion_mesa_partes es obligatoria');
  if (!expedienteSgd) throw httpError('numero_expediente_sgd es obligatorio');
  if (archivos.length > 1) {
    throw httpError('Solo se permite un PDF vigente por recepción', 400, 'DOCUMENTO_VIGENTE_MULTIPLE');
  }
  const archivo = archivos[0] || null;
  const docValidado = archivo ? validateArchivo({
    contenido_base64: archivo.contenido_base64,
    nombre_archivo: archivo.nombre_archivo || archivo.nombre,
    mime_type: archivo.mime_type || 'application/pdf',
  }) : null;

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows: entregaRows } = await client.query(`
      SELECT oe.id, oe.estado, oc.tipo_orden, oc.tipo_contratacion,
        oc.estado AS orden_estado, r.tipo AS req_tipo
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
      LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
      WHERE oe.id = $1
      FOR UPDATE OF oe
    `, [eid]);
    const entrega = entregaRows[0];
    if (!entrega) throw httpError('Entregable no encontrado', 404);
    if (String(entrega.estado || '').toUpperCase() !== 'ACTIVO') {
      throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
    }
    if (String(entrega.orden_estado || '').toUpperCase() === 'ORDEN_ANULADA') {
      throw httpError('La orden asociada está anulada', 409, 'ORDEN_ANULADA');
    }
    if (!isServicioOLocacion(entrega.tipo_orden, entrega.tipo_contratacion, entrega.req_tipo)) {
      throw httpError('El entregable no corresponde a un servicio/locación', 409, 'ENTREGABLE_NO_SERVICIO');
    }
    assertEtapaGestionOperativa(
      await obtenerEstadoResponsableEntregable(eid, { client }),
    );

    const { rows: recepcionRows } = await client.query(`
      SELECT * FROM entregable_recepciones
      WHERE orden_entrega_id = $1 AND tipo_recepcion = 'INICIAL'
      ORDER BY numero_recepcion, id
      LIMIT 1
      FOR UPDATE
    `, [eid]);
    const recepcion = recepcionRows[0];
    if (!recepcion) {
      throw httpError('El entregable no tiene recepción INICIAL para modificar', 404, 'RECEPCION_NO_EXISTE');
    }
    if (String(recepcion.estado || '').toUpperCase() !== 'RECIBIDO') {
      throw httpError(
        'La recepción ya no es editable',
        409,
        'RECEPCION_NO_EDITABLE',
      );
    }
    const { rows: vigentes } = await client.query(`
      SELECT id FROM entregable_recepciones
      WHERE orden_entrega_id = $1
      ORDER BY numero_recepcion DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `, [eid]);
    if (Number(vigentes[0]?.id) !== Number(recepcion.id)) {
      throw httpError(
        'La recepción INICIAL ya es histórica y no puede modificarse',
        409,
        'RECEPCION_NO_EDITABLE',
      );
    }
    const { rows: observacionesAbiertas } = await client.query(`
      SELECT id FROM entregable_observaciones
      WHERE recepcion_id = $1
        AND estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION')
      LIMIT 1
      FOR UPDATE
    `, [recepcion.id]);
    if (observacionesAbiertas.length) {
      throw httpError(
        'La recepción tiene una observación formal abierta; debe registrar una subsanación',
        409,
        'ENTREGABLE_OBSERVADO',
      );
    }

    const { rows: actualizadas } = await client.query(`
      UPDATE entregable_recepciones
      SET fecha_recepcion_mesa_partes = $2,
          numero_expediente_sgd = $3,
          observacion = $4,
          actualizado_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [
      recepcion.id,
      fechaRecepcion,
      expedienteSgd.slice(0, 120),
      observacion || null,
    ]);

    let documentoVigente = null;
    const { rows: docsVigentes } = await client.query(`
      SELECT * FROM entregable_recepcion_documentos
      WHERE recepcion_id = $1 AND vigente = TRUE
      ORDER BY id DESC
      FOR UPDATE
    `, [recepcion.id]);

    if (archivo) {
      const anterior = docsVigentes[0] || null;
      if (docsVigentes.length) {
        await client.query(`
          UPDATE entregable_recepcion_documentos
          SET vigente = FALSE
          WHERE recepcion_id = $1 AND vigente = TRUE
        `, [recepcion.id]);
      }
      const { rows: nuevosDocs } = await client.query(`
        INSERT INTO entregable_recepcion_documentos (
          recepcion_id, nombre_archivo, mime_type, contenido_base64,
          tamanio_bytes, vigente, reemplaza_id
        ) VALUES ($1,$2,$3,$4,$5,TRUE,$6)
        RETURNING id, recepcion_id, nombre_archivo, mime_type, tamanio_bytes,
          vigente, reemplaza_id, created_at
      `, [
        recepcion.id,
        String(archivo.nombre_archivo || archivo.nombre || 'entregable.pdf').slice(0, 300),
        String(archivo.mime_type || 'application/pdf').slice(0, 120),
        docValidado.raw,
        docValidado.bytes,
        anterior?.id || null,
      ]);
      documentoVigente = nuevosDocs[0];
    } else {
      documentoVigente = docsVigentes[0] || null;
    }

    await client.query('COMMIT');
    return {
      ...actualizadas[0],
      documento_vigente: documentoVigente,
      modificado_por: String(usuario || '').slice(0, 150),
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw error;
  } finally {
    client.release();
  }
}

/** Contenido documental de una recepción (preview/download). */
export async function getDocumentoRecepcionEntregable(recepcionId, documentoId) {
  const { rows } = await query(`
    SELECT d.id, d.nombre_archivo, d.mime_type, d.contenido_base64, d.tamanio_bytes,
      d.recepcion_id
    FROM entregable_recepcion_documentos d
    WHERE d.recepcion_id = $1 AND d.id = $2
  `, [parseInt(recepcionId, 10), parseInt(documentoId, 10)]);
  if (!rows.length) throw httpError('Documento no encontrado', 404);
  const row = rows[0];
  return {
    id: row.id,
    nombre: row.nombre_archivo,
    mime_type: row.mime_type,
    contenido_base64: row.contenido_base64,
    tamano_bytes: row.tamanio_bytes,
    recepcion_id: row.recepcion_id,
  };
}

export async function getDocumentoRecepcionEntregableBytes(recepcionId, documentoId) {
  const doc = await getDocumentoRecepcionEntregable(recepcionId, documentoId);
  let raw = String(doc.contenido_base64 || '');
  if (raw.includes('base64,')) raw = raw.split('base64,').pop();
  raw = raw.replace(/\s+/g, '');
  if (!raw) throw httpError('Archivo no disponible', 404, 'DOCUMENTO_SIN_CONTENIDO');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw httpError('Archivo no disponible', 404, 'DOCUMENTO_SIN_CONTENIDO');
  return {
    buffer,
    mimeType: doc.mime_type || 'application/pdf',
    nombre: doc.nombre || 'documento.pdf',
    documentoId: doc.id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RC8.15.5B — Acta de Conformidad de Servicios (generación + firmada + visor).
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ACTA_BYTES = 10 * 1024 * 1024; // 10 MB
const ACTA_MIME_PDF = 'application/pdf';

/** Override institucional: rol admin o alcance global/institucional. */
function esAdmin(userCtx) {
  if (!userCtx) return false;
  const rol = String(userCtx.rol || '').toLowerCase();
  if (rol === 'admin' || rol === 'administrador') return true;
  const alcance = String(userCtx.alcance_datos || '').toUpperCase();
  return alcance.includes('GLOBAL') || alcance.includes('INSTITUCIONAL');
}

/** Responsable canónico actual (o admin); una responsabilidad UNIDAD no inventa usuario. */
function assertPuedeObservarEntregable(userCtx, responsable) {
  if (esAdmin(userCtx)) return;
  const uid = Number(userCtx?.id);
  const responsableId = responsable ? Number(responsable.responsable_usuario_id) : null;
  if (!uid || !responsableId || uid !== responsableId) {
    throw httpError(
      'Solo el responsable actual del expediente puede observar el entregable',
      403,
      'OBSERVACION_NO_AUTORIZADA',
    );
  }
}

/** Responsable canónico actual (o admin); UNIDAD sin persona no habilita subsanar. */
function assertPuedeSubsanarEntregable(userCtx, responsable) {
  if (esAdmin(userCtx)) return;
  const uid = Number(userCtx?.id);
  const responsableId = responsable ? Number(responsable.responsable_usuario_id) : null;
  if (!uid || !responsableId || uid !== responsableId) {
    throw httpError(
      'Solo el responsable actual del expediente puede subsanar el entregable',
      403,
      'SUBSANACION_NO_AUTORIZADA',
    );
  }
}

/**
 * Responsable canónico específico del entregable. El helper conserva para
 * históricos el fallback expediente_estado_vigente + JOIN usuarios.
 */
async function getResponsableConformidad(ordenEntregaId) {
  const estado = await obtenerEstadoResponsableEntregable(ordenEntregaId);
  if (!estado) return null;
  return {
    responsable_usuario_id: estado.responsableUsuarioId,
    responsable_nombre: estado.responsableNombre,
    responsable_username: estado.responsableUsername,
    etapa_codigo: estado.etapaCodigo,
    estado_codigo: estado.estadoCodigo,
    fuente_estado: estado.fuenteEstado,
  };
}

/** Solo el responsable actual del expediente (o admin) puede gestionar la conformidad. */
function assertPuedeGestionarConformidad(userCtx, entrega, responsable) {
  if (esAdmin(userCtx)) return;
  const uid = Number(userCtx?.id);
  const responsableId = responsable ? Number(responsable.responsable_usuario_id) : null;
  if (!uid || !responsableId || uid !== responsableId) {
    const err = new Error('Solo el responsable actual del expediente puede gestionar la conformidad');
    err.status = 403;
    err.code = 'CONFORMIDAD_NO_AUTORIZADO';
    throw err;
  }
}

/**
 * Presentación canónica vigente: inicial o última subsanación válida según su
 * secuencia funcional. No infiere vigencia por MAX(id).
 */
export async function obtenerRecepcionVigenteEntregable(
  ordenEntregaId,
  { client = null, lock = false } = {},
) {
  const runQuery = client ? client.query.bind(client) : query;
  const { rows } = await runQuery(
    `SELECT * FROM entregable_recepciones
     WHERE orden_entrega_id = $1
       AND UPPER(COALESCE(estado,'')) IN ('RECIBIDO','SUBSANADO','CONFORME')
     ORDER BY numero_recepcion DESC, id DESC
     LIMIT 1
     ${client && lock ? 'FOR UPDATE' : ''}`,
    [Number(ordenEntregaId)],
  );
  return rows[0] || null;
}

/** Documento de presentación/recepción del entregable. */
async function getDocumentoRecepcionPresentacion(ordenEntregaId, recepcionId = null, { client = null } = {}) {
  const runQuery = client ? client.query.bind(client) : query;
  const { rows } = await runQuery(
    `SELECT d.* FROM entregable_recepcion_documentos d
     JOIN entregable_recepciones er ON er.id = d.recepcion_id
     WHERE er.orden_entrega_id = $1
       AND ($2::int IS NULL OR er.id = $2)
       AND d.vigente = TRUE
     ORDER BY er.numero_recepcion DESC, er.id DESC, d.id DESC LIMIT 1`,
    [Number(ordenEntregaId), recepcionId == null ? null : Number(recepcionId)],
  );
  return rows[0] || null;
}

/** Precondiciones (A–F, H). La autorización (G) se valida aparte. */
async function validarPrecondicionesConformidad(entrega) {
  if (String(entrega.estado || '').toUpperCase() !== 'ACTIVO') {
    throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
  }
  if (String(entrega.orden_estado || '').toUpperCase() === 'ORDEN_ANULADA') {
    throw httpError('La orden asociada está anulada', 409, 'ORDEN_ANULADA');
  }
  const recepcion = await obtenerRecepcionVigenteEntregable(entrega.id);
  if (!recepcion) {
    throw httpError('El entregable no tiene una recepción válida', 409, 'SIN_RECEPCION_VALIDA');
  }
  const observacionAbierta = await obtenerObservacionAbierta(entrega.id);
  if (observacionAbierta) {
    throw httpError(
      'El entregable tiene una observación formal abierta',
      409,
      'ENTREGABLE_OBSERVADO',
    );
  }
  const documento = await getDocumentoRecepcionPresentacion(entrega.id, recepcion.id);
  if (!documento) {
    throw httpError('Falta el documento de presentación/recepción del entregable', 409, 'SIN_DOCUMENTO_RECEPCION');
  }
  return { recepcion, documento };
}

/**
 * PASO 1 — Armador de datos reales del acta.
 * Construye el objeto que recibe generateActaConformidadServiciosPdfServer().
 * Resuelve fuentes reales (centro, cantidad/PU/total, recepción, responsable).
 */
export async function buildDatosActaConformidadServicio(ordenEntregaId, opts = {}) {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  const [recepcion, responsable] = await Promise.all([
    opts.recepcion
      ? Promise.resolve(opts.recepcion)
      : obtenerRecepcionVigenteEntregable(ordenEntregaId),
    getResponsableConformidad(ordenEntregaId),
  ]);

  let centro = '';
  try {
    const c = resolverCentroDesdeRequerimiento({
      cmn: entrega.requerimiento_cmn,
      area: entrega.req_area,
      payload: entrega.requerimiento_payload,
    });
    centro = c.centro_codigo || c.centro_nombre || '';
  } catch (_) { centro = ''; }

  const areaUsuaria = resolveAreaUsuaria({ requerimientoArea: entrega.req_area });
  const contract = buildEntregaContract(entrega, { totalEntregas: 1 });

  return {
    numero_orden: entrega.numero_orden || '',
    fecha_orden: toIsoDateString(entrega.fecha_orden) || entrega.fecha_orden || null,
    requerimiento: entrega.requerimiento_codigo || '',
    proveedor: entrega.proveedor_razon_social || '',
    ruc: entrega.proveedor_ruc || '',
    centro,
    area_usuaria: areaUsuaria || entrega.req_area || '',
    objeto_servicio: entrega.denominacion || contract.descripcionEntrega || '',
    numero_entrega: entrega.numero_entrega,
    denominacion: contract.etiquetaEntrega || contract.descripcionEntrega || '',
    plazo: entrega.dias_plazo ? `${Number(entrega.dias_plazo)} días` : '',
    fecha_maxima: toIsoDateString(entrega.fecha_maxima) || entrega.fecha_maxima || null,
    fecha_recepcion_mesa_partes: recepcion?.fecha_recepcion_mesa_partes || null,
    numero_expediente_sgd: recepcion?.numero_expediente_sgd || '',
    cantidad: entrega.cantidad != null ? Number(entrega.cantidad) : null,
    precio_unitario: entrega.precio_unitario != null ? Number(entrega.precio_unitario) : null,
    importe_entregable: entrega.importe != null ? Number(entrega.importe)
      : (entrega.precio_total != null ? Number(entrega.precio_total) : null),
    responsable: responsable?.responsable_nombre || responsable?.responsable_username || '',
    fecha_emision: opts.fecha_emision || new Date().toISOString().slice(0, 10),
    conclusion: opts.conclusion || '',
    moneda: entrega.moneda || 'PEN',
    version: Number(opts.version) || 1,
    numero_acta: opts.numero_acta || undefined,
  };
}

/** PASO 2–6 — Genera y persiste el Acta (versionada). */
export async function generarActaConformidadEntregable(ordenEntregaId, body = {}, userCtx = null, usuario = '') {
  const conclusion = String(body?.conclusion || '').trim().toUpperCase();
  if (conclusion !== 'CONFORME') {
    throw httpError('Debe confirmar la conformidad del entregable (conclusión CONFORME)', 422, 'CONCLUSION_NO_CONFORME');
  }

  const entrega = await getEntregableOrThrow(ordenEntregaId);
  await validarPrecondicionesConformidad(entrega);
  const responsable = await getResponsableConformidad(ordenEntregaId);
  assertEtapaGestionOperativa({
    etapaCodigo: responsable?.etapa_codigo,
    estadoCodigo: responsable?.estado_codigo,
    fuenteEstado: responsable?.fuente_estado,
  });
  assertPuedeGestionarConformidad(userCtx, entrega, responsable);

  const eid = Number(ordenEntregaId);
  const generadoPor = String(usuario || userCtx?.id || '').slice(0, 150);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Serializa la generación por entregable (evita versiones duplicadas).
    await client.query('SELECT id FROM orden_entregas WHERE id = $1 FOR UPDATE', [eid]);
    const observacionEnTransaccion = await client.query(`
      SELECT id FROM entregable_observaciones
      WHERE orden_entrega_id = $1
        AND estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION')
      LIMIT 1
      FOR UPDATE
    `, [eid]);
    if (observacionEnTransaccion.rows.length) {
      throw httpError(
        'El entregable tiene una observación formal abierta',
        409,
        'ENTREGABLE_OBSERVADO',
      );
    }
    const recepcionVigente = await obtenerRecepcionVigenteEntregable(eid, { client, lock: true });
    if (!recepcionVigente) {
      throw httpError('El entregable no tiene una recepción válida', 409, 'SIN_RECEPCION_VALIDA');
    }
    const documentoVigente = await getDocumentoRecepcionPresentacion(
      eid,
      recepcionVigente.id,
      { client },
    );
    if (!documentoVigente) {
      throw httpError(
        'Falta el documento de la presentación vigente del entregable',
        409,
        'SIN_DOCUMENTO_RECEPCION',
      );
    }
    const vres = await client.query(
      'SELECT COALESCE(MAX(version),0)::int AS v FROM entregable_conformidad_actas WHERE orden_entrega_id = $1',
      [eid],
    );
    const nextVersion = Number(vres.rows[0].v) + 1;

    const data = await buildDatosActaConformidadServicio(eid, {
      version: nextVersion,
      conclusion,
      recepcion: recepcionVigente,
    });
    const pdf = generateActaConformidadServiciosPdfServer(data);

    const ins = await client.query(
      `INSERT INTO entregable_conformidad_actas
         (orden_id, orden_entrega_id, recepcion_id, numero_acta, version, estado_documental, contenido_html,
          documento_nombre, documento_mime, documento_base64, generado_at, generado_por)
       VALUES ($1,$2,$3,$4,$5,'ACTA_CONFORMIDAD_GENERADA',$6,$7,'application/pdf',$8,NOW(),$9)
       RETURNING id, orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
                 estado_documental, generado_at, generado_por`,
      [
        entrega.orden_id,
        eid,
        recepcionVigente.id,
        pdf.nombre,
        nextVersion,
        pdf.html,
        pdf.nombre,
        pdf.base64,
        generadoPor,
      ],
    );
    await client.query('COMMIT');
    return { ok: true, data: ins.rows[0] };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

/** PASO 7–10 — Adjunta Acta firmada (PDF, versionada, idempotente). */
export async function adjuntarActaConformidadFirmada(ordenEntregaId, body = {}, userCtx = null, usuario = '') {
  const entrega = await getEntregableOrThrow(ordenEntregaId);
  const responsable = await getResponsableConformidad(ordenEntregaId);
  assertEtapaGestionOperativa({
    etapaCodigo: responsable?.etapa_codigo,
    estadoCodigo: responsable?.estado_codigo,
    fuenteEstado: responsable?.fuente_estado,
  });
  assertPuedeGestionarConformidad(userCtx, entrega, responsable);

  const raw = stripDataUrl(body?.contenido_base64 || '');
  const mime = String(body?.mime_type || '').toLowerCase();
  if (mime && mime !== ACTA_MIME_PDF) {
    throw httpError('Solo se admite PDF para el acta firmada', 422, 'ACTA_FIRMADA_SOLO_PDF');
  }
  if (!raw || raw.length < 20) {
    throw httpError('Contenido del acta firmada inválido o vacío', 422, 'ACTA_FIRMADA_VACIA');
  }
  const approxBytes = Math.floor((raw.length * 3) / 4);
  if (approxBytes > MAX_ACTA_BYTES) {
    throw httpError('El acta firmada supera el tamaño máximo permitido (10 MB)', 422, 'ACTA_FIRMADA_TAMANO');
  }

  const actaPrevia = await obtenerActaGeneradaVigente(ordenEntregaId);
  if (!actaPrevia) {
    if (body?.acta_id != null) {
      throw httpError(
        'El acta seleccionada no corresponde a la presentación vigente',
        409,
        'ACTA_GENERADA_HISTORICA',
      );
    }
    throw httpError('Debe existir un Acta de Conformidad generada antes de adjuntar la firmada', 409, 'SIN_ACTA_GENERADA');
  }
  const actaSolicitadaId = body?.acta_id == null ? null : Number(body.acta_id);
  if (actaSolicitadaId != null
    && (!Number.isInteger(actaSolicitadaId) || actaSolicitadaId !== Number(actaPrevia.id))) {
    throw httpError(
      'El acta seleccionada no corresponde a la presentación vigente',
      409,
      'ACTA_GENERADA_HISTORICA',
    );
  }

  const eid = Number(ordenEntregaId);
  const idem = String(body?.idempotency_key || '').trim().slice(0, 120) || null;
  const nombre = String(body?.nombre || actaPrevia.numero_acta || `ACTA-CS-${entrega.numero_orden}-E${entrega.numero_entrega}-firmada.pdf`).slice(0, 255);
  const createdBy = String(usuario || userCtx?.id || '').slice(0, 150);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Serializa contra observación/subsanación y revalida el acta seleccionable.
    await client.query('SELECT id FROM orden_entregas WHERE id = $1 FOR UPDATE', [eid]);
    const acta = await obtenerActaGeneradaVigente(eid, { client });
    if (!acta) {
      throw httpError(
        'El Acta de Conformidad generada no corresponde a la presentación vigente',
        409,
        'ACTA_GENERADA_HISTORICA',
      );
    }
    if (actaSolicitadaId != null && actaSolicitadaId !== Number(acta.id)) {
      throw httpError(
        'El acta seleccionada no corresponde a la presentación vigente',
        409,
        'ACTA_GENERADA_HISTORICA',
      );
    }

    if (idem) {
      const existente = await client.query(
        `SELECT id, orden_id, orden_entrega_id, acta_id, version, nombre, mime_type, tamano_bytes,
                estado_documental, vigente, reemplaza_id, created_by, created_at
         FROM entregable_conformidad_acta_visados
         WHERE orden_entrega_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL`,
        [eid, idem],
      );
      if (existente.rows.length) {
        if (Number(existente.rows[0].acta_id) !== Number(acta.id)) {
          throw httpError(
            'La carga idempotente pertenece a un acta histórica',
            409,
            'ACTA_FIRMADA_HISTORICA',
          );
        }
        await client.query('COMMIT');
        return { ok: true, data: existente.rows[0], idempotente: true };
      }
    }

    const vigente = await client.query(
      `SELECT id, version FROM entregable_conformidad_acta_visados
       WHERE acta_id = $1 AND vigente = TRUE AND deleted_at IS NULL
       ORDER BY version DESC LIMIT 1`,
      [acta.id],
    );
    const prev = vigente.rows[0] || null;
    const nextVersion = prev ? Number(prev.version) + 1 : 1;

    if (prev) {
      await client.query('UPDATE entregable_conformidad_acta_visados SET vigente = FALSE WHERE id = $1', [prev.id]);
    }

    const ins = await client.query(
      `INSERT INTO entregable_conformidad_acta_visados
         (orden_id, orden_entrega_id, acta_id, version, nombre, mime_type, contenido_base64, tamano_bytes,
          estado_documental, vigente, reemplaza_id, idempotency_key, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTA_CONFORMIDAD_FIRMADA',TRUE,$9,$10,$11)
       RETURNING id, orden_id, orden_entrega_id, acta_id, version, nombre, mime_type, tamano_bytes,
                 estado_documental, vigente, reemplaza_id, created_by, created_at`,
      [entrega.orden_id, eid, acta.id, nextVersion, nombre, ACTA_MIME_PDF, raw, approxBytes,
        prev ? prev.id : null, idem, createdBy],
    );
    await client.query('COMMIT');
    return { ok: true, data: ins.rows[0] };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

/** PASO 11 — Ver/descargar Acta generada (valida ordenEntregaId + actaId). */
export async function getActaConformidadGenerada(ordenEntregaId, actaId) {
  await getEntregableOrThrow(ordenEntregaId);
  const { rows } = await query(
    `SELECT id, orden_id, orden_entrega_id, numero_acta, version, estado_documental,
            documento_nombre, documento_mime, documento_base64, generado_at, generado_por, created_at, updated_at
     FROM entregable_conformidad_actas
     WHERE id = $1 AND orden_entrega_id = $2`,
    [parseInt(actaId, 10), Number(ordenEntregaId)],
  );
  if (!rows.length) throw httpError('Acta de conformidad no encontrada', 404);
  return rows[0];
}

export async function getActaConformidadGeneradaBytes(ordenEntregaId, actaId) {
  await getEntregableOrThrow(ordenEntregaId);
  const { rows } = await query(
    `SELECT documento_base64, documento_nombre, documento_mime
     FROM entregable_conformidad_actas WHERE id = $1 AND orden_entrega_id = $2`,
    [parseInt(actaId, 10), Number(ordenEntregaId)],
  );
  if (!rows.length || !rows[0].documento_base64) throw httpError('Acta de conformidad no disponible', 404, 'ACTA_SIN_CONTENIDO');
  let raw = String(rows[0].documento_base64 || '');
  if (raw.includes('base64,')) raw = raw.split('base64,').pop();
  raw = raw.replace(/\s+/g, '');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw httpError('Acta de conformidad no disponible', 404, 'ACTA_SIN_CONTENIDO');
  return { buffer, mimeType: rows[0].documento_mime || ACTA_MIME_PDF, nombre: rows[0].documento_nombre || 'acta-conformidad.pdf' };
}

/** PASO 11 — Ver/descargar Acta firmada (valida ordenEntregaId + visadoId). */
export async function getActaConformidadFirmada(ordenEntregaId, visadoId) {
  await getEntregableOrThrow(ordenEntregaId);
  const { rows } = await query(
    `SELECT id, orden_id, orden_entrega_id, acta_id, version, nombre, mime_type, tamano_bytes,
            estado_documental, vigente, reemplaza_id, idempotency_key, contenido_base64, created_by, created_at
     FROM entregable_conformidad_acta_visados
     WHERE id = $1 AND orden_entrega_id = $2 AND deleted_at IS NULL`,
    [parseInt(visadoId, 10), Number(ordenEntregaId)],
  );
  if (!rows.length) throw httpError('Acta firmada no encontrada', 404);
  return rows[0];
}

export async function getActaConformidadFirmadaBytes(ordenEntregaId, visadoId) {
  await getEntregableOrThrow(ordenEntregaId);
  const { rows } = await query(
    `SELECT contenido_base64, nombre, mime_type
     FROM entregable_conformidad_acta_visados
     WHERE id = $1 AND orden_entrega_id = $2 AND deleted_at IS NULL`,
    [parseInt(visadoId, 10), Number(ordenEntregaId)],
  );
  if (!rows.length || !rows[0].contenido_base64) throw httpError('Acta firmada no disponible', 404, 'ACTA_FIRMADA_SIN_CONTENIDO');
  let raw = String(rows[0].contenido_base64 || '');
  if (raw.includes('base64,')) raw = raw.split('base64,').pop();
  raw = raw.replace(/\s+/g, '');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw httpError('Acta firmada no disponible', 404, 'ACTA_FIRMADA_SIN_CONTENIDO');
  return { buffer, mimeType: rows[0].mime_type || ACTA_MIME_PDF, nombre: rows[0].nombre || 'acta-firmada.pdf' };
}