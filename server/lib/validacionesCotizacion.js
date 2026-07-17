// Validación técnica de cotizaciones — derivación CM y trabajo del área usuaria
import { query } from '../db.js';
import { registrarTrazaPortal } from './invitaciones.js';
import { normalizePermisos } from './permissionsCatalog.js';
import {
  buildManifiestoCotizacionTecnica,
  parseCotizacionAnexos,
} from './portalDocumentos.js';
import { syncRequerimientosSolicitudWorkflow } from './cotizacionWorkflowSync.js';
import {
  normalizeTipoValidacion,
  legacyItemToEvaluacion,
  filasV2ToLegacyItems,
  calcularResultadoCotizacion,
  validarMatrizCompleta,
} from './validacionFormatos.js';
import {
  resolveValidationCentro,
  consolidateCentros,
} from '../../shared/validacionCentro.js';

const SUBMODULOS_VALIDACION = Object.freeze([
  { code: 'REGISTRO_REQUERIMIENTO', label: 'Registro de Requerimiento' },
  { code: 'EVALUACION_REQUERIMIENTO', label: 'Evaluación de Requerimiento' },
]);

function parseJson(val, fallback = {}) {
  if (val && typeof val === 'object') return val;
  try { return JSON.parse(val || 'null') ?? fallback; } catch (_) { return fallback; }
}

function parseInforme(cot) {
  return parseJson(cot?.validacion_informe, {});
}

function nombreUsuario(u) {
  return String(u?.nombre || [u?.apellidos, u?.nombres].filter(Boolean).join(' ') || u?.username || u?.dni || '').trim();
}

function normalizePersonName(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}

function nameTokensMatch(candidate, responsable) {
  const c = normalizePersonName(candidate);
  const r = normalizePersonName(responsable);
  if (!c || !r) return false;
  if (c === r || c.includes(r) || r.includes(c)) return true;
  const ct = c.split(' ').filter((t) => t.length > 2);
  const rt = r.split(' ').filter((t) => t.length > 2);
  if (!ct.length || !rt.length) return false;
  const hits = ct.filter((t) => rt.some((u) => u.includes(t) || t.includes(u))).length;
  return hits >= Math.min(2, ct.length, rt.length);
}

function responsableIdDeCot(cot) {
  const inf = parseInforme(cot);
  const id = parseInt(inf.derivacion?.responsable_id, 10);
  return Number.isFinite(id) ? id : null;
}

function responsableNombreDeCot(cot) {
  const inf = parseInforme(cot);
  return String(cot.validacion_responsable || inf.derivacion?.responsable_nombre || '').trim();
}

function tieneResponsableAsignado(cot) {
  return !!(responsableIdDeCot(cot) || responsableNombreDeCot(cot));
}

/** Criterio único: visibilidad, Validar, abrir, guardar y derivar. */
export function canUserValidateExpediente(cot, usuario, userId, opts = {}) {
  const esAdmin = !!opts.esAdmin;
  const inf = parseInforme(cot);
  const respId = responsableIdDeCot(cot);
  const respNombre = responsableNombreDeCot(cot);
  const uid = parseInt(userId, 10);

  if (!tieneResponsableAsignado(cot)) {
    return { puedeVer: esAdmin, puedeValidar: false, sinAsignacion: true, motivo: 'Pendiente de asignación' };
  }

  if (esAdmin) {
    const v = String(cot.validacion_estado || '').toUpperCase();
    const editable = ['DERIVADA', 'EN_PROCESO'].includes(v);
    return {
      puedeVer: true,
      puedeValidar: editable,
      sinAsignacion: false,
      motivo: editable ? 'Administrador' : 'Solo lectura',
    };
  }

  if (respId && uid && respId === uid) {
    const v = String(cot.validacion_estado || '').toUpperCase();
    const editable = ['DERIVADA', 'EN_PROCESO'].includes(v);
    return { puedeVer: true, puedeValidar: editable, sinAsignacion: false, motivo: 'Responsable asignado' };
  }

  const candidatos = [
    usuario,
    opts.usuarioNombre,
    opts.usuarioApellidosNombres,
    opts.usuarioUsername,
    opts.usuarioDni,
  ].filter(Boolean);

  const matchNombre = candidatos.some((c) => nameTokensMatch(c, respNombre));
  const v = String(cot.validacion_estado || '').toUpperCase();
  const editable = matchNombre && ['DERIVADA', 'EN_PROCESO'].includes(v);

  return {
    puedeVer: matchNombre,
    puedeValidar: editable,
    sinAsignacion: false,
    motivo: matchNombre ? (editable ? 'Responsable asignado' : 'Solo lectura') : 'No asignado',
  };
}

function matchResponsable(cot, usuario, userId, opts = {}) {
  return canUserValidateExpediente(cot, usuario, userId, opts).puedeVer;
}

function matchResponsableParaEdicion(cot, usuario, userId, opts = {}) {
  return canUserValidateExpediente(cot, usuario, userId, opts).puedeValidar;
}

function mapCotizacionRow(r) {
  const eco = parseJson(r.propuesta_economica, {});
  const inf = parseInforme(r);
  const valEst = r.validacion_estado || '';
  return {
    id: r.id,
    solicitud_id: r.solicitud_id,
    proveedor_id: r.proveedor_id,
    estado: r.estado,
    validacion_estado: valEst,
    estado_display: estadoDisplayValidacion(valEst, r.estado),
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
    requerimientos: r.requerimientos_texto || '',
    derivacion: inf.derivacion || null,
    responsable_id: inf.derivacion?.responsable_id || null,
    responsable_nombre: r.validacion_responsable || inf.derivacion?.responsable_nombre || '',
    estado_bandeja: estadoDisplayBandejaValidacion(valEst),
    estado_bandeja_class: badgeBandejaClass(valEst),
  };
}

function estadoDisplayValidacion(validacionEstado, cotEstado) {
  const v = String(validacionEstado || '').toUpperCase();
  if (v === 'DERIVADA' || v === 'EN_PROCESO') return 'En validación AU';
  if (!v || v === 'PENDIENTE') return 'COTIZACION_PRESENTADA';
  return validacionEstado || cotEstado || '';
}

/**
 * Destinos oficiales al cerrar validación AU (vía sync + registrarMovimiento).
 * APTO → CUADRO_COMPARATIVO (catálogo Workflow APROBAR).
 * NO_APTO/OBSERVADO → RECEPCION_COTIZACIONES (regla operativa actual).
 * Nota RC7.7A: el flujo funcional solicitado pedía INVITACIONES para no apto;
 * no se altera el motor ni se hardcodea INVITACIONES en la vista.
 */
export const DESTINOS_SALIDA_VALIDACION = Object.freeze({
  APTO: Object.freeze({
    code: 'CUADRO_COMPARATIVO',
    label: 'Cuadro Comparativo',
    estado_bandeja: 'Derivado a Cuadro Comparativo',
    bloqueado: true,
  }),
  NO_APTO: Object.freeze({
    code: 'RECEPCION_COTIZACIONES',
    label: 'Recepción de Cotizaciones',
    estado_bandeja: 'Derivado a Recepción de Cotizaciones',
    bloqueado: true,
    nota: 'Destino oficial vigente. El flujo solicitado (Invitaciones) contradice esta regla; no se alteró el Workflow Engine.',
  }),
  OBSERVADO: Object.freeze({
    code: 'RECEPCION_COTIZACIONES',
    label: 'Recepción de Cotizaciones',
    estado_bandeja: 'Derivado a Recepción de Cotizaciones',
    bloqueado: true,
  }),
});

export function resolverDestinoSalidaValidacion(estadoVal) {
  const v = String(estadoVal || '').toUpperCase();
  if (v === 'APTO') return DESTINOS_SALIDA_VALIDACION.APTO;
  if (v === 'NO_APTO') return DESTINOS_SALIDA_VALIDACION.NO_APTO;
  return DESTINOS_SALIDA_VALIDACION.OBSERVADO;
}

