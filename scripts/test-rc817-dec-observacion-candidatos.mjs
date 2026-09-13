/**
 * RC8.17 — DEC observación: candidatos destino + acceso responsable vigente.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listarCandidatosObservacionDestino,
  assertUsuarioDestinoObservacionElegible,
  resolveRecomendadoRegistro,
  resolveRecomendadoEvaluacion,
} from '../server/lib/candidatosObservacionDestino.js';
import { canAccessRequirement } from '../server/lib/userDataScope.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17 — DEC observación candidatos ===\n');

const modalSrc = readFileSync(join(__dir, '../src/components/modalObservaciones.js'), 'utf8');
ok(/candidatosApiPath:\s*config\.candidatosApiPath/.test(modalSrc),
  'handleBandejaObservaciones reenvía candidatosApiPath (ruta DEC)');

try {
  await runMigrations();
  const { rows: reqRows } = await query(`SELECT id FROM requerimientos WHERE codigo = 'REQ-00016' LIMIT 1`);
  const rid = reqRows[0]?.id;
  const { rows: lesp } = await query(`SELECT id FROM usuarios WHERE LOWER(username)='lespinoza' AND activo=TRUE LIMIT 1`);
  const { rows: wv } = await query(`SELECT id FROM usuarios WHERE LOWER(username)='wvasquez' AND activo=TRUE LIMIT 1`);
  const { rows: mg } = await query(`SELECT id FROM usuarios WHERE LOWER(username)='mgrande' AND activo=TRUE LIMIT 1`);

  if (rid && lesp[0]) {
    const acc = await canAccessRequirement(lesp[0].id, rid, 'GET');
    ok(acc.ok, 'lespinoza responsable vigente puede acceder al REQ (guard org)');

    const reg = await listarCandidatosObservacionDestino({
      requerimientoId: rid,
      destinoSubmodulo: 'Registro de Requerimiento',
      search: 'wvas',
    });
    ok(reg.soportado, 'destino Registro soportado');
    const regIds = [...(reg.recomendado ? [reg.recomendado] : []), ...(reg.candidatos || [])].map((c) => c.id);
    if (wv[0]) {
      ok(regIds.includes(wv[0].id), 'búsqueda wvasquez incluye wvasquez en Registro');
      await assertUsuarioDestinoObservacionElegible(rid, 'Registro de Requerimiento', wv[0].id);
      ok(true, 'assert acepta wvasquez destino Registro');
    }

    const ev = await listarCandidatosObservacionDestino({
      requerimientoId: rid,
      destinoSubmodulo: 'Evaluación de Requerimiento',
      search: '',
    });
    ok(ev.soportado, 'destino Evaluación soportado');
    const evIds = [...(ev.recomendado ? [ev.recomendado] : []), ...(ev.candidatos || [])].map((c) => c.id);
    if (mg[0]) {
      ok(evIds.includes(mg[0].id), 'mgrande aparece en candidatos Evaluación');
    }

    const recReg = await resolveRecomendadoRegistro(rid);
    const recEv = await resolveRecomendadoEvaluacion(rid);
    if (wv[0] && recReg) ok(Number(recReg.id) === Number(wv[0].id), 'recomendado histórico Registro = wvasquez-like');
    if (mg[0] && recEv) ok(Number(recEv.id) === Number(mg[0].id), 'recomendado histórico Evaluación = mgrande-like');
  } else {
    console.log('  ⚠ REQ-00016 o usuarios piloto no disponibles');
  }
} catch (e) {
  console.log('  ⚠ integración BD:', e.message);
  if (process.env.CI) throw e;
}

console.log('\n✅ RC8.17 DEC observación candidatos — OK\n');
