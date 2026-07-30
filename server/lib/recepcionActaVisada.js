/**
 * Gestión documental del Acta visada por Almacén.
 * Arquitectura vigente del proyecto: JSON + base64 (no multipart).
 */
import { query } from '../db.js';

const MAX_ACTA_VISADA_BYTES = 10 * 1024 * 1024;

function httpError(message, status = 400, code = null) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

function resolveRolActor(rolHint = '') {
  const rol = String(rolHint || '').toLowerCase();
  if (rol === 'admin' || rol === 'dec') return 'ALMACEN';
  if (rol === 'au' || rol === 'area_usuaria') return 'AREA_USUARIA';
  if (rol === 'cm' || rol === 'coordinador' || rol === 'coordinador_cm') return 'COORDINADOR_CM';
  if (rol === 'almacen') return 'ALMACEN';
  return String(rolHint || 'ALMACEN').toUpperCase();
}

async function registrarEvento({
  expedienteId, ordenId, tipo, estadoAnterior, estadoNuevo, usuario, rol, motivo, metadata,
}) {
  await query(`
    INSERT INTO recepcion_bienes_eventos
      (expediente_recepcion_id, orden_id, tipo, estado_anterior, estado_nuevo, usuario, rol, motivo, metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
  `, [
    expedienteId, ordenId || null, tipo,
    estadoAnterior || null, estadoNuevo || null,
    String(usuario || '').slice(0, 150),
    String(rol || '').slice(0, 40),
    motivo || null,
    JSON.stringify(metadata || {}),
  ]);
}

async function getExpedienteOrThrow(expedienteId) {
  const id = parseInt(expedienteId, 10);
  const { rows } = await query(`
    SELECT rbe.*, oc.numero_orden, oc.estado AS orden_estado, oc.enviado_proveedor_at,
      oc.requerimiento_id, oc.orden_id AS _oc_id
    FROM recepcion_bienes_expedientes rbe
    JOIN ordenes_contratacion oc ON oc.id = rbe.orden_id
    WHERE rbe.id = $1
  `, [id]).catch(async () => query(`
    SELECT rbe.*, oc.numero_orden, oc.estado AS orden_estado, oc.enviado_proveedor_at
    FROM recepcion_bienes_expedientes rbe
    JOIN ordenes_contratacion oc ON oc.id = rbe.orden_id
    WHERE rbe.id = $1
  `, [id]));
  if (!rows.length) throw httpError('Expediente de recepción no encontrado', 404);
  return rows[0];
}

async function getDetalleSafe(expedienteId) {
  const { getDetalleRecepcionBienes } = await import('./recepcionBienes.js');
  return getDetalleRecepcionBienes(expedienteId);
}

let _visadosTableReady = false;

