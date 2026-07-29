/**
 * Ejecución → Recepción de Bienes.
 * Consume órdenes OC notificadas (no duplica ordenes_contratacion).
 */
import { query } from '../db.js';
import {
  resolveEstadoExpedienteVigente,
  normalizeEstadoCode,
  getLabelEstado,
} from '../../shared/estadoExpedienteVigente.js';
import { validateEstadoTransition } from '../../shared/validateEstadoTransition.js';

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function isOrdenBienes(tipoOrden, tipoReq) {
  const to = String(tipoOrden || '').toUpperCase();
  if (to === 'OC') return true;
  if (to === 'OS') return false;
  const raw = String(tipoReq || '').toUpperCase();
  if (/SERVIC/.test(raw) || /LOCADOR/.test(raw)) return false;
  return true;
}

function resolveRolActor(usuario = {}, rolHint = '') {
  const rol = String(rolHint || usuario.rol || usuario.role || '').toLowerCase();
  if (rol === 'admin' || rol === 'dec') return 'ALMACEN'; // DEC opera almacén por defecto en esta fase
  if (rol === 'au' || rol === 'area_usuaria') return 'AREA_USUARIA';
  if (rol === 'cm' || rol === 'coordinador' || rol === 'coordinador_cm') return 'COORDINADOR_CM';
  if (rol === 'analista' || rol === 'tesoreria' || rol === 'pago') return 'ANALISTA_PAGO';
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

/**
 * Asegura expediente de recepción para una OC notificada.
 */
export async function asegurarExpedienteRecepcionDesdeOrden(ordenId, usuario = 'Sistema') {
  const oid = parseInt(ordenId, 10);
  if (!Number.isFinite(oid)) throw httpError('orden_id inválido');

  const { rows } = await query(`
    SELECT oc.id, oc.requerimiento_id, oc.tipo_orden, oc.estado, oc.enviado_proveedor_at,
      oc.numero_orden, r.tipo AS req_tipo
    FROM ordenes_contratacion oc
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    WHERE oc.id = $1
  `, [oid]);
  if (!rows.length) throw httpError('Orden no encontrada', 404);
  const orden = rows[0];

  if (!isOrdenBienes(orden.tipo_orden, orden.req_tipo)) {
    return null;
  }
  if (!orden.enviado_proveedor_at
    && normalizeEstadoCode(orden.estado) !== 'ORDEN_NOTIFICADA') {
    return null;
  }
  if (['ORDEN_ANULADA', 'ANULADA'].includes(String(orden.estado || '').toUpperCase())) {
    return null;
  }

  const existing = await query(
    'SELECT * FROM recepcion_bienes_expedientes WHERE orden_id = $1',
    [oid],
  );
  if (existing.rows.length) return existing.rows[0];

  const { rows: created } = await query(`
    INSERT INTO recepcion_bienes_expedientes
      (orden_id, requerimiento_id, estado_global, estado_interno, bandeja_actual, created_by, updated_by)
    VALUES ($1,$2,'RECEPCION_BIENES_PENDIENTE','PENDIENTE_RECEPCION','ALMACEN',$3,$3)
    ON CONFLICT (orden_id) DO UPDATE SET updated_at = NOW()
    RETURNING *
  `, [oid, orden.requerimiento_id, String(usuario || 'Sistema').slice(0, 150)]);

  const exp = created[0];
  await registrarEvento({
    expedienteId: exp.id,
    ordenId: oid,
    tipo: 'ORDEN_INGRESADA_RECEPCION_BIENES',
    estadoAnterior: 'ORDEN_NOTIFICADA',
    estadoNuevo: 'RECEPCION_BIENES_PENDIENTE',
    usuario,
    rol: 'SISTEMA',
    motivo: 'Ingreso automático tras notificación de OC',
  });
  return exp;
}

export async function sincronizarOrdenesElegibles(usuario = 'Sistema') {
  const { rows } = await query(`
    SELECT oc.id
    FROM ordenes_contratacion oc
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    LEFT JOIN recepcion_bienes_expedientes rbe ON rbe.orden_id = oc.id
    WHERE rbe.id IS NULL
      AND oc.enviado_proveedor_at IS NOT NULL
      AND UPPER(COALESCE(oc.estado,'')) NOT IN ('ORDEN_ANULADA','ANULADA')
      AND (
        UPPER(COALESCE(oc.tipo_orden,'')) = 'OC'
        OR (
          UPPER(COALESCE(oc.tipo_orden,'')) = ''
          AND UPPER(COALESCE(r.tipo,'')) !~ 'SERVIC'
          AND UPPER(COALESCE(r.tipo,'')) !~ 'LOCADOR'
        )
      )
    ORDER BY oc.id ASC
    LIMIT 500
  `);
  const out = [];
  for (const r of rows) {
    const exp = await asegurarExpedienteRecepcionDesdeOrden(r.id, usuario);
    if (exp) out.push(exp);
  }
  return { sincronizados: out.length };
}

function mapBandejaRow(row) {
  const vigente = resolveEstadoExpedienteVigente({
    codigo_ccp: row.codigo_ccp || '',
    ccp_activo: !!row.codigo_ccp,
    orden_id: row.orden_id,
    orden_estado: row.orden_estado,
    enviado_proveedor_at: row.enviado_proveedor_at,
    recepcion_estado_global: row.estado_global,
    recepcion_estado_interno: row.estado_interno,
    recepcion_bienes_expediente_id: row.id,
    orden_resuelta: normalizeEstadoCode(row.orden_estado) === 'ORDEN_RESUELTA',
    expediente_derivado_pago: row.estado_global === 'EXPEDIENTE_DERIVADO_PAGO',
  });

  return {
    id: row.id,
    expediente_recepcion_id: row.id,
    orden_id: row.orden_id,
    requerimiento_id: row.requerimiento_id,
    requerimiento_codigo: row.requerimiento_codigo || '',
    numero_orden: row.numero_orden || '',
    tipo_orden: row.tipo_orden || 'OC',
    fecha_emision: row.fecha_orden || null,
    proveedor_id: row.proveedor_id || null,
    proveedor_ruc: row.proveedor_ruc || '',
    proveedor_razon_social: row.proveedor_razon_social || '',
    monto_total: money(row.monto_total),
    moneda: row.moneda || 'PEN',
    plazo_total: row.plazo_total || null,
    fecha_notificacion: row.enviado_proveedor_at || null,
    fecha_recepcion_guia: row.ultima_fecha_guia || null,
    numero_guia: row.ultima_guia || '',
    monto_a_liquidar: money(row.monto_liquidar_acumulado),
    tipo_proceso: row.tipo_proceso || '',
    numero_contrato: row.numero_contrato || '',
    fecha_envio_au: row.fecha_envio_au || null,
    numero_entrega: row.ultima_entrega || null,
    fecha_entrega_almacen: row.ultima_fecha_almacen || null,
    responsable: row.actor_responsable || row.enviado_proveedor_por || '',
    bandeja_actual: row.bandeja_actual,
    estado_interno: row.estado_interno,
    estadoVigente: vigente.estadoVigente,
    estado_vigente: vigente.codigo,
    estado_vigente_label: vigente.label,
    etiqueta_estado: vigente.label,
    situacion: vigente.situacion
      ? { codigo: vigente.situacion.codigo, label: vigente.situacion.label }
      : null,
    estadoInterno: {
      codigo: row.estado_interno || row.estado_global,
      label: row.estado_interno || getLabelEstado(row.estado_global),
      modulo: 'RECEPCION_BIENES',
    },
  };
}

export async function listarBandejaRecepcionBienes({ rol = 'ALMACEN', usuario = '', userId = null } = {}) {
  await sincronizarOrdenesElegibles(usuario || 'Sistema');

  const actor = resolveRolActor({ rol }, rol);
  let whereBandeja = 'TRUE';
  const params = [];

  if (actor === 'AREA_USUARIA') {
    whereBandeja = `rbe.bandeja_actual = 'AREA_USUARIA'`;
    if (userId) {
      params.push(parseInt(userId, 10));
      whereBandeja += ` AND (rbe.actor_responsable_id = $${params.length} OR rbe.actor_responsable_id IS NULL)`;
    }
  } else if (actor === 'COORDINADOR_CM') {
    whereBandeja = `rbe.bandeja_actual IN ('COORDINADOR_CM','ALMACEN')
      AND rbe.estado_global IN ('CONFORMIDAD_EN_COORDINACION_CM','CONFORMIDAD_RECIBIDA_AU','BIEN_RECIBIDO_ALMACEN')`;
  } else if (actor === 'ANALISTA_PAGO') {
    whereBandeja = `rbe.estado_global = 'EXPEDIENTE_DERIVADO_PAGO'`;
  } else {
    // ALMACEN / admin / dec: ve pendientes y en su bandeja
    whereBandeja = `rbe.bandeja_actual IN ('ALMACEN','AREA_USUARIA','COORDINADOR_CM')
      OR rbe.estado_global IN (
        'RECEPCION_BIENES_PENDIENTE','BIEN_RECIBIDO_ALMACEN',
        'CONFORMIDAD_PENDIENTE_AU','CONFORMIDAD_RECIBIDA_AU',
        'CONFORMIDAD_EN_COORDINACION_CM','EXPEDIENTE_DERIVADO_PAGO'
      )`;
  }

  const { rows } = await query(`
    SELECT rbe.*,
      oc.numero_orden, oc.fecha_orden, oc.monto_total, oc.moneda, oc.tipo_orden,
      oc.estado AS orden_estado, oc.enviado_proveedor_at, oc.enviado_proveedor_por,
      oc.proveedor_id, r.codigo AS requerimiento_codigo,
      p.ruc AS proveedor_ruc, p.razon_social AS proveedor_razon_social,
      (
        SELECT string_agg(DISTINCT oi.plazo_ofertado, ' / ')
        FROM orden_items oi WHERE oi.orden_id = oc.id
      ) AS plazo_total,
      (
        SELECT rb.fecha_recepcion_guia FROM recepciones_bienes rb
        WHERE rb.expediente_recepcion_id = rbe.id
        ORDER BY rb.id DESC LIMIT 1
      ) AS ultima_fecha_guia,
      (
        SELECT rb.fecha_entrega_almacen FROM recepciones_bienes rb
        WHERE rb.expediente_recepcion_id = rbe.id
        ORDER BY rb.id DESC LIMIT 1
      ) AS ultima_fecha_almacen,
      (
        SELECT rb.numero_entrega FROM recepciones_bienes rb
        WHERE rb.expediente_recepcion_id = rbe.id
        ORDER BY rb.id DESC LIMIT 1
      ) AS ultima_entrega,
      (
        SELECT g.numero_guia FROM recepcion_bienes_guias g
        JOIN recepciones_bienes rb ON rb.id = g.recepcion_bien_id
        WHERE rb.expediente_recepcion_id = rbe.id
        ORDER BY g.id DESC LIMIT 1
      ) AS ultima_guia,
      (
        SELECT a.enviado_au_at FROM recepcion_bienes_actas a
        WHERE a.expediente_recepcion_id = rbe.id
        ORDER BY a.id DESC LIMIT 1
      ) AS fecha_envio_au,
      (
        SELECT cod.codigo_ccp FROM ccp_codigos cod
        WHERE cod.requerimiento_id = rbe.requerimiento_id AND cod.estado = 'ACTIVO'
        ORDER BY cod.id DESC LIMIT 1
      ) AS codigo_ccp
    FROM recepcion_bienes_expedientes rbe
    JOIN ordenes_contratacion oc ON oc.id = rbe.orden_id
    LEFT JOIN requerimientos r ON r.id = rbe.requerimiento_id
    LEFT JOIN proveedores p ON p.id = oc.proveedor_id
    WHERE (${whereBandeja})
    ORDER BY rbe.updated_at DESC, rbe.id DESC
    LIMIT 500
  `, params);

  return rows.map(mapBandejaRow);
}

async function getExpedienteOrThrow(id) {
  const eid = parseInt(id, 10);
  if (!Number.isFinite(eid)) throw httpError('id inválido');
  const { rows } = await query(`
    SELECT rbe.*, oc.numero_orden, oc.fecha_orden, oc.monto_total, oc.moneda,
      oc.tipo_orden, oc.estado AS orden_estado, oc.enviado_proveedor_at,
      oc.proveedor_id, oc.requerimiento_id AS oc_req_id,
      r.codigo AS requerimiento_codigo, r.denominacion, r.tipo AS req_tipo,
      p.ruc AS proveedor_ruc, p.razon_social AS proveedor_razon_social
    FROM recepcion_bienes_expedientes rbe
    JOIN ordenes_contratacion oc ON oc.id = rbe.orden_id
    LEFT JOIN requerimientos r ON r.id = rbe.requerimiento_id
    LEFT JOIN proveedores p ON p.id = oc.proveedor_id
    WHERE rbe.id = $1
  `, [eid]);
  if (!rows.length) throw httpError('Expediente de recepción no encontrado', 404);
  return rows[0];
}

export async function getDetalleRecepcionBienes(id) {
  const exp = await getExpedienteOrThrow(id);
  const [items, entregas, recepciones, docsOrden, docsRec, actas, historial, docsExp] = await Promise.all([
    query('SELECT * FROM orden_items WHERE orden_id = $1 ORDER BY id', [exp.orden_id]),
    query(`SELECT * FROM orden_entregas WHERE orden_id = $1 AND estado <> 'ANULADO' ORDER BY id`, [exp.orden_id]),
    query(`
      SELECT rb.*,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', g.id, 'numero_guia', g.numero_guia, 'fecha_guia', g.fecha_guia,
            'documento_nombre', g.documento_nombre
          ) ORDER BY g.id)
          FROM recepcion_bienes_guias g WHERE g.recepcion_bien_id = rb.id
        ), '[]'::json) AS guias,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', i.id, 'orden_item_id', i.orden_item_id, 'descripcion', i.descripcion,
            'cantidad_recibida', i.cantidad_recibida, 'importe_recibido', i.importe_recibido
          ) ORDER BY i.id)
          FROM recepcion_bienes_items i WHERE i.recepcion_bien_id = rb.id
        ), '[]'::json) AS items
      FROM recepciones_bienes rb
      WHERE rb.expediente_recepcion_id = $1
      ORDER BY rb.id DESC
    `, [exp.id]),
    query(`
      SELECT id, tipo, nombre, mime_type, version, creado_at AS created_at, vigente
      FROM orden_documentos WHERE orden_id = $1 ORDER BY id DESC
    `, [exp.orden_id]).catch(() => ({ rows: [] })),
    query(`
      SELECT id, tipo, nombre, mime_type, version, created_at, vigente, origen
      FROM recepcion_bienes_documentos
      WHERE expediente_recepcion_id = $1
      ORDER BY id DESC
    `, [exp.id]),
    query(`
      SELECT id, numero_acta, version, estado_documental, generado_at, enviado_au_at,
        firmado_au_at, destinatario_au, documento_nombre, acta_firmada_nombre
      FROM recepcion_bienes_actas
      WHERE expediente_recepcion_id = $1
      ORDER BY id DESC
    `, [exp.id]),
    query(`
      SELECT id, tipo, estado_anterior, estado_nuevo, usuario, rol, motivo, created_at
      FROM recepcion_bienes_eventos
      WHERE expediente_recepcion_id = $1
      ORDER BY id DESC
      LIMIT 200
    `, [exp.id]),
    query(`
      SELECT id, tipo, nombre FROM recepcion_bienes_documentos
      WHERE expediente_recepcion_id = $1 AND vigente = TRUE
    `, [exp.id]),
  ]);

  const vigente = resolveEstadoExpedienteVigente({
    orden_id: exp.orden_id,
    orden_estado: exp.orden_estado,
    enviado_proveedor_at: exp.enviado_proveedor_at,
    recepcion_estado_global: exp.estado_global,
    recepcion_estado_interno: exp.estado_interno,
    recepcion_bienes_expediente_id: exp.id,
  });

  return {
    ...mapBandejaRow({ ...exp, id: exp.id }),
    denominacion: exp.denominacion || '',
    orden_items: items.rows,
    cronograma: entregas.rows,
    recepciones: recepciones.rows,
    documentos_orden: docsOrden.rows || [],
    documentos_recepcion: docsRec.rows,
    actas: actas.rows,
    historial: historial.rows,
    documentos_vigentes: docsExp.rows,
    estadoVigente: vigente.estadoVigente,
    version: exp.version,
  };
}

export async function registrarRecepcion(expedienteId, body = {}, usuario = '', rol = '') {
  const exp = await getExpedienteOrThrow(expedienteId);
  if (normalizeEstadoCode(exp.orden_estado) === 'ORDEN_RESUELTA') {
    throw httpError('Orden resuelta: no se permiten nuevas recepciones', 409);
  }
  if (['EXPEDIENTE_DERIVADO_PAGO'].includes(exp.estado_global)) {
    throw httpError('Expediente ya derivado a pago', 409);
  }

  const actor = resolveRolActor({}, rol);
  if (actor !== 'ALMACEN' && String(rol).toLowerCase() !== 'admin' && String(rol).toLowerCase() !== 'dec') {
    throw httpError('Solo Almacén puede registrar recepción', 403);
  }

  const fechaGuia = body.fecha_recepcion_guia || body.fecha_recepcion;
  const numeroGuia = String(body.numero_guia || '').trim();
  const montoLiquidar = money(body.monto_liquidar);
  if (!fechaGuia) throw httpError('fecha_recepcion_guia obligatoria');
  if (!numeroGuia) throw httpError('numero_guia obligatorio');
  if (montoLiquidar < 0) throw httpError('monto_liquidar no puede ser negativo');

  if (exp.fecha_orden && String(fechaGuia) < String(exp.fecha_orden).slice(0, 10)) {
    throw httpError('La fecha de recepción no puede ser anterior a la emisión de la OC');
  }

  const saldo = money(exp.monto_total) - money(exp.monto_liquidar_acumulado);
  if (montoLiquidar > saldo + 0.009) {
    throw httpError(`Monto a liquidar (${montoLiquidar}) supera el saldo pendiente (${saldo})`);
  }

  const idem = String(body.idempotency_key || `rec-${expedienteId}-${numeroGuia}`).slice(0, 120);

  try {
    // guía duplicada en el expediente
    const dup = await query(`
      SELECT g.id FROM recepcion_bienes_guias g
      JOIN recepciones_bienes rb ON rb.id = g.recepcion_bien_id
      WHERE rb.expediente_recepcion_id = $1 AND UPPER(g.numero_guia) = UPPER($2)
    `, [exp.id, numeroGuia]);
    if (dup.rows.length) throw httpError('Guía de remisión duplicada', 409);

    const { rows: recRows } = await query(`
      INSERT INTO recepciones_bienes (
        expediente_recepcion_id, orden_id, entrega_programada_id, numero_entrega,
        fecha_recepcion_guia, fecha_entrega_almacen, monto_calculado, monto_liquidar,
        tipo_proceso, numero_contrato, periodo_inicio, periodo_fin, observaciones,
        estado_interno, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'REGISTRADA',$14,$14)
      RETURNING *
    `, [
      exp.id, exp.orden_id,
      body.entrega_programada_id || null,
      body.numero_entrega || null,
      fechaGuia,
      body.fecha_entrega_almacen || fechaGuia,
      body.monto_calculado != null ? money(body.monto_calculado) : montoLiquidar,
      montoLiquidar,
      body.tipo_proceso || exp.tipo_proceso || null,
      body.numero_contrato || exp.numero_contrato || null,
      body.periodo_inicio || null,
      body.periodo_fin || null,
      body.observaciones || null,
      String(usuario || '').slice(0, 150),
    ]);
    const recepcion = recRows[0];

    await query(`
      INSERT INTO recepcion_bienes_guias
        (recepcion_bien_id, numero_guia, fecha_guia, proveedor_id,
         documento_nombre, documento_mime, documento_base64, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      recepcion.id, numeroGuia, body.fecha_guia || fechaGuia, exp.proveedor_id,
      body.guia_nombre || null, body.guia_mime || null, body.guia_base64 || null,
      String(usuario || '').slice(0, 150),
    ]);

    const items = Array.isArray(body.items) ? body.items : [];
    for (const it of items) {
      await query(`
        INSERT INTO recepcion_bienes_items (
          recepcion_bien_id, orden_item_id, descripcion, cantidad_contratada,
          cantidad_recibida, cantidad_observada, unidad_medida, precio_unitario, importe_recibido
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        recepcion.id, it.orden_item_id || null, it.descripcion || null,
        it.cantidad_contratada ?? null, it.cantidad_recibida ?? 0,
        it.cantidad_observada ?? null, it.unidad_medida || null,
        it.precio_unitario ?? null, it.importe_recibido != null ? money(it.importe_recibido) : null,
      ]);
    }

    if (body.documento_tecnico_nombre && body.documento_tecnico_base64) {
      await query(`
        INSERT INTO recepcion_bienes_documentos (
          expediente_recepcion_id, recepcion_bien_id, tipo, nombre, mime_type,
          contenido_base64, origen, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,'PROVEEDOR',$7)
      `, [
        exp.id, recepcion.id, body.documento_tecnico_tipo || 'DOCUMENTO_TECNICO',
        body.documento_tecnico_nombre, body.documento_tecnico_mime || 'application/pdf',
        body.documento_tecnico_base64, String(usuario || '').slice(0, 150),
      ]);
    }

    const nuevoAcum = money(exp.monto_liquidar_acumulado) + montoLiquidar;
    const estadoAnterior = exp.estado_global;
    const estadoNuevo = 'BIEN_RECIBIDO_ALMACEN';

    await query(`
      UPDATE recepcion_bienes_expedientes SET
        estado_global = $2,
        estado_interno = 'RECEPCION_REGISTRADA',
        monto_liquidar_acumulado = $3,
        tipo_proceso = COALESCE($4, tipo_proceso),
        numero_contrato = COALESCE($5, numero_contrato),
        bandeja_actual = 'ALMACEN',
        version = version + 1,
        updated_by = $6,
        updated_at = NOW()
      WHERE id = $1
    `, [
      exp.id, estadoNuevo, nuevoAcum,
      body.tipo_proceso || null, body.numero_contrato || null,
      String(usuario || '').slice(0, 150),
    ]);

    await query(`
      INSERT INTO recepcion_bienes_derivaciones (
        expediente_recepcion_id, origen_rol, destino_rol, accion, motivo,
        estado_anterior, estado_nuevo, idempotency_key, created_by
      ) VALUES ($1,'ALMACEN','ALMACEN','REGISTRAR_RECEPCION',$2,$3,$4,$5,$6)
      ON CONFLICT (expediente_recepcion_id, idempotency_key) DO NOTHING
    `, [
      exp.id, `Guía ${numeroGuia}`, estadoAnterior, estadoNuevo, idem,
      String(usuario || '').slice(0, 150),
    ]);

    await registrarEvento({
      expedienteId: exp.id,
      ordenId: exp.orden_id,
      tipo: 'RECEPCION_REGISTRADA',
      estadoAnterior,
      estadoNuevo,
      usuario,
      rol: actor,
      motivo: `Guía ${numeroGuia}`,
      metadata: { recepcion_id: recepcion.id, monto_liquidar: montoLiquidar },
    });

    return getDetalleRecepcionBienes(exp.id);
  } catch (err) {
    throw err;
  }
}

