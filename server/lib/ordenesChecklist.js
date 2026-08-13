/**
 * Checklist de órdenes — carga snapshot DB y aplica estado según requisitos.
 * No sustituye validaciones de negocio; es capa preventiva + fuente de estado LISTA.
 */
import { query } from '../db.js';
import {
  ETAPAS_CHECKLIST,
  evaluarChecklist,
  listoParaNotificacion,
} from '../../shared/expedienteChecklist.js';
import {
  getOrdenById,
  getOrdenItems,
  reconciliarItemsContractuales,
  ESTADOS_ORDEN,
  httpError,
} from './ordenesContratacion.js';
import { normalizeEstadoOrden } from '../../shared/estadoExpedienteVigente.js';

export { ETAPAS_CHECKLIST, evaluarChecklist, listoParaNotificacion };

async function loadSnapshotOrden(ordenId) {
  const orden = await getOrdenById(ordenId);
  const itemsFisicos = await getOrdenItems(ordenId);
  // RC8.14 Obs.51 — misma reconciliación en presentación de getDetalleOrden
  // (reutilizada, no reimplementada): si hay evidencia contractual canónica de que
  // los orden_items físicos están fragmentados (p. ej. 2 filas de 7000 en vez de 1
  // de 14000), el checklist debe evaluarse contra el ítem contractual real, no
  // contra el dato histórico fragmentado. No escribe BD.
  const reconciliacion = await reconciliarItemsContractuales(orden, itemsFisicos);
  const items = reconciliacion.items;

  const { rows: docs } = await query(`
    SELECT id FROM orden_documentos
    WHERE orden_id = $1 AND tipo_documento = 'ORDEN_FIRMADA' AND activo = TRUE
    LIMIT 1
  `, [ordenId]);

  const { rows: ents } = await query(`
    SELECT id, importe FROM orden_entregas
    WHERE orden_id = $1 AND estado <> 'ANULADO'
  `, [ordenId]);

  const entIds = ents.map((e) => e.id);
  let entregaItems = [];
  if (entIds.length) {
    const { rows: ei } = await query(`
      SELECT orden_item_id, cantidad, precio_total, precio_unitario
      FROM orden_entrega_items
      WHERE orden_entrega_id = ANY($1::int[])
    `, [entIds]);
    entregaItems = ei;
  }
  // RC8.14 Obs.51 — cuando el ítem fue reconciliado (ver arriba) las relaciones
  // orden_entrega_items físicas referencian ítems que ya no se exponen (o, como en
  // el caso observado, nunca se guardaron: 0 filas pese a 2 entregas activas reales).
  // Se sintetiza, solo para evaluar el checklist, una línea por ítem canónico y
  // entrega usando el importe YA persistido y confiable de cada orden_entregas
  // (no se inventa una distribución: si faltan relaciones reales, se usa el importe
  // real de la entrega, repartido entre los ítems canónicos si hay más de uno).
  const relacionesInsuficientes = ents.length > 0
    && entregaItems.length < ents.length * Math.max(items.length, 1);
  if (reconciliacion.reconciliado && relacionesInsuficientes) {
    const nItems = Math.max(items.length, 1);
    entregaItems = ents.flatMap((e) => items.map((it) => ({
      orden_item_id: it.id,
      cantidad: Number(it.cantidad) || 1,
      precio_total: Number(e.importe || 0) / nItems,
      precio_unitario: (Number(e.importe || 0) / nItems) / (Number(it.cantidad) || 1),
    })));
  }

  const { rows: ini } = await query(`
    SELECT id FROM orden_inicio_actividad
    WHERE orden_id = $1
       OR (requerimiento_id = $2 AND orden_id IS NULL)
    ORDER BY id DESC LIMIT 1
  `, [ordenId, orden.requerimiento_id]);

  // CCP firmado = documento en ccp_firmados (NO basta codigo_ccp).
  const { rows: ccp } = await query(`
    SELECT id FROM ccp_firmados
    WHERE requerimiento_id = $1 AND activo = TRUE
    ORDER BY version DESC, id DESC LIMIT 1
  `, [orden.requerimiento_id]);

  const { rows: reqTipo } = await query(
    `SELECT tipo FROM requerimientos WHERE id = $1`,
    [orden.requerimiento_id],
  );
  const tipo = String(reqTipo[0]?.tipo || orden.tipo || '').toLowerCase();

  return {
    orden_id: orden.id,
    requerimiento_id: orden.requerimiento_id,
    tipo,
    estado: orden.estado,
    ccp_firmado: ccp.length > 0,
    numero_orden: orden.numero_orden || '',
    fecha_orden: orden.fecha_orden || null,
    orden_firmada: docs.length > 0,
    entregas_count: ents.length,
    inicio_actividad: ini.length > 0,
    monto_total: Number(orden.monto_total || 0),
    items: items.map((it) => ({
      id: it.id,
      cantidad: Number(it.cantidad),
      precio_unitario: Number(it.precio_unitario),
      precio_total: Number(it.precio_total),
    })),
    entrega_items: entregaItems.map((li) => ({
      orden_item_id: Number(li.orden_item_id),
      cantidad: Number(li.cantidad),
      precio_total: Number(li.precio_total),
      precio_unitario: Number(li.precio_unitario),
    })),
    orden_notificada: !!orden.enviado_proveedor_at
      || normalizeEstadoOrden(orden.estado) === 'ORDEN_NOTIFICADA',
    enviado_proveedor_at: orden.enviado_proveedor_at,
    recepcion_confirmada: !!orden.recibido_proveedor_at
      || normalizeEstadoOrden(orden.estado) === 'ORDEN_RECEPCION_CONFIRMADA',
    recibido_proveedor_at: orden.recibido_proveedor_at,
    derivado_ejecucion: !!orden.derivado_ejecucion_at
      || normalizeEstadoOrden(orden.estado) === 'EN_EJECUCION',
    derivado_ejecucion_at: orden.derivado_ejecucion_at,
    en_ejecucion: normalizeEstadoOrden(orden.estado) === 'EN_EJECUCION',
  };
}