/** Etiqueta de bandeja Validaciones (RC7.7 / RC7.7A). */
export function estadoDisplayBandejaValidacion(validacionEstado) {
  const v = String(validacionEstado || '').toUpperCase();
  if (v === 'DERIVADA' || v === 'EN_PROCESO') return 'Pendiente de validación';
  if (v === 'APTO') return DESTINOS_SALIDA_VALIDACION.APTO.estado_bandeja;
  if (v === 'NO_APTO' || v === 'OBSERVADO') return resolverDestinoSalidaValidacion(v).estado_bandeja;
  return 'Pendiente de validación';
}

function badgeBandejaClass(validacionEstado) {
  const v = String(validacionEstado || '').toUpperCase();
  if (v === 'APTO') return 'success';
  if (v === 'NO_APTO' || v === 'OBSERVADO') return 'warning';
  return 'warning';
}

function formatRequerimientosCodes(requerimientos = [], detalleItems = []) {
  const fromSr = (requerimientos || []).map((r) => r.codigo).filter(Boolean);
  if (fromSr.length) return [...new Set(fromSr)].join(', ');
  const fromItems = (Array.isArray(detalleItems) ? detalleItems : [])
    .map((it) => it.requerimiento_codigo || it.codigo)
    .filter(Boolean);
  return [...new Set(fromItems)].join(', ');
}

function bytesFromBase64(b64) {
  if (!b64) return null;
  const s = String(b64);
  const padding = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - padding);
}

function enrichDocsCotizacion(docs, cot) {
  const anexos = parseCotizacionAnexos(cot?.anexos);
  const fecha = cot?.fecha_presentacion || cot?.updated_at || null;
  return (docs || []).map((d) => {
    let tamaño = d.tamaño_bytes ?? null;
    let fechaDoc = d.fecha || fecha;
    const ref = String(d.ref || '');
    if (tamaño == null) {
      let entry = null;
      if (ref.startsWith('docs-')) entry = (anexos.docs_solicitados || [])[Number(ref.split('-')[1])];
      else if (ref.startsWith('req-')) entry = (anexos.requisitos || [])[Number(ref.split('-')[1])];
      else if (ref === 'anexo05a') entry = anexos.anexo05a_firmado;
      else if (ref.startsWith('cert-')) {
        const certs = parseJson(cot?.certificados, []);
        entry = (Array.isArray(certs) ? certs : [])[Number(ref.split('-')[1])];
      }
      const b64 = entry?.base64 || entry?.contenido_base64;
      if (b64) tamaño = bytesFromBase64(b64);
      if (entry?.uploaded_at || entry?.fecha) fechaDoc = entry.uploaded_at || entry.fecha;
    }
    return {
      ...d,
      tipo: d.grupo || d.fuente || 'Documento',
      fecha: fechaDoc,
      tamaño_bytes: tamaño,
      estado: d.estado || 'Presentado',
    };
  });
}

function resumenPropuestaTecnica(cot) {
  const prop = parseJson(cot?.propuesta_tecnica, {});
  const items = Array.isArray(prop.items) ? prop.items : [];
  return {
    tiene_propuesta: items.length > 0 || Object.keys(prop).length > 0,
    items: items.map((it, idx) => ({
      item: idx + 1,
      item_key: it.item_key || '',
      marca: it.marca || '',
      pais: it.pais || it.procedencia || '',
      descripcion: it.descripcion || '',
    })),
    notas: prop.notas || prop.observacion || '',
  };
}

function normalizeTipoContratacion(tipo) {
  const t = String(tipo || '').trim().toUpperCase();
  if (t === 'B' || t === 'BIEN' || t === 'BIENES') return 'Bien';
  if (t === 'S' || t === 'SERVICIO' || t === 'SERVICIOS') return 'Servicio';
  if (t === 'L' || t === 'LOCADOR' || t === 'LOCADORES' || /LOCACI/i.test(t)) return 'Locador';
  return tipo || '—';
}

async function loadRequerimientosSolicitud(solicitudId) {
  const { rows } = await query(`
    SELECT r.id, r.codigo, r.denominacion, r.area, r.cmn, r.payload,
      COALESCE(
        NULLIF(TRIM(r.cmn), ''),
        NULLIF(TRIM(COALESCE(r.payload, '{}')::jsonb->>'cmn'), ''),
        NULLIF(TRIM(COALESCE(r.payload, '{}')::jsonb->>'centro'), ''),
        NULLIF(TRIM(COALESCE(r.payload, '{}')::jsonb->>'centro_costo'), ''),
        NULLIF(TRIM(r.area), ''),
        ''
      ) AS centro,
      NULLIF(TRIM(COALESCE(r.payload, '{}')::jsonb->>'centro_costo'), '') AS centro_costo
    FROM solicitud_requerimientos sr
    JOIN requerimientos r ON r.id = sr.requerimiento_id
    WHERE sr.solicitud_id = $1
    ORDER BY r.codigo ASC
  `, [solicitudId]);
  return rows;
}

async function loadDocumentosRequerimientoSolicitud(solicitudId) {
  const { rows } = await query(`
    SELECT ra.id, ra.nombre_archivo, ra.mime_type, ra.tamaño_bytes, ra.created_at,
           r.codigo AS requerimiento_codigo, r.id AS requerimiento_id
    FROM requerimientos_adjuntos ra
    JOIN solicitud_requerimientos sr ON sr.requerimiento_id = ra.requerimiento_id
    JOIN requerimientos r ON r.id = ra.requerimiento_id
    WHERE sr.solicitud_id = $1
    ORDER BY r.codigo ASC, ra.created_at ASC
  `, [solicitudId]);
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre_archivo,
    mime_type: r.mime_type,
    tamaño_bytes: r.tamaño_bytes,
    requerimiento_codigo: r.requerimiento_codigo,
    requerimiento_id: r.requerimiento_id,
    fuente: 'Requerimiento',
    grupo: `REQ ${r.requerimiento_codigo}`,
    ref: `req_adj_${r.id}`,
  }));
}

/** Etiquetas de estado para bandeja Recepción de Cotizaciones (RC7.6). */
export function estadoDisplayRecepcion(validacionEstado) {
  const v = String(validacionEstado || '').toUpperCase();
  if (v === 'DERIVADA' || v === 'EN_PROCESO') return 'Enviada a validación AU';
  if (['APTO', 'NO_APTO', 'OBSERVADO'].includes(v)) return 'Validada por área usuaria';
  return 'Cotización presentada';
}

export function puedeEnviarAValidacion(validacionEstado) {
  const v = String(validacionEstado || '').toUpperCase();
  // Primera derivación o devolución del analista (APTO/NO_APTO/OBSERVADO con observación).
  return !v || v === 'PENDIENTE' || v === 'OBSERVADO' || v === 'NO_APTO' || v === 'APTO';
}

/** Estados en los que el Área Usuaria puede editar/guardar. */
export function esEstadoEditableValidacion(validacionEstado) {
  const v = String(validacionEstado || '').toUpperCase();
  return ['DERIVADA', 'EN_PROCESO'].includes(v);
}

export function getSubmodulosValidacion() {
  return SUBMODULOS_VALIDACION.map((s) => ({ ...s }));
}

