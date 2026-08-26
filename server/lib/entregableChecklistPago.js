/**
 * RC8.15.6G-8 — Checklist documental de expediente de pago.
 */
import { query, getClient } from '../db.js';
import { getExpedienteOrdenCompleto } from './ordenesContratacion.js';
import {
  calcularProgresoChecklist,
  filasAnalistaBaseFaltantes,
  mapFilaAnalistaChecklist,
  resolverFilasSistemaChecklist,
  TIPO_CHECKLIST_OTRO,
  TIPOS_ANALISTA_CHECKLIST,
} from '../../shared/entregableChecklistPago.js';
import { TIPO_ENTREGABLE } from '../../shared/entregableDocumentosTipos.js';
import {
  eliminarPagoDocumentoFisico,
  leerPagoDocumentoBytes,
  persistirPagoDocumento,
  validatePagoDocumentoArchivo,
} from './entregablePagoDocumentos.js';
import { obtenerEstadoResponsableEntregable } from './entregableEstadoPersistido.js';
import {
  listarConformidadEntregable,
  listarDocumentosTipificadosEntregable,
  puedeAccederTrazabilidadEntregable,
} from './entregablesServicios.js';
import { resolveFunctionalProfiles, PERFILES_FUNCIONALES } from '../utils/userRoleCatalog.js';
import { ETAPAS } from '../../shared/workflow/etapas.js';

function httpError(message, status = 400, code = 'CHECKLIST_PAGO_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function esAdmin(userCtx) {
  return String(userCtx?.rol || '').toLowerCase() === 'admin';
}

async function getEntregableBasico(ordenEntregaId) {
  const eid = parseInt(ordenEntregaId, 10);
  const { rows } = await query(`
    SELECT oe.*, oc.requerimiento_id, oc.tipo_orden, oc.numero_orden, oc.anio_orden,
      oc.tipo_contratacion, oc.estado AS orden_estado,
      r.codigo AS requerimiento_codigo,
      p.ruc AS proveedor_ruc, p.razon_social AS proveedor_razon_social
    FROM orden_entregas oe
    JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    LEFT JOIN proveedores p ON p.id = oc.proveedor_id
    WHERE oe.id = $1
  `, [eid]);
  if (!rows.length) throw httpError('Entregable no encontrado', 404, 'ENTREGABLE_NO_ENCONTRADO');
  return rows[0];
}

async function assertAccesoChecklistEntregable(ordenEntregaId, userCtx) {
  const entrega = await getEntregableBasico(ordenEntregaId);
  const estado = await obtenerEstadoResponsableEntregable(ordenEntregaId);
  const { rows: routingRows } = await query(`
    SELECT 1 FROM entregable_observaciones eo
    JOIN workflow_observaciones wo ON wo.id = eo.workflow_observacion_id
    WHERE eo.orden_entrega_id = $1
      AND (wo.usuario_origen_id = $2 OR wo.usuario_destino_id = $2)
    LIMIT 1
  `, [Number(ordenEntregaId), Number(userCtx?.id) || 0]);
  if (!puedeAccederTrazabilidadEntregable(userCtx, estado, entrega, {
    accesoRoutingObservacion: routingRows.length > 0,
  })) {
    throw httpError('No autorizado', 403, 'CHECKLIST_PAGO_NO_AUTORIZADO');
  }
  return { entrega, estado };
}

const TIPOS_CHECKLIST_ANALISTA = new Set([
  ...TIPOS_ANALISTA_CHECKLIST.map((t) => t.codigo),
  TIPO_CHECKLIST_OTRO,
]);

function puedeConsultarChecklistPago(userCtx, estado) {
  if (esAdmin(userCtx)) return true;
  return Number(userCtx?.id) === Number(estado?.responsableUsuarioId)
    && estado?.responsableTipo === 'PERSONA';
}

function puedeGestionarChecklistAnalista(userCtx, estado) {
  if (esAdmin(userCtx)) return true;
  const perfiles = resolveFunctionalProfiles(userCtx);
  return Number(userCtx?.id) === Number(estado?.responsableUsuarioId)
    && estado?.responsableTipo === 'PERSONA'
    && perfiles.includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES)
    && String(estado?.etapaCodigo || '').toUpperCase() === ETAPAS.PREPARACION_EXPEDIENTE_PAGO;
}

