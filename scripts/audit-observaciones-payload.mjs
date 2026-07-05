/**
 * Auditoría de payload.observaciones — sin modificar motor ni UI.
 * Ejecutar:
 *   node scripts/audit-observaciones-payload.mjs --codigo 051
 *   node scripts/audit-observaciones-payload.mjs --id 51
 *   node scripts/audit-observaciones-payload.mjs --payload ./mi-payload.json
 */
import fs from 'fs';
import pg from 'pg';
import {
  ESTADOS_OBS,
  getListaObservaciones,
  getObservacionesAbiertas,
  getObservacionPadreId,
  formatEtiquetaJerarquica,
  migrateObservacion,
  isObservacionAbierta,
  receptorDebeActuar,
  emisorDebeRevisar,
  getModuloEmisor,
  getModuloReceptor,
  normalizeModuloKey,
  bloqueaSubsanacionPorHijos,
  tieneDescendientesAbiertos,
  countPendientesModulo,
  getPendientesModulo,
} from '../shared/observacionesMotor.js';

const { Pool } = pg;

const MODULOS = Object.freeze({
  registro: 'Registro de Requerimiento',
  eval: 'Evaluación de Requerimiento',
  dec: 'DEC',
  prog: 'Programación',
  cm: 'Coordinación CM',
  inv: 'Invitaciones',
});

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { codigo: '051', id: null, payloadPath: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--codigo') out.codigo = args[++i];
    else if (args[i] === '--id') out.id = Number(args[++i]);
    else if (args[i] === '--payload') out.payloadPath = args[++i];
  }
  return out;
}

async function fetchRowFromDb({ codigo, id }) {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'sgc_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });
  try {
    if (id) {
      const res = await pool.query(
        'SELECT id, codigo, estado, payload FROM requerimientos WHERE id = $1',
        [id],
      );
      return res.rows[0] || null;
    }
    const res = await pool.query(
      `SELECT id, codigo, estado, payload FROM requerimientos
       WHERE codigo ILIKE $1 OR codigo ILIKE $2 OR id::text = $3
       ORDER BY id DESC LIMIT 1`,
      [`%${codigo}%`, `REQ-${codigo}`, codigo],
    );
    return res.rows[0] || null;
  } finally {
    await pool.end();
  }
}

function loadRowFromPayloadFile(path) {
  const raw = fs.readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  if (data.payload) return data;
  return { id: data.id || 51, codigo: data.codigo || 'REQ-051', payload: data };
}

function auditObservacion(o, hilos, modEvalKey, pendientesEvalIds) {
  const m = migrateObservacion({ ...o });
  const padreId = getObservacionPadreId(m);
  const abierta = isObservacionAbierta(m);
  const reqSub = receptorDebeActuar(m);
  const reqCierre = emisorDebeRevisar(m);
  const emisorKey = getModuloEmisor(m);
  const receptorKey = getModuloReceptor(m);
  const bloqueadaHijos = bloqueaSubsanacionPorHijos(hilos, m.id);
  const hijosAbiertos = abierta ? tieneDescendientesAbiertos(hilos, m.id) : false;

  const pendienteReceptorEval = abierta
    && receptorKey === modEvalKey
    && reqSub
    && !bloqueadaHijos;

  const pendienteEmisorEval = abierta
    && emisorKey === modEvalKey
    && reqCierre
    && !hijosAbiertos;

  const esContabilizada = pendientesEvalIds.has(String(m.id));

  let motivoConteo = null;
  if (esContabilizada) {
    if (pendienteReceptorEval) motivoConteo = 'receptor Eval debe subsanar';
    else if (pendienteEmisorEval) motivoConteo = 'emisor Eval debe cerrar/revisar';
    else motivoConteo = 'incluida en getPendientesModulo(Eval)';
  }

  return {
    id: m.id,
    numero: formatEtiquetaJerarquica(m, hilos),
    numero_padre: padreId || null,
    origen: m.origen_submodulo || m.moduloEmisor || m.moduloOrigen || m.origen || '—',
    destino: m.destino_submodulo || m.moduloReceptor || m.moduloDestino || '—',
    origen_key: emisorKey,
    destino_key: receptorKey,
    estado: o.estado ?? '(sin estado)',
    estado_normalizado: m.estado,
    cerrada: m.cerrada === true,
    esRaiz: !padreId,
    esHija: !!padreId,
    abierta,
    requiereSubsanacion: reqSub,
    requiereCierre: reqCierre,
    pendienteReceptor: pendienteReceptorEval,
    pendienteEmisor: pendienteEmisorEval,
    bloqueadaPorHijos: bloqueadaHijos,
    tieneDescendientesAbiertos: hijosAbiertos,
    esContabilizadaPorCountPendientesModulo: esContabilizada,
    motivoConteoEval: motivoConteo,
    tieneSubsanacion: !!(m.subsanacion || m.respuesta),
  };
}

