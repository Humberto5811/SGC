/** Diagnóstico READ-ONLY SC-00002 / REQ-00002 — no modifica datos. */
import { query } from '../server/db.js';
import { formatDateTimeLima } from '../src/utils/dateTimeLima.js';
import { buildEstadoRecepcionContract } from '../shared/estadoRecepcionCotizaciones.js';

const { rows: reqs } = await query(`
  SELECT id, codigo, estado, estado_actual, responsable_actual, sub_modulo_actual
  FROM requerimientos WHERE codigo = 'REQ-00002'
`);
const { rows: scs } = await query(`
  SELECT id, codigo, estado FROM solicitudes_cotizacion WHERE codigo ILIKE 'SC-00002%'
`);
console.log('REQ-00002:', reqs[0] || null);
console.log('SC:', scs[0] || null);
if (scs[0]) {
  const { rows: cots } = await query(`
    SELECT cot.id, cot.estado, cot.validacion_estado, cot.fecha_presentacion, cot.created_at,
           p.razon_social
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    WHERE cot.solicitud_id = $1
  `, [scs[0].id]);
  console.log('COTIZACIONES:', cots);
  for (const c of cots) {
    const contract = buildEstadoRecepcionContract({ cotizacion: c, cotizaciones: cots });
    console.log('contrato', c.razon_social, contract);
    console.log('fecha Lima', formatDateTimeLima(c.fecha_presentacion));
  }
}
process.exit(0);