async function assertAccesoChecklistConsulta(ordenEntregaId, userCtx) {
  const { entrega, estado } = await assertAccesoChecklistEntregable(ordenEntregaId, userCtx);
  if (!puedeConsultarChecklistPago(userCtx, estado)) {
    throw httpError('No autorizado para consultar el checklist de pago', 403, 'CHECKLIST_PAGO_NO_AUTORIZADO');
  }
  return { entrega, estado };
}

async function assertAccesoChecklistGestion(ordenEntregaId, userCtx) {
  const { entrega, estado } = await assertAccesoChecklistConsulta(ordenEntregaId, userCtx);
  if (!puedeGestionarChecklistAnalista(userCtx, estado)) {
    throw httpError('No autorizado para gestionar documentos del checklist', 403, 'CHECKLIST_PAGO_GESTION_DENEGADA');
  }
  return { entrega, estado };
}

async function listarDocumentosChecklistAnalista(ordenEntregaId, client = null) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(`
    SELECT * FROM entregable_pago_documentos
    WHERE orden_entrega_id = $1
      AND tipo_documento = ANY($2::varchar[])
    ORDER BY tipo_documento, id DESC
  `, [Number(ordenEntregaId), [...TIPOS_CHECKLIST_ANALISTA]]);
  return rows;
}

async function listarDocumentosPenalidadChecklist(ordenEntregaId) {
  const { rows } = await query(`
    SELECT d.*
    FROM entregable_pago_documentos d
    WHERE d.orden_entrega_id = $1
      AND d.tipo_documento IN ('FORMATO_PENALIDAD_FIRMADO', 'CARTA_PENALIDAD')
      AND d.vigente = TRUE
    ORDER BY d.id DESC
  `, [Number(ordenEntregaId)]);
  return rows;
}

async function construirContextoChecklist(entrega, ordenEntregaId) {
  const expediente = await getExpedienteOrdenCompleto(entrega.orden_id);
  const tipificados = await listarDocumentosTipificadosEntregable(ordenEntregaId);
  const entregableDocs = (tipificados || []).map((d) => ({
    documentoId: d.id,
    id: d.id,
    recepcion_id: d.recepcion_id,
    origen: 'ENTREGABLE',
    tipo: d.tipo_label || d.tipo_documento,
    tipo_documento: d.tipo_documento,
    nombre: d.nombre || d.nombre_archivo,
    nombre_archivo: d.nombre_archivo,
    mime_type: d.mime_type,
    vigencia_desde: d.vigencia_desde,
    vigencia_hasta: d.vigencia_hasta,
    valido_para_pago: d.valido_para_pago,
    vigente: d.vigente,
    kind: 'entregable_recepcion',
    previewDisponible: true,
  }));
  const penalidadRes = await query(
    'SELECT estado_penalidad FROM entregable_penalidad_evaluacion WHERE orden_entrega_id = $1 LIMIT 1',
    [Number(ordenEntregaId)],
  );
  const penalidadCodigo = String(penalidadRes.rows[0]?.estado_penalidad || 'PENDIENTE').toUpperCase();
  const penalidadDocs = await listarDocumentosPenalidadChecklist(ordenEntregaId);
  return {
    expediente: expediente.documentos || [],
    entregableDocs,
    resumen: expediente.resumen || {},
    penalidadCodigo,
    penalidadDocs,
    refDate: new Date(),
  };
}

export async function obtenerChecklistExpedientePago(ordenEntregaId, userCtx = null) {
  const { entrega, estado } = await assertAccesoChecklistConsulta(ordenEntregaId, userCtx);
  const ctx = await construirContextoChecklist(entrega, ordenEntregaId);
  const sistema = resolverFilasSistemaChecklist(ctx);
  const rowsAnalista = await listarDocumentosChecklistAnalista(ordenEntregaId);
  const vigentesPorTipo = new Map();
  const otros = [];
  for (const row of rowsAnalista) {
    if (row.vigente === false) continue;
    if (row.tipo_documento === TIPO_CHECKLIST_OTRO) {
      otros.push(row);
      continue;
    }
    if (!vigentesPorTipo.has(row.tipo_documento)) vigentesPorTipo.set(row.tipo_documento, row);
  }
  const analistaAdjuntos = [...vigentesPorTipo.values(), ...otros].map(mapFilaAnalistaChecklist);
  const analistaFaltantes = filasAnalistaBaseFaltantes([...vigentesPorTipo.values()]);
  const analista = [...analistaFaltantes, ...analistaAdjuntos]
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'es'));
  const filas = [...sistema, ...analista];
  const progreso = calcularProgresoChecklist(filas);
  const enrichPreview = (fila) => {
    if (!fila.preview) return fila;
    return {
      ...fila,
      preview: {
        ...fila.preview,
        orden_id: fila.preview.orden_id || Number(entrega.orden_id),
        requerimiento_id: fila.preview.requerimiento_id || Number(entrega.requerimiento_id),
      },
    };
  };
  const sistemaOut = sistema.map(enrichPreview);
  const analistaOut = analista.map(enrichPreview);
  return {
    orden_entrega_id: Number(ordenEntregaId),
    orden_id: Number(entrega.orden_id),
    requerimiento_id: Number(entrega.requerimiento_id),
    penalidad_codigo: ctx.penalidadCodigo,
    puede_gestionar_analista: puedeGestionarChecklistAnalista(userCtx, estado),
    progreso: calcularProgresoChecklist([...sistemaOut, ...analistaOut]),
    bloques: {
      sistema: sistemaOut,
      analista: analistaOut,
    },
    filas: [...sistemaOut, ...analistaOut],
  };
}

