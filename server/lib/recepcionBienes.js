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
import {
  buildDocsCotizacionAdjudicada,
  dedupeDocumentos,
  toDocumentoContrato,
  seleccionarActaVigente,
} from '../../shared/expedienteDocumentos.js';
import { generateActaRecepcionPdfServer } from './recepcionActaPdfServer.js';
import { buildActaRecepcionData } from '../../shared/recepcionActaData.js';
import {
  toCalendarIso,
  validateFechaRecepcionVsEmision,
  correspondeAplicarPenalidad,
} from '../../shared/calendarDate.js';
import { canRegistrarRecepcion } from '../../shared/recepcionSaldo.js';
import { normalizePermisos } from './permissionsCatalog.js';
import {
  resolverCentroDesdeRequerimiento,
  resolveCentroExpediente,
  esAlcanceGlobal,
  puedeAccederRecepcionBienes,
  assertAccesoRecepcionBienes,
  validarResponsableCentro,
} from './recepcionBienesAlcance.js';

function httpError(message, status = 400, code = null) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
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

  const recepcionesCount = Number(row.recepciones_count || 0);
  const cantContr = Number(row.cantidad_contratada_total || 0);
  const cantRec = Number(row.cantidad_recibida_total || 0);
  const montoTotal = money(row.monto_total);
  const montoAcum = money(row.monto_liquidar_acumulado);
  const actaEstado = row.acta_estado_documental || null;
  const actaVisada = !!(row.acta_visada_at || actaEstado === 'ACTA_RECEPCION_VISADA_ALMACEN');

  // Heurística de saldo para bandeja (detalle usa canRegistrarRecepcion completo)
  let saldoPendiente = Math.max(0, cantContr - cantRec);
  if (recepcionesCount > 0 && cantRec <= 0 && montoTotal > 0 && montoAcum >= montoTotal - 0.01) {
    saldoPendiente = 0;
  }
  if (recepcionesCount > 0 && cantContr <= 0 && montoTotal > 0 && montoAcum >= montoTotal - 0.01) {
    saldoPendiente = 0;
  }
  const puedeRegistrar = saldoPendiente > 0.0001
    || (recepcionesCount === 0 && vigente.codigo === 'RECEPCION_BIENES_PENDIENTE');

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
    monto_total: montoTotal,
    moneda: row.moneda || 'PEN',
    plazo_total: row.plazo_total || null,
    fecha_notificacion: row.enviado_proveedor_at || null,
    fecha_recepcion_guia: row.ultima_fecha_guia || null,
    numero_guia: row.ultima_guia || '',
    monto_a_liquidar: montoAcum,
    tipo_proceso: row.tipo_proceso || '',
    numero_contrato: row.numero_contrato || '',
    fecha_envio_au: row.fecha_envio_au || null,
    numero_entrega: row.ultima_entrega || null,
    entrega_label: row.entrega_label || null,
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
    recepciones_count: recepcionesCount,
    cantidad_contratada_total: cantContr,
    cantidad_recibida_total: cantRec,
    saldo_pendiente_cantidad: saldoPendiente,
    puede_registrar_recepcion: puedeRegistrar,
    recepcion_completa: !puedeRegistrar && recepcionesCount > 0,
    tiene_recepcion: recepcionesCount > 0 || !!row.ultima_fecha_guia,
    acta_id: row.acta_id || null,
    acta_estado_documental: actaEstado,
    acta_visada: actaVisada,
    puede_derivar_au: actaVisada && ['BIEN_RECIBIDO_ALMACEN', 'RECEPCION_BIENES_OBSERVADA'].includes(vigente.codigo),
  };
}

export async function listarBandejaRecepcionBienes({ rol = 'ALMACEN', usuario = '', userId = null, userCtx = null } = {}) {
  await sincronizarOrdenesElegibles(usuario || 'Sistema');

  // RB8.1D — contexto de usuario obligatorio; nunca se fabrica DEC/ALMACEN.
  const ctx = (userCtx && typeof userCtx === 'object') ? userCtx : null;
  if (!ctx) {
    const err = new Error('Autenticación requerida');
    err.code = 'AUTH_REQUIRED';
    err.status = 401;
    throw err;
  }
  const actor = resolveRolActor({ rol }, rol);
  const global = esAlcanceGlobal(ctx);
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

  const sqlLimit = (ctx && !global) ? '' : 'LIMIT 500';
  const { rows } = await query(`
    SELECT rbe.*,
      oc.numero_orden, oc.fecha_orden, oc.monto_total, oc.moneda, oc.tipo_orden,
      oc.estado AS orden_estado, oc.enviado_proveedor_at, oc.enviado_proveedor_por,
      oc.proveedor_id, r.codigo AS requerimiento_codigo, r.cmn AS requerimiento_cmn,
      r.payload AS requerimiento_payload, r.area AS req_area,
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
        SELECT COALESCE(
          (
            SELECT string_agg(lab, ' / ' ORDER BY num)
            FROM (
              SELECT oe.numero_entrega AS num,
                COALESCE(
                  NULLIF(TRIM(oe.etiqueta_entrega), ''),
                  NULLIF(TRIM(oe.descripcion), ''),
                  'Entrega ' || oe.numero_entrega::text
                ) AS lab
              FROM orden_entregas oe
              WHERE oe.orden_id = oc.id AND oe.estado <> 'ANULADO'
            ) t
          ),
          (
            SELECT rb.numero_entrega::text FROM recepciones_bienes rb
            WHERE rb.expediente_recepcion_id = rbe.id
            ORDER BY rb.id DESC LIMIT 1
          )
        )
      ) AS entrega_label,
      (
        SELECT g.numero_guia FROM recepcion_bienes_guias g
        JOIN recepciones_bienes rb ON rb.id = g.recepcion_bien_id
        WHERE rb.expediente_recepcion_id = rbe.id
        ORDER BY g.id DESC LIMIT 1
      ) AS ultima_guia,
      (
        SELECT a.enviado_au_at FROM recepcion_bienes_actas a
        WHERE a.expediente_recepcion_id = rbe.id AND a.eliminado_at IS NULL
        ORDER BY a.id DESC LIMIT 1
      ) AS fecha_envio_au,
      (
        SELECT COUNT(*)::int FROM recepciones_bienes rb
        WHERE rb.expediente_recepcion_id = rbe.id
      ) AS recepciones_count,
      (
        SELECT COALESCE(SUM(oi.cantidad), 0) FROM orden_items oi WHERE oi.orden_id = oc.id
      ) AS cantidad_contratada_total,
      (
        SELECT COALESCE(SUM(ri.cantidad_recibida), 0)
        FROM recepcion_bienes_items ri
        JOIN recepciones_bienes rb ON rb.id = ri.recepcion_bien_id
        WHERE rb.expediente_recepcion_id = rbe.id
      ) AS cantidad_recibida_total,
      (
        SELECT a.id FROM recepcion_bienes_actas a
        WHERE a.expediente_recepcion_id = rbe.id AND a.eliminado_at IS NULL
        ORDER BY a.id DESC LIMIT 1
      ) AS acta_id,
      (
        SELECT a.estado_documental FROM recepcion_bienes_actas a
        WHERE a.expediente_recepcion_id = rbe.id AND a.eliminado_at IS NULL
        ORDER BY a.id DESC LIMIT 1
      ) AS acta_estado_documental,
      (
        SELECT a.visado_almacen_at FROM recepcion_bienes_actas a
        WHERE a.expediente_recepcion_id = rbe.id AND a.eliminado_at IS NULL
        ORDER BY a.id DESC LIMIT 1
      ) AS acta_visada_at,
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
    ${sqlLimit}
  `, params);

  // RB8.1B: alcance por centro. Global/admin conserva todo; restringido filtra
  // resolviendo el centro real desde requerimiento (cmn/payload) en servidor.
  // El LIMIT se aplica DESPUÉS del filtro por centro (restringidos leen sin LIMIT
  // en SQL y se recorta aquí) para no ocultar expedientes del propio centro.
  if (ctx && !global) {
    const filtradas = [];
    for (const row of rows) {
      let centro;
      try {
        centro = resolverCentroDesdeRequerimiento({
          cmn: row.requerimiento_cmn,
          area: row.req_area,
          payload: row.requerimiento_payload,
        });
      } catch (_) {
        continue; // centro no resoluble → no se muestra al operador restringido
      }
      if (puedeAccederRecepcionBienes(ctx, centro)) filtradas.push(row);
    }
    return filtradas.slice(0, 500).map(mapBandejaRow);
  }

  return rows.map(mapBandejaRow);
}