export async function generarActaRecepcion(expedienteId, body = {}, usuario = '', rol = '') {
  const exp = await getExpedienteOrThrow(expedienteId);
  const actor = resolveRolActor({}, rol);
  if (actor !== 'ALMACEN' && !['admin', 'dec'].includes(String(rol).toLowerCase())) {
    throw httpError('Solo Almacén puede generar el acta', 403);
  }
  if (!['BIEN_RECIBIDO_ALMACEN', 'CONFORMIDAD_RECIBIDA_AU', 'CONFORMIDAD_PENDIENTE_AU'].includes(exp.estado_global)
    && exp.estado_global !== 'RECEPCION_BIENES_PENDIENTE') {
    // permitir desde recibido
  }
  if (exp.estado_global === 'RECEPCION_BIENES_PENDIENTE') {
    throw httpError('Debe registrar al menos una recepción antes de generar el acta', 409);
  }

  const detalle = await getDetalleRecepcionBienes(expedienteId);
  const version = (detalle.actas?.[0]?.version || 0) + 1;
  const numero = body.numero_acta || `ACTA-RB-${exp.orden_id}-${version}`;
  const html = `
    <h2>Proyecto de Acta de Recepción</h2>
    <p><strong>Orden:</strong> ${exp.numero_orden || exp.orden_id}</p>
    <p><strong>Proveedor:</strong> ${exp.proveedor_razon_social || ''} (${exp.proveedor_ruc || ''})</p>
    <p><strong>Requerimiento:</strong> ${exp.requerimiento_codigo || ''}</p>
    <p><strong>Fecha emisión OC:</strong> ${String(exp.fecha_orden || '').slice(0, 10)}</p>
    <p><strong>Fecha notificación:</strong> ${String(exp.enviado_proveedor_at || '').slice(0, 10)}</p>
    <p><strong>Monto a liquidar acumulado:</strong> ${money(exp.monto_liquidar_acumulado)}</p>
    <p><strong>Generado por:</strong> ${usuario || ''}</p>
    <p><strong>Observaciones:</strong> ${body.observaciones || '—'}</p>
  `;

  const { rows } = await query(`
    INSERT INTO recepcion_bienes_actas (
      expediente_recepcion_id, numero_acta, version, estado_documental,
      contenido_html, documento_nombre, documento_mime, generado_at, generado_por
    ) VALUES ($1,$2,$3,'ACTA_RECEPCION_GENERADA',$4,$5,'text/html',NOW(),$6)
    RETURNING *
  `, [
    exp.id, numero, version, html, `${numero}.html`,
    String(usuario || '').slice(0, 150),
  ]);

  await query(`
    UPDATE recepcion_bienes_expedientes SET
      estado_interno = 'ACTA_GENERADA',
      updated_by = $2, updated_at = NOW(), version = version + 1
    WHERE id = $1
  `, [exp.id, String(usuario || '').slice(0, 150)]);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'ACTA_GENERADA',
    estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
    usuario, rol: actor, motivo: numero, metadata: { acta_id: rows[0].id },
  });

  return rows[0];
}