export async function listarDocumentosEntregablePago(ordenEntregaId, userCtx = null) {
  const { entrega } = await assertAccesoChecklistConsulta(ordenEntregaId, userCtx);
  const ctx = await construirContextoChecklist(entrega, ordenEntregaId);
  const docs = ctx.entregableDocs.filter(
    (d) => String(d.tipo_documento || '').toUpperCase() === TIPO_ENTREGABLE,
  );
  return {
    orden_entrega_id: Number(ordenEntregaId),
    documentos: docs.map((d) => ({
      id: d.id,
      recepcion_id: d.recepcion_id,
      tipo_documento: d.tipo_documento,
      nombre: d.nombre || d.nombre_archivo,
      nombre_archivo: d.nombre_archivo,
      mime_type: d.mime_type,
      vigencia_hasta: d.vigencia_hasta || null,
      valido_para_pago: d.valido_para_pago,
      preview: {
        kind: 'entregable_recepcion',
        id: d.id,
        recepcion_id: d.recepcion_id,
        nombre: d.nombre || d.nombre_archivo,
      },
    })),
  };
}

export async function obtenerActaConformidadPagoPreview(ordenEntregaId, userCtx = null) {
  await assertAccesoChecklistConsulta(ordenEntregaId, userCtx);
  const conformidad = await listarConformidadEntregable(ordenEntregaId);
  const firmada = conformidad.acta_firmada_vigente;
  const generada = conformidad.acta_generada_vigente;
  const target = firmada || generada;
  if (!target) {
    return {
      orden_entrega_id: Number(ordenEntregaId),
      disponible: false,
      tipo: null,
      preview: null,
    };
  }
  return {
    orden_entrega_id: Number(ordenEntregaId),
    disponible: true,
    tipo: firmada ? 'firmada' : 'generada',
    preview: firmada
      ? { kind: 'conformidad_firmada', id: firmada.id, acta_id: firmada.acta_id, nombre: firmada.nombre || 'Acta firmada' }
      : { kind: 'conformidad_generada', id: target.id, nombre: target.documento_nombre || 'Acta generada' },
  };
}

async function registrarEventoChecklistDocumento(client, {
  entrega,
  estado,
  eventoCodigo,
  documentoId = null,
  reemplazaId = null,
  ejecutadoPor = '',
  userCtx = null,
  motivo = '',
  metadata = {},
}) {
  await client.query(`
    INSERT INTO entregable_eventos (
      orden_id, orden_entrega_id, requerimiento_id, evento_codigo,
      estado_anterior_codigo, estado_anterior_label,
      estado_nuevo_codigo, estado_nuevo_label,
      etapa_anterior_codigo, etapa_nueva_codigo,
      responsable_anterior_tipo, responsable_anterior_usuario, responsable_anterior_unidad,
      responsable_nuevo_tipo, responsable_nuevo_usuario, responsable_nuevo_unidad,
      ejecutado_usuario_id, ejecutado_por, motivo, metadata_json
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$5,$6,$7,$7,$8,$9,$10,$8,$9,$10,$11,$12,$13,$14::jsonb
    )
  `, [
    Number(entrega.orden_id),
    Number(entrega.id || entrega.orden_entrega_id),
    Number(entrega.requerimiento_id),
    eventoCodigo,
    estado.estadoCodigo || estado.estado_codigo,
    estado.estadoLabel || estado.estado_label,
    estado.etapaCodigo || estado.etapa_codigo,
    estado.responsableTipo || estado.responsable_tipo,
    estado.responsableUsuarioId || estado.responsable_usuario_id,
    estado.responsableUnidad || estado.responsable_unidad,
    Number(userCtx?.id) > 0 ? Number(userCtx.id) : null,
    ejecutadoPor,
    motivo,
    JSON.stringify({ documento_id: documentoId, reemplaza_id: reemplazaId, ...metadata }),
  ]);
}