export async function ensureActaVisadosTable() {
  if (_visadosTableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS recepcion_bienes_acta_visados (
      id SERIAL PRIMARY KEY,
      expediente_recepcion_id INTEGER NOT NULL
        REFERENCES recepcion_bienes_expedientes(id) ON DELETE CASCADE,
      acta_id INTEGER NOT NULL
        REFERENCES recepcion_bienes_actas(id) ON DELETE CASCADE,
      documento_recepcion_id INTEGER NULL
        REFERENCES recepcion_bienes_documentos(id) ON DELETE SET NULL,
      version INTEGER NOT NULL DEFAULT 1,
      nombre VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL DEFAULT 'application/pdf',
      contenido_base64 TEXT NOT NULL,
      tamano_bytes INTEGER NULL,
      estado_documental VARCHAR(64) NOT NULL DEFAULT 'ACTA_RECEPCION_VISADA_ALMACEN',
      observacion TEXT NULL,
      vigente BOOLEAN NOT NULL DEFAULT TRUE,
      reemplaza_id INTEGER NULL,
      idempotency_key VARCHAR(120) NULL,
      created_by VARCHAR(150) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP NULL,
      deleted_by VARCHAR(150) NULL,
      deleted_motivo TEXT NULL
    )
  `).catch(() => {});
  await query('CREATE INDEX IF NOT EXISTS idx_rbav_exp ON recepcion_bienes_acta_visados(expediente_recepcion_id)').catch(() => {});
  await query('CREATE INDEX IF NOT EXISTS idx_rbav_acta ON recepcion_bienes_acta_visados(acta_id)').catch(() => {});
  await query(`
    ALTER TABLE recepcion_bienes_documentos
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(150) NULL,
      ADD COLUMN IF NOT EXISTS deleted_motivo TEXT NULL
  `).catch(() => {});
  _visadosTableReady = true;
}

function assertPuedeGestionarVisadoAlmacen(rol) {
  const actor = resolveRolActor(rol);
  const r = String(rol || '').toLowerCase();
  if (actor !== 'ALMACEN' && !['admin', 'dec', 'almacen'].includes(r)) {
    throw httpError('Solo Almacén puede gestionar el acta visada', 403, 'PERMISO_DENEGADO');
  }
  return actor;
}

function validatePdfVisadaPayload(body = {}) {
  const b64raw = body.acta_visada_base64 || body.documento_base64 || body.archivo_base64 || body.contenido_base64;
  if (!b64raw) throw httpError('Archivo de acta visada obligatorio', 400, 'ARCHIVO_REQUERIDO');
  let raw = String(b64raw);
  if (raw.includes('base64,')) raw = raw.split('base64,').pop();
  raw = raw.replace(/\s+/g, '');
  if (!raw) throw httpError('Archivo vacío', 400, 'ARCHIVO_VACIO');

  let buf;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch (_) {
    throw httpError('Archivo inválido', 400, 'ARCHIVO_INVALIDO');
  }
  if (!buf.length) throw httpError('Archivo vacío', 400, 'ARCHIVO_VACIO');
  if (buf.length > MAX_ACTA_VISADA_BYTES) {
    throw httpError('El PDF supera el tamaño máximo permitido (10 MB)', 400, 'ARCHIVO_DEMASIADO_GRANDE');
  }
  if (buf.slice(0, 5).toString('utf8') !== '%PDF-') {
    throw httpError('Solo se aceptan archivos PDF válidos', 400, 'SOLO_PDF');
  }

  let nombre = String(body.acta_visada_nombre || body.nombre || body.documento_nombre || 'acta-visada.pdf')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .slice(0, 200);
  if (!/\.pdf$/i.test(nombre)) nombre = `${nombre}.pdf`;
  const mime = String(body.acta_visada_mime || body.mime_type || body.mimeType || 'application/pdf').toLowerCase();
  if (mime && mime !== 'application/pdf' && mime !== 'application/x-pdf') {
    throw httpError('MIME no permitido. Solo application/pdf', 400, 'SOLO_PDF');
  }
  return { raw, nombre, mime: 'application/pdf', tamano: buf.length };
}

export function mapVisadoDoc(row, expedienteId, actaId) {
  const vigente = !!row.vigente && !row.deleted_at;
  const estado = row.estado_documental;
  return {
    documentoId: row.id,
    actaId: Number(actaId || row.acta_id),
    nombre: row.nombre,
    mimeType: row.mime_type || 'application/pdf',
    tamano: row.tamano_bytes || null,
    version: row.version,
    estadoDocumental: estado,
    fechaRegistro: row.created_at,
    registradoPor: row.created_by || null,
    observacion: row.observacion || null,
    vigente,
    reemplazaId: row.reemplaza_id || null,
    previewDisponible: true,
    downloadEndpoint: `/api/recepcion-bienes/${expedienteId}/documentos/acta_visada/${row.id}`,
    puedeReemplazar: vigente && estado === 'ACTA_RECEPCION_VISADA_ALMACEN',
    puedeEliminar: vigente && ['ACTA_RECEPCION_VISADA_ALMACEN', 'ACTA_RECEPCION_GENERADA'].includes(estado),
  };
}

async function getActaOrThrow(expedienteId, actaId) {
  const { rows } = await query(`
    SELECT * FROM recepcion_bienes_actas
    WHERE id = $1 AND expediente_recepcion_id = $2 AND eliminado_at IS NULL
  `, [actaId, expedienteId]);
  if (!rows.length) throw httpError('Acta no encontrada', 404);
  return rows[0];
}

async function syncActaVisadaMirror(acta, visado, usuario) {
  if (!visado) {
    await query(`
      UPDATE recepcion_bienes_actas SET
        acta_visada_nombre = NULL,
        acta_visada_mime = NULL,
        acta_visada_base64 = NULL,
        visado_almacen_at = NULL,
        visado_almacen_por = NULL,
        observacion_visado = NULL,
        estado_documental = CASE
          WHEN documento_base64 IS NOT NULL THEN 'ACTA_RECEPCION_GENERADA'
          ELSE 'ACTA_RECEPCION_BORRADOR'
        END,
        updated_at = NOW()
      WHERE id = $1
    `, [acta.id]);
    return;
  }
  await query(`
    UPDATE recepcion_bienes_actas SET
      estado_documental = 'ACTA_RECEPCION_VISADA_ALMACEN',
      acta_visada_nombre = $2,
      acta_visada_mime = $3,
      acta_visada_base64 = $4,
      visado_almacen_at = COALESCE(visado_almacen_at, NOW()),
      visado_almacen_por = COALESCE($5, visado_almacen_por),
      observacion_visado = COALESCE($6, observacion_visado),
      updated_at = NOW()
    WHERE id = $1
  `, [
    acta.id,
    visado.nombre,
    visado.mime_type,
    visado.contenido_base64,
    String(usuario || visado.created_by || '').slice(0, 150) || null,
    visado.observacion || null,
  ]);
}

async function assertActaPuedeModificarVisado(acta) {
  if (acta.enviado_au_at || acta.estado_documental === 'ACTA_RECEPCION_ENVIADA_AU'
    || acta.firmado_au_at || acta.estado_documental === 'ACTA_RECEPCION_FIRMADA_AU') {
    throw httpError(
      'El acta no puede eliminarse porque ya fue derivada o firmada.',
      409,
      'ACTA_VISADA_NO_ELIMINABLE',
    );
  }
}

export async function tieneActaVisadaVigente(expedienteId, actaId = null) {
  await ensureActaVisadosTable();
  const params = [expedienteId];
  let sql = `
    SELECT 1 FROM recepcion_bienes_acta_visados
    WHERE expediente_recepcion_id = $1
      AND vigente = TRUE AND deleted_at IS NULL
      AND estado_documental = 'ACTA_RECEPCION_VISADA_ALMACEN'
  `;
  if (actaId) {
    params.push(actaId);
    sql += ' AND acta_id = $2';
  }
  sql += ' LIMIT 1';
  const { rows } = await query(sql, params).catch(() => ({ rows: [] }));
  if (rows.length) return true;
  const { rows: legacy } = await query(`
    SELECT 1 FROM recepcion_bienes_actas
    WHERE expediente_recepcion_id = $1 AND eliminado_at IS NULL
      AND acta_visada_base64 IS NOT NULL
      AND estado_documental = 'ACTA_RECEPCION_VISADA_ALMACEN'
      ${actaId ? 'AND id = $2' : ''}
    LIMIT 1
  `, actaId ? [expedienteId, actaId] : [expedienteId]);
  return !!legacy.length;
}

export async function listarVisadosDetalle(expedienteId) {
  await ensureActaVisadosTable();
  const { rows } = await query(`
    SELECT id, acta_id, version, nombre, mime_type, tamano_bytes, estado_documental,
      observacion, vigente, reemplaza_id, created_by, created_at, deleted_at
    FROM recepcion_bienes_acta_visados
    WHERE expediente_recepcion_id = $1 AND deleted_at IS NULL
    ORDER BY version DESC, id DESC
  `, [expedienteId]).catch(() => ({ rows: [] }));
  return rows.map((r) => mapVisadoDoc(r, expedienteId, r.acta_id));
}

export async function adjuntarActaVisadaAlmacen(expedienteId, body = {}, usuario = '', rol = '') {
  await ensureActaVisadosTable();
  const exp = await getExpedienteOrThrow(expedienteId);
  const actor = assertPuedeGestionarVisadoAlmacen(rol);

  if (!['BIEN_RECIBIDO_ALMACEN', 'RECEPCION_BIENES_OBSERVADA'].includes(exp.estado_global)) {
    throw httpError('Estado no permite adjuntar acta visada', 409);
  }

  const actaId = body.acta_id || body.actaId
    ? parseInt(body.acta_id || body.actaId, 10)
    : null;
  let acta;
  if (actaId) {
    acta = await getActaOrThrow(exp.id, actaId);
  } else {
    const { rows } = await query(`
      SELECT * FROM recepcion_bienes_actas
      WHERE expediente_recepcion_id = $1 AND eliminado_at IS NULL
      ORDER BY id DESC LIMIT 1
    `, [exp.id]);
    if (!rows.length) {
      throw httpError('Debe generar el acta antes de adjuntar la versión visada', 409, 'ACTA_REQUERIDA');
    }
    acta = rows[0];
  }

  await assertActaPuedeModificarVisado(acta);
  const file = validatePdfVisadaPayload(body);
  const observacion = body.observacion || body.observaciones || null;
  const idem = String(
    body.idempotency_key || `acta-visada-${acta.id}-v${file.tamano}-${file.nombre}`,
  ).slice(0, 120);

  const existingIdem = await query(`
    SELECT * FROM recepcion_bienes_acta_visados
    WHERE expediente_recepcion_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL
    LIMIT 1
  `, [exp.id, idem]).catch(() => ({ rows: [] }));
  if (existingIdem.rows?.length) {
    return {
      ok: true,
      idempotent: true,
      ...mapVisadoDoc(existingIdem.rows[0], exp.id, acta.id),
      data: await getDetalleSafe(exp.id),
    };
  }

  const { rows: verRows } = await query(`
    SELECT COALESCE(MAX(version), 0)::int AS v FROM recepcion_bienes_acta_visados WHERE acta_id = $1
  `, [acta.id]);
  const nextVersion = Number(verRows[0]?.v || 0) + 1;

  await query(`
    UPDATE recepcion_bienes_acta_visados SET
      vigente = FALSE,
      estado_documental = 'ACTA_RECEPCION_REEMPLAZADA'
    WHERE acta_id = $1 AND vigente = TRUE AND deleted_at IS NULL
  `, [acta.id]);

  const { rows: docRows } = await query(`
    INSERT INTO recepcion_bienes_documentos
      (expediente_recepcion_id, recepcion_bien_id, tipo, nombre, mime_type, contenido_base64,
       version, vigente, origen, observacion, created_by)
    VALUES ($1,$2,'ACTA_VISADA_ALMACEN',$3,$4,$5,$6,TRUE,'ALMACEN',$7,$8)
    RETURNING id
  `, [
    exp.id,
    acta.recepcion_bien_id || body.recepcion_id || null,
    file.nombre, file.mime, file.raw, nextVersion, observacion,
    String(usuario || '').slice(0, 150),
  ]);

  const { rows: visRows } = await query(`
    INSERT INTO recepcion_bienes_acta_visados
      (expediente_recepcion_id, acta_id, documento_recepcion_id, version, nombre, mime_type,
       contenido_base64, tamano_bytes, estado_documental, observacion, vigente,
       idempotency_key, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTA_RECEPCION_VISADA_ALMACEN',$9,TRUE,$10,$11)
    RETURNING *
  `, [
    exp.id, acta.id, docRows[0]?.id || null, nextVersion, file.nombre, file.mime,
    file.raw, file.tamano, observacion, idem, String(usuario || '').slice(0, 150),
  ]);

  const visado = visRows[0];
  await syncActaVisadaMirror(acta, visado, usuario);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'ACTA_VISADA_ADJUNTADA',
    estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
    usuario, rol: actor, motivo: observacion || file.nombre,
    metadata: {
      acta_id: acta.id,
      documento_id: visado.id,
      documento_recepcion_id: visado.documento_recepcion_id,
      version: visado.version,
      idempotency_key: idem,
      estado_anterior: acta.estado_documental,
      estado_nuevo: 'ACTA_RECEPCION_VISADA_ALMACEN',
      orden_id: exp.orden_id,
      recepcion_id: acta.recepcion_bien_id,
    },
  });
  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'ACTA_RECEPCION_VISADA_ALMACEN',
    estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
    usuario, rol: actor, motivo: observacion || acta.numero_acta,
    metadata: {
      acta_id: acta.id, version: visado.version, documento_id: visado.id, idempotency_key: idem,
    },
  });

  return {
    ok: true,
    ...mapVisadoDoc(visado, exp.id, acta.id),
    data: await getDetalleSafe(exp.id),
  };
}

export async function listarActaVisada(expedienteId, actaId) {
  await ensureActaVisadosTable();
  const exp = await getExpedienteOrThrow(expedienteId);
  const acta = await getActaOrThrow(exp.id, parseInt(actaId, 10));
  const { rows } = await query(`
    SELECT * FROM recepcion_bienes_acta_visados
    WHERE expediente_recepcion_id = $1 AND acta_id = $2 AND deleted_at IS NULL
    ORDER BY version DESC, id DESC
  `, [exp.id, acta.id]);

  if (!rows.length && acta.acta_visada_base64) {
    return {
      ok: true,
      actaId: acta.id,
      items: [{
        documentoId: `legacy-${acta.id}`,
        actaId: acta.id,
        nombre: acta.acta_visada_nombre || 'acta-visada.pdf',
        mimeType: acta.acta_visada_mime || 'application/pdf',
        tamano: null,
        version: Number(acta.version || 1),
        estadoDocumental: 'ACTA_RECEPCION_VISADA_ALMACEN',
        fechaRegistro: acta.visado_almacen_at,
        registradoPor: acta.visado_almacen_por,
        observacion: acta.observacion_visado,
        vigente: true,
        previewDisponible: true,
        downloadEndpoint: `/api/recepcion-bienes/${exp.id}/documentos/acta_visada_legacy/${acta.id}`,
        puedeReemplazar: !acta.enviado_au_at && !acta.firmado_au_at,
        puedeEliminar: !acta.enviado_au_at && !acta.firmado_au_at,
        legacy: true,
      }],
    };
  }
  return { ok: true, actaId: acta.id, items: rows.map((r) => mapVisadoDoc(r, exp.id, acta.id)) };
}

export async function obtenerActaVisada(expedienteId, actaId, documentoId) {
  await ensureActaVisadosTable();
  const exp = await getExpedienteOrThrow(expedienteId);
  const acta = await getActaOrThrow(exp.id, parseInt(actaId, 10));
  const docId = String(documentoId);
  if (docId.startsWith('legacy')) {
    if (!acta.acta_visada_base64) throw httpError('Documento no encontrado', 404);
    return {
      ok: true,
      ...mapVisadoDoc({
        id: `legacy-${acta.id}`,
        acta_id: acta.id,
        nombre: acta.acta_visada_nombre || 'acta-visada.pdf',
        mime_type: acta.acta_visada_mime || 'application/pdf',
        tamano_bytes: null,
        version: acta.version || 1,
        estado_documental: 'ACTA_RECEPCION_VISADA_ALMACEN',
        created_at: acta.visado_almacen_at,
        created_by: acta.visado_almacen_por,
        observacion: acta.observacion_visado,
        vigente: true,
        deleted_at: null,
        reemplaza_id: null,
      }, exp.id, acta.id),
      contenido_base64: acta.acta_visada_base64,
    };
  }
  const id = parseInt(documentoId, 10);
  const { rows } = await query(`
    SELECT * FROM recepcion_bienes_acta_visados
    WHERE id = $1 AND expediente_recepcion_id = $2 AND acta_id = $3 AND deleted_at IS NULL
  `, [id, exp.id, acta.id]);
  if (!rows.length) throw httpError('Documento no encontrado', 404);
  return {
    ok: true,
    ...mapVisadoDoc(rows[0], exp.id, acta.id),
    contenido_base64: rows[0].contenido_base64,
  };
}

export async function reemplazarActaVisada(
  expedienteId, actaId, documentoId, body = {}, usuario = '', rol = '',
) {
  await ensureActaVisadosTable();
  const exp = await getExpedienteOrThrow(expedienteId);
  const actor = assertPuedeGestionarVisadoAlmacen(rol);
  const acta = await getActaOrThrow(exp.id, parseInt(actaId, 10));
  await assertActaPuedeModificarVisado(acta);

  const prevId = parseInt(documentoId, 10);
  const { rows: prevRows } = await query(`
    SELECT * FROM recepcion_bienes_acta_visados
    WHERE id = $1 AND expediente_recepcion_id = $2 AND acta_id = $3 AND deleted_at IS NULL
  `, [prevId, exp.id, acta.id]);
  const prev = prevRows[0] || null;
  if (!prev && !String(documentoId).startsWith('legacy')) {
    throw httpError('Documento a reemplazar no encontrado', 404);
  }

  const result = await adjuntarActaVisadaAlmacen(exp.id, {
    ...body,
    acta_id: acta.id,
    idempotency_key: body.idempotency_key || `reemp-${prevId || 'legacy'}-${Date.now()}`,
  }, usuario, rol);

  if (prev) {
    await query(`
      UPDATE recepcion_bienes_acta_visados SET
        vigente = FALSE, estado_documental = 'ACTA_RECEPCION_REEMPLAZADA'
      WHERE id = $1
    `, [prev.id]);
    await query(`
      UPDATE recepcion_bienes_acta_visados SET reemplaza_id = $2 WHERE id = $1
    `, [result.documentoId, prev.id]).catch(() => {});
  }

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'ACTA_VISADA_REEMPLAZADA',
    estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
    usuario, rol: actor,
    motivo: body.motivo || body.observacion || 'Reemplazo de acta visada',
    metadata: {
      acta_id: acta.id,
      documento_anterior_id: prev?.id || documentoId,
      documento_nuevo_id: result.documentoId,
      version_anterior: prev?.version || null,
      version_nueva: result.version,
      estado_anterior: prev?.estado_documental || 'ACTA_RECEPCION_VISADA_ALMACEN',
      estado_nuevo: 'ACTA_RECEPCION_VISADA_ALMACEN',
    },
  });

  return result;
}

export async function eliminarActaVisada(
  expedienteId, actaId, documentoId, body = {}, usuario = '', rol = '',
) {
  await ensureActaVisadosTable();
  const exp = await getExpedienteOrThrow(expedienteId);
  const actor = assertPuedeGestionarVisadoAlmacen(rol);
  const acta = await getActaOrThrow(exp.id, parseInt(actaId, 10));
  await assertActaPuedeModificarVisado(acta);

  const motivo = String(body.motivo || body.observacion || '').trim();
  if (!motivo) throw httpError('El motivo de eliminación es obligatorio', 400, 'MOTIVO_REQUERIDO');

  const docIdStr = String(documentoId);
  if (docIdStr.startsWith('legacy')) {
    await syncActaVisadaMirror(acta, null, usuario);
    await registrarEvento({
      expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'ACTA_VISADA_ELIMINADA',
      estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
      usuario, rol: actor, motivo,
      metadata: {
        acta_id: acta.id, documento_id: docIdStr, version: acta.version,
        estado_anterior: 'ACTA_RECEPCION_VISADA_ALMACEN',
        estado_nuevo: 'ACTA_RECEPCION_ELIMINADA',
      },
    });
    return { ok: true, eliminado: true, legacy: true, data: await getDetalleSafe(exp.id) };
  }

  const id = parseInt(documentoId, 10);
  const { rows } = await query(`
    SELECT * FROM recepcion_bienes_acta_visados
    WHERE id = $1 AND expediente_recepcion_id = $2 AND acta_id = $3
  `, [id, exp.id, acta.id]);
  if (!rows.length) throw httpError('Documento no encontrado', 404);
  const doc = rows[0];
  if (doc.deleted_at) {
    return { ok: true, eliminado: true, idempotent: true, documentoId: doc.id };
  }

  await query(`
    UPDATE recepcion_bienes_acta_visados SET
      deleted_at = NOW(), deleted_by = $2, deleted_motivo = $3,
      vigente = FALSE, estado_documental = 'ACTA_RECEPCION_ELIMINADA'
    WHERE id = $1
  `, [doc.id, String(usuario || '').slice(0, 150), motivo.slice(0, 500)]);

  if (doc.documento_recepcion_id) {
    await query(`
      UPDATE recepcion_bienes_documentos SET
        vigente = FALSE, deleted_at = NOW(), deleted_by = $2, deleted_motivo = $3
      WHERE id = $1
    `, [doc.documento_recepcion_id, String(usuario || '').slice(0, 150), motivo.slice(0, 500)]).catch(() => {});
  }

  const { rows: vigentes } = await query(`
    SELECT * FROM recepcion_bienes_acta_visados
    WHERE acta_id = $1 AND vigente = TRUE AND deleted_at IS NULL
    ORDER BY version DESC, id DESC LIMIT 1
  `, [acta.id]);
  await syncActaVisadaMirror(acta, vigentes[0] || null, usuario);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'ACTA_VISADA_ELIMINADA',
    estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
    usuario, rol: actor, motivo,
    metadata: {
      acta_id: acta.id, documento_id: doc.id, version: doc.version,
      estado_anterior: doc.estado_documental, estado_nuevo: 'ACTA_RECEPCION_ELIMINADA',
    },
  });

  return {
    ok: true,
    eliminado: true,
    documentoId: doc.id,
    data: await getDetalleSafe(exp.id),
  };
}

export async function getContenidoActaVisada(expedienteId, docId) {
  await ensureActaVisadosTable();
  const exp = await getExpedienteOrThrow(expedienteId);
  const idStr = String(docId);
  if (idStr.startsWith('legacy') || /legacy/i.test(idStr)) {
    const actaId = parseInt(idStr.replace(/\D/g, ''), 10);
    const { rows } = await query(`
      SELECT id, acta_visada_nombre AS nombre, acta_visada_mime AS mime_type,
        acta_visada_base64 AS contenido_base64
      FROM recepcion_bienes_actas
      WHERE expediente_recepcion_id = $1 AND id = $2
    `, [exp.id, actaId]);
    if (!rows.length || !rows[0].contenido_base64) throw httpError('Acta visada no encontrada', 404);
    return rows[0];
  }
  const id = parseInt(docId, 10);
  const { rows } = await query(`
    SELECT id, nombre, mime_type, contenido_base64, version, estado_documental
    FROM recepcion_bienes_acta_visados
    WHERE expediente_recepcion_id = $1 AND id = $2 AND deleted_at IS NULL
  `, [exp.id, id]);
  if (!rows.length) throw httpError('Acta visada no encontrada', 404);
  return rows[0];
}
