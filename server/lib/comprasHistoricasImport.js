/**
 * RC8.16C — Importación controlada Compras Históricas (SIGAMEF real).
 * Fase PREVIEW (sin grabar) + CONFIRMAR (transacción).
 */
import crypto from 'node:crypto';
import XLSX from 'xlsx';
import pool, { query } from '../db.js';
import {
  cleanString,
  normalizeDateValue,
  normalizeRowKeys,
} from './importNormalize.js';

const ERRORES_MUESTRA_MAX = 20;
const TIPO_MAP = {
  B: 'B',
  S: 'S',
  BIEN: 'B',
  BIENES: 'B',
  SERVICIO: 'S',
  SERVICIOS: 'S',
};

function roundN(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(Number(n || 0) * f) / f;
}

export function normalizeMoney(value, fallback = null) {
  if (value == null || value === '') return fallback;
  let text = cleanString(value).replace(/\s/g, '');
  if (!text) return fallback;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d+$/.test(text) && !text.includes('.')) {
    text = text.replace(',', '.');
  } else {
    text = text.replace(/,/g, '');
  }
  const num = Number(text);
  return Number.isFinite(num) ? num : fallback;
}

export function normalizeTipoOrigen(value) {
  const raw = cleanString(value).toUpperCase();
  if (!raw) return null;
  return TIPO_MAP[raw] || null;
}

export function buildOrdenKey(anio, tipoOrigen, numeroOrden) {
  return `${Number(anio)}|${tipoOrigen}|${cleanString(numeroOrden)}`;
}

/**
 * Fingerprint determinístico de ítem (sin UNIQUE en BD).
 * Combina la clave de orden + campos fuente SIGAMEF normalizados y redondeados.
 */
export function buildItemFingerprint(row) {
  const parts = [
    row.ordenKey,
    cleanString(row.codigo_item).toUpperCase(),
    cleanString(row.nombre_item).toLowerCase(),
    cleanString(row.unidad_medida).toUpperCase(),
    cleanString(row.centro_costo).toUpperCase(),
    cleanString(row.nombre_dependencia).toLowerCase(),
    String(roundN(row.cantidad, 4)),
    String(roundN(row.precio_unitario, 4)),
    String(roundN(row.valor_soles, 2)),
  ];
  return crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

export function parseExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
}

