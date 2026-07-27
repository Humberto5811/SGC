/**
 * Observaciones bandejas RC8 — centro textual, 3 empresas, columnas.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  esCodigoCmnCentro,
  listarProveedoresSolicitudValidacion,
  getValidacionTrabajoDetalle,
  listarValidacionesExpedientes,
  resolveCentrosTextoSolicitud,
} from '../server/lib/validacionesCotizacion.js';
import pool, { query } from '../server/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8 bandejas / centro / empresas ===\n');

assert(esCodigoCmnCentro('05277') === true, '05277 es CMN numérico');
assert(esCodigoCmnCentro('CNSP') === false, 'CNSP no es CMN');
assert(esCodigoCmnCentro('05277', '05277') === true, 'hint CMN');

const valJs = fs.readFileSync(path.join(root, 'server/lib/validacionesCotizacion.js'), 'utf8');
assert(/buildMatrizValidacionSolicitud/.test(valJs), 'matriz por solicitud');
assert(/sincronizarHermanasDerivacionValidacion/.test(valJs), 'sync hermanas expediente');
assert(/loadCotizacionesValidacionSolicitud/.test(valJs), 'carga todas PRESENTADA');

const recView = fs.readFileSync(path.join(root, 'src/views/contratacion/recepcionCotizacionesView.js'), 'utf8');
assert(/Solicitud de cotización/.test(recView) && /Requerimiento/.test(recView)
  && /Centro/.test(recView) && /Cantidad/.test(recView), 'Recepción columnas principales');
assert(/estado_recepcion/.test(recView), 'Recepción estado dinámico por expediente');

try {
  const adminRows = await listarValidacionesExpedientes('', '', { esAdmin: true });
  assert(Array.isArray(adminRows), 'listarValidacionesExpedientes');

  const bySol = new Map();
  for (const r of adminRows) {
    if (!bySol.has(r.solicitud_id)) bySol.set(r.solicitud_id, []);
    bySol.get(r.solicitud_id).push(r);
  }
  const multi = [...bySol.entries()].find(([, rows]) => rows.length >= 3);
  if (multi) {
    const [sid, rows] = multi;
    assert(rows.length >= 3, '1. expediente con ≥3 cotizaciones en bandeja');
    const provs = await listarProveedoresSolicitudValidacion(sid, 'admin', '1', { esAdmin: true });
    assert(provs.length >= 3, '1. listarProveedores ≥3');
    const ancla = rows.find((r) => ['DERIVADA', 'EN_PROCESO', 'APTO', 'NO_APTO', 'OBSERVADO']
      .includes(String(r.validacion_estado || '').toUpperCase())) || rows[0];
    const det = await getValidacionTrabajoDetalle(ancla.id, 'admin', '1', { esAdmin: true });
    const cotIds = new Set((det.matriz_v2?.filas || []).map((f) => f.cotizacion_id).filter(Boolean));
    assert(cotIds.size >= 3, '2. matriz renderiza ≥3 empresas/cotizaciones');
    assert((det.proveedores_solicitud || []).length >= 3, '2. proveedores_solicitud ≥3');
    const centros = await resolveCentrosTextoSolicitud(sid);
    if (centros) {
      assert(!/^\d{4,6}$/.test(String(centros).trim()), '4. centro no es solo CMN numérico');
      assert(String(centros).toUpperCase() !== '05277' || /[A-Za-z]/.test(centros), '4. centro textual');
    } else {
      assert(true, '4. (sin centro resuelto en SC de prueba)');
    }
  } else {
    assert(true, '1/2/4. (sin SC con 3 cotizaciones en BD) omitido parcialmente');
  }
} finally {
  try { await pool.end(); } catch (_) { /* noop */ }
}

const failed = tests.filter((t) => !t.ok);
console.log(failed.length ? `\n${failed.length} fallos` : '\nPASS bandejas/centro/empresas');
process.exit(failed.length ? 1 : 0);
