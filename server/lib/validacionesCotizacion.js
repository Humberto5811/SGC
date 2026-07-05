// Validación técnica de cotizaciones — derivación CM y trabajo del área usuaria
import { query } from '../db.js';
import { registrarTrazaPortal } from './invitaciones.js';
import { normalizePermisos } from './permissionsCatalog.js';
import {
  buildManifiestoCotizacionTecnica,
  parseCotizacionAnexos,
} from './portalDocumentos.js';

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

function matchResponsable(cot, usuario, userId) {
  const inf = parseInforme(cot);
  const d = inf.derivacion || {};
  const id = parseInt(userId, 10);
  if (d.responsable_id && id && Number(d.responsable_id) === id) return true;
  const nombre = String(usuario || '').trim().toLowerCase();
  const resp = String(cot.validacion_responsable || d.responsable_nombre || '').trim().toLowerCase();
  if (!nombre || !resp) return false;
  return resp === nombre || resp.includes(nombre) || nombre.includes(resp);
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
  };
}

function estadoDisplayValidacion(validacionEstado, cotEstado) {
  const v = String(validacionEstado || '').toUpperCase();
  if (v === 'DERIVADA' || v === 'EN_PROCESO') return 'En validación AU';
  if (!v || v === 'PENDIENTE') return 'COTIZACION_PRESENTADA';
  return validacionEstado || cotEstado || '';
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
      return p.modulos.includes('CONTRATACIONES') && p.submodulos.includes(code);
    })
    .map(({ permisosNorm, ...rest }) => rest);
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
      AND cot.validacion_estado IN ('DERIVADA', 'EN_PROCESO')
    ORDER BY cot.updated_at DESC
  `);
  return rows.filter((r) => matchResponsable(r, usuario, userId)).map(mapCotizacionRow);
}

async function loadCotizacionFull(cotizacionId) {
  const { rows } = await query(`
    SELECT cot.*, p.ruc, p.razon_social, sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto, sc.detalle_items
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

async function buildItemsFormulario07a(cot) {
  const items = parseJson(cot.detalle_items, []);
  const propItems = parseJson(cot.propuesta_tecnica, {}).items || [];
  const { rows: countRows } = await query(`
    SELECT COUNT(*)::int AS total FROM cotizaciones_proveedor
    WHERE solicitud_id = $1 AND estado = 'COTIZACION_PRESENTADA'
  `, [cot.solicitud_id]);
  const cantCot = countRows[0]?.total || 1;
  const inf = parseInforme(cot);
  const saved = inf.formulario_07a?.items || [];

  return items.map((it, idx) => {
    const itemKey = `${it.requerimiento_id}-${it.item_index ?? idx}`;
    const prop = propItems.find((p) => p.item_key === itemKey) || propItems[idx] || {};
    const prev = saved.find((s) => s.item_key === itemKey) || {};
    return {
      item_key: itemKey,
      item: idx + 1,
      nro_req: it.requerimiento_codigo || it.codigo || '',
      codigo_sigamef: it.codigo_sigamef || it.cmn || '',
      descripcion: it.descripcion || it.denominacion || '',
      cantidad: it.cantidad ?? 1,
      um: it.unidad_medida || it.um || 'UND',
      cant_cotizaciones: cantCot,
      razon_social: cot.razon_social,
      marca: prev.marca ?? prop.marca ?? '',
      procedencia: prev.procedencia ?? prop.pais ?? '',
      inserto: prev.inserto ?? '',
      certificado: prev.certificado ?? '',
      obs_specs: prev.obs_specs ?? '',
      acredita_doc: prev.acredita_doc ?? '',
      vigencia_minima_val: prev.vigencia_minima_val ?? '',
      plazos_entrega_val: prev.plazos_entrega_val ?? '',
      resultado: prev.resultado ?? '',
      obs_validacion: prev.obs_validacion ?? '',
    };
  });
}

export async function derivarValidacionCotizacion(cotizacionId, body, usuarioOperador) {
  const { submodulo, submodulo_label, responsable_id, responsable_nombre } = body || {};
  if (!submodulo || !responsable_id || !responsable_nombre) {
    throw new Error('Submódulo y responsable son obligatorios');
  }
  const cot = await loadCotizacionFull(cotizacionId);
  if (String(cot.estado) !== 'COTIZACION_PRESENTADA') throw new Error('La cotización no está presentada');
  const estadoActual = String(cot.validacion_estado || '');
  if (estadoActual && !['', 'PENDIENTE'].includes(estadoActual)) {
    throw new Error('La cotización ya fue derivada o validada');
  }
  const documentos = buildManifiestoCotizacionTecnica(cot);
  const sub = SUBMODULOS_VALIDACION.find((s) => s.code === submodulo) || { code: submodulo, label: submodulo_label || submodulo };
  const informe = {
    ...parseInforme(cot),
    derivacion: {
      submodulo: sub.code,
      submodulo_label: sub.label,
      responsable_id: parseInt(responsable_id, 10),
      responsable_nombre,
      documentos_tecnicos: documentos,
      derivado_por: usuarioOperador,
      derivado_at: new Date().toISOString(),
    },
  };
  const { rows } = await query(`
    UPDATE cotizaciones_proveedor SET
      validacion_estado = 'DERIVADA',
      validacion_responsable = $2,
      validacion_informe = $3::jsonb,
      historial = historial || $4::jsonb,
      updated_at = NOW()
    WHERE id = $1 RETURNING *
  `, [
    cotizacionId,
    responsable_nombre,
    JSON.stringify(informe),
    JSON.stringify([{ tipo: 'derivacion_validacion', submodulo: sub.code, responsable: responsable_nombre, usuario: usuarioOperador, fecha: new Date().toISOString() }]),
  ]);
  const updated = rows[0];
  await registrarTrazaPortal({
    solicitud_id: updated.solicitud_id,
    proveedor_id: updated.proveedor_id,
    requerimiento_id: updated.requerimiento_id,
    evento: 'VALIDACION_DERIVADA',
    detalle: `${sub.label} → ${responsable_nombre}`,
    usuario: usuarioOperador,
  });
  return mapCotizacionRow({ ...updated, ruc: cot.ruc, razon_social: cot.razon_social, solicitud_codigo: cot.solicitud_codigo, denominacion: cot.denominacion, objeto: cot.objeto });
}