export async function listUsuariosDerivacionValidacion(submoduloCode, search = '') {
  const code = String(submoduloCode || '').toUpperCase();
  const modReq = ['REGISTRO_REQUERIMIENTO', 'EVALUACION_REQUERIMIENTO'].includes(code);
  const params = ['admin'];
  let where = 'WHERE u.activo = TRUE AND u.rol <> $1';
  if (String(search || '').trim()) {
    params.push(`%${String(search).trim()}%`);
    where += ` AND (
      COALESCE(u.nombre, '') ILIKE $${params.length}
      OR COALESCE(u.apellidos, '') ILIKE $${params.length}
      OR COALESCE(u.nombres, '') ILIKE $${params.length}
      OR COALESCE(u.username, '') ILIKE $${params.length}
      OR COALESCE(u.dni, '') ILIKE $${params.length}
      OR COALESCE(u.cargo, '') ILIKE $${params.length}
    )`;
  }
  const { rows } = await query(`
    SELECT u.id, u.dni, u.username, u.apellidos, u.nombres, u.nombre, u.cargo, u.rol, u.permisos
    FROM usuarios u
    ${where}
    ORDER BY u.apellidos ASC NULLS LAST, u.nombres ASC NULLS LAST
    LIMIT 200
  `, params);
  return rows
    .map((u) => ({
      id: u.id,
      nombre: nombreUsuario(u),
      cargo: u.cargo || '',
      username: u.username || u.dni || '',
      rol: u.rol,
      permisosNorm: normalizePermisos(u.permisos, u.rol),
    }))
    .filter((u) => {
      const p = u.permisosNorm;
      if (modReq) return p.modulos.includes('REQUERIMIENTOS') && p.submodulos.includes(code);
      // Destinos de salida post-validación (RC7.7A)
      if (['CUADRO_COMPARATIVO', 'RECEPCION_COTIZACIONES', 'INVITACIONES'].includes(code)) {
        return p.modulos.includes('CONTRATACIONES') && p.submodulos.includes(code);
      }
      return p.modulos.includes('CONTRATACIONES') && p.submodulos.includes(code);
    })
    .map(({ permisosNorm, ...rest }) => rest);
}

/**
 * Lista liviana proveedor × requerimiento (sin documentos).
 * Una fila por combinación cotización/proveedor + requerimiento vinculado.
 */
export async function listarProveedoresSolicitudValidacion(solicitudId, usuario, userId, opts = {}) {
  const sid = parseInt(solicitudId, 10);
  if (!Number.isFinite(sid)) throw new Error('Solicitud inválida');
  const { rows } = await query(`
    SELECT cot.id, cot.solicitud_id, cot.proveedor_id, cot.requerimiento_id, cot.estado,
      cot.validacion_estado, cot.validacion_responsable, cot.validacion_informe,
      cot.fecha_presentacion, cot.updated_at,
      p.ruc, p.razon_social, sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    WHERE cot.solicitud_id = $1
      AND cot.estado = 'COTIZACION_PRESENTADA'
      AND cot.validacion_estado IN ('DERIVADA', 'EN_PROCESO', 'APTO', 'NO_APTO', 'OBSERVADO')
    ORDER BY p.razon_social ASC, cot.fecha_presentacion DESC NULLS LAST
  `, [sid]);
  const reqs = await loadRequerimientosSolicitud(sid);
  const esAdmin = !!opts.esAdmin;
  const authOpts = { esAdmin, usuarioNombre: usuario };
  const out = [];
  for (const r of rows) {
    const perm = canUserValidateExpediente(r, usuario, userId, authOpts);
    const reqsFila = r.requerimiento_id
      ? reqs.filter((q) => q.id === r.requerimiento_id)
      : reqs;
    const lista = reqsFila.length ? reqsFila : [{ id: null, codigo: '', denominacion: r.denominacion || r.objeto || '', area: '', cmn: '' }];
    for (const req of lista) {
      out.push({
        cotizacion_id: r.id,
        solicitud_id: r.solicitud_id,
        proveedor_id: r.proveedor_id,
        requerimiento_id: req.id || r.requerimiento_id || null,
        ruc: r.ruc || '',
        razon_social: r.razon_social || '',
        fecha_presentacion: r.fecha_presentacion,
        estado: r.estado,
        validacion_estado: r.validacion_estado || '',
        estado_display: estadoDisplayValidacion(r.validacion_estado, r.estado),
        estado_bandeja: estadoDisplayBandejaValidacion(r.validacion_estado),
        estado_bandeja_class: badgeBandejaClass(r.validacion_estado),
        requerimiento_codigo: req.codigo || '',
        requerimientos: req.codigo || '',
        descripcion: req.denominacion || r.denominacion || r.objeto || '',
        centro: req.centro || req.cmn || req.area || '',
        puede_validar: perm.puedeValidar,
        puede_ver: perm.puedeVer,
        sin_asignacion: perm.sinAsignacion,
      });
    }
  }
  return out;
}

export function getDestinosSalidaPorResultado(resultado, cumple) {
  const estadoVal = mapResultadoFormulario(resultado, cumple);
  const dest = resolverDestinoSalidaValidacion(estadoVal);
  return { resultado_mapeado: estadoVal, destino: dest };
}

export async function listarValidacionesPendientesDerivacion() {
  const { rows } = await query(`
    SELECT cot.*, p.ruc, p.razon_social, sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto,
      COALESCE((
        SELECT string_agg(DISTINCT r.codigo, ', ' ORDER BY r.codigo)
        FROM solicitud_requerimientos sr
        JOIN requerimientos r ON r.id = sr.requerimiento_id
        WHERE sr.solicitud_id = cot.solicitud_id
      ), (
        SELECT string_agg(DISTINCT elem->>'requerimiento_codigo', ', ' ORDER BY elem->>'requerimiento_codigo')
        FROM jsonb_array_elements(COALESCE(sc.detalle_items, '[]'::jsonb)) elem
        WHERE COALESCE(elem->>'requerimiento_codigo', '') <> ''
      ), '') AS requerimientos_texto
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    WHERE cot.estado = 'COTIZACION_PRESENTADA'
      AND COALESCE(cot.validacion_estado, '') NOT IN ('APTO', 'NO_APTO')
    ORDER BY cot.fecha_presentacion DESC NULLS LAST, cot.updated_at DESC
  `);
  return rows.map(mapCotizacionRow);
}

export async function listarValidacionesAsignadas(usuario, userId) {
  return listarValidacionesExpedientes(usuario, userId, { soloAsignadas: true });
}

/** Bandeja unificada — expedientes enviados desde Recepción de Cotizaciones (RC7.7). */
export async function listarValidacionesExpedientes(usuario, userId, opts = {}) {
  const { rows } = await query(`
    SELECT cot.*, p.ruc, p.razon_social, sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto,
      sc.tipo AS solicitud_tipo,
      COALESCE((
        SELECT string_agg(DISTINCT r.codigo, ', ' ORDER BY r.codigo)
        FROM solicitud_requerimientos sr
        JOIN requerimientos r ON r.id = sr.requerimiento_id
        WHERE sr.solicitud_id = cot.solicitud_id
      ), (
        SELECT string_agg(DISTINCT elem->>'requerimiento_codigo', ', ' ORDER BY elem->>'requerimiento_codigo')
        FROM jsonb_array_elements(COALESCE(sc.detalle_items, '[]'::jsonb)) elem
        WHERE COALESCE(elem->>'requerimiento_codigo', '') <> ''
      ), '') AS requerimientos_texto,
      COALESCE((
        SELECT string_agg(DISTINCT r.area, ', ' ORDER BY r.area)
        FROM solicitud_requerimientos sr
        JOIN requerimientos r ON r.id = sr.requerimiento_id
        WHERE sr.solicitud_id = cot.solicitud_id AND COALESCE(r.area, '') <> ''
      ), '') AS area_usuaria
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    WHERE cot.estado = 'COTIZACION_PRESENTADA'
      AND cot.validacion_estado IN ('DERIVADA', 'EN_PROCESO', 'APTO', 'NO_APTO', 'OBSERVADO')
    ORDER BY
      COALESCE(
        NULLIF(cot.validacion_informe->'derivacion'->>'derivado_at', '')::timestamptz,
        cot.updated_at,
        cot.fecha_presentacion,
        cot.created_at
      ) DESC NULLS LAST,
      cot.id DESC
  `);
  const esAdmin = !!opts.esAdmin;
  const authOpts = { esAdmin, usuarioNombre: usuario };
  const filtered = rows.filter((r) => {
    if (esAdmin) return true;
    if (!opts.soloAsignadas) return matchResponsable(r, usuario, userId, authOpts);
    return canUserValidateExpediente(r, usuario, userId, authOpts).puedeVer;
  });
  return filtered.map((r) => {
    const perm = canUserValidateExpediente(r, usuario, userId, authOpts);
    return {
      ...mapCotizacionRow(r),
      tipo_contratacion: normalizeTipoContratacion(r.solicitud_tipo),
      area_usuaria: r.area_usuaria || '',
      descripcion: r.denominacion || r.objeto || '',
      puede_validar: perm.puedeValidar,
      puede_ver: perm.puedeVer,
      sin_asignacion: perm.sinAsignacion,
    };
  });
}

