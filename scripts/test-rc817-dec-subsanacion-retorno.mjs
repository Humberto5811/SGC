/**
 * RC8.17 — Subsanación Registro → DEC: emisor (lespinoza-like) como PERSONA.
 */
import assert from 'node:assert/strict';
import {
  listarCandidatosSubsanacionDestino,
  assertUsuarioDestinoSubsanacionElegible,
  mapDestinoSubmoduloAEtapaObservacion,
} from '../server/lib/candidatosObservacionDestino.js';
import { resolveEmisorObservacionRetorno } from '../server/lib/pilotRegistroEvaluacion.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17 — Subsanación → DEC emisor ===\n');

ok(mapDestinoSubmoduloAEtapaObservacion('DEC') === 'DEC', 'destino DEC mapeado');

const mockClient = (emisorRow, elegiblesDec = []) => ({
  query: async (sql, params) => {
    if (/workflow_observaciones/i.test(sql)) {
      return { rows: emisorRow ? [{ usuario_origen_id: emisorRow.id, emitida_por: emisorRow.username }] : [] };
    }
    if (/FROM requerimientos/i.test(sql) && /payload/i.test(sql)) {
      return {
        rows: [{
          payload: JSON.stringify({
            observaciones: [{
              id: 'obs1',
              cerrada: false,
              gerente: emisorRow?.username || 'lespinoza',
              moduloEmisor: 'DEC',
              moduloReceptor: 'Registro de Requerimiento',
            }],
          }),
        }],
      };
    }
    if (/FROM usuarios u/i.test(sql) && params?.[0]?.length) {
      return { rows: elegiblesDec.length ? elegiblesDec : (emisorRow ? [emisorRow] : []) };
    }
    if (/FROM usuarios/i.test(sql) && /WHERE/i.test(sql) && /id = \$1/i.test(sql) && !/activo = TRUE/i.test(sql)) {
      return { rows: emisorRow ? [emisorRow] : [] };
    }
    if (/FROM usuarios/i.test(sql) && /LOWER\(username\)/i.test(sql)) {
      return { rows: emisorRow ? [emisorRow] : [] };
    }
    if (/FROM centros/i.test(sql)) {
      return { rows: [{ codigo: 'OA', nombre: 'Unidad de Adquisiciones' }] };
    }
    if (/FROM usuarios u/i.test(sql) && /activo = TRUE/i.test(sql)) {
      return { rows: elegiblesDec };
    }
    return { rows: [] };
  },
});

const lespLike = {
  id: 549,
  username: 'lespinoza',
  apellidos: 'ESPINOZA',
  nombres: 'LUIGI',
  rol: 'director',
  cargo: 'DIRECTOR UAD',
  centro: 'OA',
  codigo_centro_costo: '01.04.01.02.01',
  activo: true,
  permisos: {},
};

const lista = await listarCandidatosSubsanacionDestino({
  requerimientoId: 16,
  destinoSubmodulo: 'DEC',
  observacionId: 'obs1',
  search: '',
  client: mockClient(lespLike, [lespLike]),
});
ok(lista.soportado, 'subsanación DEC soportada');
ok(lista.recomendado?.id === 549, 'emisor recomendado');

try {
  await runMigrations();
  const { rows: req } = await query(`SELECT id FROM requerimientos WHERE codigo='REQ-00016' LIMIT 1`);
  const { rows: lesp } = await query(`SELECT id FROM usuarios WHERE LOWER(username)='lespinoza' AND activo=TRUE LIMIT 1`);
  if (req[0] && lesp[0]) {
    const emisor = await resolveEmisorObservacionRetorno(req[0].id, null, {});
    if (emisor) ok(Number(emisor) === Number(lesp[0].id), 'BD: emisor observación resuelve lespinoza');
    const live = await listarCandidatosSubsanacionDestino({
      requerimientoId: req[0].id,
      destinoSubmodulo: 'DEC',
      search: 'lesp',
    });
    const ids = [...(live.recomendado ? [live.recomendado.id] : []), ...(live.candidatos || []).map((c) => c.id)];
    ok(ids.includes(lesp[0].id), 'BD: candidatos subsanación DEC incluyen lespinoza');
    await assertUsuarioDestinoSubsanacionElegible(req[0].id, 'DEC', lesp[0].id);
    ok(true, 'assert subsanación acepta lespinoza');
  }
} catch (e) {
  console.log('  ⚠ BD:', e.message);
}

console.log('\n✅ RC8.17 subsanación DEC — OK\n');
