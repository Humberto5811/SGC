// Matriz de consolidación de paquetes de programación
import { query } from '../db.js';
import {
  enrichRequerimientoRow,
  TRAZA_EXTRA_SELECT,
  resolveEstadoNegocioFromRow,
  resolveUbicacionExpediente,
  getEstadoActualTexto,
  isEstadoObservado,
  calcDiasEnEstado,
} from './trazabilidad.js';

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw || '{}'); } catch (_) { return {}; }
}

function tipoLabel(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t === 'servicios') return 'SERVICIO';
  if (t === 'locacion') return 'LOCACIÓN';
  return 'BIEN';
}

function pedidoLabel(ped) {
  if (!ped) return '';
  const pref = String(ped.tipo || 'PB').slice(0, 2).toUpperCase();
  return ped.nro_pedido ? `${pref}-${ped.nro_pedido}` : String(ped.codigo_pedido || ped.nro_pedido || '');
}

function itemFromReq(req, ped) {
  const pl = parsePayload(req.payload);
  const items = req.tipo === 'servicios' ? (pl.servicioItems || [])
    : req.tipo === 'locacion' ? (pl.locadorItems || []) : (pl.items || []);
  if (!items.length) return null;
  if (ped?.codigo_sigamef) {
    return items.find((it) => String(it.item_bien || it.codigo_sigamef || '') === String(ped.codigo_sigamef))
      || items[0];
  }
  return items[0];
}

function buildFilaPaquete(paquete, req, ped, enriched) {
  const item = itemFromReq(req, ped);
  const estadoNeg = resolveEstadoNegocioFromRow(enriched);
  const ubic = resolveUbicacionExpediente(enriched);
  const estadoTexto = /^En /i.test(estadoNeg) ? estadoNeg : getEstadoActualTexto(ubic);
  const dias = enriched.dias_en_estado ?? calcDiasEnEstado(enriched.fecha_estado_actual);
  const monto = ped ? Number(ped.total_item || 0) : 0;
  const cantidad = ped ? Number(ped.cant_solicitada || 0) : 0;
  let area = req.area || ped?.area_usuaria || '';
  if (!area) {
    const pl = parsePayload(req.payload);
    area = pl.area?.nombre || pl.area_usuaria || '';
  }

  return {
    paquete_id: paquete.id,
    codigo_paquete: paquete.codigo_paquete,
    paquete_estado: paquete.estado,
    paquete_fecha: paquete.fecha_creacion,
    paquete_usuario: paquete.usuario_creacion,
    requerimiento_id: req.id,
    requerimiento_codigo: req.codigo,
    pedido_id: ped?.id || null,
    pedido: pedidoLabel(ped),
    tipo: tipoLabel(req.tipo),
    codigo_sigamef: ped?.codigo_sigamef || item?.item_bien || item?.codigo_sigamef || '',
    descripcion: ped?.descripcion || item?.nombre_item || req.denominacion || '',
    cantidad,
    monto_total: Number(monto.toFixed(2)),
    centro: ped?.centro || enriched.centro_nombre || req.centro_nombre || '',
    area_usuaria: area,
    estado: estadoNeg,
    estado_actual: ubic,
    estado_actual_texto: estadoTexto,
    responsable: enriched.responsable_actual || req.responsable || '—',
    sub_modulo: enriched.sub_modulo_actual || '',
    meta: ped?.sec_func || '',
    clasificador: ped?.especifica || '',
    fecha_estado_actual: enriched.fecha_estado_actual,
    dias_en_estado: dias,
    retrasado: dias > 10,
    observado: isEstadoObservado(enriched),
  };
}