export function resolveImportRows(body = {}) {
  if (Array.isArray(body.rows) && body.rows.length) return body.rows;
  const b64 = body.excel_base64 || body.excelBase64;
  if (typeof b64 === 'string' && b64.trim()) {
    const buf = Buffer.from(b64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    return parseExcelBuffer(buf);
  }
  return [];
}

function pickRowValue(row, keys) {
  for (const key of keys) {
    const v = row[key];
    if (v != null && cleanString(v) !== '') return v;
  }
  return null;
}

export function transformImportRow(raw, anioDeclarado, filaNumero) {
  const row = normalizeRowKeys(raw);
  const anioRaw = pickRowValue(row, ['ano', 'anio', 'año', 'ano_eje']);
  const anioEnFila = anioRaw != null && cleanString(anioRaw) !== '';
  const anioParsed = anioEnFila
    ? parseInt(String(anioRaw).replace(/\D/g, ''), 10)
    : Number(anioDeclarado);

  const tipoOrigen = normalizeTipoOrigen(pickRowValue(row, ['tipo', 'tipo_origen', 'tipo_bien']));
  const numeroOrden = cleanString(pickRowValue(row, ['nro_orden', 'numero_orden', 'nroorden', 'orden']));
  const anio = Number(anioDeclarado);

  const normalized = {
    fila: filaNumero,
    anio,
    anio_en_fila: anioEnFila,
    anio_fila: anioParsed,
    tipo_origen: tipoOrigen,
    numero_orden: numeroOrden,
    fecha_orden: normalizeDateValue(pickRowValue(row, ['fecha_orden', 'fecha'])) || null,
    mes: cleanString(pickRowValue(row, ['mes'])) || null,
    nombre_proveedor: cleanString(pickRowValue(row, ['nombre_prov', 'nombre_proveedor', 'proveedor'])) || null,
    codigo_item: cleanString(pickRowValue(row, ['item', 'codigo_item', 'cod_item'])) || null,
    nombre_item: cleanString(pickRowValue(row, ['nombre_item', 'descripcion_item'])) || null,
    unidad_medida: cleanString(pickRowValue(row, ['abreviatura', 'unidad_medida', 'unidad'])) || null,
    centro_costo: cleanString(pickRowValue(row, ['centro_costo', 'centro'])) || null,
    nombre_dependencia: cleanString(pickRowValue(row, ['nombre_depend', 'nombre_dependencia', 'dependencia'])) || null,
    cantidad: normalizeMoney(pickRowValue(row, ['cant_depend', 'cantidad']), null),
    precio_unitario: normalizeMoney(pickRowValue(row, ['prec_unit_moneda', 'precio_unitario', 'prec_unit']), null),
    valor_soles: normalizeMoney(pickRowValue(row, ['valor_soles', 'valor']), null),
  };

  normalized.ordenKey = tipoOrigen && numeroOrden
    ? buildOrdenKey(anio, tipoOrigen, numeroOrden)
    : null;

  return normalized;
}

export function validateImportRow(row) {
  const errores = [];
  if (!Number.isFinite(row.anio) || row.anio < 1990 || row.anio > 2100) {
    errores.push('Año inválido');
  }
  if (row.anio_en_fila && Number.isFinite(row.anio_fila) && row.anio_fila !== row.anio) {
    errores.push(`Año de fila (${row.anio_fila}) no coincide con año declarado (${row.anio})`);
  }
  if (!row.tipo_origen) errores.push('TIPO inválido (use B, S, BIEN, BIENES, SERVICIO o SERVICIOS)');
  if (!row.numero_orden) errores.push('nro_orden requerido');
  if (!row.codigo_item && !row.nombre_item) errores.push('ITEM o nombre_item requerido');
  if (row.cantidad == null) errores.push('cant_depend inválido');
  if (row.precio_unitario == null) errores.push('prec_unit_moneda inválido');
  if (row.valor_soles == null) errores.push('valor_soles inválido');
  return errores;
}

async function loadExistingContext(anio, client = null) {
  const q = client ? (text, params) => client.query(text, params) : query;
  const { rows: ordenRows } = await q(
    `SELECT id, anio, tipo_origen, numero_orden
     FROM compras_historicas_ordenes
     WHERE anio = $1`,
    [anio],
  );

  const ordenByKey = new Map();
  const ordenIds = [];
  for (const o of ordenRows) {
    const key = buildOrdenKey(o.anio, o.tipo_origen, o.numero_orden);
    ordenByKey.set(key, o);
    ordenIds.push(o.id);
  }

  const fingerprintCounts = new Map();
  if (ordenIds.length) {
    const { rows: itemRows } = await q(
      `SELECT i.*, o.anio, o.tipo_origen, o.numero_orden
       FROM compras_historicas_items i
       INNER JOIN compras_historicas_ordenes o ON o.id = i.orden_id
       WHERE o.anio = $1`,
      [anio],
    );
    for (const item of itemRows) {
      const fp = buildItemFingerprint({
        ordenKey: buildOrdenKey(item.anio, item.tipo_origen, item.numero_orden),
        codigo_item: item.codigo_item,
        nombre_item: item.nombre_item,
        unidad_medida: item.unidad_medida,
        centro_costo: item.centro_costo,
        nombre_dependencia: item.nombre_dependencia,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        valor_soles: item.valor_soles,
      });
      fingerprintCounts.set(fp, (fingerprintCounts.get(fp) || 0) + 1);
    }
  }

  return { ordenByKey, fingerprintCounts };
}

function buildPreviewToken(anio, archivo, rowsToInsert) {
  const canonical = JSON.stringify({
    anio: Number(anio),
    archivo: cleanString(archivo),
    rows: rowsToInsert
      .map((r) => ({ o: r.ordenKey, f: r.fingerprint }))
      .sort((a, b) => a.f.localeCompare(b.f)),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function analyzeRows(rawRows, anio, { ordenByKey, fingerprintCounts }) {
  const errores = [];
  const ordenKeysDetectadas = new Set();
  const itemsDetectados = [];
  const rowsToInsert = [];
  const batchFpCounts = new Map();
  let duplicados = 0;

  rawRows.forEach((raw, idx) => {
    const row = transformImportRow(raw, anio, idx + 1);
    const rowErrors = validateImportRow(row);
    if (rowErrors.length) {
      errores.push({ fila: row.fila, error: rowErrors.join('; ') });
      return;
    }

    ordenKeysDetectadas.add(row.ordenKey);
    row.fingerprint = buildItemFingerprint(row);
    itemsDetectados.push(row);

    const fp = row.fingerprint;
    const occurrenceInBatch = (batchFpCounts.get(fp) || 0) + 1;
    batchFpCounts.set(fp, occurrenceInBatch);
    const dbCount = fingerprintCounts.get(fp) || 0;

    if (occurrenceInBatch <= dbCount) {
      duplicados += 1;
      return;
    }

    rowsToInsert.push(row);
  });

  let ordenesNuevas = 0;
  for (const key of ordenKeysDetectadas) {
    if (!ordenByKey.has(key)) ordenesNuevas += 1;
  }

  const itemsNuevos = rowsToInsert.length;

  return {
    filas_leidas: rawRows.length,
    ordenes_detectadas: ordenKeysDetectadas.size,
    items_detectados: itemsDetectados.length,
    ordenes_nuevas: ordenesNuevas,
    items_nuevos: itemsNuevos,
    duplicados,
    errores: errores.length,
    errores_muestra: errores.slice(0, ERRORES_MUESTRA_MAX),
    rowsToInsert,
    puede_confirmar: itemsNuevos > 0,
  };
}

export async function previewComprasHistoricasImport({ anio, archivo = '', rows = [] }) {
  const anioNum = parseInt(anio, 10);
  if (!Number.isFinite(anioNum)) {
    const err = new Error('Parámetro anio requerido y numérico');
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(rows) || !rows.length) {
    const err = new Error('No se recibieron filas ni Excel para analizar');
    err.status = 400;
    throw err;
  }

  const ctx = await loadExistingContext(anioNum);
  const analysis = analyzeRows(rows, anioNum, ctx);
  const previewToken = buildPreviewToken(anioNum, archivo, analysis.rowsToInsert);

  return {
    anio: anioNum,
    archivo: cleanString(archivo) || '',
    filas_leidas: analysis.filas_leidas,
    ordenes_detectadas: analysis.ordenes_detectadas,
    items_detectados: analysis.items_detectados,
    ordenes_nuevas: analysis.ordenes_nuevas,
    items_nuevos: analysis.items_nuevos,
    duplicados: analysis.duplicados,
    errores: analysis.errores,
    errores_muestra: analysis.errores_muestra,
    preview_token: previewToken,
    puede_confirmar: analysis.puede_confirmar,
  };
}

async function recalcularMontosOrdenes(client, ordenIds) {
  if (!ordenIds.length) return;
  await client.query(`
    UPDATE compras_historicas_ordenes o
    SET monto_total = sub.total, updated_at = NOW()
    FROM (
      SELECT orden_id, ROUND(COALESCE(SUM(valor_soles), 0)::numeric, 2) AS total
      FROM compras_historicas_items
      WHERE orden_id = ANY($1::int[])
      GROUP BY orden_id
    ) sub
    WHERE o.id = sub.orden_id
  `, [ordenIds]);
}

export async function confirmarComprasHistoricasImport({
  anio,
  archivo = '',
  rows = [],
  preview_token: previewTokenIn,
  usuario = 'Sistema',
}) {
  const anioNum = parseInt(anio, 10);
  if (!Number.isFinite(anioNum)) {
    const err = new Error('Parámetro anio requerido y numérico');
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(rows) || !rows.length) {
    const err = new Error('No se recibieron filas para confirmar');
    err.status = 400;
    throw err;
  }
  if (!previewTokenIn) {
    const err = new Error('preview_token requerido');
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  const start = Date.now();
  const affectedOrdenIds = new Set();
  let ordenesNuevas = 0;
  let itemsNuevos = 0;
  let preview;

  try {
    await client.query('BEGIN');

    const ctx = await loadExistingContext(anioNum, client);
    const analysis = analyzeRows(rows, anioNum, ctx);
    preview = {
      anio: anioNum,
      archivo: cleanString(archivo) || '',
      ...analysis,
    };

    const expectedToken = buildPreviewToken(anioNum, preview.archivo, analysis.rowsToInsert);
    if (previewTokenIn !== expectedToken) {
      const err = new Error('preview_token inválido o desactualizado; ejecute preview nuevamente');
      err.status = 409;
      throw err;
    }
    if (!analysis.puede_confirmar) {
      const err = new Error('No hay ítems nuevos para importar');
      err.status = 409;
      throw err;
    }

    const { rows: existingOrdenes } = await client.query(
      `SELECT id, anio, tipo_origen, numero_orden
       FROM compras_historicas_ordenes
       WHERE anio = $1`,
      [preview.anio],
    );
    const ordenByKey = new Map(
      existingOrdenes.map((o) => [buildOrdenKey(o.anio, o.tipo_origen, o.numero_orden), o]),
    );

    for (const row of analysis.rowsToInsert) {
      let orden = ordenByKey.get(row.ordenKey);
      if (!orden) {
        const ins = await client.query(`
          INSERT INTO compras_historicas_ordenes (
            anio, tipo_origen, numero_orden, fecha_orden, mes, nombre_proveedor, ruc, monto_total
          ) VALUES ($1,$2,$3,$4,$5,$6,NULL,0)
          RETURNING id, anio, tipo_origen, numero_orden
        `, [
          row.anio,
          row.tipo_origen,
          row.numero_orden,
          row.fecha_orden,
          row.mes,
          row.nombre_proveedor,
        ]);
        orden = ins.rows[0];
        ordenByKey.set(row.ordenKey, orden);
        ordenesNuevas += 1;
      } else {
        await client.query(`
          UPDATE compras_historicas_ordenes
          SET fecha_orden = COALESCE($2, fecha_orden),
              mes = COALESCE($3, mes),
              nombre_proveedor = COALESCE($4, nombre_proveedor),
              updated_at = NOW()
          WHERE id = $1
        `, [orden.id, row.fecha_orden, row.mes, row.nombre_proveedor]);
      }

      await client.query(`
        INSERT INTO compras_historicas_items (
          orden_id, codigo_item, nombre_item, unidad_medida, centro_costo,
          nombre_dependencia, cantidad, precio_unitario, valor_soles
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        orden.id,
        row.codigo_item,
        row.nombre_item,
        row.unidad_medida,
        row.centro_costo,
        row.nombre_dependencia,
        roundN(row.cantidad, 4),
        roundN(row.precio_unitario, 4),
        roundN(row.valor_soles, 2),
      ]);

      affectedOrdenIds.add(orden.id);
      itemsNuevos += 1;
    }

    await recalcularMontosOrdenes(client, [...affectedOrdenIds]);

    const { rows: impRows } = await client.query(`
      INSERT INTO compras_historicas_importaciones (
        anio, archivo, fecha_importacion, usuario,
        filas_leidas, ordenes_nuevas, items_nuevos, duplicados, errores, estado
      ) VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,$8,'CONFIRMADO')
      RETURNING id, created_at
    `, [
      preview.anio,
      preview.archivo,
      usuario,
      preview.filas_leidas,
      ordenesNuevas,
      itemsNuevos,
      preview.duplicados,
      preview.errores,
    ]);

    await client.query('COMMIT');

    return {
      ok: true,
      importacion_id: impRows[0].id,
      anio: preview.anio,
      archivo: preview.archivo,
      filas_leidas: preview.filas_leidas,
      ordenes_detectadas: preview.ordenes_detectadas,
      items_detectados: preview.items_detectados,
      ordenes_nuevas: ordenesNuevas,
      items_nuevos: itemsNuevos,
      duplicados: preview.duplicados,
      errores: preview.errores,
      errores_muestra: preview.errores_muestra,
      duracion_ms: Date.now() - start,
      created_at: impRows[0].created_at,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}
