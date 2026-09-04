// Compras Históricas — consultas base (SIGAMEF real: 1 fila histórica = 1 ítem)
import { query } from '../db.js';

function cleanString(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

function parsePage(v, fallback = 1) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

function parsePageSize(v, fallback = 50) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(500, n);
}

function buildListFilters(filters = {}) {
  const params = [];
  const clauses = [];

  const anio = cleanString(filters.anio);
  if (anio) {
    params.push(parseInt(anio, 10));
    clauses.push(`o.anio = $${params.length}`);
  }

  const tipo = cleanString(filters.tipo);
  if (tipo) {
    params.push(tipo);
    clauses.push(`o.tipo_origen = $${params.length}`);
  }

  const numero = cleanString(filters.numero);
  if (numero) {
    params.push(`%${numero}%`);
    clauses.push(`o.numero_orden ILIKE $${params.length}`);
  }

  const proveedor = cleanString(filters.proveedor);
  if (proveedor) {
    params.push(`%${proveedor}%`);
    clauses.push(`o.nombre_proveedor ILIKE $${params.length}`);
  }

  const item = cleanString(filters.item);
  if (item) {
    params.push(`%${item}%`);
    clauses.push(`i.codigo_item ILIKE $${params.length}`);
  }

  const descripcion = cleanString(filters.descripcion);
  if (descripcion) {
    params.push(`%${descripcion}%`);
    clauses.push(`i.nombre_item ILIKE $${params.length}`);
  }

  const centroCosto = cleanString(filters.centro_costo);
  if (centroCosto) {
    params.push(`%${centroCosto}%`);
    clauses.push(`i.centro_costo ILIKE $${params.length}`);
  }

  const desde = cleanString(filters.desde);
  if (desde) {
    params.push(desde);
    clauses.push(`o.fecha_orden >= $${params.length}::date`);
  }

  const hasta = cleanString(filters.hasta);
  if (hasta) {
    params.push(hasta);
    clauses.push(`o.fecha_orden <= $${params.length}::date`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

const LIST_SELECT = `
  SELECT
    i.id,
    i.orden_id,
    o.anio,
    o.tipo_origen,
    o.numero_orden,
    o.fecha_orden,
    o.mes,
    o.nombre_proveedor,
    o.ruc,
    o.monto_total,
    i.codigo_item,
    i.nombre_item,
    i.unidad_medida,
    i.centro_costo,
    i.nombre_dependencia,
    i.cantidad,
    i.precio_unitario,
    i.valor_soles,
    i.created_at AS item_created_at,
    o.created_at AS orden_created_at,
    o.updated_at AS orden_updated_at
  FROM compras_historicas_items i
  INNER JOIN compras_historicas_ordenes o ON o.id = i.orden_id
`;

export async function listarComprasHistoricas(filters = {}) {
  const page = parsePage(filters.page, 1);
  const pageSize = parsePageSize(filters.pageSize, 50);
  const offset = (page - 1) * pageSize;
  const { where, params } = buildListFilters(filters);

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM compras_historicas_items i
    INNER JOIN compras_historicas_ordenes o ON o.id = i.orden_id
    ${where}
  `;
  const { rows: countRows } = await query(countSql, params);
  const total = countRows[0]?.total ?? 0;

  const dataParams = [...params, pageSize, offset];
  const dataSql = `
    ${LIST_SELECT}
    ${where}
    ORDER BY o.fecha_orden DESC NULLS LAST, o.anio DESC, o.numero_orden, i.id
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
  `;
  const { rows } = await query(dataSql, dataParams);

  return {
    data: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function obtenerCompraHistoricaPorId(ordenId) {
  const id = parseInt(ordenId, 10);
  if (!Number.isFinite(id) || id < 1) return null;

  const { rows: ordenRows } = await query(
    `SELECT * FROM compras_historicas_ordenes WHERE id = $1`,
    [id],
  );
  if (!ordenRows.length) return null;

  const { rows: items } = await query(
    `SELECT *
     FROM compras_historicas_items
     WHERE orden_id = $1
     ORDER BY id`,
    [id],
  );

  const montoCalculado = items.reduce(
    (acc, row) => acc + Number(row.valor_soles || 0),
    0,
  );

  return {
    ...ordenRows[0],
    monto_total_calculado: Math.round(montoCalculado * 100) / 100,
    items,
  };
}