async function getExpedienteOrThrow(id) {
  const eid = parseInt(id, 10);
  if (!Number.isFinite(eid)) throw httpError('id inválido');
  const { rows } = await query(`
    SELECT rbe.*, oc.numero_orden, oc.fecha_orden, oc.monto_total, oc.moneda,
      oc.tipo_orden, oc.estado AS orden_estado, oc.enviado_proveedor_at,
      oc.proveedor_id, oc.requerimiento_id AS oc_req_id, oc.condicion_inicio,
      (
        SELECT oe.lugar_entrega FROM orden_entregas oe
        WHERE oe.orden_id = oc.id AND oe.estado <> 'ANULADO'
          AND NULLIF(TRIM(oe.lugar_entrega), '') IS NOT NULL
        ORDER BY oe.id ASC
        LIMIT 1
      ) AS orden_lugar_entrega,
      r.codigo AS requerimiento_codigo, r.denominacion, r.tipo AS req_tipo, r.area AS req_area,
      r.cmn AS requerimiento_cmn, r.payload AS requerimiento_payload,
      p.ruc AS proveedor_ruc, p.razon_social AS proveedor_razon_social
    FROM recepcion_bienes_expedientes rbe
    JOIN ordenes_contratacion oc ON oc.id = rbe.orden_id
    LEFT JOIN requerimientos r ON r.id = rbe.requerimiento_id
    LEFT JOIN proveedores p ON p.id = oc.proveedor_id
    WHERE rbe.id = $1
  `, [eid]);
  if (!rows.length) throw httpError('Expediente de recepción no encontrado', 404);
  const row = rows[0];
  row.lugar_entrega = row.orden_lugar_entrega || null;
  return row;
}