export async function obtenerChecklistOrden(ordenId, etapa = ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION) {
  const snapshot = await loadSnapshotOrden(ordenId);
  const checklist = evaluarChecklist(etapa, snapshot);
  return { snapshot, checklist };
}

export async function obtenerChecklistRequerimiento(requerimientoId, etapa = ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION) {
  const reqId = parseInt(requerimientoId, 10);
  if (!Number.isFinite(reqId)) throw httpError('Requerimiento inválido');

  const { rows: ord } = await query(`
    SELECT id FROM ordenes_contratacion
    WHERE requerimiento_id = $1 AND estado <> 'ORDEN_ANULADA'
    ORDER BY id DESC LIMIT 1
  `, [reqId]);

  if (ord.length) return obtenerChecklistOrden(ord[0].id, etapa);

  const { rows: ccp } = await query(`
    SELECT id FROM ccp_firmados
    WHERE requerimiento_id = $1 AND activo = TRUE
    LIMIT 1
  `, [reqId]);

  // RC8.10.2 — tipo para no confundir reglas; sin orden aún todo pendiente es dominio real.
  const { rows: reqTipo } = await query(
    `SELECT tipo FROM requerimientos WHERE id = $1`,
    [reqId],
  );
  const tipo = String(reqTipo[0]?.tipo || '').toLowerCase();

  const snapshot = {
    tipo,
    // codigo_ccp NO implica ccp_firmado — solo ccp_firmados.activo
    ccp_firmado: ccp.length > 0,
    numero_orden: '',
    fecha_orden: null,
    orden_firmada: false,
    entregas_count: 0,
    inicio_actividad: false,
    items: [],
    entrega_items: [],
    monto_total: 0,
  };
  return { snapshot, checklist: evaluarChecklist(etapa, snapshot) };
}

/**
 * Recalcula y persiste el estado de la orden según checklist.
 * No retrocede estados posteriores a notificación/ejecución.
 */
export async function sincronizarEstadoSegunChecklist(ordenId, usuario = '') {
  const orden = await getOrdenById(ordenId);
  const norm = normalizeEstadoOrden(orden.estado);
  const avanzados = new Set([
    'ORDEN_NOTIFICADA',
    'ORDEN_RECEPCION_CONFIRMADA',
    'EN_EJECUCION',
    'ORDEN_ANULADA',
  ]);
  if (avanzados.has(norm) || orden.estado === ESTADOS_ORDEN.ORDEN_ANULADA) {
    const { checklist } = await obtenerChecklistOrden(ordenId);
    return { estado: orden.estado, checklist, sincronizado: false };
  }

  const { checklist } = await obtenerChecklistOrden(ordenId);
  let nuevo = ESTADOS_ORDEN.ORDEN_REGISTRADA;
  if (checklist.completo) {
    nuevo = ESTADOS_ORDEN.ORDEN_LISTA_NOTIFICACION;
  } else if (orden.numero_orden && orden.fecha_orden) {
    nuevo = ESTADOS_ORDEN.ORDEN_REGISTRADA;
  } else {
    nuevo = ESTADOS_ORDEN.ORDEN_REGISTRADA;
  }

  if (orden.estado !== nuevo) {
    await query(`
      UPDATE ordenes_contratacion SET
        estado = $2, actualizado_por = $3, actualizado_at = NOW()
      WHERE id = $1
    `, [ordenId, nuevo, String(usuario || '').slice(0, 150)]);
  }
  return { estado: nuevo, checklist, sincronizado: orden.estado !== nuevo };
}