async function loadCotizacionFull(cotizacionId) {
  const { rows } = await query(`
    SELECT cot.*, p.ruc, p.razon_social, sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto,
      sc.detalle_items, sc.tipo AS solicitud_tipo, sc.id AS solicitud_id_ref
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    WHERE cot.id = $1
  `, [cotizacionId]);
  if (!rows.length) throw new Error('Cotización no encontrada');
  return rows[0];
}

export async function getPreviewDerivacionValidacion(cotizacionId) {
  const cot = await loadCotizacionFull(cotizacionId);
  const documentos = buildManifiestoCotizacionTecnica(cot);
  return {
    ...mapCotizacionRow(cot),
    documentos_tecnicos: documentos,
    excluye_economica: true,
    nota: 'La propuesta económica (Anexo 05-B y montos) no se envía al área usuaria.',
  };
}

async function loadReqMetaMap(solicitudId) {
  const reqs = await loadRequerimientosSolicitud(solicitudId);
  const map = new Map();
  reqs.forEach((r) => {
    map.set(r.id, {
      codigo: r.codigo,
      denominacion: r.denominacion,
      centro: r.centro || r.cmn || r.area || '',
      centro_costo: r.centro_costo || '',
      cmn: r.cmn || '',
      area: r.area || '',
    });
  });
  return map;
}

/** Centros de pedidos SIGAMEF vinculados a requerimientos de la solicitud. */
async function loadPedidosCentroByReq(solicitudId) {
  const { rows } = await query(`
    SELECT rp.requerimiento_id,
      NULLIF(TRIM(p.centro), '') AS centro,
      NULLIF(TRIM(p.centro_costo), '') AS centro_costo,
      NULLIF(TRIM(COALESCE(p.codigo_sigamef, '')), '') AS codigo_sigamef,
      NULLIF(TRIM(COALESCE(p.pedido_sigamef, '')), '') AS pedido_sigamef
    FROM solicitud_requerimientos sr
    JOIN requerimiento_pedidos rp ON rp.requerimiento_id = sr.requerimiento_id
    JOIN pedidos_sigamef p ON p.id = rp.pedido_sigamef_id
    WHERE sr.solicitud_id = $1
  `, [solicitudId]);
  const byReq = new Map();
  const byCodigo = new Map();
  for (const r of rows) {
    const entry = {
      centro: r.centro || '',
      centro_costo: r.centro_costo || '',
      pedido_sigamef: r.pedido_sigamef || '',
      codigo_sigamef: r.codigo_sigamef || '',
    };
    if (r.requerimiento_id) {
      const prev = byReq.get(r.requerimiento_id);
      if (!prev?.centro && entry.centro) byReq.set(r.requerimiento_id, entry);
      else if (!prev) byReq.set(r.requerimiento_id, entry);
    }
    if (entry.codigo_sigamef && entry.centro && !byCodigo.has(entry.codigo_sigamef)) {
      byCodigo.set(entry.codigo_sigamef, entry);
    }
  }
  return { byReq, byCodigo };
}

/**
 * Construye items legacy + matriz_v2 (RC7.7B) para una cotización/proveedor.
 */
async function buildMatrizValidacion(cot) {
  const items = parseJson(cot.detalle_items, []);
  const propItems = parseJson(cot.propuesta_tecnica, {}).items || [];
  const tipoKey = normalizeTipoValidacion(cot.solicitud_tipo) || 'BIENES';
  const { rows: countRows } = await query(`
    SELECT COUNT(*)::int AS total FROM cotizaciones_proveedor
    WHERE solicitud_id = $1 AND estado = 'COTIZACION_PRESENTADA'
  `, [cot.solicitud_id]);
  const cantCot = countRows[0]?.total || 1;
  const reqMeta = await loadReqMetaMap(cot.solicitud_id);
  const pedidosCentro = await loadPedidosCentroByReq(cot.solicitud_id);
  const inf = parseInforme(cot);
  const savedLegacy = inf.formulario_07a?.items || [];
  const savedFilas = inf.matriz_v2?.filas || [];
  const cabeceraCentro = String(
    inf.cabecera_centro
    || inf.formulario_07a?.centro
    || '',
  ).trim();

  const list = (items.length ? items : [{ requerimiento_id: cot.requerimiento_id, item_index: 0, cantidad: 1 }]);

  const filas = list.map((it, idx) => {
    const itemKey = `${it.requerimiento_id}-${it.item_index ?? idx}`;
    const prop = propItems.find((p) => p.item_key === itemKey) || propItems[idx] || {};
    const prevLegacy = savedLegacy.find((s) => s.item_key === itemKey) || {};
    const prevFila = savedFilas.find((s) => s.item_key === itemKey) || {};
    const meta = reqMeta.get(it.requerimiento_id) || {};
    const nroReq = it.requerimiento_codigo || it.codigo || meta.codigo || '';
    const codigoSiga = it.codigo_sigamef || it.codigo_siga || it.cmn || '';
    const cantidad = it.cantidad != null && it.cantidad !== '' ? it.cantidad : (tipoKey === 'SERVICIOS' ? 1 : 1);
    const um = it.unidad_medida || it.um || 'UND';
    const ped = pedidosCentro.byReq.get(it.requerimiento_id)
      || (codigoSiga ? pedidosCentro.byCodigo.get(String(codigoSiga)) : null)
      || {};
    const resolved = resolveValidationCentro({
      requerimientoCentro: meta.centro || meta.cmn || meta.area || '',
      pedidoCentro: ped.centro || '',
      cabeceraCentro,
      informeCentro: prevFila.automaticos?.centro || prevLegacy.centro || '',
      itemCentro: it.centro || it.cmn || prop.centro || '',
      centroCosto: meta.centro_costo || ped.centro_costo || prevFila.automaticos?.centro_costo || it.centro_costo || '',
    });
    if (resolved.warning) {
      // Advertencia técnica (sin rutas ni datos sensibles)
      console.warn('[validaciones] centro_no_resuelto', {
        cotizacion_id: cot.id,
        item_key: itemKey,
        tiene_requerimiento_id: !!it.requerimiento_id,
      });
    }
    const automaticos = {
      item: idx + 1,
      nro_req: nroReq,
      centro: resolved.centro,
      centro_costo: resolved.centro_costo,
      centro_fuente: resolved.fuente || '',
      pedido_sigamef: ped.pedido_sigamef || it.pedido_sigamef || '',
      codigo_siga: codigoSiga,
      descripcion: it.descripcion || it.denominacion || meta.denominacion || '',
      cantidad,
      um,
      cant_cotizaciones: cantCot,
      razon_social: cot.razon_social || '',
      marca: prevFila.automaticos?.marca ?? prevLegacy.marca ?? prop.marca ?? '',
      procedencia: prevFila.automaticos?.procedencia ?? prevLegacy.procedencia ?? prop.pais ?? prop.procedencia ?? '',
    };
    const evaluacion = prevFila.evaluacion
      || legacyItemToEvaluacion(prevLegacy, tipoKey)
      || {};
    return {
      cotizacion_id: cot.id,
      proveedor_id: cot.proveedor_id,
      requerimiento_id: it.requerimiento_id || null,
      requerimiento_codigo: nroReq,
      item_key: itemKey,
      tipo: tipoKey,
      automaticos,
      evaluacion: {
        ...emptyEvaluacion(tipoKey),
        ...evaluacion,
      },
      resultado: evaluacion.resultado || '',
      observaciones: evaluacion.observaciones || '',
    };
  });

  // Items legacy (compat RC7.7)
  const legacyItems = filasV2ToLegacyItems(filas, tipoKey).map((it, idx) => {
    const f = filas[idx];
    return {
      ...it,
      marca: f.automaticos.marca,
      procedencia: f.automaticos.procedencia,
      centro: f.automaticos.centro,
      codigo_sigamef: f.automaticos.codigo_siga,
    };
  });

  return {
    tipoKey,
    legacyItems,
    matriz_v2: {
      version: 2,
      tipo: tipoKey,
      cotizacion_id: cot.id,
      proveedor_id: cot.proveedor_id,
      solicitud_id: cot.solicitud_id,
      filas,
    },
  };
}