export async function getDetalleRecepcionBienes(id, userCtx = null) {
  const exp = await getExpedienteOrThrow(id);
  if (userCtx && typeof userCtx === 'object' && !esAlcanceGlobal(userCtx)) {
    const centro = resolverCentroDesdeRequerimiento({
      cmn: exp.requerimiento_cmn,
      area: exp.req_area,
      payload: exp.requerimiento_payload,
    });
    assertAccesoRecepcionBienes(userCtx, centro);
  }
  const [items, entregas, recepciones, docsOrden, docsRec, actas, historial, docsExp, adjuntosReq] = await Promise.all([
    query('SELECT * FROM orden_items WHERE orden_id = $1 ORDER BY id', [exp.orden_id]),
    query(`SELECT * FROM orden_entregas WHERE orden_id = $1 AND estado <> 'ANULADO' ORDER BY id`, [exp.orden_id]),
    query(`
      SELECT rb.*,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', g.id, 'numero_guia', g.numero_guia, 'fecha_guia', g.fecha_guia,
            'transportista', g.transportista,
            'documento_nombre', g.documento_nombre, 'documento_mime', g.documento_mime
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
      SELECT id, tipo_documento AS tipo, nombre_archivo AS nombre, mime_type, version,
        subido_at AS created_at, activo AS vigente
      FROM orden_documentos WHERE orden_id = $1 ORDER BY id DESC
    `, [exp.orden_id]).catch(() => ({ rows: [] })),
    query(`
      SELECT id, tipo, nombre, mime_type, version, created_at, vigente, origen, recepcion_bien_id
      FROM recepcion_bienes_documentos
      WHERE expediente_recepcion_id = $1
      ORDER BY id DESC
    `, [exp.id]),
    query(`
      SELECT id, numero_acta, version, estado_documental, generado_at, enviado_au_at,
        firmado_au_at, destinatario_au, documento_nombre, acta_firmada_nombre,
        documento_mime, acta_firmada_mime, recepcion_bien_id, orden_item_id,
        orden_entrega_id, monto_entregable, corresponde_penalidad, lugar_entrega,
        observacion_acta, eliminado_at, contenido_html,
        acta_visada_nombre, acta_visada_mime, visado_almacen_at, visado_almacen_por,
        observacion_visado
      FROM recepcion_bienes_actas
      WHERE expediente_recepcion_id = $1
        AND eliminado_at IS NULL
      ORDER BY version DESC, generado_at DESC, id DESC
    `, [exp.id]),
    query(`
      SELECT id, tipo, estado_anterior, estado_nuevo, usuario, rol, motivo, created_at, metadata
      FROM recepcion_bienes_eventos
      WHERE expediente_recepcion_id = $1
      ORDER BY id DESC
      LIMIT 200
    `, [exp.id]),
    query(`
      SELECT id, tipo, nombre FROM recepcion_bienes_documentos
      WHERE expediente_recepcion_id = $1 AND vigente = TRUE
    `, [exp.id]),
    query(`
      SELECT id, nombre_archivo, mime_type, created_at, NULL::text AS tipo_documento
      FROM requerimientos_adjuntos WHERE requerimiento_id = $1
      ORDER BY id DESC
    `, [exp.requerimiento_id]).catch(() => ({ rows: [] })),
  ]);

  const vigente = resolveEstadoExpedienteVigente({
    orden_id: exp.orden_id,
    orden_estado: exp.orden_estado,
    enviado_proveedor_at: exp.enviado_proveedor_at,
    recepcion_estado_global: exp.estado_global,
    recepcion_estado_interno: exp.estado_interno,
    recepcion_bienes_expediente_id: exp.id,
  });

  const { buildEntregaContract, formatEntregasBandejaLabel } = await import('../../shared/entregaContractual.js');
  const {
    expandItemEntregaCombinaciones,
    resolveOrdenCronogramaContractual,
    resolveOrdenFechaNotificacion,
    resolveItemPedidoSigamef,
    resolveAreaUsuaria,
  } = await import('../../shared/ordenCronogramaContractual.js');

  // Pedidos + enriquecimiento de ítems
  let pedidos = [];
  try {
    const { rows } = await query(`
      SELECT p.id, p.centro, p.centro_costo, p.especifica, p.descripcion, p.codigo_sigamef,
        p.pedido_sigamef, p.nro_pedido, p.unidad_medida
      FROM requerimiento_pedidos rp
      JOIN pedidos_sigamef p ON p.id = rp.pedido_sigamef_id
      WHERE rp.requerimiento_id = $1
      ORDER BY p.id ASC
    `, [exp.requerimiento_id]);
    pedidos = rows;
  } catch (_) { /* ok */ }

  let reqArea = '';
  try {
    const { rows: ra } = await query(`SELECT area FROM requerimientos WHERE id = $1`, [exp.requerimiento_id]);
    reqArea = ra[0]?.area || '';
  } catch (_) { /* ok */ }

  const itemsEnriquecidos = (items.rows || []).map((it, idx) => {
    const ped = resolveItemPedidoSigamef(it, pedidos, idx);
    return {
      ...it,
      codigo_sigamef: ped.codigo_sigamef,
      codigo: ped.codigo_sigamef,
      pedido_sigamef: ped.pedido_sigamef,
      centro: ped.centro,
      centro_costo: ped.centro_costo,
      especifica: ped.especifica || it.especifica_gasto || null,
    };
  });

  const cronograma = (entregas.rows || []).map((e) => {
    const c = buildEntregaContract(e, { totalEntregas: entregas.rows.length });
    return { ...e, ...c, etiqueta_entrega: c.etiquetaEntrega };
  });
  const fmtEnt = formatEntregasBandejaLabel(entregas.rows || []);

  const notif = resolveOrdenFechaNotificacion({
    enviado_proveedor_at: exp.enviado_proveedor_at,
    fecha_orden: exp.fecha_orden,
  }, []);
  const cron = resolveOrdenCronogramaContractual({
    fecha_orden: exp.fecha_orden,
    enviado_proveedor_at: exp.enviado_proveedor_at,
    condicion_inicio: exp.condicion_inicio,
  }, cronograma[0] || {}, { totalEntregas: cronograma.length });

  const itemEntregas = expandItemEntregaCombinaciones(itemsEnriquecidos, cronograma).map((c) => {
    const ent = cronograma.find((e) => Number(e.id) === Number(c.orden_entrega_id)) || cronograma[0];
    const cr = resolveOrdenCronogramaContractual({
      fecha_orden: exp.fecha_orden,
      enviado_proveedor_at: exp.enviado_proveedor_at,
      condicion_inicio: exp.condicion_inicio,
    }, ent || {}, { totalEntregas: cronograma.length, plazoDias: c.dias_plazo });
    return {
      ...c,
      condicion_inicio_label: cr.condicionLabel,
      fecha_efectiva: cr.fechaEfectiva,
      fecha_maxima: cr.fechaMaxima,
      plazo_label: cr.plazoEntregaLabel,
      cantidad_programada: c.cantidad,
      cantidad_recibida_acum: 0,
      saldo_pendiente: c.cantidad,
    };
  });

  // Restar cantidades ya recibidas por ítem+entrega
  for (const rec of recepciones.rows || []) {
    const recItems = Array.isArray(rec.items) ? rec.items : [];
    for (const ri of recItems) {
      const combo = itemEntregas.find((c) =>
        Number(c.orden_item_id) === Number(ri.orden_item_id)
        && (rec.entrega_programada_id == null
          || Number(c.orden_entrega_id) === Number(rec.entrega_programada_id)));
      if (combo) {
        combo.cantidad_recibida_acum = Number(combo.cantidad_recibida_acum || 0) + Number(ri.cantidad_recibida || 0);
        combo.saldo_pendiente = Math.max(0,
          Number(combo.cantidad_programada || combo.cantidad || 0) - Number(combo.cantidad_recibida_acum || 0));
      }
    }
  }

  // Cotización adjudicada → 5-A / 5-B / docs técnicos (solo proveedor adjudicado)
  let documentosCotizacion = [];
  let cotizacionAdjudicadaId = null;
  try {
    const { rows: ordMeta } = await query(`
      SELECT oc.proveedor_id, oc.solicitud_cotizacion_id
      FROM ordenes_contratacion oc WHERE oc.id = $1
    `, [exp.orden_id]);
    const proveedorId = ordMeta[0]?.proveedor_id;
    const solicitudId = ordMeta[0]?.solicitud_cotizacion_id;
    if (proveedorId != null) {
      let cots = [];
      let docsSolSc = [];
      let reqsSc = [];
      const loadCots = async (whereSql, params) => {
        const { rows } = await query(`
          SELECT cot.id, cot.proveedor_id, cot.anexos, cot.certificados,
            cot.updated_at, cot.created_at, cot.fecha_presentacion,
            p.razon_social, p.ruc
          FROM cotizaciones_proveedor cot
          LEFT JOIN proveedores p ON p.id = cot.proveedor_id
          WHERE ${whereSql}
          ORDER BY cot.id DESC
        `, params);
        return rows;
      };
      if (solicitudId) {
        cots = await loadCots('cot.solicitud_id = $1 AND cot.proveedor_id = $2', [solicitudId, proveedorId]);
        try {
          const { rows: sc } = await query(`
            SELECT docs_solicitados, requisitos_tecnicos FROM solicitudes_cotizacion WHERE id = $1
          `, [solicitudId]);
          docsSolSc = sc[0]?.docs_solicitados || [];
          reqsSc = sc[0]?.requisitos_tecnicos || [];
          if (typeof docsSolSc === 'string') {
            try { docsSolSc = JSON.parse(docsSolSc); } catch (_) { docsSolSc = []; }
          }
          if (typeof reqsSc === 'string') {
            try { reqsSc = JSON.parse(reqsSc); } catch (_) { reqsSc = []; }
          }
        } catch (_) { /* ok */ }
      }
      if (!cots.length) {
        cots = await loadCots('cot.requerimiento_id = $1 AND cot.proveedor_id = $2', [
          exp.requerimiento_id, proveedorId,
        ]);
      }
      documentosCotizacion = buildDocsCotizacionAdjudicada(cots, proveedorId, {
        docsSolicitadosSc: docsSolSc,
        requisitosTecnicosSc: reqsSc,
      });
      cotizacionAdjudicadaId = cots[0]?.id || null;
    }
  } catch (_) { /* ok */ }

  const docsTecnicos = dedupeDocumentos(
    documentosCotizacion.filter((d) => {
      const ref = String(d.ref || '');
      return ref.startsWith('docs-')
        || ref.startsWith('req-')
        || ref.startsWith('cert-')
        || ref.startsWith('extra-');
    }),
  );
  const docsRecNorm = (docsRec.rows || []).map((d) => toDocumentoContrato({
    ...d,
    documentoId: d.id,
    origen: d.origen || 'RECEPCION',
    fechaEnvio: d.created_at,
    kind: 'recepcion',
  }, {
    kind: 'recepcion',
    endpointVisualizacion: `recepcion/${d.id}`,
  }));

  const checkRec = canRegistrarRecepcion({
    orden: exp,
    itemEntregas,
    recepciones: recepciones.rows || [],
    montoTotal: exp.monto_total,
    montoLiquidarAcumulado: exp.monto_liquidar_acumulado,
  });
  const actaVigente = seleccionarActaVigente(actas.rows || []);
  const { listarVisadosDetalle, tieneActaVisadaVigente } = await import('./recepcionActaVisada.js');
  const actasVisadas = await listarVisadosDetalle(exp.id);
  const visadaVigente = await tieneActaVisadaVigente(exp.id, actaVigente?.id || null);

  return {
    ...mapBandejaRow({
      ...exp,
      id: exp.id,
      entrega_label: fmtEnt.label,
      ultima_entrega: cronograma[0]?.numeroEntrega ?? null,
      recepciones_count: (recepciones.rows || []).length,
      cantidad_contratada_total: itemEntregas.reduce((s, c) => s + Number(c.cantidad_programada || c.cantidad || 0), 0),
      cantidad_recibida_total: itemEntregas.reduce((s, c) => s + Number(c.cantidad_recibida_acum || 0), 0),
      acta_id: actaVigente?.id || null,
      acta_estado_documental: actaVigente?.estado_documental || null,
      acta_visada_at: actaVigente?.visado_almacen_at || null,
    }),
    denominacion: exp.denominacion || '',
    fecha_orden: toCalendarIso(exp.fecha_orden) || exp.fecha_orden,
    fecha_emision: toCalendarIso(exp.fecha_orden) || exp.fecha_orden,
    condicion_inicio: exp.condicion_inicio,
    lugar_entrega: exp.lugar_entrega || null,
    orden_items: itemsEnriquecidos,
    items: itemsEnriquecidos,
    cronograma,
    entregas: cronograma,
    item_entregas: itemEntregas,
    entrega_label: fmtEnt.label,
    fecha_notificacion: notif.fechaNotificacion,
    condicion_inicio_label: cron.condicionLabel,
    fecha_efectiva_inicio: cron.fechaEfectiva,
    fecha_maxima: cron.fechaMaxima,
    plazo_entrega_label: cron.plazoEntregaLabel,
    pedido_sigamef: [...new Set(pedidos.map((p) => p.pedido_sigamef || p.nro_pedido).filter(Boolean))].join(', ') || null,
    area_usuaria: resolveAreaUsuaria({
      requerimientoArea: reqArea,
      centroCosto: pedidos[0]?.centro_costo || '',
      centro: pedidos[0]?.centro || '',
    }),
    centro: pedidos[0]?.centro || exp.centro || null,
    recepciones: recepciones.rows,
    documentos_orden: docsOrden.rows || [],
    documentos_recepcion: docsRecNorm,
    documentos_requerimiento: adjuntosReq.rows || [],
    documentos_cotizacion: documentosCotizacion,
    documentos_anexo_05a: documentosCotizacion.filter((d) => d.ref === 'anexo05a'),
    documentos_anexo_05b: documentosCotizacion.filter((d) => d.ref === 'anexo05b'),
    documentos_tecnicos_cotizacion: docsTecnicos,
    documentos_tecnicos: dedupeDocumentos([...docsTecnicos, ...docsRecNorm]),
    cotizacion_adjudicada_id: cotizacionAdjudicadaId,
    proveedor_id: exp.proveedor_id,
    actas: actas.rows,
    actas_visadas: actasVisadas,
    historial: historial.rows,
    documentos_vigentes: docsExp.rows,
    estadoVigente: vigente.estadoVigente,
    version: exp.version,
    solo_lectura_au: String(exp.estado_global || '').startsWith('CONFORMIDAD_'),
    puede_registrar_recepcion: checkRec.permitido,
    recepcion_completa: checkRec.recepcionCompleta,
    combinaciones_pendientes: checkRec.combinacionesPendientes,
    puede_registrar_motivo: checkRec.motivo,
    acta_visada: visadaVigente,
    puede_derivar_au: !!(
      visadaVigente
      && ['BIEN_RECIBIDO_ALMACEN', 'RECEPCION_BIENES_OBSERVADA'].includes(exp.estado_global)
    ),
  };
}

