// Matriz de seguimiento de pedidos SIGAMEF (Programación)
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

function tipoLabel(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t === 'servicios') return 'SERVICIO';
  if (t === 'locacion') return 'LOCACIÓN';
  return 'BIEN';
}

function pedidoLabel(ped) {
  const pref = String(ped.tipo || 'PB').slice(0, 2).toUpperCase();
  return ped.nro_pedido ? `${pref}-${ped.nro_pedido}` : String(ped.codigo_pedido || '');
}

export async function buildMatrizSeguimientoPedidos() {
  const { rows } = await query(`
    SELECT
      rp.id AS asociacion_id,
      rp.fecha_registro AS fecha_asociacion,
      p.id AS pedido_id,
      p.codigo_pedido, p.ano_eje, p.tipo AS pedido_tipo, p.nro_pedido,
      p.centro, p.descripcion AS pedido_descripcion, p.cant_solicitada,
      p.precio_unitario, p.total_item, p.codigo_sigamef, p.sec_func, p.especifica,
      p.fecha_pedido,
      r.id AS requerimiento_id, r.tipo AS req_tipo, r.codigo AS requerimiento_codigo,
      r.cmn, r.denominacion, r.area, r.responsable, r.estado, r.payload,
      r.created_at, r.updated_at,
      COALESCE(c.nombre, c.codigo, a.responsable, p.centro, '') AS centro_nombre,
      pp.id AS paquete_id,
      pp.codigo_paquete,
      ${TRAZA_EXTRA_SELECT}
    FROM requerimiento_pedidos rp
    JOIN pedidos_sigamef p ON rp.pedido_sigamef_id = p.id
    JOIN requerimientos r ON rp.requerimiento_id = r.id
    LEFT JOIN areas a ON r.area = a.nombre
    LEFT JOIN centros c ON a.centro_id = c.id
    LEFT JOIN paquete_requerimientos pr ON pr.requerimiento_id = r.id
    LEFT JOIN paquetes_programacion pp ON pp.id = pr.paquete_id
    ORDER BY p.nro_pedido ASC NULLS LAST, r.codigo ASC NULLS LAST, p.id ASC
  `);

  const filas = [];
  let montoConsolidado = 0;
  let conPaquete = 0;
  let sinPaquete = 0;
  let observados = 0;
  let retrasados = 0;

  rows.forEach((row) => {
    const enriched = enrichRequerimientoRow(row);
    const estadoNeg = resolveEstadoNegocioFromRow(enriched);
    const ubic = resolveUbicacionExpediente(enriched);
    const estadoTexto = /^En /i.test(estadoNeg) ? estadoNeg : getEstadoActualTexto(ubic);
    const dias = enriched.dias_en_estado ?? calcDiasEnEstado(enriched.fecha_estado_actual);
    const observado = isEstadoObservado(enriched);
    const retrasado = dias > 10;

    if (row.paquete_id) conPaquete += 1;
    else sinPaquete += 1;
    if (observado) observados += 1;
    if (retrasado) retrasados += 1;
    montoConsolidado += Number(row.total_item || 0);

    let area = row.area || '';
    if (!area) {
      try {
        const pl = JSON.parse(row.payload || '{}');
        area = pl.area?.nombre || pl.area_usuaria || '';
      } catch (_) {}
    }

    filas.push({
      pedido_id: row.pedido_id,
      asociacion_id: row.asociacion_id,
      pedido: pedidoLabel(row),
      nro_pedido: row.nro_pedido,
      requerimiento_id: row.requerimiento_id,
      requerimiento_codigo: row.requerimiento_codigo,
      paquete_id: row.paquete_id || null,
      codigo_paquete: row.codigo_paquete || null,
      tipo: tipoLabel(row.req_tipo),
      codigo_sigamef: row.codigo_sigamef || '',
      descripcion: row.pedido_descripcion || row.denominacion || '',
      cantidad: Number(row.cant_solicitada || 0),
      monto_total: Number(Number(row.total_item || 0).toFixed(2)),
      centro: row.centro || row.centro_nombre || '',
      area_usuaria: area,
      estado: estadoNeg,
      estado_actual: ubic,
      estado_actual_texto: estadoTexto,
      responsable: enriched.responsable_actual || row.responsable || '—',
      sub_modulo: enriched.sub_modulo_actual || '',
      meta: row.sec_func || '',
      clasificador: row.especifica || '',
      fecha_pedido: row.fecha_pedido || '',
      fecha_asociacion: row.fecha_asociacion,
      fecha_estado_actual: enriched.fecha_estado_actual,
      dias_en_estado: dias,
      observado,
      retrasado,
      requerimiento: {
        id: row.requerimiento_id,
        codigo: row.requerimiento_codigo,
        tipo: row.req_tipo,
        estado: estadoNeg,
        area: row.area,
        denominacion: row.denominacion,
        payload: row.payload,
        responsable: row.responsable,
        estado_actual: ubic,
        sub_modulo_actual: enriched.sub_modulo_actual,
        responsable_actual: enriched.responsable_actual,
        fecha_estado_actual: enriched.fecha_estado_actual,
        historial_estados: enriched.historial_estados,
      },
    });
  });

  return {
    filas,
    indicadores: {
      total_pedidos: filas.length,
      pedidos_con_paquete: conPaquete,
      pedidos_sin_paquete: sinPaquete,
      observados,
      retrasados,
      monto_consolidado: Number(montoConsolidado.toFixed(2)),
    },
  };
}