function emptyEvaluacion(tipoKey) {
  if (tipoKey === 'SERVICIOS') {
    return {
      plazo_ejecucion: '',
      formacion_academica: '',
      capacitacion_personal: '',
      experiencia_personal: '',
      experiencia_facturacion: '',
      canal_autorizado: '',
      resultado: '',
      observaciones: '',
    };
  }
  return {
    inserto: '',
    certificado: '',
    obs_specs: '',
    acredita_doc: '',
    vigencia_minima: '',
    plazos_entrega: '',
    resultado: '',
    observaciones: '',
  };
}

async function buildItemsFormulario07a(cot) {
  const built = await buildMatrizValidacion(cot);
  return built.legacyItems;
}

export async function derivarValidacionCotizacion(cotizacionId, body, usuarioOperador) {
  const {
    submodulo,
    submodulo_label,
    responsable_id,
    responsable_nombre,
    observacion,
  } = body || {};
  if (!submodulo || !responsable_id || !responsable_nombre) {
    throw new Error('Submódulo y responsable son obligatorios');
  }
  const cot = await loadCotizacionFull(cotizacionId);
  if (String(cot.estado) !== 'COTIZACION_PRESENTADA') throw new Error('La cotización no está presentada');
  const estadoActual = String(cot.validacion_estado || '').toUpperCase();
  const esReapertura = ['OBSERVADO', 'NO_APTO', 'APTO'].includes(estadoActual);
  const obsTextoPre = String(observacion || body?.observacion_retorno || '').trim();

  // Idempotencia: ya reabierto / en AU → no duplicar historial ni movimiento
  if (['DERIVADA', 'EN_PROCESO'].includes(estadoActual)) {
    return {
      ...mapCotizacionRow({
        ...cot,
        ruc: cot.ruc,
        razon_social: cot.razon_social,
        solicitud_codigo: cot.solicitud_codigo,
        denominacion: cot.denominacion,
        objeto: cot.objeto,
      }),
      idempotente: true,
      ya_en_validacion: true,
      ok: true,
    };
  }

  if (esReapertura && !obsTextoPre) {
    throw new Error('La observación es obligatoria para devolver la validación al Área Usuaria');
  }
  if (estadoActual && !['', 'PENDIENTE', 'OBSERVADO', 'NO_APTO', 'APTO'].includes(estadoActual)) {
    throw new Error('La cotización ya fue derivada o validada');
  }
  const documentos = buildManifiestoCotizacionTecnica(cot);
  const sub = SUBMODULOS_VALIDACION.find((s) => s.code === submodulo) || { code: submodulo, label: submodulo_label || submodulo };
  const prevInf = parseInforme(cot);
  const obsTexto = obsTextoPre;
  const informe = {
    ...prevInf,
    // Conservar matriz/formulario previos al reabrir; limpiar solo salida.
    derivacion_salida: null,
    enviado_at: null,
    enviado_por: null,
    derivacion: {
      submodulo: sub.code,
      submodulo_label: sub.label,
      responsable_id: parseInt(responsable_id, 10),
      responsable_nombre,
      documentos_tecnicos: documentos,
      derivado_por: usuarioOperador,
      derivado_at: new Date().toISOString(),
      reapertura: esReapertura,
    },
    ...(esReapertura && obsTexto ? {
      observacion_retorno: {
        texto: obsTexto,
        usuario: usuarioOperador,
        fecha: new Date().toISOString(),
        estado_anterior: estadoActual,
        estado_nuevo: 'DERIVADA',
      },
    } : (esReapertura ? {} : { observacion_retorno: null })),
  };
  const histEntry = {
    tipo: esReapertura ? 'validacion_reapertura' : 'derivacion_validacion',
    submodulo: sub.code,
    responsable: responsable_nombre,
    usuario: usuarioOperador,
    observacion: obsTexto || undefined,
    estado_anterior: estadoActual || 'PENDIENTE',
    estado_nuevo: 'DERIVADA',
    fecha: new Date().toISOString(),
  };
  const estadosPermitidos = esReapertura
    ? ['OBSERVADO', 'NO_APTO', 'APTO']
    : ['', 'PENDIENTE'];
  const { rows } = await query(`
    UPDATE cotizaciones_proveedor SET
      validacion_estado = 'DERIVADA',
      validacion_responsable = $2,
      validacion_informe = $3::jsonb,
      historial = historial || $4::jsonb,
      updated_at = NOW()
    WHERE id = $1
      AND COALESCE(UPPER(TRIM(validacion_estado)), '') = ANY($5::text[])
    RETURNING *
  `, [
    cotizacionId,
    responsable_nombre,
    JSON.stringify(informe),
    JSON.stringify([histEntry]),
    estadosPermitidos.map((e) => String(e).toUpperCase()),
  ]);

  // Condición de carrera / doble clic: otro proceso ya dejó el expediente en AU
  if (!rows.length) {
    const again = await loadCotizacionFull(cotizacionId);
    const est = String(again.validacion_estado || '').toUpperCase();
    if (['DERIVADA', 'EN_PROCESO'].includes(est)) {
      return {
        ...mapCotizacionRow({
          ...again,
          ruc: again.ruc,
          razon_social: again.razon_social,
          solicitud_codigo: again.solicitud_codigo,
          denominacion: again.denominacion,
          objeto: again.objeto,
        }),
        idempotente: true,
        ya_en_validacion: true,
        ok: true,
      };
    }
    throw new Error('No se pudo derivar/devolver la validación (estado no permitido)');
  }

  const updated = rows[0];
  await registrarTrazaPortal({
    solicitud_id: updated.solicitud_id,
    proveedor_id: updated.proveedor_id,
    requerimiento_id: updated.requerimiento_id,
    evento: esReapertura ? 'VALIDACION_DEVUELTA_AU' : 'COTIZACION_ENVIADA_VALIDACION_AU',
    detalle: esReapertura
      ? `Validación observada/devuelta a AU — ${responsable_nombre}${obsTexto ? `: ${obsTexto.slice(0, 160)}` : ''}`
      : `Cotización enviada a validación AU — ${sub.label} → ${responsable_nombre}`,
    usuario: usuarioOperador,
  });

  await syncRequerimientosSolicitudWorkflow(updated.solicitud_id, {
    etapaDestino: 'VALIDACION_USUARIO',
    usuario: usuarioOperador,
    observacion: esReapertura
      ? (obsTexto || `Validación devuelta a Área Usuaria — ${responsable_nombre}`)
      : `Cotización enviada a validación AU — ${responsable_nombre}`,
    etapaEjecutor: 'RECEPCION_COTIZACIONES',
    responsable: responsable_nombre,
  });

  return mapCotizacionRow({
    ...updated,
    ruc: cot.ruc,
    razon_social: cot.razon_social,
    solicitud_codigo: cot.solicitud_codigo,
    denominacion: cot.denominacion,
    objeto: cot.objeto,
  });
}