/** Contenido documental lazy (visor). tipo: orden|recepcion|guia|acta|acta_firmada|cotizacion */
export async function getDocumentoRecepcionBienes(expedienteId, tipo, docId, userCtx = null) {
  const exp = await getExpedienteOrThrow(expedienteId);
  if (userCtx && typeof userCtx === 'object' && !esAlcanceGlobal(userCtx)) {
    const centro = resolverCentroDesdeRequerimiento({
      cmn: exp.requerimiento_cmn,
      area: exp.req_area,
      payload: exp.requerimiento_payload,
    });
    assertAccesoRecepcionBienes(userCtx, centro);
  }
  const t = String(tipo || '').toLowerCase();

  if (t === 'cotizacion' || t.startsWith('cotizacion')) {
    const raw = decodeURIComponent(String(docId));
    const [cotPart, ...refParts] = raw.split(':');
    const cotId = parseInt(cotPart, 10);
    const docRef = refParts.join(':') || 'anexo05a';
    if (!Number.isFinite(cotId)) throw httpError('documento de cotización inválido');
    const { resolverDocumentoCotizacionAnalista } = await import('./portalDocumentos.js');
    try {
      const doc = await resolverDocumentoCotizacionAnalista(cotId, docRef);
      if (!doc?.base64 && !doc?.contenido_base64) {
        throw httpError('Documento de cotización no encontrado', 404);
      }
      return {
        id: raw,
        nombre: doc.nombre_archivo || doc.nombre || docRef,
        mime_type: doc.mime_type || 'application/pdf',
        contenido_base64: doc.base64 || doc.contenido_base64,
        ref: docRef,
      };
    } catch (e) {
      if (e.status) throw e;
      throw httpError(e.message || 'Documento de cotización no disponible', 404);
    }
  }

  const id = parseInt(docId, 10);
  const tNorm = String(tipo || '').toLowerCase();
  if (tNorm === 'acta_visada' || tNorm === 'acta_visada_legacy') {
    const { getContenidoActaVisada } = await import('./recepcionActaVisada.js');
    return getContenidoActaVisada(exp.id, docId);
  }
  if (!Number.isFinite(id) && !String(docId).startsWith('legacy')) {
    throw httpError('documento inválido');
  }

  if (t === 'orden') {
    const { rows } = await query(`
      SELECT id, nombre_archivo AS nombre, mime_type, contenido_base64
      FROM orden_documentos WHERE orden_id = $1 AND id = $2
    `, [exp.orden_id, id]);
    if (!rows.length) throw httpError('Documento de orden no encontrado', 404);
    return rows[0];
  }
  if (t === 'recepcion') {
    const { rows } = await query(`
      SELECT id, nombre, mime_type, contenido_base64, tipo
      FROM recepcion_bienes_documentos
      WHERE expediente_recepcion_id = $1 AND id = $2
    `, [exp.id, id]);
    if (!rows.length) throw httpError('Documento de recepción no encontrado', 404);
    return rows[0];
  }
  if (t === 'guia') {
    const { rows } = await query(`
      SELECT g.id, g.documento_nombre AS nombre, g.documento_mime AS mime_type,
        g.documento_base64 AS contenido_base64, g.numero_guia
      FROM recepcion_bienes_guias g
      JOIN recepciones_bienes rb ON rb.id = g.recepcion_bien_id
      WHERE rb.expediente_recepcion_id = $1 AND g.id = $2
    `, [exp.id, id]);
    if (!rows.length) throw httpError('Guía no encontrada', 404);
    return rows[0];
  }
  if (t === 'acta' || t === 'acta_firmada') {
    const { rows } = await query(`
      SELECT id, numero_acta,
        CASE WHEN $3 = 'acta_firmada' THEN acta_firmada_nombre ELSE documento_nombre END AS nombre,
        CASE WHEN $3 = 'acta_firmada' THEN acta_firmada_mime ELSE documento_mime END AS mime_type,
        CASE WHEN $3 = 'acta_firmada' THEN acta_firmada_base64 ELSE documento_base64 END AS contenido_base64,
        contenido_html
      FROM recepcion_bienes_actas
      WHERE expediente_recepcion_id = $1 AND id = $2
    `, [exp.id, id, t]);
    if (!rows.length) throw httpError('Acta no encontrada', 404);
    const row = rows[0];
    if (!row.contenido_base64 && row.contenido_html) {
      row.contenido_base64 = Buffer.from(String(row.contenido_html), 'utf8').toString('base64');
      row.mime_type = row.mime_type || 'text/html';
      row.nombre = row.nombre || `${row.numero_acta || 'acta'}.html`;
    }
    return row;
  }
  throw httpError('tipo de documento no soportado');
}

