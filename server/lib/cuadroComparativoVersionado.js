/**
 * RC8.7 — Versionado documental del Cuadro Comparativo.
 * Al observar (Coordinador/DEC): archiva versión (ANULADO, se conserva) y crea N+1 editable.
 */
import { query } from '../db.js';

function parseJson(raw, fallback = {}) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || fallback);
  } catch (_) {
    return fallback;
  }
}

/** Copia datos económicos; elimina firmas/aprobaciones/conformidades. */
export function copiarDatosParaNuevaVersion(prev = {}, obsRecord = {}) {
  const historialRev = Array.isArray(prev.historial_revision) ? [...prev.historial_revision] : [];
  historialRev.push({
    at: obsRecord.fecha || new Date().toISOString(),
    usuario: obsRecord.usuario || '',
    accion: obsRecord.accion || 'OBSERVAR',
    estado: obsRecord.estado || '',
    observacion: obsRecord.observacion || '',
    motivo: obsRecord.motivo || undefined,
    descripcion: obsRecord.descripcion || undefined,
    comentario: obsRecord.comentario || undefined,
    version_origen: obsRecord.version_origen,
  });

  const historialVersiones = Array.isArray(prev.historial_versiones)
    ? [...prev.historial_versiones]
    : [];
  historialVersiones.push(obsRecord);

  return {
    items: prev.items || [],
    primera_fuente: prev.primera_fuente || [],
    segunda_fuente: prev.segunda_fuente || [],
    adjudicacion: prev.adjudicacion || null,
    historial_adjudicacion: prev.historial_adjudicacion || [],
    resumen_proveedores: prev.resumen_proveedores || [],
    inconsistencias: prev.inconsistencias || [],
    solicitud: prev.solicitud || null,
    requerimientos: prev.requerimientos || [],
    notas_internas: prev.notas_internas || '',
    meta: {
      ...(prev.meta || {}),
      pdf_modo: undefined,
      puede_pdf_oficial: false,
    },
    // Sin conformidades / firmas / aprobaciones
    revision_coordinador: null,
    revision_dec: null,
    historial_revision: historialRev.slice(-40),
    historial_versiones: historialVersiones.slice(-50),
    observacion_pendiente: obsRecord,
    respuesta_observaciones: '',
    version_meta: {
      vigente: true,
      version_origen: obsRecord.version_origen,
      cuadro_origen_id: obsRecord.cuadro_origen_id,
      creado_por_observacion: true,
      creado_at: obsRecord.fecha || new Date().toISOString(),
    },
  };
}

export async function nextVersionNumber(solicitudId, tipo) {
  const { rows } = await query(`
    SELECT COALESCE(MAX(version), 0) + 1 AS next
    FROM cuadros_comparativos
    WHERE solicitud_id = $1 AND tipo = $2
  `, [solicitudId, tipo]);
  return Number(rows[0]?.next || 1);
}

/**
 * Archiva la versión observada (ANULADO, se conserva) e inserta versión N+1 editable.
 * @returns {{ cuadroArchivado, cuadroNuevo, version_nueva, observacion }}
 */
