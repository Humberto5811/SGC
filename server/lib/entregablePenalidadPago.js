/**
 * RC8.15.6G-7 — Cálculo, persistencia y documentos de penalidad (Pagos).
 */
import { getClient, query } from '../db.js';
import { buildEntregaContract } from '../../shared/entregaContractual.js';
import { resolveAreaUsuaria } from '../../shared/ordenCronogramaContractual.js';
import { calcularPenalidadInstitucional, REGLA_PENALIDAD_VERSION } from '../../shared/penalidadCalculo.js';
import { toIsoDateString } from './diasPlazo.js';
import { obtenerEstadoResponsableEntregable } from './entregableEstadoPersistido.js';
import {
  generateCartaPenalidadPdf,
  generateFormatoPenalidadPdf,
} from './entregablePenalidadPdfServer.js';
import {
  leerPagoDocumentoBytes,
  persistirPagoDocumento,
  validatePagoDocumentoArchivo,
} from './entregablePagoDocumentos.js';
import { ETAPAS } from '../../shared/workflow/etapas.js';
import { resolveFunctionalProfiles, PERFILES_FUNCIONALES } from '../utils/userRoleCatalog.js';

function httpError(message, status = 400, code = 'PENALIDAD_ERROR') {
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
      oc.tipo_contratacion, oc.estado AS orden_estado, oc.enviado_proveedor_at,
      oc.monto_total, oc.moneda, oc.fecha_orden,
      r.codigo AS requerimiento_codigo, r.area AS req_area, r.denominacion,
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
      ORDER BY oei.id LIMIT 1
    ) oei ON TRUE
    WHERE oe.id = $1
  `, [eid]);
  if (!rows.length) throw httpError('Entregable no encontrado', 404, 'ENTREGABLE_NO_ENCONTRADO');
  return rows[0];
}

function assertPuedeGestionarPenalidadCalculo(userCtx, estado) {
  if (esAdmin(userCtx)) return;
  const perfiles = resolveFunctionalProfiles(userCtx);
  if (Number(userCtx?.id) !== Number(estado?.responsableUsuarioId)
    || estado?.responsableTipo !== 'PERSONA'
    || !perfiles.includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES)
    || String(estado?.etapaCodigo || '').toUpperCase() !== ETAPAS.PREPARACION_EXPEDIENTE_PAGO) {
    throw httpError(
      'Solo el Analista CM responsable en preparación de expediente de pago puede gestionar el cálculo de penalidad',
      403,
      'PENALIDAD_CALCULO_NO_AUTORIZADO',
    );
  }
}

async function assertEvaluacionCorresponde(ordenEntregaId, client = null) {
  const run = client || { query };
  const { rows } = await run.query(`
    SELECT * FROM entregable_penalidad_evaluacion
    WHERE orden_entrega_id = $1
  `, [Number(ordenEntregaId)]);
  const ev = rows[0];
  if (!ev || ev.estado_penalidad !== 'CORRESPONDE' || ev.corresponde_penalidad !== true) {
    throw httpError(
      'Debe evaluar previamente que corresponde penalidad',
      409,
      'PENALIDAD_NO_CORRESPONDE',
    );
  }
  return ev;
}

function mapCalculoRow(row, docs = {}) {
  if (!row) return null;
  return {
    id: row.id,
    orden_entrega_id: row.orden_entrega_id,
    version: row.version,
    regla_version: row.regla_version,
    entrada: row.entrada_json,
    resultado: row.resultado_json,
    calculado_at: row.calculado_at,
    usuario_calculador_id: row.usuario_calculador_id,
    vigente: row.vigente,
    documento_generado: docs.generado || null,
    documento_firmado: docs.firmado || null,
    carta_generada: docs.carta || null,
  };
}

async function cargarDocumentosCalculo(row) {
  const ids = [row.documento_generado_id, row.documento_firmado_id, row.carta_generada_id]
    .filter((id) => Number(id) > 0);
  if (!ids.length) return {};
  const { rows } = await query(`
    SELECT id, tipo_documento, nombre_archivo, mime_type, tamanio_bytes, created_at
    FROM entregable_pago_documentos WHERE id = ANY($1::int[])
  `, [ids]);
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return {
    generado: byId.get(Number(row.documento_generado_id)) || null,
    firmado: byId.get(Number(row.documento_firmado_id)) || null,
    carta: byId.get(Number(row.carta_generada_id)) || null,
  };
}

export async function armarDatosCalculoPenalidad(ordenEntregaId, userCtx, { obtenerContextoPenalidadPagoEntregable }) {
  const entrega = await getEntregableBasico(ordenEntregaId);
  const ctx = await obtenerContextoPenalidadPagoEntregable(ordenEntregaId, userCtx);
  const montoBase = Number(entrega.precio_total ?? entrega.importe ?? 0);
  const contract = buildEntregaContract(entrega, { totalEntregas: 1 });
  const areaUsuaria = resolveAreaUsuaria({ requerimientoArea: entrega.req_area });

  const calcInput = {
    monto_base: montoBase,
    plazo_dias: Number(entrega.dias_plazo || 0),
    dias_atraso: Number(ctx.dias_atraso || 0),
    total_dias_ampliacion: Number(ctx.total_dias_ampliacion || 0),
    fecha_maxima_contractual: ctx.fecha_maxima_contractual,
    fecha_maxima_ajustada: ctx.fecha_maxima_ajustada,
    fecha_presentacion: ctx.fecha_presentacion,
    monto_total_orden: entrega.monto_total != null ? Number(entrega.monto_total) : null,
  };

  const calculo = calcularPenalidadInstitucional(calcInput);
  return {
    entrega,
    contexto: ctx,
    calcInput,
    calculo,
    ficha: {
      tipo_orden: entrega.tipo_orden,
      numero_orden: entrega.numero_orden,
      proveedor_razon_social: entrega.proveedor_razon_social,
      proveedor_ruc: entrega.proveedor_ruc,
      tipo_contratacion: entrega.tipo_contratacion,
      objeto: entrega.denominacion || contract.descripcionEntrega,
      descripcion: contract.descripcionEntrega,
      area_usuaria: areaUsuaria || entrega.req_area,
      numero_entrega: entrega.numero_entrega,
      moneda: entrega.moneda || 'PEN',
      fecha_notificacion: ctx.fecha_notificacion,
      fecha_orden: toIsoDateString(entrega.fecha_orden),
      fecha_inicio_plazo: ctx.fecha_inicio_plazo,
      dias_plazo: entrega.dias_plazo,
      fecha_maxima_contractual: ctx.fecha_maxima_contractual,
      total_dias_ampliacion: ctx.total_dias_ampliacion,
      fecha_maxima_ajustada: ctx.fecha_maxima_ajustada,
      fecha_presentacion: ctx.fecha_presentacion,
      dias_atraso: ctx.dias_atraso,
      monto_total_orden: entrega.monto_total,
      monto_base: montoBase,
    },
  };
}

async function registrarEventoPenalidad(client, {
  entrega, estado, eventoCodigo, userCtx, usuario, motivo, metadata,
}) {
  const { rows } = await client.query(`
    INSERT INTO entregable_eventos (
      orden_id, orden_entrega_id, requerimiento_id, evento_codigo,
      estado_anterior_codigo, estado_anterior_label,
      estado_nuevo_codigo, estado_nuevo_label,
      etapa_anterior_codigo, etapa_nueva_codigo,
      responsable_anterior_tipo, responsable_anterior_usuario,
      responsable_anterior_unidad, responsable_nuevo_tipo,
      responsable_nuevo_usuario, responsable_nuevo_unidad,
      ejecutado_usuario_id, ejecutado_por, motivo, metadata_json
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$5,$6,$7,$7,$8,$9,$10,$8,$9,$10,$11,$12,$13,$14::jsonb
    ) RETURNING id
  `, [
    Number(entrega.orden_id),
    Number(entrega.id),
    Number(entrega.requerimiento_id),
    eventoCodigo,
    estado.estadoCodigo || estado.estado_codigo,
    estado.estadoLabel || estado.estado_label,
    estado.etapaCodigo || estado.etapa_codigo,
    estado.responsableTipo || estado.responsable_tipo,
    estado.responsableUsuarioId || estado.responsable_usuario_id,
    estado.responsableUnidad || estado.responsable_unidad,
    Number(userCtx?.id) > 0 ? Number(userCtx.id) : null,
    String(usuario || userCtx?.username || userCtx?.id || '').slice(0, 150),
    motivo,
    JSON.stringify(metadata || {}),
  ]);
  return rows[0];
}

export async function obtenerFichaCalculoPenalidad(ordenEntregaId, userCtx, deps) {
  const estado = await obtenerEstadoResponsableEntregable(ordenEntregaId);
  assertPuedeGestionarPenalidadCalculo(userCtx, estado);
  await assertEvaluacionCorresponde(ordenEntregaId);
  const armado = await armarDatosCalculoPenalidad(ordenEntregaId, userCtx, deps);
  const { rows } = await query(`
    SELECT * FROM entregable_penalidad_calculo
    WHERE orden_entrega_id = $1 AND vigente = TRUE
    ORDER BY version DESC, id DESC LIMIT 1
  `, [Number(ordenEntregaId)]);
  const vigente = rows[0] || null;
  const docs = vigente ? await cargarDocumentosCalculo(vigente) : {};
  return {
    ficha: armado.ficha,
    calculo_preview: armado.calculo.ok ? armado.calculo.resultado : null,
    faltantes: armado.calculo.ok ? [] : armado.calculo.faltantes,
    calculo_vigente: mapCalculoRow(vigente, docs),
    puede_editar: true,
  };
}

export async function calcularPenalidadEntregable(ordenEntregaId, userCtx, usuario, deps) {
  const eid = parseInt(ordenEntregaId, 10);
  const estado = await obtenerEstadoResponsableEntregable(eid);
  assertPuedeGestionarPenalidadCalculo(userCtx, estado);
  const evaluacion = await assertEvaluacionCorresponde(eid);
  const armado = await armarDatosCalculoPenalidad(eid, userCtx, deps);
  if (!armado.calculo.ok) {
    const msg = armado.calculo.faltantes.map((f) => f.mensaje).join('; ');
    const err = httpError(msg, 422, 'PENALIDAD_DATOS_INCOMPLETOS');
    err.faltantes = armado.calculo.faltantes;
    throw err;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM orden_entregas WHERE id=$1 FOR UPDATE', [eid]);
    const prev = (await client.query(`
      SELECT COALESCE(MAX(version),0)::int AS v FROM entregable_penalidad_calculo
      WHERE orden_entrega_id=$1
    `, [eid])).rows[0];
    const nextVersion = Number(prev?.v || 0) + 1;
    await client.query(`
      UPDATE entregable_penalidad_calculo SET vigente=FALSE, updated_at=NOW()
      WHERE orden_entrega_id=$1 AND vigente=TRUE
    `, [eid]);
    const { rows } = await client.query(`
      INSERT INTO entregable_penalidad_calculo (
        orden_id, orden_entrega_id, evaluacion_id, version, regla_version,
        entrada_json, resultado_json, usuario_calculador_id, vigente
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,TRUE)
      RETURNING *
    `, [
      Number(armado.entrega.orden_id),
      eid,
      evaluacion.id,
      nextVersion,
      REGLA_PENALIDAD_VERSION,
      JSON.stringify(armado.calculo.entrada),
      JSON.stringify(armado.calculo.resultado),
      Number(userCtx?.id) > 0 ? Number(userCtx.id) : null,
    ]);
    const calculo = rows[0];
    await registrarEventoPenalidad(client, {
      entrega: armado.entrega,
      estado,
      eventoCodigo: 'PENALIDAD_CALCULADA',
      userCtx,
      usuario,
      motivo: nextVersion > 1 ? 'Recálculo de penalidad' : 'Cálculo inicial de penalidad',
      metadata: {
        calculo_id: calculo.id,
        version: nextVersion,
        resultado: armado.calculo.resultado,
        es_modificacion: nextVersion > 1,
      },
    });
    await client.query('COMMIT');
    return mapCalculoRow(calculo, {});
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function generarFormatoPenalidadEntregable(ordenEntregaId, userCtx, usuario) {
  const eid = parseInt(ordenEntregaId, 10);
  const estado = await obtenerEstadoResponsableEntregable(eid);
  assertPuedeGestionarPenalidadCalculo(userCtx, estado);
  await assertEvaluacionCorresponde(eid);
  const { rows } = await query(`
    SELECT * FROM entregable_penalidad_calculo
    WHERE orden_entrega_id=$1 AND vigente=TRUE
    ORDER BY version DESC, id DESC LIMIT 1
  `, [eid]);
  const calculoRow = rows[0];
  if (!calculoRow) {
    throw httpError('Debe calcular la penalidad antes de generar el formato', 409, 'SIN_CALCULO_PENALIDAD');
  }
  const entrega = await getEntregableBasico(eid);
  const contract = buildEntregaContract(entrega, { totalEntregas: 1 });
  const areaUsuaria = resolveAreaUsuaria({ requerimientoArea: entrega.req_area });
  const pdf = generateFormatoPenalidadPdf({
    ...entrega,
    objeto: entrega.denominacion || contract.descripcionEntrega,
    area_usuaria: areaUsuaria,
    resultado: calculoRow.resultado_json,
    entrada: calculoRow.entrada_json,
    version: calculoRow.version,
    regla_version: calculoRow.regla_version,
    total_dias_ampliacion: calculoRow.entrada_json?.total_dias_ampliacion,
    fecha_maxima_contractual: calculoRow.entrada_json?.fecha_maxima_contractual,
    fecha_maxima_ajustada: calculoRow.entrada_json?.fecha_maxima_ajustada,
    fecha_presentacion: calculoRow.entrada_json?.fecha_presentacion,
    dias_atraso: calculoRow.resultado_json?.dias_atraso,
    dias_plazo: calculoRow.entrada_json?.plazo_dias,
  });

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const doc = await persistirPagoDocumento({
      client,
      ordenId: entrega.orden_id,
      ordenEntregaId: eid,
      tipoDocumento: 'FORMATO_PENALIDAD',
      archivo: {
        nombre_archivo: pdf.nombre,
        mime_type: 'application/pdf',
        contenido_base64: pdf.base64,
      },
      createdBy: usuario || userCtx?.username,
    });
    await client.query(`
      UPDATE entregable_penalidad_calculo
      SET documento_generado_id=$2, updated_at=NOW()
      WHERE id=$1
    `, [calculoRow.id, doc.id]);
    await registrarEventoPenalidad(client, {
      entrega,
      estado,
      eventoCodigo: 'FORMATO_PENALIDAD_GENERADO',
      userCtx,
      usuario,
      motivo: 'Formato de penalidad generado',
      metadata: { calculo_id: calculoRow.id, documento_id: doc.id, version: calculoRow.version },
    });
    await client.query('COMMIT');
    return {
      calculo_id: calculoRow.id,
      documento: {
        id: doc.id,
        nombre_archivo: doc.nombre_archivo,
        tipo_documento: doc.tipo_documento,
      },
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function adjuntarFormatoPenalidadFirmado(ordenEntregaId, body, userCtx, usuario) {
  const eid = parseInt(ordenEntregaId, 10);
  const estado = await obtenerEstadoResponsableEntregable(eid);
  assertPuedeGestionarPenalidadCalculo(userCtx, estado);
  validatePagoDocumentoArchivo({
    contenido_base64: body.contenido_base64,
    nombre_archivo: body.nombre_archivo || 'formato-penalidad-firmado.pdf',
    mime_type: body.mime_type || 'application/pdf',
  });
  const { rows } = await query(`
    SELECT * FROM entregable_penalidad_calculo
    WHERE orden_entrega_id=$1 AND vigente=TRUE
    ORDER BY version DESC, id DESC LIMIT 1
  `, [eid]);
  const calculoRow = rows[0];
  if (!calculoRow?.documento_generado_id) {
    throw httpError('Debe generar el formato antes de adjuntar el firmado', 409, 'SIN_FORMATO_GENERADO');
  }
  const entrega = await getEntregableBasico(eid);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const doc = await persistirPagoDocumento({
      client,
      ordenId: entrega.orden_id,
      ordenEntregaId: eid,
      tipoDocumento: 'FORMATO_PENALIDAD_FIRMADO',
      archivo: body,
      createdBy: usuario || userCtx?.username,
    });
    await client.query(`
      UPDATE entregable_penalidad_calculo
      SET documento_firmado_id=$2, updated_at=NOW()
      WHERE id=$1
    `, [calculoRow.id, doc.id]);
    await registrarEventoPenalidad(client, {
      entrega,
      estado,
      eventoCodigo: 'FORMATO_PENALIDAD_FIRMADO',
      userCtx,
      usuario,
      motivo: 'Formato de penalidad firmado adjuntado',
      metadata: { calculo_id: calculoRow.id, documento_id: doc.id },
    });
    await client.query('COMMIT');
    return {
      calculo_id: calculoRow.id,
      documento: { id: doc.id, nombre_archivo: doc.nombre_archivo, tipo_documento: doc.tipo_documento },
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function generarCartaPenalidadEntregable(ordenEntregaId, userCtx, usuario) {
  const eid = parseInt(ordenEntregaId, 10);
  const estado = await obtenerEstadoResponsableEntregable(eid);
  assertPuedeGestionarPenalidadCalculo(userCtx, estado);
  const { rows } = await query(`
    SELECT * FROM entregable_penalidad_calculo
    WHERE orden_entrega_id=$1 AND vigente=TRUE
    ORDER BY version DESC, id DESC LIMIT 1
  `, [eid]);
  const calculoRow = rows[0];
  if (!calculoRow) {
    throw httpError('Debe calcular la penalidad antes de generar la carta', 409, 'SIN_CALCULO_PENALIDAD');
  }
  const entrega = await getEntregableBasico(eid);
  const contract = buildEntregaContract(entrega, { totalEntregas: 1 });
  const pdf = generateCartaPenalidadPdf({
    ...entrega,
    objeto: entrega.denominacion || contract.descripcionEntrega,
    resultado: calculoRow.resultado_json,
    version: calculoRow.version,
    referencia_sustento: calculoRow.documento_generado_id
      ? `Formato de penalidad v${calculoRow.version}`
      : `Cálculo de penalidad v${calculoRow.version}`,
    fecha_generacion: new Date().toISOString(),
  });

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const doc = await persistirPagoDocumento({
      client,
      ordenId: entrega.orden_id,
      ordenEntregaId: eid,
      tipoDocumento: 'CARTA_PENALIDAD',
      archivo: {
        nombre_archivo: pdf.nombre,
        mime_type: 'application/pdf',
        contenido_base64: pdf.base64,
      },
      createdBy: usuario || userCtx?.username,
    });
    await client.query(`
      UPDATE entregable_penalidad_calculo
      SET carta_generada_id=$2, updated_at=NOW()
      WHERE id=$1
    `, [calculoRow.id, doc.id]);
    await registrarEventoPenalidad(client, {
      entrega,
      estado,
      eventoCodigo: 'CARTA_PENALIDAD_GENERADA',
      userCtx,
      usuario,
      motivo: 'Carta de penalidad generada',
      metadata: { calculo_id: calculoRow.id, documento_id: doc.id },
    });
    await client.query('COMMIT');
    return {
      calculo_id: calculoRow.id,
      documento: { id: doc.id, nombre_archivo: doc.nombre_archivo, tipo_documento: doc.tipo_documento },
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function getDocumentoPenalidadPagoBytes(ordenEntregaId, documentoId, userCtx) {
  const estado = await obtenerEstadoResponsableEntregable(ordenEntregaId);
  assertPuedeGestionarPenalidadCalculo(userCtx, estado);
  const { rows } = await query(`
    SELECT d.* FROM entregable_pago_documentos d
    WHERE d.id=$1 AND d.orden_entrega_id=$2
  `, [Number(documentoId), Number(ordenEntregaId)]);
  if (!rows.length) throw httpError('Documento no encontrado', 404, 'DOCUMENTO_NO_ENCONTRADO');
  const bytes = await leerPagoDocumentoBytes(rows[0]);
  return {
    nombre_archivo: rows[0].nombre_archivo,
    mime_type: rows[0].mime_type,
    bytes,
  };
}