export async function buildMatrizConsolidacionPaquetes() {
  const { rows: paquetes } = await query(`
    SELECT pp.*
    FROM paquetes_programacion pp
    ORDER BY pp.created_at DESC NULLS LAST, pp.id DESC
  `);

  const resultado = [];
  let totalRequerimientos = 0;
  let totalPedidos = 0;
  let montoConsolidado = 0;
  let observados = 0;
  let retrasados = 0;
  const reqIdsVistos = new Set();

  for (const paquete of paquetes) {
    const { rows: reqs } = await query(`
      SELECT
        r.id, r.tipo, r.codigo, r.cmn, r.denominacion, r.area, r.responsable, r.estado,
        r.payload, r.created_at, r.updated_at,
        COALESCE(c.nombre, c.codigo, a.responsable, '') AS centro_nombre,
        ${TRAZA_EXTRA_SELECT}
      FROM paquete_requerimientos pr
      JOIN requerimientos r ON pr.requerimiento_id = r.id
      LEFT JOIN areas a ON r.area = a.nombre
      LEFT JOIN centros c ON a.centro_id = c.id
      WHERE pr.paquete_id = $1
      ORDER BY r.codigo ASC NULLS LAST, r.id ASC
    `, [paquete.id]);

    const reqIds = reqs.map((r) => r.id);
    let pedidos = [];
    if (reqIds.length) {
      const { rows: peds } = await query(`
        SELECT p.id, p.ano_eje, p.tipo, p.nro_pedido, p.codigo_pedido, p.centro, p.descripcion,
               p.cant_solicitada, p.precio_unitario, p.total_item,
               p.codigo_sigamef, p.sec_func, p.especifica, p.unidad_medida,
               rp.requerimiento_id,
               COALESCE(NULLIF(TRIM(r.area), ''), a.nombre, '') AS area_usuaria
        FROM requerimiento_pedidos rp
        JOIN pedidos_sigamef p ON rp.pedido_sigamef_id = p.id
        JOIN requerimientos r ON rp.requerimiento_id = r.id
        LEFT JOIN areas a ON a.nombre = r.area OR a.codigo = r.area
        WHERE rp.requerimiento_id = ANY($1)
        ORDER BY r.codigo ASC, p.nro_pedido ASC
      `, [reqIds]);
      pedidos = peds;
    }

    const filas = [];
    let montoPaquete = 0;
    const pedidosPaquete = new Set();

    for (const req of reqs) {
      const enriched = enrichRequerimientoRow(req);
      const pedsReq = pedidos.filter((p) => p.requerimiento_id === req.id);
      if (!reqIdsVistos.has(req.id)) {
        reqIdsVistos.add(req.id);
        totalRequerimientos += 1;
        if (isEstadoObservado(enriched)) observados += 1;
        if (enriched.retrasado || (enriched.dias_en_estado > 10)) retrasados += 1;
      }

      if (pedsReq.length) {
        pedsReq.forEach((ped) => {
          filas.push(buildFilaPaquete(paquete, req, ped, enriched));
          montoPaquete += Number(ped.total_item || 0);
          pedidosPaquete.add(ped.id);
        });
      } else {
        filas.push(buildFilaPaquete(paquete, req, null, enriched));
      }
    }

    totalPedidos += pedidosPaquete.size;
    montoConsolidado += montoPaquete;

    resultado.push({
      paquete: {
        id: paquete.id,
        codigo_paquete: paquete.codigo_paquete,
        estado: paquete.estado,
        fecha_creacion: paquete.fecha_creacion,
        usuario_creacion: paquete.usuario_creacion,
        usuario_aprobacion: paquete.usuario_aprobacion,
        fecha_aprobacion: paquete.fecha_aprobacion,
      },
      resumen: {
        cant_requerimientos: reqs.length,
        cant_pedidos: pedidosPaquete.size,
        monto_total: Number(montoPaquete.toFixed(2)),
      },
      filas,
    });
  }

  return {
    paquetes: resultado,
    indicadores: {
      total_paquetes: paquetes.length,
      total_requerimientos: totalRequerimientos,
      total_pedidos: totalPedidos,
      monto_consolidado: Number(montoConsolidado.toFixed(2)),
      observados,
      retrasados,
    },
  };
}
