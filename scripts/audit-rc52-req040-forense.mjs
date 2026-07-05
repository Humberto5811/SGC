/**
 * RC5.2 — Auditoría forense REQ-040 (solo lectura, sin modificar motor).
 * Ejecutar desde raíz SGC: node scripts/audit-rc52-req040-forense.mjs
 */
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, 'server', '.env') });

import {
  getListaObservaciones,
  getObservacionesAbiertas,
  getPendientesModulo,
  countPendientesModulo,
  formatEtiquetaJerarquica,
  getObservacionPadreId,
  getHijosDirectos,
  migrateObservacion,
  isObservacionAbierta,
  receptorDebeActuar,
  emisorDebeRevisar,
  tieneDescendientesAbiertos,
  bloqueaSubsanacionPorHijos,
  getModuloEmisor,
  getModuloReceptor,
  normalizeModuloKey,
  ESTADOS_OBS,
} from '../shared/observacionesMotor.js';

const MODULOS = {
  registro: 'Registro de Requerimiento',
  eval: 'Evaluación de Requerimiento',
  dec: 'DEC',
  prog: 'Programación',
  cm: 'Coordinación CM',
  inv: 'Invitaciones',
};

const { Pool } = pg;
const dbs = [...new Set([process.env.DB_NAME, 'sgc', 'sgc_db'].filter(Boolean))];
let row = null;
let usedDb = null;
let lastErr = null;

for (const db of dbs) {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: db,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });
  try {
    const res = await pool.query(
      "SELECT id, codigo, estado, payload FROM requerimientos WHERE codigo ILIKE '%040%' OR codigo ILIKE 'REQ-040' OR id = 40 ORDER BY id DESC LIMIT 5",
    );
    await pool.end();
    if (res.rows.length) {
      row = res.rows.find((r) => /040/.test(String(r.codigo || ''))) || res.rows[0];
      usedDb = db;
      break;
    }
  } catch (e) {
    lastErr = e.message;
    await pool.end().catch(() => {});
  }
}

if (!row) {
  console.error('ERROR: No se pudo obtener REQ-040. Último error:', lastErr);
  process.exit(1);
}

const input = { payload: typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload || {}) };
const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {});
const hilos = getListaObservaciones(input);
const modEval = MODULOS.eval;
const modEvalKey = normalizeModuloKey(modEval);
const pendientesEval = getPendientesModulo(input, modEval);
const pendientesEvalIds = new Set(pendientesEval.map((p) => String(p.id)));

console.log('══════════════════════════════════════════════════════════');
console.log('RC5.2 AUDITORÍA FORENSE — REQ-040 REAL');
console.log('══════════════════════════════════════════════════════════');
console.log('DB:', usedDb, '| id:', row.id, '| codigo:', row.codigo, '| estado:', row.estado);
console.log('\n── PASO 1: payload.observaciones (sin modificar) ──\n');
console.log(JSON.stringify(payload.observaciones ?? [], null, 2));

console.log('\n── PASO 2-3: getPendientesModulo(Evaluación de Requerimiento) ──\n');
console.log('RESULTADO count:', pendientesEval.length);
console.log('ARRAY COMPLETO:');
console.log(JSON.stringify(pendientesEval, null, 2));

const abiertas = getObservacionesAbiertas(input);
const cerradas = hilos.length - abiertas.length;
const tabla = [];