export async function derivarAreaUsuaria(expedienteId, body = {}, usuario = '', rol = '') {
  const exp = await getExpedienteOrThrow(expedienteId);
  const actor = resolveRolActor({}, rol);
  if (actor !== 'ALMACEN' && !['admin', 'dec'].includes(String(rol).toLowerCase())) {
    throw httpError('Solo Almacén puede derivar al Área Usuaria', 403);
  }
  if (!['BIEN_RECIBIDO_ALMACEN', 'CONFORMIDAD_RECIBIDA_AU'].includes(exp.estado_global)) {
    throw httpError('Estado no permite derivación al AU', 409);
  }

  const idem = String(body.idempotency_key || `der-au-${expedienteId}-${exp.version}`).slice(0, 120);
  const existing = await query(`
    SELECT id FROM recepcion_bienes_derivaciones
    WHERE expediente_recepcion_id = $1 AND idempotency_key = $2
  `, [exp.id, idem]);
  if (existing.rows.length) {
    return getDetalleRecepcionBienes(exp.id);
  }

  const { rows: actas } = await query(`
    SELECT id FROM recepcion_bienes_actas
    WHERE expediente_recepcion_id = $1
    ORDER BY id DESC LIMIT 1
  `, [exp.id]);
  if (!actas.length) throw httpError('Debe generar el proyecto de acta antes de derivar', 409);

  const estadoAnterior = exp.estado_global;
  const estadoNuevo = 'CONFORMIDAD_PENDIENTE_AU';
  const transition = validateEstadoTransition({
    estadoActual: estadoAnterior,
    estadoDestino: estadoNuevo,
    accion: 'DERIVAR_AU',
    actor: usuario,
    allowHistorical: true,
  });
  if (!transition.ok && !transition.warning) {
    throw httpError(transition.reason || 'Transición no permitida', 409);
  }

  await query(`
    UPDATE recepcion_bienes_actas SET
      estado_documental = 'ACTA_RECEPCION_ENVIADA_AU',
      enviado_au_at = NOW(), enviado_au_por = $2,
      destinatario_au = $3, destinatario_au_id = $4, updated_at = NOW()
    WHERE id = $1
  `, [
    actas[0].id, String(usuario || '').slice(0, 150),
    body.destinatario_nombre || body.responsable || null,
    body.destinatario_id || null,
  ]);

  await query(`
    UPDATE recepcion_bienes_expedientes SET
      estado_global = $2, estado_interno = 'ACTA_ENVIADA_AU',
      bandeja_actual = 'AREA_USUARIA',
      actor_responsable = $3, actor_responsable_id = $4,
      version = version + 1, updated_by = $5, updated_at = NOW()
    WHERE id = $1
  `, [
    exp.id, estadoNuevo,
    body.destinatario_nombre || null, body.destinatario_id || null,
    String(usuario || '').slice(0, 150),
  ]);

  await query(`
    INSERT INTO recepcion_bienes_derivaciones (
      expediente_recepcion_id, origen_rol, destino_rol, destino_usuario_id,
      destino_usuario_nombre, accion, motivo, estado_anterior, estado_nuevo,
      idempotency_key, created_by
    ) VALUES ($1,'ALMACEN','AREA_USUARIA',$2,$3,'DERIVAR_AU',$4,$5,$6,$7,$8)
  `, [
    exp.id, body.destinatario_id || null, body.destinatario_nombre || null,
    body.motivo || body.observacion || null,
    estadoAnterior, estadoNuevo, idem, String(usuario || '').slice(0, 150),
  ]);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'DERIVADO_AU',
    estadoAnterior, estadoNuevo, usuario, rol: actor,
    motivo: body.motivo || null,
  });

  return getDetalleRecepcionBienes(exp.id);
}