export async function getValidacionTrabajoDetalle(cotizacionId, usuario, userId, opts = {}) {
  const cot = await loadCotizacionFull(cotizacionId);
  const esAdmin = !!opts.esAdmin;
  const estado = String(cot.validacion_estado || '');
  if (!['DERIVADA', 'EN_PROCESO', 'APTO', 'NO_APTO', 'OBSERVADO'].includes(estado)) {
    throw new Error('La cotización no tiene validación derivada');
  }
  if (!esAdmin && !matchResponsable(cot, usuario, userId)) {
    throw new Error('No tiene asignada esta validación');
  }
  const inf = parseInforme(cot);
  const items = await buildItemsFormulario07a(cot);
  return {
    ...mapCotizacionRow(cot),
    documentos_tecnicos: inf.derivacion?.documentos_tecnicos || buildManifiestoCotizacionTecnica(cot),
    formulario_07a: {
      items,
      lugar: inf.formulario_07a?.lugar || 'Chorrillos',
      fecha: inf.formulario_07a?.fecha || new Date().toLocaleDateString('es-PE'),
      profesional: inf.formulario_07a?.profesional || usuario,
      producto_adquisicion: cot.denominacion || cot.objeto || '',
    },
    pdf_firmado: inf.pdf_firmado || null,
    solo_tecnica: true,
  };
}

function mapResultadoFormulario(resultado) {
  const r = String(resultado || '').toLowerCase();
  if (r.includes('no válid') || r.includes('no valid')) return 'NO_APTO';
  if (r.includes('válid') || r.includes('valid')) return 'APTO';
  return 'OBSERVADO';
}

export async function enviarValidacionUsuario(cotizacionId, body, usuario, userId, opts = {}) {
  const { formulario_07a, pdf_firmado, resultado, observacion } = body || {};
  if (!formulario_07a?.items?.length) throw new Error('Complete el formulario de validación');
  if (!pdf_firmado?.base64) throw new Error('Adjunte el PDF firmado de la validación');

  const cot = await loadCotizacionFull(cotizacionId);
  const esAdmin = !!opts.esAdmin;
  if (!esAdmin && !matchResponsable(cot, usuario, userId)) {
    throw new Error('No tiene asignada esta validación');
  }
  const estadoVal = mapResultadoFormulario(resultado || formulario_07a.resultado_global);
  const obs = String(observacion || formulario_07a.observacion_global || '').trim();
  if (!obs) throw new Error('Las observaciones de la validación son obligatorias');

  const informe = {
    ...parseInforme(cot),
    formulario_07a,
    pdf_firmado: {
      nombre: pdf_firmado.nombre || 'Validacion_Anexo_07A.pdf',
      mime_type: pdf_firmado.mime_type || 'application/pdf',
      base64: pdf_firmado.base64,
      uploaded_at: new Date().toISOString(),
      uploaded_by: usuario,
    },
    enviado_at: new Date().toISOString(),
    enviado_por: usuario,
  };

  const { rows } = await query(`
    UPDATE cotizaciones_proveedor SET
      validacion_estado = $2,
      validacion_observacion = $3,
      validacion_informe = $4::jsonb,
      historial = historial || $5::jsonb,
      updated_at = NOW()
    WHERE id = $1 RETURNING *
  `, [
    cotizacionId,
    estadoVal,
    obs,
    JSON.stringify(informe),
    JSON.stringify([{ tipo: 'validacion_enviada', resultado: estadoVal, usuario, fecha: new Date().toISOString() }]),
  ]);
  const updated = rows[0];

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
  }

  return mapCotizacionRow({ ...updated, ruc: cot.ruc, razon_social: cot.razon_social, solicitud_codigo: cot.solicitud_codigo, denominacion: cot.denominacion, objeto: cot.objeto });
}

export async function listarCuadroComparativo() {
  const { rows } = await query(`
    SELECT cot.*, p.ruc, p.razon_social, sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto, sc.estado AS solicitud_estado
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
      ...mapCotizacionRow(r),
      solicitud_estado: r.solicitud_estado,
      tiene_pdf_validacion: !!inf.pdf_firmado?.base64,
      resultado_validacion: inf.formulario_07a?.resultado_global || 'APTO',
      validado_por: inf.formulario_07a?.profesional || r.validacion_responsable,
      validado_at: inf.enviado_at || r.updated_at,
    };
  });
}

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