hilos.forEach((o, idx) => {
  const raw = payload.observaciones?.find((x) => String(x.id) === String(o.id)) || payload.observaciones?.[idx] || o;
  const m = migrateObservacion({ ...o });
  const padreId = getObservacionPadreId(m);
  const hijos = getHijosDirectos(hilos, m.id);
  const cuenta = pendientesEvalIds.has(String(m.id));
  const emisorKey = getModuloEmisor(m);
  const receptorKey = getModuloReceptor(m);
  const abierta = isObservacionAbierta(m);
  const recAct = receptorDebeActuar(m);
  const emiRev = emisorDebeRevisar(m);
  const descAb = abierta ? tieneDescendientesAbiertos(hilos, m.id) : false;
  const bloqH = bloqueaSubsanacionPorHijos(hilos, m.id);

  let motivo = 'No cuenta para Evaluación.';
  if (cuenta) {
    const p = pendientesEval.find((x) => String(x.id) === String(m.id));
    if (p?.rol === 'receptor') {
      motivo = `Cuenta porque: receptor=EVALUACION, receptorDebeActuar=true, bloqueaSubsanacionPorHijos=false. estado=${m.estado}, cerrada=${m.cerrada}`;
    } else if (p?.rol === 'emisor') {
      motivo = `Cuenta porque: emisor=EVALUACION, emisorDebeRevisar=true, tieneDescendientesAbiertos=false. estado=${m.estado}, cerrada=${m.cerrada}`;
    } else {
      motivo = 'Cuenta: incluida en getPendientesModulo(Eval)';
    }
  } else if (!abierta) {
    motivo = 'No cuenta: isObservacionAbierta=false (cerrada o estado CERRADA).';
  } else if (emisorKey !== modEvalKey && receptorKey !== modEvalKey) {
    motivo = `No cuenta: ni emisor ni receptor es Evaluación (emisor=${emisorKey}, receptor=${receptorKey}).`;
  } else if (receptorKey === modEvalKey && !recAct) {
    motivo = 'No cuenta: receptor Eval pero receptorDebeActuar=false (ya subsanada o estado no pendiente receptor).';
  } else if (emisorKey === modEvalKey && !emiRev) {
    motivo = 'No cuenta: emisor Eval pero emisorDebeRevisar=false.';
  } else if (receptorKey === modEvalKey && bloqH) {
    motivo = 'No cuenta: receptor Eval bloqueadaPorHijos.';
  } else if (emisorKey === modEvalKey && descAb) {
    motivo = 'No cuenta: emisor Eval con descendientes abiertos.';
  }

  const block = {
    ID: m.id,
    etiqueta_jerarquica: formatEtiquetaJerarquica(m, hilos),
    estado_original: raw.estado ?? null,
    estado_normalizado: m.estado,
    origen: m.origen_submodulo || m.moduloEmisor || null,
    destino: m.destino_submodulo || m.moduloReceptor || null,
    cerrada: m.cerrada === true,
    subsanacion: !!(m.subsanacion || raw.subsanacion),
    respuesta: !!(m.respuesta || raw.respuesta),
    observacion_padre_id: padreId,
    cantidad_hijos: hijos.length,
    receptorDebeActuar: recAct,
    emisorDebeRevisar: emiRev,
    tieneDescendientesAbiertos: descAb,
    bloqueaSubsanacionPorHijos: bloqH,
    isObservacionAbierta: abierta,
    cuenta_para_evaluacion: cuenta ? 'SI' : 'NO',
    motivo,
  };

  console.log('----------------------------------------');
  console.log(JSON.stringify(block, null, 2));
  tabla.push({ observacion: `${block.etiqueta_jerarquica} (${m.id})`, cuenta: cuenta ? 'SI' : 'NO', motivo });
});

console.log('\n── PASO 4: Tabla resumen ──\n');
console.log('| Observación | Cuenta | Motivo exacto |');
tabla.forEach((t) => {
  console.log(`| ${t.observacion} | ${t.cuenta} | ${t.motivo} |`);
});

console.log('\n── PASO 5: Totales ──\n');
console.log('TOTAL observaciones:', hilos.length);
console.log('TOTAL abiertas:', abiertas.length);
console.log('TOTAL cerradas:', cerradas);
console.log('Pendientes Registro:', countPendientesModulo(input, MODULOS.registro));
console.log('Pendientes Evaluación:', countPendientesModulo(input, MODULOS.eval));
console.log('Pendientes DEC:', countPendientesModulo(input, MODULOS.dec));
console.log('Pendientes Programación:', countPendientesModulo(input, MODULOS.prog));
console.log('Pendientes CM:', countPendientesModulo(input, MODULOS.cm));
console.log('Pendientes Invitaciones:', countPendientesModulo(input, MODULOS.inv));
console.log('payload.observaciones.length:', (payload.observaciones || []).length);

const countEval = countPendientesModulo(input, MODULOS.eval);
console.log('\n── PASO 6: Conclusión ──\n');
if (countEval > 0) {
  console.log('A) El Motor está correcto. Pendientes Evaluación =', countEval);
  pendientesEval.forEach((p) => {
    const m = migrateObservacion(p);
    console.log(`- ${p.id} | rol=${p.rol} | estado=${m.estado} | cerrada=${m.cerrada}`);
  });
} else {
  console.log('A/B) Motor devuelve 0 pendientes Evaluación con payload actual.');
  console.log('Si UI muestra 4, la discrepancia no está en getPendientesModulo sobre este payload.');
}