export async function cargarActaFirmada(expedienteId, body = {}, usuario = '', rol = '') {
  const exp = await getExpedienteOrThrow(expedienteId);
  const actor = resolveRolActor({}, rol);
  if (actor !== 'AREA_USUARIA' && !['admin', 'dec', 'au'].includes(String(rol).toLowerCase())) {
    throw httpError('Solo el Área Usuaria puede cargar el acta firmada', 403);
  }
  if (exp.estado_global !== 'CONFORMIDAD_PENDIENTE_AU') {
    throw httpError('El expediente no está pendiente de conformidad AU', 409);
  }
  if (!body.acta_firmada_base64 && !body.documento_base64) {
    throw httpError('Archivo de acta firmada obligatorio');
  }

  const idem = String(body.idempotency_key || `acta-firmada-${expedienteId}-${exp.version}`).slice(0, 120);
  const dup = await query(`
    SELECT id FROM recepcion_bienes_derivaciones
    WHERE expediente_recepcion_id = $1 AND idempotency_key = $2
  `, [exp.id, idem]);
  if (dup.rows.length) return getDetalleRecepcionBienes(exp.id);

  const { rows: actas } = await query(`
    SELECT id FROM recepcion_bienes_actas
    WHERE expediente_recepcion_id = $1 ORDER BY id DESC LIMIT 1
  `, [exp.id]);
  if (!actas.length) throw httpError('No hay proyecto de acta', 409);

  await query(`
    UPDATE recepcion_bienes_actas SET
      estado_documental = 'ACTA_RECEPCION_FIRMADA_AU',
      firmado_au_at = NOW(), firmado_au_por = $2,
      acta_firmada_nombre = $3, acta_firmada_mime = $4, acta_firmada_base64 = $5,
      updated_at = NOW()
    WHERE id = $1
  `, [
    actas[0].id, String(usuario || '').slice(0, 150),
    body.acta_firmada_nombre || body.nombre || 'acta-firmada.pdf',
    body.acta_firmada_mime || body.mime_type || 'application/pdf',
    body.acta_firmada_base64 || body.documento_base64,
  ]);

  const estadoAnterior = exp.estado_global;
  const estadoNuevo = 'CONFORMIDAD_RECIBIDA_AU';
  await query(`
    UPDATE recepcion_bienes_expedientes SET
      estado_global = $2, estado_interno = 'ACTA_FIRMADA_AU_RECIBIDA',
      bandeja_actual = 'ALMACEN',
      version = version + 1, updated_by = $3, updated_at = NOW()
    WHERE id = $1
  `, [exp.id, estadoNuevo, String(usuario || '').slice(0, 150)]);

  await query(`
    INSERT INTO recepcion_bienes_derivaciones (
      expediente_recepcion_id, origen_rol, destino_rol, accion, motivo,
      estado_anterior, estado_nuevo, idempotency_key, created_by
    ) VALUES ($1,'AREA_USUARIA','ALMACEN','CARGAR_ACTA_FIRMADA',$2,$3,$4,$5,$6)
  `, [
    exp.id, body.comentario || null, estadoAnterior, estadoNuevo, idem,
    String(usuario || '').slice(0, 150),
  ]);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'ACTA_FIRMADA_CARGADA',
    estadoAnterior, estadoNuevo, usuario, rol: actor, motivo: body.comentario || null,
  });

  return getDetalleRecepcionBienes(exp.id);
}