/**
 * Analista (Recepción/Invitaciones) observa y devuelve la validación al Área Usuaria.
 * Reutiliza el estado oficial DERIVADA (editable) sin crear estados nuevos.
 */
export async function devolverValidacionAAreaUsuaria(cotizacionId, body, usuarioOperador) {
  const {
    observacion,
    responsable_id,
    responsable_nombre,
    submodulo,
    submodulo_label,
  } = body || {};
  const obs = String(observacion || '').trim();
  if (!obs) throw new Error('La observación es obligatoria para devolver la validación');

  const cot = await loadCotizacionFull(cotizacionId);
  const estadoActual = String(cot.validacion_estado || '').toUpperCase();
  if (!['OBSERVADO', 'NO_APTO', 'APTO'].includes(estadoActual)) {
    throw new Error('Solo se puede devolver una validación ya remitida (APTO, NO_APTO u OBSERVADO)');
  }
  // APTO solo se reabre con observación explícita del analista (flujo de corrección).
  const prevInf = parseInforme(cot);
  const respNombre = String(responsable_nombre || cot.validacion_responsable || prevInf.derivacion?.responsable_nombre || '').trim();
  const respId = parseInt(responsable_id || prevInf.derivacion?.responsable_id, 10);
  if (!respNombre || !Number.isFinite(respId)) {
    throw new Error('No hay responsable de Área Usuaria para reabrir la validación');
  }

  return derivarValidacionCotizacion(cotizacionId, {
    submodulo: submodulo || prevInf.derivacion?.submodulo || 'REGISTRO_REQUERIMIENTO',
    submodulo_label: submodulo_label || prevInf.derivacion?.submodulo_label,
    responsable_id: respId,
    responsable_nombre: respNombre,
    observacion: obs,
  }, usuarioOperador);
}

export async function getValidacionTrabajoDetalle(cotizacionId, usuario, userId, opts = {}) {
  const cot = await loadCotizacionFull(cotizacionId);
  const esAdmin = !!opts.esAdmin;
  const estado = String(cot.validacion_estado || '');
  if (!['DERIVADA', 'EN_PROCESO', 'APTO', 'NO_APTO', 'OBSERVADO'].includes(estado)) {
    throw new Error('La cotización no tiene validación derivada');
  }
  const perm = canUserValidateExpediente(cot, usuario, userId, { esAdmin, usuarioNombre: usuario });
  if (!perm.puedeVer) {
    throw new Error(perm.sinAsignacion ? 'Pendiente de asignación de responsable' : 'No tiene asignada esta validación');
  }
  const inf = parseInforme(cot);
  const built = await buildMatrizValidacion(cot);
  const items = built.legacyItems;
  const requerimientos = await loadRequerimientosSolicitud(cot.solicitud_id);
  const reqIdsVinculados = new Set(requerimientos.map((r) => r.id));
  if (cot.requerimiento_id) reqIdsVinculados.add(cot.requerimiento_id);
  const documentos_requerimiento = (await loadDocumentosRequerimientoSolicitud(cot.solicitud_id))
    .filter((d) => !d.requerimiento_id || reqIdsVinculados.has(d.requerimiento_id))
    .map((d) => ({
      ...d,
      tipo: d.grupo || 'Documento del requerimiento',
      fecha: d.created_at || null,
      estado: 'Disponible',
    }));
  const areaUsuaria = requerimientos.map((r) => r.area).filter(Boolean).join(', ')
    || inf.derivacion?.submodulo_label || '';
  const reqCodes = formatRequerimientosCodes(requerimientos, parseJson(cot.detalle_items, []));
  const docsTecnicos = enrichDocsCotizacion(
    inf.derivacion?.documentos_tecnicos || buildManifiestoCotizacionTecnica(cot),
    cot,
  );
  const proveedoresSolicitud = await listarProveedoresSolicitudValidacion(
    cot.solicitud_id,
    usuario,
    userId,
    { esAdmin },
  );
  const yaDerivado = ['APTO', 'NO_APTO', 'OBSERVADO'].includes(estado);
  const destinoActual = yaDerivado
    ? resolverDestinoSalidaValidacion(estado)
    : null;
  const fechaAuto = new Date().toLocaleDateString('es-PE');
  const calc = calcularResultadoCotizacion(built.tipoKey, built.matriz_v2.filas);
  const centrosConsolidados = consolidateCentros(
    (built.matriz_v2.filas || []).map((f) => f.automaticos?.centro),
  );
  return {
    ...mapCotizacionRow(cot),
    requerimientos: reqCodes || mapCotizacionRow(cot).requerimientos || '',
    tipo_contratacion: normalizeTipoContratacion(cot.solicitud_tipo),
    tipo_formato: built.tipoKey,
    area_usuaria: areaUsuaria,
    centro: centrosConsolidados.display,
    centro_multiple: centrosConsolidados.multiple,
    centro_label: centrosConsolidados.label,
    descripcion: cot.denominacion || cot.objeto || '',
    requerimientos_detalle: requerimientos.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      denominacion: r.denominacion,
      area: r.area,
      cmn: r.cmn,
      centro: r.centro || r.cmn || r.area || '',
      centro_costo: r.centro_costo || '',
    })),
    observacion_retorno: inf.observacion_retorno || null,
    documentos_tecnicos: docsTecnicos,
    documentos_requerimiento,
    documentos_cotizacion: docsTecnicos,
    propuesta_tecnica: resumenPropuestaTecnica(cot),
    excluye_economica: true,
    proveedores_solicitud: proveedoresSolicitud,
    matriz_v2: built.matriz_v2,
    formulario_07a: {
      items,
      lugar: inf.formulario_07a?.lugar || 'Chorrillos',
      fecha: inf.formulario_07a?.fecha || fechaAuto,
      profesional: inf.formulario_07a?.profesional || responsableNombreDeCot(cot) || usuario,
      producto_adquisicion: cot.denominacion || cot.objeto || '',
      resultado_global: inf.formulario_07a?.resultado_global || calc.resultado_global || '',
      observacion_global: inf.formulario_07a?.observacion_global || '',
      sustento: inf.formulario_07a?.sustento || '',
      cumple: inf.formulario_07a?.cumple || calc.cumple || '',
    },
    pdf_firmado: inf.pdf_firmado
      ? {
          nombre: inf.pdf_firmado.nombre,
          mime_type: inf.pdf_firmado.mime_type,
          base64: inf.pdf_firmado.base64,
          uploaded_at: inf.pdf_firmado.uploaded_at,
          tamaño_bytes: inf.pdf_firmado.tamaño_bytes || bytesFromBase64(inf.pdf_firmado.base64),
        }
      : null,
    solo_tecnica: true,
    puede_derivar: perm.puedeValidar && ['DERIVADA', 'EN_PROCESO'].includes(estado) && !yaDerivado,
    puede_editar: perm.puedeValidar && !yaDerivado,
    ya_derivado: yaDerivado,
    destino_derivacion: destinoActual?.code || DESTINOS_SALIDA_VALIDACION.APTO.code,
    destino_salida: destinoActual,
    destinos_salida: DESTINOS_SALIDA_VALIDACION,
    derivacion_salida: inf.derivacion_salida || null,
  };
}