export async function crearNuevaVersionPorObservacion(cur, {
  accion,
  user,
  motivo,
  descripcion = '',
  observacion = '',
  comentario = '',
  estadoDestino,
} = {}) {
  if (!cur?.id) throw new Error('Cuadro origen inválido');
  const datosPrev = parseJson(cur.datos_json, {});
  const nextVersion = await nextVersionNumber(cur.solicitud_id, cur.tipo);
  const fecha = new Date().toISOString();

  const obsRecord = {
    version_origen: Number(cur.version || 1),
    version_nueva: nextVersion,
    cuadro_origen_id: cur.id,
    accion: String(accion || '').toUpperCase(),
    motivo: String(motivo || '').trim(),
    descripcion: String(descripcion || '').trim() || undefined,
    observacion: String(observacion || '').trim(),
    comentario: String(comentario || '').trim() || undefined,
    usuario: String(user || '').slice(0, 150),
    fecha,
    estado: estadoDestino,
  };

  // 1) Archivar versión anterior (nunca eliminar): conserva PDF/firmas/datos
  const datosArchivo = {
    ...datosPrev,
    version_meta: {
      ...(datosPrev.version_meta || {}),
      vigente: false,
      supersedido_por_version: nextVersion,
      observado: obsRecord,
      archivado_at: fecha,
      archivado_por: obsRecord.usuario,
    },
  };
  if (accion === 'OBSERVAR_COORDINADOR') {
    datosArchivo.revision_coordinador = {
      ...(datosPrev.revision_coordinador || {}),
      conformidad: false,
      observacion: {
        motivo: obsRecord.motivo,
        descripcion: obsRecord.descripcion,
        observacion: obsRecord.observacion,
      },
      observado_at: fecha,
      observado_por: obsRecord.usuario,
    };
  }
  if (accion === 'OBSERVAR_DEC' || accion === 'OBSERVAR_DEC_A_COORD') {
    datosArchivo.revision_dec = {
      ...(datosPrev.revision_dec || {}),
      conformidad: false,
      observacion: {
        motivo: obsRecord.motivo,
        observacion: obsRecord.observacion,
        comentario: obsRecord.comentario,
        destino: accion === 'OBSERVAR_DEC_A_COORD' ? 'COORDINADOR_CM' : 'ANALISTA',
      },
      observado_at: fecha,
      observado_por: obsRecord.usuario,
    };
  }

  await query(`
    UPDATE cuadros_comparativos
    SET estado = 'ANULADO',
        datos_json = $2::jsonb,
        actualizado_por = $3,
        actualizado_at = NOW()
    WHERE id = $1 AND estado <> 'ANULADO'
  `, [cur.id, JSON.stringify(datosArchivo), obsRecord.usuario]);

  // 2) Nueva versión editable (sin firmas / PDF / conformidades)
  const datosNuevos = copiarDatosParaNuevaVersion(datosPrev, obsRecord);
  const { rows } = await query(`
    INSERT INTO cuadros_comparativos (
      solicitud_id, tipo, version, estado, datos_json,
      proveedor_ganador_id, criterio_seleccion, sustento_decision, valor_adjudicado,
      usuario_adjudicacion, fecha_adjudicacion, modalidad_adjudicacion,
      pdf_nombre, pdf_contenido,
      firmado_nombre, firmado_contenido, firmado_por, firmado_at,
      firmado_dec_nombre, firmado_dec_contenido, firmado_dec_por, firmado_dec_at,
      creado_por, actualizado_por, creado_at, actualizado_at
    ) VALUES (
      $1, $2, $3, $4, $5::jsonb,
      $6, $7, $8, $9,
      $10, $11, $12,
      NULL, NULL,
      NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL,
      $13, $13, NOW(), NOW()
    )
    RETURNING *
  `, [
    cur.solicitud_id,
    cur.tipo,
    nextVersion,
    estadoDestino,
    JSON.stringify(datosNuevos),
    cur.proveedor_ganador_id,
    cur.criterio_seleccion,
    cur.sustento_decision,
    cur.valor_adjudicado,
    cur.usuario_adjudicacion,
    cur.fecha_adjudicacion,
    cur.modalidad_adjudicacion,
    obsRecord.usuario,
  ]);

  return {
    cuadroArchivado: { id: cur.id, version: cur.version, estado: 'ANULADO' },
    cuadroNuevo: rows[0],
    version_nueva: nextVersion,
    observacion: obsRecord,
  };
}

export function metaVersionDesdeRow(row) {
  const datos = parseJson(row?.datos_json, {});
  const obs = datos.version_meta?.observado
    || datos.observacion_pendiente
    || (Array.isArray(datos.historial_versiones) ? datos.historial_versiones.slice(-1)[0] : null);
  const vigente = String(row?.estado || '').toUpperCase() !== 'ANULADO';
  return {
    vigente,
    motivo: obs?.motivo || '',
    usuario_version: obs?.usuario || row?.actualizado_por || row?.creado_por || '',
    fecha_version: obs?.fecha || row?.actualizado_at || row?.creado_at || null,
    observacion: obs?.observacion || '',
    descripcion: obs?.descripcion || '',
    comentario: obs?.comentario || '',
    accion_origen: obs?.accion || '',
    version_origen: obs?.version_origen || null,
    respuesta_observaciones: datos.respuesta_observaciones || '',
    observacion_pendiente: datos.observacion_pendiente || null,
    historial_versiones: Array.isArray(datos.historial_versiones) ? datos.historial_versiones : [],
  };
}