export async function observarActa(expedienteId, body = {}, usuario = '', rol = '') {
  const exp = await getExpedienteOrThrow(expedienteId);
  const actor = resolveRolActor({}, rol);
  const destino = String(body.destino || 'AREA_USUARIA').toUpperCase();
  if (!body.motivo) throw httpError('motivo obligatorio');

  if (actor === 'ALMACEN' || ['admin', 'dec'].includes(String(rol).toLowerCase())) {
    if (exp.estado_global !== 'CONFORMIDAD_RECIBIDA_AU') {
      throw httpError('Almacén solo observa actas recibidas del AU', 409);
    }
  } else if (actor === 'COORDINADOR_CM') {
    if (exp.estado_global !== 'CONFORMIDAD_EN_COORDINACION_CM') {
      throw httpError('Coordinador solo observa en su etapa', 409);
    }
  } else {
    throw httpError('Rol no autorizado a observar', 403);
  }

  const bandeja = destino === 'ALMACEN' ? 'ALMACEN' : 'AREA_USUARIA';
  await query(`
    UPDATE recepcion_bienes_expedientes SET
      estado_interno = 'OBSERVADO',
      bandeja_actual = $2,
      version = version + 1, updated_by = $3, updated_at = NOW()
    WHERE id = $1
  `, [exp.id, bandeja, String(usuario || '').slice(0, 150)]);

  await query(`
    UPDATE recepcion_bienes_actas SET
      estado_documental = 'ACTA_RECEPCION_OBSERVADA', updated_at = NOW()
    WHERE expediente_recepcion_id = $1
  `, [exp.id]);

  await query(`
    INSERT INTO recepcion_bienes_derivaciones (
      expediente_recepcion_id, origen_rol, destino_rol, accion, motivo,
      estado_anterior, estado_nuevo, created_by, metadata
    ) VALUES ($1,$2,$3,'OBSERVAR',$4,$5,$5,$6,$7::jsonb)
  `, [
    exp.id, actor, destino, body.motivo, exp.estado_global,
    String(usuario || '').slice(0, 150),
    JSON.stringify({ situacion: 'OBSERVADO', destino }),
  ]);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'OBSERVACION',
    estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
    usuario, rol: actor, motivo: body.motivo,
    metadata: { destino, situacion: 'OBSERVADO' },
  });

  const detalle = await getDetalleRecepcionBienes(exp.id);
  detalle.situacion = {
    codigo: 'OBSERVADO',
    label: destino === 'ALMACEN' ? 'Conformidad observada al Almacén' : 'Conformidad observada al Área Usuaria',
  };
  return detalle;
}