/** Bytes reales para preview/download (Content-Type binario, no JSON). */
export async function getDocumentoRecepcionBienesBytes(expedienteId, tipo, docId, userCtx = null) {
  const doc = await getDocumentoRecepcionBienes(expedienteId, tipo, docId, userCtx);
  let raw = String(doc.contenido_base64 || doc.base64 || '');
  if (raw.includes('base64,')) raw = raw.split('base64,').pop();
  raw = raw.replace(/\s+/g, '');
  if (!raw) {
    const err = httpError('Archivo no disponible', 404, 'DOCUMENTO_SIN_CONTENIDO');
    throw err;
  }
  let buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch (_) {
    throw httpError('Contenido documental inválido', 404, 'DOCUMENTO_INVALIDO');
  }
  if (!buffer.length) throw httpError('Archivo no disponible', 404, 'DOCUMENTO_SIN_CONTENIDO');
  const mime = doc.mime_type || doc.mimeType || 'application/pdf';
  const nombre = doc.nombre || doc.nombre_archivo || 'documento.pdf';
  return { buffer, mimeType: mime, nombre, documentoId: doc.id || docId };
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

  const fechaRecepcionRaw = body.fecha_recepcion_guia || body.fecha_recepcion || body.fecha_entrega_almacen;
  const fechaRecepcion = toCalendarIso(fechaRecepcionRaw) || fechaRecepcionRaw;
  const montoLiquidar = money(body.monto_liquidar != null ? body.monto_liquidar : exp.monto_total);
  const responsable = String(body.responsable || usuario || '').trim().slice(0, 150);
  const estadoFisicoRaw = String(body.estado_fisico || '').toUpperCase();
  const observada = !!(
    body.recepcion_observada === true
    || body.recepcion_conforme === false
    || ['OBSERVADA', 'OBSERVADO', 'CON_OBSERVACION'].includes(estadoFisicoRaw)
  );
  const estadoFisico = observada ? 'OBSERVADA' : 'CONFORME';
  const motivoObservacion = String(body.motivo_observacion || body.motivo || '').trim();

  const guiasIn = Array.isArray(body.guias) && body.guias.length
    ? body.guias
    : (body.numero_guia ? [{
      numero_guia: body.numero_guia,
      fecha_guia: body.fecha_guia || fechaRecepcion,
      transportista: body.transportista || null,
      documento_nombre: body.guia_nombre || null,
      documento_mime: body.guia_mime || null,
      documento_base64: body.guia_base64 || null,
    }] : []);

  if (!fechaRecepcion) throw httpError('fecha_recepcion obligatoria');
  if (!responsable) throw httpError('responsable obligatorio');
  if (!guiasIn.length) throw httpError('Debe registrar al menos una Guía de Remisión');
  if (montoLiquidar < 0) throw httpError('monto_liquidar no puede ser negativo');
  if (observada && !String(body.observaciones || motivoObservacion || '').trim()) {
    throw httpError('Las observaciones son obligatorias cuando la recepción está observada');
  }
  if (observada && !motivoObservacion && !String(body.observaciones || '').trim()) {
    throw httpError('Debe indicar el motivo de la recepción observada');
  }

  const fechaCheck = validateFechaRecepcionVsEmision(fechaRecepcion, exp.fecha_orden);
  if (!fechaCheck.ok) {
    throw httpError(
      fechaCheck.message || 'La fecha de recepción no puede ser anterior a la fecha de emisión de la orden.',
      400,
      fechaCheck.code || 'FECHA_RECEPCION_ANTERIOR_EMISION',
    );
  }

  const detallePrev = await getDetalleRecepcionBienes(expedienteId);
  const checkRec = canRegistrarRecepcion({
    orden: detallePrev,
    itemEntregas: detallePrev.item_entregas || [],
    recepciones: detallePrev.recepciones || [],
    montoTotal: detallePrev.monto_total,
    montoLiquidarAcumulado: detallePrev.monto_a_liquidar,
  });
  if (!checkRec.permitido) {
    throw httpError(
      checkRec.motivo || 'La entrega ya fue recibida completamente y no admite otra recepción.',
      409,
      'RECEPCION_COMPLETA',
    );
  }

  const saldo = money(exp.monto_total) - money(exp.monto_liquidar_acumulado);
  if (montoLiquidar > saldo + 0.009) {
    throw httpError(`Monto a liquidar (${montoLiquidar}) supera el saldo pendiente (${saldo})`);
  }

  for (const g of guiasIn) {
    const num = String(g.numero_guia || g.numero || '').trim();
    if (!num) throw httpError('Cada guía debe tener número');
    const dup = await query(`
      SELECT g.id FROM recepcion_bienes_guias g
      JOIN recepciones_bienes rb ON rb.id = g.recepcion_bien_id
      JOIN ordenes_contratacion oc ON oc.id = rb.orden_id
      WHERE rb.orden_id = $1
        AND UPPER(g.numero_guia) = UPPER($2)
        AND ($3::int IS NULL OR COALESCE(g.proveedor_id, oc.proveedor_id) = $3)
    `, [exp.orden_id, num, exp.proveedor_id || null]);
    if (dup.rows.length) throw httpError(`Guía de remisión duplicada: ${num}`, 409, 'GUIA_DUPLICADA');
  }

  const firstGuia = String(guiasIn[0].numero_guia || guiasIn[0].numero || '').trim();
  const idem = String(body.idempotency_key || `rec-${expedienteId}-${firstGuia}-${Date.now()}`).slice(0, 120);
  const observacionesTxt = [
    motivoObservacion ? `Motivo: ${motivoObservacion}` : '',
    String(body.observaciones || '').trim(),
  ].filter(Boolean).join(' — ') || null;

  // Ítems: usar body o completar desde combinaciones pendientes
  let itemsIn = Array.isArray(body.items) ? body.items.filter((x) => x) : [];
  if (!itemsIn.length && checkRec.combinacionesPendientes?.length) {
    itemsIn = checkRec.combinacionesPendientes.map((c) => {
      const it = (detallePrev.orden_items || []).find((x) => Number(x.id) === Number(c.orden_item_id));
      const cant = Number(c.saldo_pendiente ?? c.cantidad_programada ?? c.cantidad ?? 0);
      return {
        orden_item_id: c.orden_item_id,
        orden_entrega_id: c.orden_entrega_id,
        descripcion: it?.descripcion || c.descripcion || null,
        cantidad_contratada: c.cantidad_programada ?? c.cantidad ?? null,
        cantidad_recibida: cant,
        unidad_medida: it?.unidad_medida || null,
        precio_unitario: it?.precio_unitario ?? null,
        importe_recibido: it?.precio_unitario != null ? money(cant * Number(it.precio_unitario)) : null,
      };
    });
  }
  const entregaProgId = body.entrega_programada_id
    || itemsIn[0]?.orden_entrega_id
    || checkRec.combinacionesPendientes?.[0]?.orden_entrega_id
    || null;

  try {
    const { rows: recRows } = await query(`
      INSERT INTO recepciones_bienes (
        expediente_recepcion_id, orden_id, entrega_programada_id, numero_entrega,
        fecha_recepcion_guia, fecha_entrega_almacen, monto_calculado, monto_liquidar,
        tipo_proceso, numero_contrato, periodo_inicio, periodo_fin, observaciones,
        estado_interno, responsable, estado_fisico, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
      RETURNING *
    `, [
      exp.id, exp.orden_id,
      entregaProgId,
      body.numero_entrega || null,
      fechaRecepcion,
      toCalendarIso(body.fecha_entrega_almacen) || fechaRecepcion,
      body.monto_calculado != null ? money(body.monto_calculado) : montoLiquidar,
      montoLiquidar,
      body.tipo_proceso || exp.tipo_proceso || null,
      body.numero_contrato || exp.numero_contrato || null,
      body.periodo_inicio || null,
      body.periodo_fin || null,
      observacionesTxt,
      observada ? 'OBSERVADA' : 'CONFORME',
      responsable,
      estadoFisico,
      String(usuario || responsable).slice(0, 150),
    ]);
    const recepcion = recRows[0];

    for (const g of guiasIn) {
      const num = String(g.numero_guia || g.numero || '').trim();
      const fechaGuia = toCalendarIso(g.fecha_guia) || g.fecha_guia || fechaRecepcion;
      await query(`
        INSERT INTO recepcion_bienes_guias
          (recepcion_bien_id, numero_guia, fecha_guia, proveedor_id, transportista,
           documento_nombre, documento_mime, documento_base64, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        recepcion.id, num, fechaGuia, exp.proveedor_id,
        g.transportista || null,
        g.documento_nombre || g.archivo_nombre || null,
        g.documento_mime || g.archivo_mime || null,
        g.documento_base64 || g.archivo_base64 || null,
        String(usuario || '').slice(0, 150),
      ]);
      await registrarEvento({
        expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'GUIA_REGISTRADA',
        estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
        usuario, rol: actor, motivo: num,
        metadata: { recepcion_id: recepcion.id, numero_guia: num, fecha_guia: fechaGuia },
      });
    }

    for (const it of itemsIn) {
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

    const docsTec = Array.isArray(body.documentos_tecnicos) ? [...body.documentos_tecnicos] : [];
    if (body.documento_tecnico_nombre && body.documento_tecnico_base64) {
      docsTec.push({
        tipo: body.documento_tecnico_tipo || 'DOCUMENTO_TECNICO',
        nombre: body.documento_tecnico_nombre,
        mime_type: body.documento_tecnico_mime || 'application/pdf',
        contenido_base64: body.documento_tecnico_base64,
      });
    }
    for (const d of docsTec) {
      if (!d?.nombre || !d?.contenido_base64) continue;
      await query(`
        INSERT INTO recepcion_bienes_documentos (
          expediente_recepcion_id, recepcion_bien_id, tipo, nombre, mime_type,
          contenido_base64, origen, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,'PROVEEDOR',$7)
      `, [
        exp.id, recepcion.id, d.tipo || 'DOCUMENTO_TECNICO',
        d.nombre, d.mime_type || d.mime || 'application/pdf',
        d.contenido_base64 || d.base64,
        String(usuario || '').slice(0, 150),
      ]);
      await registrarEvento({
        expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'DOCUMENTO_TECNICO_ADJUNTADO',
        estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
        usuario, rol: actor, motivo: d.nombre,
        metadata: { recepcion_id: recepcion.id, tipo: d.tipo, nombre: d.nombre },
      });
    }

    const nuevoAcum = money(exp.monto_liquidar_acumulado) + montoLiquidar;
    const estadoAnterior = exp.estado_global;
    const estadoNuevo = observada ? 'RECEPCION_BIENES_OBSERVADA' : 'BIEN_RECIBIDO_ALMACEN';

    await query(`
      UPDATE recepcion_bienes_expedientes SET
        estado_global = $2,
        estado_interno = $7,
        monto_liquidar_acumulado = $3,
        tipo_proceso = COALESCE($4, tipo_proceso),
        numero_contrato = COALESCE($5, numero_contrato),
        actor_responsable = $8,
        bandeja_actual = 'ALMACEN',
        version = version + 1,
        updated_by = $6,
        updated_at = NOW()
      WHERE id = $1
    `, [
      exp.id, estadoNuevo, nuevoAcum,
      body.tipo_proceso || null, body.numero_contrato || null,
      String(usuario || '').slice(0, 150),
      observada ? 'RECEPCION_OBSERVADA' : 'RECEPCION_REGISTRADA',
      responsable,
    ]);

    await query(`
      INSERT INTO recepcion_bienes_derivaciones (
        expediente_recepcion_id, origen_rol, destino_rol, accion, motivo,
        estado_anterior, estado_nuevo, idempotency_key, created_by
      ) VALUES ($1,'ALMACEN','ALMACEN','REGISTRAR_RECEPCION',$2,$3,$4,$5,$6)
      ON CONFLICT (expediente_recepcion_id, idempotency_key) DO NOTHING
    `, [
      exp.id, observada ? `Recepción observada · Guía ${firstGuia}` : `Guía ${firstGuia}`,
      estadoAnterior, estadoNuevo, idem,
      String(usuario || '').slice(0, 150),
    ]);

    await registrarEvento({
      expedienteId: exp.id,
      ordenId: exp.orden_id,
      tipo: observada ? 'RECEPCION_OBSERVADA' : 'RECEPCION_REGISTRADA',
      estadoAnterior,
      estadoNuevo,
      usuario,
      rol: actor,
      motivo: body.observaciones || `Guía ${firstGuia}`,
      metadata: {
        recepcion_id: recepcion.id,
        monto_liquidar: montoLiquidar,
        guias: guiasIn.map((g) => g.numero_guia || g.numero),
        estado_fisico: estadoFisico,
      },
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

  const detalle = await getDetalleRecepcionBienes(expedienteId);
  if (!(detalle.recepciones || []).length) {
    throw httpError('Debe registrar al menos una recepción antes de generar el acta', 409);
  }

  const recepcionId = body.recepcion_id || body.recepcion_bien_id || null;
  const ordenItemId = body.orden_item_id || body.item_id || null;
  const ordenEntregaId = body.orden_entrega_id || body.entrega_id || body.entrega_programada_id || null;

  const recepcion = (detalle.recepciones || []).find((r) => Number(r.id) === Number(recepcionId))
    || (detalle.recepciones || [])[0];
  if (!recepcion) throw httpError('Recepción vinculada no encontrada', 404);

  const item = (detalle.orden_items || []).find((it) => Number(it.id) === Number(ordenItemId))
    || (detalle.orden_items || [])[0]
    || null;
  const entrega = (detalle.cronograma || detalle.entregas || []).find((e) => Number(e.id) === Number(ordenEntregaId))
    || (detalle.cronograma || [])[0]
    || null;

  // Validar pertenencia a la orden
  if (item && Number(item.orden_id || detalle.orden_id) !== Number(detalle.orden_id)
    && ordenItemId && !(detalle.orden_items || []).some((it) => Number(it.id) === Number(ordenItemId))) {
    throw httpError('El ítem no pertenece a la orden', 400);
  }
  if (ordenEntregaId && !(detalle.cronograma || []).some((e) => Number(e.id) === Number(ordenEntregaId))) {
    throw httpError('La entrega no pertenece a la orden', 400);
  }
  if (recepcionId && Number(recepcion.expediente_recepcion_id || detalle.id) !== Number(detalle.id)
    && !(detalle.recepciones || []).some((r) => Number(r.id) === Number(recepcionId))) {
    throw httpError('La recepción no pertenece al expediente', 400);
  }

  const combo = (detalle.item_entregas || []).find((c) =>
    (!ordenItemId || Number(c.orden_item_id) === Number(item?.id))
    && (!ordenEntregaId || Number(c.orden_entrega_id) === Number(entrega?.id)))
    || null;

  const cantidadProg = Number(combo?.cantidad_programada ?? combo?.cantidad ?? item?.cantidad ?? 0);
  const precioUnit = Number(item?.precio_unitario ?? 0);
  let montoEntregable = body.monto_entregable != null
    ? money(body.monto_entregable)
    : (combo?.monto_programado != null
      ? money(combo.monto_programado)
      : (cantidadProg && precioUnit ? money(cantidadProg * precioUnit) : money(recepcion.monto_liquidar || detalle.monto_total)));

  const fechaMaxima = combo?.fecha_maxima || entrega?.fechaMaxima || detalle.fecha_maxima;
  const fechaRecepcion = toCalendarIso(recepcion.fecha_recepcion_guia || recepcion.fecha_entrega_almacen);
  const penalidadAuto = correspondeAplicarPenalidad(fechaRecepcion, fechaMaxima);
  const correspondePenalidad = penalidadAuto === 'SÍ';
  // No permitir override manual SÍ→NO sin excepción autorizada
  if (body.corresponde_penalidad === false && correspondePenalidad && !body.excepcion_penalidad_autorizada) {
    throw httpError(
      'No se puede cambiar Penalidad SÍ a NO sin excepción documentada y autorizada',
      400,
      'PENALIDAD_NO_EDITABLE',
    );
  }
  const penalidadFinal = body.excepcion_penalidad_autorizada && body.corresponde_penalidad === false
    ? false
    : correspondePenalidad;

  const version = ((detalle.actas || []).filter((a) => !a.eliminado_at)[0]?.version || 0) + 1;
  const estadoDoc = body.borrador ? 'ACTA_RECEPCION_BORRADOR' : 'ACTA_RECEPCION_GENERADA';

  const actaData = buildActaRecepcionData(detalle, {
    version,
    numeroActa: body.numero_acta,
    generadoPor: usuario,
    observaciones: body.observaciones || body.observacion || '',
    item,
    entrega,
    recepcion,
    combo,
    montoEntregable,
    correspondePenalidad: penalidadFinal ? 'SÍ' : 'NO',
    fechaMaxima,
    fechaRecepcion,
    lugarEntrega: body.lugar_entrega || detalle.lugar_entrega || '',
    responsable: body.responsable || recepcion.responsable || usuario,
  });

  let pdfBase64 = body.documento_base64 || body.acta_base64 || null;
  let pdfNombre = body.documento_nombre || body.nombre || `${actaData.numero_acta}.pdf`;
  let pdfMime = body.documento_mime || body.mime_type || 'application/pdf';
  if (!pdfBase64 && !body.borrador) {
    const generated = generateActaRecepcionPdfServer(detalle, {
      version,
      numeroActa: actaData.numero_acta,
      generadoPor: usuario,
      observaciones: body.observaciones || '',
      item,
      entrega,
      recepcion,
      combo,
      montoEntregable,
      correspondePenalidad: penalidadFinal ? 'SÍ' : 'NO',
      fechaMaxima,
      fechaRecepcion,
      lugarEntrega: actaData.lugar_entrega,
      responsable: actaData.responsable_almacen,
    });
    pdfBase64 = generated.base64;
    pdfNombre = generated.nombre;
    pdfMime = generated.mime_type;
  } else if (String(pdfBase64 || '').includes('base64,')) {
    pdfBase64 = String(pdfBase64).split('base64,').pop();
  }

  const { rows } = await query(`
    INSERT INTO recepcion_bienes_actas (
      expediente_recepcion_id, recepcion_bien_id, orden_item_id, orden_entrega_id,
      numero_acta, version, estado_documental,
      contenido_html, documento_nombre, documento_mime, documento_base64,
      monto_entregable, corresponde_penalidad, lugar_entrega, observacion_acta,
      generado_at, generado_por
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),$16)
    RETURNING id, numero_acta, version, estado_documental, generado_at, documento_nombre, documento_mime,
      recepcion_bien_id, orden_item_id, orden_entrega_id, monto_entregable, corresponde_penalidad
  `, [
    exp.id,
    recepcion.id,
    item?.id || null,
    entrega?.id || null,
    actaData.numero_acta,
    version,
    estadoDoc,
    JSON.stringify(actaData),
    pdfNombre,
    pdfMime,
    pdfBase64,
    montoEntregable,
    penalidadFinal,
    actaData.lugar_entrega || detalle.lugar_entrega || null,
    body.observaciones || body.observacion || null,
    String(usuario || '').slice(0, 150),
  ]);

  await query(`
    UPDATE recepcion_bienes_expedientes SET
      estado_interno = 'ACTA_GENERADA',
      updated_by = $2, updated_at = NOW(), version = version + 1
    WHERE id = $1
  `, [exp.id, String(usuario || '').slice(0, 150)]);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id,
    tipo: body.borrador ? 'ACTA_RECEPCION_CREADA' : 'ACTA_RECEPCION_PDF_GENERADA',
    estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
    usuario, rol: actor, motivo: actaData.numero_acta,
    metadata: {
      acta_id: rows[0].id,
      version,
      recepcion_id: recepcion.id,
      orden_item_id: item?.id || null,
      orden_entrega_id: entrega?.id || null,
      corresponde_penalidad: penalidadFinal,
      modelo: actaData.entidad.modelo,
    },
  });
  if (!body.borrador) {
    await registrarEvento({
      expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'ACTA_RECEPCION_CREADA',
      estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
      usuario, rol: actor, motivo: actaData.numero_acta,
      metadata: { acta_id: rows[0].id, version },
    });
  }

  return { ...rows[0], datos: actaData };
}

export async function editarActaRecepcion(expedienteId, actaId, body = {}, usuario = '', rol = '') {
  const exp = await getExpedienteOrThrow(expedienteId);
  const actor = resolveRolActor({}, rol);
  if (actor !== 'ALMACEN' && !['admin', 'dec'].includes(String(rol).toLowerCase())) {
    throw httpError('Solo Almacén puede editar el acta', 403);
  }
  const { rows } = await query(`
    SELECT * FROM recepcion_bienes_actas
    WHERE id = $1 AND expediente_recepcion_id = $2 AND eliminado_at IS NULL
  `, [parseInt(actaId, 10), exp.id]);
  if (!rows.length) throw httpError('Acta no encontrada', 404);
  const acta = rows[0];
  if (acta.enviado_au_at || acta.firmado_au_at) {
    throw httpError('No se puede editar un acta ya enviada o firmada por el AU', 409, 'ACTA_NO_EDITABLE');
  }
  if (!['ACTA_RECEPCION_BORRADOR', 'ACTA_RECEPCION_GENERADA', 'ACTA_RECEPCION_EDITADA'].includes(acta.estado_documental)) {
    throw httpError('Estado documental no permite edición', 409);
  }

  // Regenerar como nueva versión (conserva historial)
  const generada = await generarActaRecepcion(expedienteId, {
    ...body,
    recepcion_id: body.recepcion_id || acta.recepcion_bien_id,
    orden_item_id: body.orden_item_id || acta.orden_item_id,
    orden_entrega_id: body.orden_entrega_id || acta.orden_entrega_id,
    observaciones: body.observaciones ?? acta.observacion_acta,
    borrador: body.borrador === true,
  }, usuario, rol);

  await query(`
    UPDATE recepcion_bienes_actas SET
      estado_documental = 'ACTA_RECEPCION_EDITADA',
      updated_at = NOW()
    WHERE id = $1
  `, [generada.id]);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'ACTA_RECEPCION_EDITADA',
    estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
    usuario, rol: actor, motivo: `v${acta.version} → v${generada.version}`,
    metadata: {
      acta_id: generada.id,
      version_anterior: acta.version,
      version_nueva: generada.version,
      acta_anterior_id: acta.id,
    },
  });

  return generada;
}

export async function eliminarActaRecepcion(expedienteId, actaId, body = {}, usuario = '', rol = '') {
  const exp = await getExpedienteOrThrow(expedienteId);
  const actor = resolveRolActor({}, rol);
  if (actor !== 'ALMACEN' && !['admin', 'dec'].includes(String(rol).toLowerCase())) {
    throw httpError('Solo Almacén puede eliminar el acta', 403);
  }
  const { rows } = await query(`
    SELECT * FROM recepcion_bienes_actas
    WHERE id = $1 AND expediente_recepcion_id = $2 AND eliminado_at IS NULL
  `, [parseInt(actaId, 10), exp.id]);
  if (!rows.length) throw httpError('Acta no encontrada', 404);
  const acta = rows[0];
  if (acta.enviado_au_at || acta.firmado_au_at) {
    throw httpError('No se puede eliminar un acta enviada al Área Usuaria', 409, 'ACTA_NO_ELIMINABLE');
  }
  if (!['ACTA_RECEPCION_BORRADOR', 'ACTA_RECEPCION_GENERADA', 'ACTA_RECEPCION_EDITADA'].includes(acta.estado_documental)) {
    throw httpError('Estado documental no permite eliminación', 409);
  }
  const motivo = String(body.motivo || body.observacion || '').trim() || 'Eliminación lógica de borrador';

  await query(`
    UPDATE recepcion_bienes_actas SET
      estado_documental = 'ACTA_RECEPCION_ELIMINADA',
      eliminado_at = NOW(),
      eliminado_por = $2,
      eliminado_motivo = $3,
      updated_at = NOW()
    WHERE id = $1
  `, [acta.id, String(usuario || '').slice(0, 150), motivo]);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'ACTA_RECEPCION_ELIMINADA',
    estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
    usuario, rol: actor, motivo,
    metadata: { acta_id: acta.id, version: acta.version },
  });

  return { ok: true, id: acta.id, estado_documental: 'ACTA_RECEPCION_ELIMINADA' };
}

// Acta visada — implementación en recepcionActaVisada.js
export {
  adjuntarActaVisadaAlmacen,
  listarActaVisada,
  obtenerActaVisada,
  reemplazarActaVisada,
  eliminarActaVisada,
  listarVisadosDetalle,
  tieneActaVisadaVigente,
  getContenidoActaVisada,
  ensureActaVisadosTable,
} from './recepcionActaVisada.js';

export async function listDestinatariosAreaUsuaria(expedienteId, { search = '', userCtx = null } = {}) {
  const eid = parseInt(expedienteId, 10);
  if (!Number.isFinite(eid)) throw httpError('expediente_id inválido', 422);
  const centro = await resolveCentroExpediente(eid);
  if (userCtx && typeof userCtx === 'object') assertAccesoRecepcionBienes(userCtx, centro);

  // Filtro por área destino cuando corresponda (área real del requerimiento)
  const areaFiltro = centro.area_id ? Number(centro.area_id) : null;

  let rows = [];
  try {
    const params = ['admin'];
    let where = `WHERE u.activo = TRUE AND u.rol <> $1
      AND (
        COALESCE(u.centro, '') = $2 OR COALESCE(u.codigo_centro_costo, '') = $2
      )`;
    params.push(centro.centro_codigo);
    if (areaFiltro) {
      params.push(areaFiltro);
      where += ` AND (u.area_id IS NULL OR u.area_id = $${params.length})`;
    }
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
    const res = await query(`
      SELECT u.id, u.dni, u.username, u.apellidos, u.nombres, u.nombre, u.cargo,
        u.rol, u.permisos, u.correo
      FROM usuarios u
      ${where}
      ORDER BY u.apellidos ASC NULLS LAST, u.nombres ASC NULLS LAST
      LIMIT 200
    `, params);
    rows = res.rows;
  } catch (_) {
    // Fallback: solo mismo centro por código (sin área)
    const res = await query(`
      SELECT u.id, u.dni, u.username, u.apellidos, u.nombres, u.nombre, u.cargo,
        u.rol, u.permisos, u.correo
      FROM usuarios u
      WHERE u.activo = TRUE AND u.rol <> 'admin'
        AND (COALESCE(u.centro, '') = $1 OR COALESCE(u.codigo_centro_costo, '') = $1)
      ORDER BY u.apellidos ASC NULLS LAST, u.nombres ASC NULLS LAST
      LIMIT 200
    `, [centro.centro_codigo]);
    rows = res.rows;
  }

  const nombreUsuario = (u) => {
    const full = [u.apellidos, u.nombres].filter(Boolean).join(' ').trim();
    return full || u.nombre || u.username || u.dni || `Usuario ${u.id}`;
  };

  return (rows || [])
    .map((u) => ({
      id: u.id,
      nombre: nombreUsuario(u),
      dni: u.dni || '',
      cargo: u.cargo || '',
      unidad: '',
      correo: u.correo || '',
      rol: u.rol,
      permisosNorm: normalizePermisos(u.permisos, u.rol),
    }))
    .filter((u) => {
      const p = u.permisosNorm || { modulos: [], submodulos: [] };
      const rolU = String(u.rol || '').toLowerCase();
      if (rolU === 'au' || rolU === 'area_usuaria') return true;
      return (p.modulos || []).includes('EJECUCION')
        && (p.submodulos || []).includes('RECEPCION_BIENES');
    })
    .map(({ permisosNorm, ...rest }) => rest);
}

export async function derivarAreaUsuaria(expedienteId, body = {}, usuario = '', rol = '', userCtx = null) {
  const exp = await getExpedienteOrThrow(expedienteId);
  const actor = resolveRolActor({}, rol);
  if (actor !== 'ALMACEN' && !['admin', 'dec'].includes(String(rol).toLowerCase())) {
    throw httpError('Solo Almacén puede derivar al Área Usuaria', 403);
  }
  // RB8.1B: alcance por centro — el operador debe pertenecer al centro del expediente
  if (userCtx && typeof userCtx === 'object') {
    const centro = resolverCentroDesdeRequerimiento({
      cmn: exp.requerimiento_cmn,
      area: exp.req_area,
      payload: exp.requerimiento_payload,
    });
    assertAccesoRecepcionBienes(userCtx, centro);
  }
  if (!['BIEN_RECIBIDO_ALMACEN', 'RECEPCION_BIENES_OBSERVADA'].includes(exp.estado_global)) {
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

  if (exp.estado_global === 'CONFORMIDAD_PENDIENTE_AU') {
    throw httpError('El expediente ya fue derivado al Área Usuaria', 409, 'DERIVACION_DUPLICADA');
  }

  const { rows: recs } = await query(`
    SELECT COUNT(*)::int AS n FROM recepciones_bienes WHERE expediente_recepcion_id = $1
  `, [exp.id]);
  if (!recs[0]?.n) {
    throw httpError('Debe registrar la recepción antes de derivar', 409, 'RECEPCION_REQUERIDA');
  }

  const { rows: actas } = await query(`
    SELECT * FROM recepcion_bienes_actas
    WHERE expediente_recepcion_id = $1 AND eliminado_at IS NULL
    ORDER BY id DESC LIMIT 1
  `, [exp.id]);
  if (!actas.length) {
    throw httpError(
      'Debe generar el acta antes de derivar al Área Usuaria.',
      409,
      'ACTA_REQUERIDA',
    );
  }
  const acta = actas[0];
  const { tieneActaVisadaVigente } = await import('./recepcionActaVisada.js');
  const visada = await tieneActaVisadaVigente(exp.id, acta.id);
  if (!visada) {
    throw httpError(
      'Debe adjuntar el acta visada por Almacén antes de derivar al Área Usuaria.',
      409,
      'ACTA_VISADA_REQUERIDA',
    );
  }

  const {
    buildPaqueteDocumentalDerivacionAu,
    assertPaqueteCompletoParaDerivar,
    persistirPaqueteDerivacion,
  } = await import('./recepcionPaqueteDerivacionAu.js');
  const paquete = await buildPaqueteDocumentalDerivacionAu(exp.id, {
    acta_id: acta.id,
    recepcion_id: body.recepcion_id || acta.recepcion_bien_id,
  });
  const docsEnviados = await assertPaqueteCompletoParaDerivar(
    paquete,
    body.documentos_ids || body.documentos || body.documentos_keys || [],
  );

  const destId = body.destinatario_id || body.responsable_id || null;
  const destNombre = body.destinatario_nombre || body.responsable || null;
  if (!destId && !destNombre) {
    throw httpError('Debe seleccionar la persona responsable del Área Usuaria', 400, 'DESTINATARIO_REQUERIDO');
  }
  // RB8.1B: validar que el responsable pertenece al centro real del expediente
  if (destId) {
    const centroResp = resolverCentroDesdeRequerimiento({
      cmn: exp.requerimiento_cmn,
      area: exp.req_area,
      payload: exp.requerimiento_payload,
    });
    await validarResponsableCentro(destId, centroResp, centroResp.area_id ?? null);
  }

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
    acta.id, String(usuario || '').slice(0, 150),
    destNombre, destId,
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
    destNombre, destId,
    String(usuario || '').slice(0, 150),
  ]);

  const metaDocs = docsEnviados.map((d) => ({
    documentoKey: d.documentoKey,
    documentoId: d.documentoId,
    tipo: d.tipo,
    grupo: d.grupo,
    nombre: d.nombre,
    obligatorio: d.obligatorio,
    version: d.version,
  }));

  const { rows: derRows } = await query(`
    INSERT INTO recepcion_bienes_derivaciones (
      expediente_recepcion_id, origen_rol, destino_rol, destino_usuario_id,
      destino_usuario_nombre, accion, motivo, estado_anterior, estado_nuevo,
      idempotency_key, created_by, metadata
    ) VALUES ($1,'ALMACEN','AREA_USUARIA',$2,$3,'DERIVAR_AU',$4,$5,$6,$7,$8,$9::jsonb)
    RETURNING id
  `, [
    exp.id, destId, destNombre,
    body.motivo || body.observacion || body.mensaje || null,
    estadoAnterior, estadoNuevo, idem, String(usuario || '').slice(0, 150),
    JSON.stringify({
      modulo_destino: body.modulo_destino || 'EJECUCION',
      submodulo_destino: body.submodulo_destino || 'RECEPCION_BIENES_AU',
      area_destino: body.area_destino || null,
      acta_id: acta.id,
      recepcion_id: paquete.recepcionId,
      documentos: metaDocs,
      documentos_cantidad: metaDocs.length,
      documentos_obligatorios: metaDocs.filter((d) => d.obligatorio).length,
      adjuntos_propios: metaDocs.filter((d) => d.tipo === 'ADJUNTO_DERIVACION').length,
    }),
  ]);

  await persistirPaqueteDerivacion(derRows[0].id, exp.id, docsEnviados);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'EXPEDIENTE_DERIVADO_AREA_USUARIA',
    estadoAnterior, estadoNuevo, usuario, rol: actor,
    motivo: body.motivo || body.observacion || body.mensaje || null,
    metadata: {
      destinatario_id: destId,
      destinatario_nombre: destNombre,
      acta_id: acta.id,
      recepcion_id: paquete.recepcionId,
      submodulo_destino: body.submodulo_destino || 'RECEPCION_BIENES_AU',
      documentos: metaDocs,
      documentos_cantidad: metaDocs.length,
      documentos_obligatorios: metaDocs.filter((d) => d.obligatorio).length,
      adjuntos_propios: metaDocs.filter((d) => d.tipo === 'ADJUNTO_DERIVACION').length,
      idempotency_key: idem,
      derivacion_id: derRows[0].id,
    },
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
  if (!body.motivo) throw httpError('motivo obligatorio');

  let destino = String(body.destino || '').toUpperCase();
  // AU puede devolver al Almacén desde conformidad pendiente
  if (actor === 'AREA_USUARIA' || ['au', 'area_usuaria'].includes(String(rol).toLowerCase())) {
    if (exp.estado_global !== 'CONFORMIDAD_PENDIENTE_AU') {
      throw httpError('AU solo puede observar cuando la conformidad está pendiente', 409);
    }
    destino = 'ALMACEN';
  } else if (actor === 'ALMACEN' || ['admin', 'dec'].includes(String(rol).toLowerCase())) {
    if (exp.estado_global !== 'CONFORMIDAD_RECIBIDA_AU') {
      throw httpError('Almacén solo observa actas recibidas del AU', 409);
    }
    destino = destino || 'AREA_USUARIA';
  } else if (actor === 'COORDINADOR_CM') {
    if (exp.estado_global !== 'CONFORMIDAD_EN_COORDINACION_CM') {
      throw httpError('Coordinador solo observa en su etapa', 409);
    }
    destino = destino || 'ALMACEN';
  } else {
    throw httpError('Rol no autorizado a observar', 403);
  }

  const responsable = String(body.responsable || usuario || '').trim().slice(0, 150);
  const fechaObs = body.fecha || body.fecha_observacion || new Date().toISOString();
  const bandeja = destino === 'ALMACEN' ? 'ALMACEN' : 'AREA_USUARIA';

  // AU que observa: vuelve a almacén manteniendo historial; estado global se conserva
  // (situación OBSERVADO) salvo que se solicite reabrir recepción
  await query(`
    UPDATE recepcion_bienes_expedientes SET
      estado_interno = 'OBSERVADO',
      bandeja_actual = $2,
      actor_responsable = $4,
      version = version + 1, updated_by = $3, updated_at = NOW()
    WHERE id = $1
  `, [exp.id, bandeja, String(usuario || '').slice(0, 150), responsable || null]);

  await query(`
    UPDATE recepcion_bienes_actas SET
      estado_documental = 'ACTA_RECEPCION_OBSERVADA', updated_at = NOW()
    WHERE expediente_recepcion_id = $1
  `, [exp.id]);

  const adjuntos = Array.isArray(body.adjuntos) ? body.adjuntos : [];
  const adjuntoIds = [];
  for (const d of adjuntos) {
    if (!d?.nombre || !(d.contenido_base64 || d.base64)) continue;
    const { rows: ins } = await query(`
      INSERT INTO recepcion_bienes_documentos (
        expediente_recepcion_id, tipo, nombre, mime_type, contenido_base64, origen, created_by
      ) VALUES ($1,'OBSERVACION_AU',$2,$3,$4,'AREA_USUARIA',$5)
      RETURNING id
    `, [
      exp.id,
      d.nombre,
      d.mime_type || d.mime || 'application/pdf',
      d.contenido_base64 || d.base64,
      String(usuario || '').slice(0, 150),
    ]);
    if (ins[0]?.id) adjuntoIds.push(ins[0].id);
  }

  await query(`
    INSERT INTO recepcion_bienes_derivaciones (
      expediente_recepcion_id, origen_rol, destino_rol, accion, motivo,
      estado_anterior, estado_nuevo, created_by, metadata
    ) VALUES ($1,$2,$3,'OBSERVAR',$4,$5,$5,$6,$7::jsonb)
  `, [
    exp.id, actor, destino, body.motivo, exp.estado_global,
    String(usuario || '').slice(0, 150),
    JSON.stringify({
      situacion: 'OBSERVADO',
      destino,
      responsable,
      fecha: fechaObs,
      adjuntos: adjuntoIds,
    }),
  ]);

  await registrarEvento({
    expedienteId: exp.id, ordenId: exp.orden_id, tipo: 'OBSERVACION_AU',
    estadoAnterior: exp.estado_global, estadoNuevo: exp.estado_global,
    usuario, rol: actor, motivo: body.motivo,
    metadata: {
      destino, situacion: 'OBSERVADO', responsable, fecha: fechaObs, adjuntos: adjuntoIds,
    },
  });

  const detalle = await getDetalleRecepcionBienes(exp.id);
  detalle.situacion = {
    codigo: 'OBSERVADO',
    label: destino === 'ALMACEN' ? 'Observado — devuelto a Almacén' : 'Conformidad observada al Área Usuaria',
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

export async function getHistorialRecepcionBienes(id, userCtx = null) {
  const exp = await getExpedienteOrThrow(id);
  if (userCtx && typeof userCtx === 'object' && !esAlcanceGlobal(userCtx)) {
    const centro = resolverCentroDesdeRequerimiento({
      cmn: exp.requerimiento_cmn,
      area: exp.req_area,
      payload: exp.requerimiento_payload,
    });
    assertAccesoRecepcionBienes(userCtx, centro);
  }
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