export async function guardarValidacionParcial(cotizacionId, body, usuario, userId, opts = {}) {
  const { formulario_07a, pdf_firmado, quitar_pdf, matriz_v2 } = body || {};
  const cot = await loadCotizacionFull(cotizacionId);
  const esAdmin = !!opts.esAdmin;
  const estado = String(cot.validacion_estado || '');
  if (!['DERIVADA', 'EN_PROCESO'].includes(estado)) {
    throw new Error('La validación ya fue registrada o derivada');
  }
  if (!matchResponsableParaEdicion(cot, usuario, userId, { esAdmin, usuarioNombre: usuario })) {
    throw new Error('No tiene permiso para editar esta validación');
  }

  const inf = parseInforme(cot);
  const tipoKey = normalizeTipoValidacion(cot.solicitud_tipo)
    || matriz_v2?.tipo
    || inf.matriz_v2?.tipo
    || 'BIENES';

  let formFromMatriz = formulario_07a;
  let matrizPersist = null;
  if (matriz_v2?.filas) {
    const calc = calcularResultadoCotizacion(tipoKey, matriz_v2.filas);
    formFromMatriz = {
      ...(formulario_07a || {}),
      items: filasV2ToLegacyItems(matriz_v2.filas, tipoKey),
      resultado_global: formulario_07a?.resultado_global || calc.resultado_global,
      cumple: formulario_07a?.cumple || calc.cumple,
    };
    matrizPersist = {
      version: 2,
      tipo: tipoKey,
      cotizacion_id: cot.id,
      proveedor_id: cot.proveedor_id,
      solicitud_id: cot.solicitud_id,
      filas: matriz_v2.filas,
      updated_at: new Date().toISOString(),
      updated_by: usuario,
    };
  }

  const formMerged = {
    ...inf.formulario_07a,
    ...formFromMatriz,
    // Fecha/responsable de trazabilidad (no campos manuales en UI)
    fecha: new Date().toLocaleDateString('es-PE'),
    profesional: formFromMatriz?.profesional
      || inf.formulario_07a?.profesional
      || responsableNombreDeCot(cot)
      || usuario,
  };
  const informe = {
    ...inf,
    formulario_07a: formMerged,
    ...(matrizPersist ? { matriz_v2: matrizPersist } : {}),
  };
  if (quitar_pdf) {
    informe.pdf_firmado = null;
  } else if (pdf_firmado?.base64) {
    informe.pdf_firmado = {
      nombre: pdf_firmado.nombre || 'Validacion_Anexo_07A.pdf',
      mime_type: pdf_firmado.mime_type || 'application/pdf',
      base64: pdf_firmado.base64,
      tamaño_bytes: pdf_firmado.tamaño_bytes || bytesFromBase64(pdf_firmado.base64),
      uploaded_at: new Date().toISOString(),
      uploaded_by: usuario,
    };
  }

  const historialExtra = [{ tipo: 'validacion_borrador', usuario, fecha: new Date().toISOString() }];
  if (pdf_firmado?.base64 && !quitar_pdf) {
    historialExtra.push({ tipo: 'validacion_doc_adjunto', usuario, fecha: new Date().toISOString() });
    await registrarTrazaPortal({
      solicitud_id: cot.solicitud_id,
      proveedor_id: cot.proveedor_id,
      requerimiento_id: cot.requerimiento_id,
      evento: 'VALIDACION_DOC_ADJUNTADO',
      detalle: 'Documento de validación adjuntado',
      usuario,
    });
  }
  if (inf.observacion_retorno?.texto) {
    historialExtra.push({
      tipo: 'validacion_subsanacion_borrador',
      usuario,
      fecha: new Date().toISOString(),
      observacion_retorno: inf.observacion_retorno.texto,
    });
  }

  // Merge parcial: no reemplazar matriz/form con null/undefined omitidos
  if (!matrizPersist && inf.matriz_v2) {
    informe.matriz_v2 = inf.matriz_v2;
  }
  if (!formFromMatriz && !formulario_07a) {
    informe.formulario_07a = inf.formulario_07a;
  }

  const { rows } = await query(`
    UPDATE cotizaciones_proveedor SET
      validacion_estado = 'EN_PROCESO',
      validacion_informe = $2::jsonb,
      historial = historial || $3::jsonb,
      updated_at = NOW()
    WHERE id = $1
      AND validacion_estado IN ('DERIVADA', 'EN_PROCESO')
    RETURNING *
  `, [cotizacionId, JSON.stringify(informe), JSON.stringify(historialExtra)]);
  if (!rows.length) throw new Error('No se pudo guardar: la validación no está editable');

  return mapCotizacionRow({ ...rows[0], ruc: cot.ruc, razon_social: cot.razon_social, solicitud_codigo: cot.solicitud_codigo, denominacion: cot.denominacion, objeto: cot.objeto });
}

function mapResultadoFormulario(resultado, cumple) {
  const c = String(cumple || '').toLowerCase();
  if (c.includes('no cumple') || c === 'no') return 'NO_APTO';
  if (c === 'cumple' || c === 'sí' || c === 'si') return 'APTO';
  const r = String(resultado || '').toLowerCase();
  if (r.includes('no válid') || r.includes('no valid')) return 'NO_APTO';
  if (r.includes('válid') || r.includes('valid')) return 'APTO';
  return 'OBSERVADO';
}