function countByEstado(hilos, estado) {
  return hilos.filter((o) => migrateObservacion({ ...o }).estado === estado).length;
}

function printReport(row) {
  const input = { payload: row.payload };
  const hilos = getListaObservaciones(input);
  const abiertas = getObservacionesAbiertas(input);
  const modEval = MODULOS.eval;
  const modEvalKey = normalizeModuloKey(modEval);
  const pendientesEval = getPendientesModulo(input, modEval);
  const pendientesEvalIds = new Set(pendientesEval.map((p) => String(p.id)));

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`AUDITORÍA payload.observaciones — ${row.codigo || '—'} (id=${row.id || '—'})`);
  console.log('══════════════════════════════════════════════════════════\n');

  const detalle = hilos.map((o, idx) => auditObservacion(o, hilos, modEvalKey, pendientesEvalIds));
  console.log('── Detalle por observación ──\n');
  detalle.forEach((d, i) => {
    console.log(`[${i + 1}]`);
    console.log(JSON.stringify(d, null, 2));
    console.log('');
  });

  const cerradas = hilos.length - abiertas.length;
  const subsanadas = countByEstado(hilos, ESTADOS_OBS.SUBSANADA);

  console.log('── Totales ──\n');
  console.log(`TOTAL OBSERVACIONES:     ${hilos.length}`);
  console.log(`TOTAL ABIERTAS:          ${abiertas.length}`);
  console.log(`TOTAL SUBSANADAS:        ${subsanadas}`);
  console.log(`TOTAL CERRADAS:          ${cerradas}`);
  console.log('');
  console.log(`Pendientes Registro:     ${countPendientesModulo(input, MODULOS.registro)}`);
  console.log(`Pendientes Evaluación:   ${countPendientesModulo(input, MODULOS.eval)}`);
  console.log(`Pendientes DEC:          ${countPendientesModulo(input, MODULOS.dec)}`);
  console.log(`Pendientes Programación: ${countPendientesModulo(input, MODULOS.prog)}`);
  console.log(`Pendientes CM:           ${countPendientesModulo(input, MODULOS.cm)}`);
  console.log(`Pendientes Invitaciones: ${countPendientesModulo(input, MODULOS.inv)}`);

  const countEval = countPendientesModulo(input, modEval);
  const responsables = detalle.filter((d) => d.esContabilizadaPorCountPendientesModulo);

  console.log('\n── countPendientesModulo(Evaluación de Requerimiento) ──\n');
  console.log(`RESULTADO: ${countEval}`);
  console.log(`IDs RESPONSABLES (${responsables.length}): ${responsables.map((r) => r.id).join(', ') || '(ninguno)'}`);

  if (responsables.length) {
    console.log('\n── Por qué cada ID cuenta para Eval ──\n');
    responsables.forEach((r) => {
      const pend = pendientesEval.find((p) => String(p.id) === String(r.id));
      console.log(`• ${r.id} (nº ${r.numero}) — rol: ${pend?.rol || '?'} — ${r.motivoConteoEval}`);
      console.log(`  origen: ${r.origen} → destino: ${r.destino}`);
      console.log(`  estado: ${r.estado} → normalizado: ${r.estado_normalizado}`);
      console.log(`  abierta: ${r.abierta} | requiereSubsanacion: ${r.requiereSubsanacion} | requiereCierre: ${r.requiereCierre}`);
      console.log(`  pendienteReceptor(Eval): ${r.pendienteReceptor} | pendienteEmisor(Eval): ${r.pendienteEmisor}`);
      if (r.bloqueadaPorHijos) console.log('  ⚠ bloqueadaPorHijos (no cuenta como receptor pendiente)');
      if (r.tieneDescendientesAbiertos) console.log('  ⚠ tieneDescendientesAbiertos (no cuenta como emisor pendiente)');
      console.log('');
    });
  } else if (countEval > 0) {
    console.log('\n⚠ countPendientesModulo > 0 pero ninguna obs marcada — revisar motor.');
  } else {
    console.log('\n✓ Ninguna observación pendiente para Evaluación según el motor.');
  }

  console.log('══════════════════════════════════════════════════════════\n');
  return { countEval, responsables, detalle };
}

async function main() {
  const args = parseArgs();
  let row = null;

  if (args.payloadPath) {
    row = loadRowFromPayloadFile(args.payloadPath);
  } else {
    try {
      row = await fetchRowFromDb(args);
    } catch (e) {
      console.error('No se pudo leer PostgreSQL:', e.message);
      console.error('Use --payload <archivo.json> con { "observaciones": [...] }');
      process.exit(1);
    }
  }

  if (!row) {
    console.error('Requerimiento no encontrado.');
    process.exit(1);
  }

  if (typeof row.payload === 'object') {
    row.payload = JSON.stringify(row.payload);
  }

  printReport(row);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
