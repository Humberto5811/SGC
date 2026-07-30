/**
 * Diagnóstico no destructivo — Registro de Órdenes / cronograma (OD40).
 * No modifica datos. Uso: node scripts/diag-rc108-ordenes-cronograma.mjs
 */
import { query } from '../server/db.js';
import pool from '../server/db.js';
import {
  resolveOrdenFechaNotificacion,
  resolveOrdenCronogramaContractual,
  normalizeCondicionInicio,
  labelCondicionInicio,
  resolveItemPedidoSigamef,
  resolveAreaUsuaria,
} from '../shared/ordenCronogramaContractual.js';

const issues = [];
const note = (sev, msg, extra = {}) => {
  issues.push({ sev, msg, ...extra });
  console.log(`[${sev}] ${msg}`, Object.keys(extra).length ? JSON.stringify(extra) : '');
};

const { rows: ordenes } = await query(`
  SELECT id, numero_orden, tipo_orden, fecha_orden, enviado_proveedor_at, condicion_inicio,
    regla_inicio_plazo, fecha_efectiva_inicio, requerimiento_id, solicitud_cotizacion_id
  FROM ordenes_contratacion
  WHERE estado IS DISTINCT FROM 'ORDEN_ANULADA'
  ORDER BY id DESC
  LIMIT 200
`);

for (const oc of ordenes) {
  const { rows: envios } = await query(`
    SELECT id, enviado_at, estado, intento FROM orden_envios_proveedor WHERE orden_id=$1 ORDER BY id
  `, [oc.id]);
  const notif = resolveOrdenFechaNotificacion(oc, envios);
  if (oc.enviado_proveedor_at && notif.fechaNotificacion) {
    const bandejaLike = String(oc.enviado_proveedor_at).slice(0, 10);
    // Compare ISO days carefully via resolver
    if (notif.fechaNotificacion !== String(oc.enviado_proveedor_at).slice(0, 10)
      && notif.fuente === 'orden_envios_proveedor.primer_exitoso') {
      note('INFO', `Notificación: primer exitoso ≠ enviado_proveedor_at`, {
        orden: oc.numero_orden, canon: notif.fechaNotificacion, enviado: bandejaLike,
      });
    }
  }

  const cond = normalizeCondicionInicio(oc.condicion_inicio || oc.regla_inicio_plazo);
  if (!cond && (oc.condicion_inicio || oc.regla_inicio_plazo)) {
    note('WARN', 'Condición de inicio desconocida', {
      orden: oc.numero_orden, raw: oc.condicion_inicio || oc.regla_inicio_plazo,
    });
  }
  if (/INICIO_PLAZO_ENVIO/i.test(String(oc.regla_inicio_plazo || '')) && oc.condicion_inicio === 'EMISION_ORDEN') {
    note('INFO', 'regla_inicio_plazo legacy vs condicion_inicio EMISION_ORDEN (UI debe usar condicion)', {
      orden: oc.numero_orden,
    });
  }

  const { rows: ents } = await query(`
    SELECT * FROM orden_entregas WHERE orden_id=$1 AND estado<>'ANULADO' ORDER BY numero_entrega
  `, [oc.id]);
  for (const e of ents) {
    if (!e.etiqueta_entrega) note('WARN', 'Entrega sin etiqueta', { orden: oc.numero_orden, entrega_id: e.id });
    const cron = resolveOrdenCronogramaContractual(oc, e, { envios, totalEntregas: ents.length });
    if (cron.pendiente) {
      note('WARN', 'Fecha efectiva pendiente', {
        orden: oc.numero_orden, entrega_id: e.id, motivo: cron.pendienteMotivo, cond: labelCondicionInicio(cron.condicionInicio),
      });
    }
    if (cron.fechaMaxima && e.fecha_maxima) {
      const stored = String(e.fecha_maxima).slice(0, 10);
      if (stored !== cron.fechaMaxima) {
        note('WARN', 'fecha_maxima almacenada ≠ recalculada', {
          orden: oc.numero_orden, stored, calc: cron.fechaMaxima, cond: cron.condicionInicio,
        });
      }
    }
    const { rows: lines } = await query(`SELECT COUNT(*)::int AS n FROM orden_entrega_items WHERE orden_entrega_id=$1`, [e.id]);
    if (!(lines[0]?.n > 0)) note('WARN', 'Entrega sin ítems vinculados', { orden: oc.numero_orden, entrega_id: e.id });
  }

  const { rows: items } = await query(`SELECT * FROM orden_items WHERE orden_id=$1`, [oc.id]);
  const { rows: pedidos } = await query(`
    SELECT p.* FROM requerimiento_pedidos rp
    JOIN pedidos_sigamef p ON p.id = rp.pedido_sigamef_id
    WHERE rp.requerimiento_id=$1
  `, [oc.requerimiento_id]).catch(() => ({ rows: [] }));

  items.forEach((it, idx) => {
    const ped = resolveItemPedidoSigamef(it, pedidos, idx);
    if (!ped.codigo_sigamef) note('WARN', 'Ítem sin código SIGAMEF resoluble', { orden: oc.numero_orden, item: it.id });
  });

  const { rows: req } = await query(`SELECT area FROM requerimientos WHERE id=$1`, [oc.requerimiento_id]).catch(() => ({ rows: [] }));
  const au = resolveAreaUsuaria({
    requerimientoArea: req[0]?.area || '',
    centroCosto: pedidos[0]?.centro_costo || '',
    centro: pedidos[0]?.centro || '',
  });
  if (au && /^CNSP$/i.test(au)) note('WARN', 'Área Usuaria resolvió a CNSP', { orden: oc.numero_orden });
  if (!au) note('INFO', 'Área Usuaria vacía', { orden: oc.numero_orden });
}

console.log(`\nDiagnóstico: ${issues.length} hallazgos (${issues.filter((i) => i.sev === 'WARN').length} WARN)\n`);
await pool.end();