export async function enviarValidacionUsuario(cotizacionId, body, usuario, userId, opts = {}) {
  const {
    formulario_07a: formIn,
    pdf_firmado,
    resultado,
    observacion,
    destino_submodulo,
    responsable_destino_id,
    responsable_destino_nombre,
    observacion_derivacion,
    matriz_v2,
  } = body || {};

  const cot = await loadCotizacionFull(cotizacionId);
  const esAdmin = !!opts.esAdmin;
  const estadoActual = String(cot.validacion_estado || '').toUpperCase();
  const tipoKey = normalizeTipoValidacion(cot.solicitud_tipo)
    || matriz_v2?.tipo
    || 'BIENES';

  // Idempotencia: si ya fue derivado, no repetir evento ni cambiar responsable.
  if (['APTO', 'NO_APTO', 'OBSERVADO'].includes(estadoActual)) {
    const row = mapCotizacionRow({
      ...cot,
      ruc: cot.ruc,
      razon_social: cot.razon_social,
      solicitud_codigo: cot.solicitud_codigo,
      denominacion: cot.denominacion,
      objeto: cot.objeto,
    });
    return {
      ...row,
      ya_derivado: true,
      idempotente: true,
      destino_salida: resolverDestinoSalidaValidacion(estadoActual),
      ok: true,
    };
  }

  if (!matchResponsableParaEdicion(cot, usuario, userId, { esAdmin, usuarioNombre: usuario })) {
    throw new Error('No tiene permiso para derivar esta validación');
  }

  let formulario_07a = formIn;
  let matrizPersist = null;
  if (matriz_v2?.filas?.length) {
    const check = validarMatrizCompleta(tipoKey, matriz_v2.filas);
    if (!check.ok) throw new Error(check.errores.join(' '));
    const calc = calcularResultadoCotizacion(tipoKey, matriz_v2.filas);
    formulario_07a = {
      ...(formIn || {}),
      items: filasV2ToLegacyItems(matriz_v2.filas, tipoKey),
      resultado_global: formIn?.resultado_global || calc.resultado_global,
      cumple: formIn?.cumple || calc.cumple,
    };
    matrizPersist = {
      version: 2,
      tipo: tipoKey,
      cotizacion_id: cot.id,
      proveedor_id: cot.proveedor_id,
      solicitud_id: cot.solicitud_id,
      filas: matriz_v2.filas,
      enviado_at: new Date().toISOString(),
    };
  }

  if (!formulario_07a?.items?.length) throw new Error('Complete el formulario de validación');
  if (!pdf_firmado?.base64) throw new Error('Adjunte el PDF firmado de la validación');

  const estadoVal = mapResultadoFormulario(
    resultado || formulario_07a.resultado_global,
    formulario_07a.cumple,
  );
  const destOficial = resolverDestinoSalidaValidacion(estadoVal);
  const destinoCode = String(destino_submodulo || destOficial.code).toUpperCase();
  if (destinoCode !== destOficial.code) {
    throw new Error(`Destino no permitido. El Workflow determina: ${destOficial.label}`);
  }
  const respDestId = parseInt(responsable_destino_id, 10);
  const respDestNombre = String(responsable_destino_nombre || '').trim();
  if (!Number.isFinite(respDestId) || !respDestNombre) {
    throw new Error('Seleccione el usuario responsable del submódulo destino');
  }

  const obsMatriz = (matriz_v2?.filas || matrizPersist?.filas || [])
    .map((f) => String(f?.evaluacion?.observaciones || f?.observaciones || '').trim())
    .filter(Boolean)
    .join(' | ');
  const obs = String(
    observacion
    || formulario_07a.observacion_global
    || obsMatriz
    || formulario_07a.resultado_global
    || '',
  ).trim();
  if (!obs) throw new Error('Las observaciones de la validación son obligatorias');
  if (String(estadoVal) !== 'APTO' && !obsMatriz && !String(formulario_07a.observacion_global || '').trim()) {
    // Resultado negativo: exige observación en la matriz (columna OBSERVACIONES)
    const tieneNegativa = (matriz_v2?.filas || []).some((f) => {
      const r = String(f?.evaluacion?.resultado || f?.resultado || '');
      return /NO\s*V[ÁA]LID/i.test(r);
    });
    if (tieneNegativa) {
      throw new Error('Indique observaciones en la matriz cuando el resultado sea negativo');
    }
  }

  const fechaAuto = new Date().toLocaleDateString('es-PE');
  const formPersist = {
    ...formulario_07a,
    fecha: fechaAuto,
    profesional: formulario_07a.profesional || responsableNombreDeCot(cot) || usuario,
  };

  const prevInfEnvio = parseInforme(cot);
  const esSubsanacion = !!prevInfEnvio.observacion_retorno?.texto;
  const informe = {
    ...prevInfEnvio,
    formulario_07a: formPersist,
    ...(matrizPersist ? { matriz_v2: matrizPersist } : {}),
    pdf_firmado: {
      nombre: pdf_firmado.nombre || 'Validacion_formato.pdf',
      mime_type: pdf_firmado.mime_type || 'application/pdf',
      base64: pdf_firmado.base64,
      tamaño_bytes: pdf_firmado.tamaño_bytes || bytesFromBase64(pdf_firmado.base64),
      uploaded_at: new Date().toISOString(),
      uploaded_by: usuario,
    },
    derivacion_salida: {
      submodulo: destOficial.code,
      submodulo_label: destOficial.label,
      responsable_id: respDestId,
      responsable_nombre: respDestNombre,
      observacion: String(observacion_derivacion || '').trim(),
      resultado: estadoVal,
      derivado_por: usuario,
      derivado_por_id: userId ? parseInt(userId, 10) : null,
      derivado_at: new Date().toISOString(),
    },
    enviado_at: new Date().toISOString(),
    enviado_por: usuario,
    // Conservar última observación del analista para trazabilidad; marcar cierre
    observacion_retorno: prevInfEnvio.observacion_retorno
      ? {
          ...prevInfEnvio.observacion_retorno,
          subsanada: true,
          subsanada_por: usuario,
          subsanada_at: new Date().toISOString(),
        }
      : null,
  };

  const histEnvio = [{
    tipo: esSubsanacion ? 'validacion_subsanada_enviada' : 'validacion_enviada',
    resultado: estadoVal,
    destino: destOficial.code,
    responsable_destino: respDestNombre,
    usuario,
    fecha: new Date().toISOString(),
    observacion_analista: prevInfEnvio.observacion_retorno?.texto || undefined,
  }];

  const { rows } = await query(`
    UPDATE cotizaciones_proveedor SET
      validacion_estado = $2,
      validacion_observacion = $3,
      validacion_informe = $4::jsonb,
      historial = historial || $5::jsonb,
      updated_at = NOW()
    WHERE id = $1
      AND validacion_estado IN ('DERIVADA', 'EN_PROCESO')
    RETURNING *
  `, [
    cotizacionId,
    estadoVal,
    obs,
    JSON.stringify(informe),
    JSON.stringify(histEnvio),
  ]);

  // Condición de carrera / doble click: otro proceso ya derivó.
  if (!rows.length) {
    const again = await loadCotizacionFull(cotizacionId);
    const est = String(again.validacion_estado || '').toUpperCase();
    if (['APTO', 'NO_APTO', 'OBSERVADO'].includes(est)) {
      return {
        ...mapCotizacionRow({
          ...again,
          ruc: again.ruc,
          razon_social: again.razon_social,
          solicitud_codigo: again.solicitud_codigo,
          denominacion: again.denominacion,
          objeto: again.objeto,
        }),
        ya_derivado: true,
        idempotente: true,
        destino_salida: resolverDestinoSalidaValidacion(est),
      };
    }
    throw new Error('No se pudo derivar el expediente (estado no editable)');
  }

  const updated = rows[0];

  await registrarTrazaPortal({
    solicitud_id: updated.solicitud_id,
    proveedor_id: updated.proveedor_id,
    requerimiento_id: updated.requerimiento_id,
    evento: 'VALIDACION_TECNICA_REGISTRADA',
    detalle: 'Validación técnica registrada',
    usuario,
  });

  await registrarTrazaPortal({
    solicitud_id: updated.solicitud_id,
    proveedor_id: updated.proveedor_id,
    requerimiento_id: updated.requerimiento_id,
    evento: estadoVal === 'APTO' ? 'VALIDACION_APROBADA' : 'VALIDACION_REGISTRADA',
    detalle: obs.slice(0, 200),
    usuario,
  });

  if (estadoVal === 'APTO') {
    await query(`
      UPDATE solicitudes_cotizacion SET estado = 'EN_CUADRO_COMPARATIVO', updated_at = NOW()
      WHERE id = $1 AND estado NOT IN ('CERRADA')
    `, [updated.solicitud_id]);
    await syncRequerimientosSolicitudWorkflow(updated.solicitud_id, {
      etapaDestino: destOficial.code,
      usuario,
      observacion: observacion_derivacion || 'Validación técnica aprobada por área usuaria',
      etapaEjecutor: 'VALIDACION_USUARIO',
      responsable: respDestNombre,
    });
  } else {
    await syncRequerimientosSolicitudWorkflow(updated.solicitud_id, {
      etapaDestino: destOficial.code,
      usuario,
      observacion: observacion_derivacion
        || 'Validación con observaciones — retorno a Recepción de Cotizaciones',
      etapaEjecutor: 'VALIDACION_USUARIO',
      responsable: respDestNombre,
    });
  }

  await registrarTrazaPortal({
    solicitud_id: updated.solicitud_id,
    proveedor_id: updated.proveedor_id,
    requerimiento_id: updated.requerimiento_id,
    evento: 'VALIDACION_EXPEDIENTE_DERIVADO',
    detalle: `Expediente derivado desde Validación → ${destOficial.label} (${respDestNombre})`,
    usuario,
  });

  const cotizacion = {
    ...mapCotizacionRow({
      ...updated,
      ruc: cot.ruc,
      razon_social: cot.razon_social,
      solicitud_codigo: cot.solicitud_codigo,
      denominacion: cot.denominacion,
      objeto: cot.objeto,
    }),
    ya_derivado: true,
    destino_salida: destOficial,
  };
  return {
    ...cotizacion,
    ok: true,
    estado: estadoVal,
    destino: destOficial,
    responsable: { id: respDestId, nombre: respDestNombre },
    workflow: { etapaDestino: destOficial.code, etapaEjecutor: 'VALIDACION_USUARIO' },
  };
}

/** listarCuadroComparativo movido a server/lib/cuadroComparativo.js (RC8.1). */

export async function resolverPdfValidacionFirmada(cotizacionId) {
  const cot = await loadCotizacionFull(cotizacionId);
  const inf = parseInforme(cot);
  const pdf = inf.pdf_firmado;
  if (!pdf?.base64) throw new Error('PDF de validación no encontrado');
  return {
    nombre_archivo: pdf.nombre || 'Validacion_Anexo_07A.pdf',
    mime_type: pdf.mime_type || 'application/pdf',
    contenido_base64: pdf.base64,
  };
}

/** Compatibilidad con bandeja anterior — pendientes de derivación */
export async function listarValidacionesBandeja() {
  return listarValidacionesPendientesDerivacion();
}