export async function derivarCoordinacionCm(expedienteId, body = {}, usuario = '', rol = '') {
  const exp = await getExpedienteOrThrow(expedienteId);
  const actor = resolveRolActor({}, rol);
  if (actor !== 'ALMACEN' && !['admin', 'dec'].includes(String(rol).toLowerCase())) {
    throw httpError('Solo Almacén puede derivar a Coordinación CM', 403);
  }
  if (exp.estado_global !== 'CONFORMIDAD_RECIBIDA_AU') {
    throw httpError('Debe existir conformidad recibida del AU', 409);
  }

  const idem = String(body.idempotency_key || `der-cm-${expedienteId}-${exp.version}`).slice(0, 120);
  const dup = await query(`
    SELECT id FROM recepcion_bienes_derivaciones
    WHERE expediente_recepcion_id = $1 AND idempotency_key = $2
  `, [exp.id, idem]);
  if (dup.rows.length) return getDetalleRecepcionBienes(exp.id);

  const estadoAnterior = exp.estado_global;
  const estadoNuevo = 'CONFORMIDAD_EN_COORDINACION_CM';
  await query(`
    UPDATE recepcion_bienes_expedientes SET
      estado_global = $2, estado_interno = 'DERIVADO_COORDINACION_CM',
      bandeja_actual = 'COORDINADOR_CM',
      version = version + 1, updated_by = $3, updated_at = NOW()
    WHERE id = $1
  `, [exp.id, estadoNuevo, String(usuario || '').slice(0, 150)]);

  await query(`
    UPDATE recepcion_bienes_actas SET
      estado_documental = 'ACTA_RECEPCION_CONFORME',
      revisado_almacen_at = NOW(), updated_at = NOW()
    WHERE expediente_recepcion_id = $1
  `, [exp.id]);

  await query(`
    INSERT INTO recepcion_bienes_derivaciones (
      expediente_recepcion_id, origen_rol, destino_rol, accion, motivo,
      estado_anterior, estado_nuevo, idempotency_key, created_by
    ) VALUES ($1,'ALMACEN','COORDINADOR_CM','DERIVAR_CM',$2,$3,$4,$5,$6)
  `, [
    exp.id, body.motivo || null, estadoAnterior, estadoNuevo, idem,
    String(usuario || '').slice(0, 150),
  ]);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'DERIVADO_COORDINACION_CM',
    estadoAnterior, estadoNuevo, usuario, rol: actor, motivo: body.motivo || null,
  });

  return getDetalleRecepcionBienes(exp.id);
}