function normalizarTipoChecklist(body = {}) {
  const tipo = String(body.tipo_documento || body.tipoDocumento || '').trim().toUpperCase();
  if (tipo === TIPO_CHECKLIST_OTRO || tipo === 'OTRO') return TIPO_CHECKLIST_OTRO;
  if (TIPOS_CHECKLIST_ANALISTA.has(tipo) && tipo !== TIPO_CHECKLIST_OTRO) return tipo;
  const err = new Error('tipo_documento inválido para checklist');
  err.status = 400;
  err.code = 'TIPO_CHECKLIST_INVALIDO';
  throw err;
}

export async function adjuntarDocumentoChecklistAnalista(
  ordenEntregaId,
  body = {},
  userCtx = null,
  usuario = null,
) {
  const eid = Number(ordenEntregaId);
  const tipo = normalizarTipoChecklist(body);
  const descripcion = String(body.descripcion || body.nombre || '').trim() || null;
  const obligatorio = body.obligatorio !== false;
  if (tipo === TIPO_CHECKLIST_OTRO && !descripcion) {
    throw httpError('La descripción es obligatoria para OTRO', 400, 'OTRO_DESCRIPCION_REQUERIDA');
  }
  const archivo = body.documento || body.archivo || body;
  validatePagoDocumentoArchivo(archivo);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const entrega = (await client.query(`
      SELECT oe.*, oc.requerimiento_id
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
      WHERE oe.id = $1 FOR UPDATE
    `, [eid])).rows[0];
    if (!entrega) throw httpError('Entregable no encontrado', 404);
    const estado = await obtenerEstadoResponsableEntregable(eid, { client });
    if (!puedeGestionarChecklistAnalista(userCtx, estado)) {
      throw httpError('No autorizado', 403, 'CHECKLIST_PAGO_GESTION_DENEGADA');
    }
    if (tipo !== TIPO_CHECKLIST_OTRO) {
      const prev = (await client.query(`
        SELECT id FROM entregable_pago_documentos
        WHERE orden_entrega_id=$1 AND tipo_documento=$2 AND vigente=TRUE LIMIT 1
      `, [eid, tipo])).rows[0];
      if (prev) {
        throw httpError('Ya existe un documento vigente de este tipo. Use reemplazar.', 409, 'DOCUMENTO_TIPO_YA_EXISTE');
      }
    }
    const doc = await persistirPagoDocumento({
      client,
      ordenId: entrega.orden_id,
      ordenEntregaId: eid,
      tipoDocumento: tipo,
      archivo,
      createdBy: usuario || userCtx?.username,
    });
    await client.query(`
      UPDATE entregable_pago_documentos
      SET descripcion=$2, obligatorio=$3
      WHERE id=$1
    `, [doc.id, descripcion, obligatorio]);
    await registrarEventoChecklistDocumento(client, {
      entrega,
      estado,
      eventoCodigo: 'CHECKLIST_DOCUMENTO_ADJUNTADO',
      documentoId: doc.id,
      ejecutadoPor: usuario || userCtx?.username || userCtx?.nombre || String(userCtx?.id || ''),
      userCtx,
      motivo: `Documento checklist adjuntado (${tipo})`,
      metadata: { tipo_documento: tipo, descripcion },
    });
    await client.query('COMMIT');
    return { documento: { ...doc, descripcion, obligatorio, vigente: true } };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function reemplazarDocumentoChecklistAnalista(
  ordenEntregaId,
  documentoId,
  body = {},
  userCtx = null,
  usuario = null,
) {
  const eid = Number(ordenEntregaId);
  const did = Number(documentoId);
  const archivo = body.documento || body.archivo || body;
  validatePagoDocumentoArchivo(archivo);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const entrega = (await client.query(`
      SELECT oe.*, oc.requerimiento_id
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
      WHERE oe.id = $1 FOR UPDATE
    `, [eid])).rows[0];
    if (!entrega) throw httpError('Entregable no encontrado', 404);
    const estado = await obtenerEstadoResponsableEntregable(eid, { client });
    if (!puedeGestionarChecklistAnalista(userCtx, estado)) {
      throw httpError('No autorizado', 403, 'CHECKLIST_PAGO_GESTION_DENEGADA');
    }
    const previo = (await client.query(`
      SELECT * FROM entregable_pago_documentos
      WHERE id=$1 AND orden_entrega_id=$2 AND vigente=TRUE
      FOR UPDATE
    `, [did, eid])).rows[0];
    if (!previo || !TIPOS_CHECKLIST_ANALISTA.has(previo.tipo_documento)) {
      throw httpError('Documento no encontrado', 404, 'DOCUMENTO_NO_ENCONTRADO');
    }
    await client.query(`UPDATE entregable_pago_documentos SET vigente=FALSE WHERE id=$1`, [previo.id]);
    const doc = await persistirPagoDocumento({
      client,
      ordenId: entrega.orden_id,
      ordenEntregaId: eid,
      tipoDocumento: previo.tipo_documento,
      archivo,
      createdBy: usuario || userCtx?.username,
    });
    await client.query(`
      UPDATE entregable_pago_documentos
      SET descripcion=$2, obligatorio=$3, reemplaza_id=$4
      WHERE id=$1
    `, [doc.id, previo.descripcion, previo.obligatorio, previo.id]);
    await registrarEventoChecklistDocumento(client, {
      entrega,
      estado,
      eventoCodigo: 'CHECKLIST_DOCUMENTO_REEMPLAZADO',
      documentoId: doc.id,
      reemplazaId: previo.id,
      ejecutadoPor: usuario || userCtx?.username || userCtx?.nombre || String(userCtx?.id || ''),
      userCtx,
      motivo: `Documento checklist reemplazado (${previo.tipo_documento})`,
      metadata: { tipo_documento: previo.tipo_documento },
    });
    await client.query('COMMIT');
    return { documento: { ...doc, descripcion: previo.descripcion, obligatorio: previo.obligatorio, vigente: true } };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function retirarDocumentoChecklistAnalista(
  ordenEntregaId,
  documentoId,
  userCtx = null,
  usuario = null,
) {
  const eid = Number(ordenEntregaId);
  const did = Number(documentoId);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const entrega = (await client.query(`
      SELECT oe.*, oc.requerimiento_id
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
      WHERE oe.id = $1 FOR UPDATE
    `, [eid])).rows[0];
    if (!entrega) throw httpError('Entregable no encontrado', 404);
    const estado = await obtenerEstadoResponsableEntregable(eid, { client });
    if (!puedeGestionarChecklistAnalista(userCtx, estado)) {
      throw httpError('No autorizado', 403, 'CHECKLIST_PAGO_GESTION_DENEGADA');
    }
    const previo = (await client.query(`
      SELECT * FROM entregable_pago_documentos
      WHERE id=$1 AND orden_entrega_id=$2 AND vigente=TRUE
      FOR UPDATE
    `, [did, eid])).rows[0];
    if (!previo || !TIPOS_CHECKLIST_ANALISTA.has(previo.tipo_documento)) {
      throw httpError('Documento no encontrado', 404, 'DOCUMENTO_NO_ENCONTRADO');
    }
    await client.query(`UPDATE entregable_pago_documentos SET vigente=FALSE WHERE id=$1`, [previo.id]);
    await eliminarPagoDocumentoFisico(previo);
    await registrarEventoChecklistDocumento(client, {
      entrega,
      estado,
      eventoCodigo: 'CHECKLIST_DOCUMENTO_RETIRADO',
      documentoId: previo.id,
      ejecutadoPor: usuario || userCtx?.username || userCtx?.nombre || String(userCtx?.id || ''),
      userCtx,
      motivo: `Documento checklist retirado (${previo.tipo_documento})`,
      metadata: { tipo_documento: previo.tipo_documento },
    });
    await client.query('COMMIT');
    return { ok: true, documento_id: previo.id };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function getDocumentoChecklistPagoBytes(ordenEntregaId, documentoId, userCtx = null) {
  await assertAccesoChecklistConsulta(ordenEntregaId, userCtx);
  const { rows } = await query(`
    SELECT d.* FROM entregable_pago_documentos d
    WHERE d.id=$1 AND d.orden_entrega_id=$2 AND d.vigente=TRUE
  `, [Number(documentoId), Number(ordenEntregaId)]);
  if (!rows.length) throw httpError('Documento no encontrado', 404, 'DOCUMENTO_NO_ENCONTRADO');
  const bytes = await leerPagoDocumentoBytes(rows[0]);
  return {
    nombre_archivo: rows[0].nombre_archivo,
    mime_type: rows[0].mime_type,
    bytes,
  };
}

export {
  puedeConsultarChecklistPago,
  puedeGestionarChecklistAnalista,
};