export async function derivarPago(expedienteId, body = {}, usuario = '', rol = '') {
  const exp = await getExpedienteOrThrow(expedienteId);
  const actor = resolveRolActor({}, rol);
  if (actor !== 'COORDINADOR_CM' && !['admin', 'dec'].includes(String(rol).toLowerCase())) {
    throw httpError('Solo Coordinación CM puede derivar a pago', 403);
  }
  if (exp.estado_global !== 'CONFORMIDAD_EN_COORDINACION_CM') {
    throw httpError('El expediente no está en Coordinación CM', 409);
  }
  if (!body.analista_id && !body.analista_nombre) {
    throw httpError('Debe seleccionar un analista de pago');
  }

  // Validaciones mínimas
  const { rows: recs } = await query(
    'SELECT COUNT(*)::int AS n FROM recepciones_bienes WHERE expediente_recepcion_id = $1',
    [exp.id],
  );
  const { rows: actas } = await query(`
    SELECT id FROM recepcion_bienes_actas
    WHERE expediente_recepcion_id = $1 AND acta_firmada_base64 IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `, [exp.id]);
  if (!recs[0]?.n) throw httpError('Falta recepción registrada', 409);
  if (!actas.length) throw httpError('Falta acta firmada por el Área Usuaria', 409);
  if (money(exp.monto_liquidar_acumulado) <= 0) throw httpError('Monto a liquidar inválido', 409);

  const idem = String(body.idempotency_key || `der-pago-${expedienteId}-${exp.version}`).slice(0, 120);
  const dup = await query(`
    SELECT id FROM recepcion_bienes_derivaciones
    WHERE expediente_recepcion_id = $1 AND idempotency_key = $2
  `, [exp.id, idem]);
  if (dup.rows.length) return getDetalleRecepcionBienes(exp.id);

  const estadoAnterior = exp.estado_global;
  const estadoNuevo = 'EXPEDIENTE_DERIVADO_PAGO';
  await query(`
    UPDATE recepcion_bienes_expedientes SET
      estado_global = $2, estado_interno = 'DERIVADO_PAGO',
      bandeja_actual = 'ANALISTA_PAGO',
      actor_responsable = $3, actor_responsable_id = $4,
      version = version + 1, updated_by = $5, updated_at = NOW()
    WHERE id = $1
  `, [
    exp.id, estadoNuevo,
    body.analista_nombre || null, body.analista_id || null,
    String(usuario || '').slice(0, 150),
  ]);

  await query(`
    INSERT INTO recepcion_bienes_derivaciones (
      expediente_recepcion_id, origen_rol, destino_rol, destino_usuario_id,
      destino_usuario_nombre, accion, motivo, estado_anterior, estado_nuevo,
      idempotency_key, created_by, metadata
    ) VALUES ($1,'COORDINADOR_CM','ANALISTA_PAGO',$2,$3,'DERIVAR_PAGO',$4,$5,$6,$7,$8,$9::jsonb)
  `, [
    exp.id, body.analista_id || null, body.analista_nombre || null,
    body.motivo || null, estadoAnterior, estadoNuevo, idem,
    String(usuario || '').slice(0, 150),
    JSON.stringify({ monto_liquidar: exp.monto_liquidar_acumulado }),
  ]);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'DERIVADO_PAGO',
    estadoAnterior, estadoNuevo, usuario, rol: actor, motivo: body.motivo || null,
  });

  return getDetalleRecepcionBienes(exp.id);
}

export async function getHistorialRecepcionBienes(id) {
  await getExpedienteOrThrow(id);
  const { rows } = await query(`
    SELECT * FROM recepcion_bienes_eventos
    WHERE expediente_recepcion_id = $1
    ORDER BY id DESC
  `, [id]);
  return rows;
}

export {
  isOrdenBienes,
  resolveRolActor,
  httpError,
};
