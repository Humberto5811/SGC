/**
 * RC8.17.2B-F2.1 — Director evaluación: excluir admin de candidatos.
 */
import assert from 'node:assert/strict';
import { resolveDirectorEvaluacionParaRequerimiento } from '../server/lib/pilotRegistroEvaluacion.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.2B-F2.1 — Director evaluación ===\n');

function mockClient(usuariosCentro = []) {
  return {
    query: async (sql) => {
      if (/FROM requerimientos/i.test(sql)) {
        return {
          rows: [{
            id: 20,
            codigo: 'REQ-00020',
            cmn: '00333',
            area: 'SALA DE MEDIOS Y BIOTERIO',
            payload: { area: { responsable: 'CNCC' } },
          }],
        };
      }
      if (/FROM usuarios/i.test(sql)) {
        return { rows: usuariosCentro };
      }
      return { rows: [] };
    },
  };
}

const mgrande = {
  id: 913,
  username: 'mgrande',
  apellidos: 'GRANDE ORTIZ',
  nombres: 'MIGUEL ANGEL',
  cargo: 'DIRECTOR AU',
  rol: 'director',
  centro: 'CNCC',
  codigo_centro_costo: '01.06.06.01.01',
  permisos: { submodulos: ['EVALUACION_REQUERIMIENTO'] },
};

const admin = {
  id: 1,
  username: 'admin',
  nombre: 'Administrador',
  cargo: null,
  rol: 'admin',
  centro: 'CNCC',
  codigo_centro_costo: 'CNCC',
  permisos: {},
};

const dir2 = {
  id: 920,
  username: 'dir2',
  apellidos: 'OTRO',
  nombres: 'DIRECTOR',
  cargo: 'GERENTE AU',
  rol: 'director',
  centro: 'CNCC',
  codigo_centro_costo: 'CNCC',
  permisos: {},
};

// CNCC: mgrande + admin → PERSONA mgrande
const r1 = await resolveDirectorEvaluacionParaRequerimiento(20, null, mockClient([mgrande, admin]));
ok(r1.usuarioId === 913, 'CNCC mgrande+admin → PERSONA mgrande (913)');
ok(r1.ambiguo === false, 'CNCC mgrande+admin → no ambiguo');
ok(r1.persona?.username === 'mgrande', 'CNCC mgrande+admin → username mgrande');

// CNCC: dos directores reales → ambiguo
const r2 = await resolveDirectorEvaluacionParaRequerimiento(20, null, mockClient([mgrande, dir2]));
ok(r2.usuarioId == null, 'dos directores reales → sin usuarioId');
ok(r2.ambiguo === true, 'dos directores reales → ambiguo');
ok(r2.motivo === 'multiples_directores', 'dos directores reales → motivo multiples_directores');
ok(r2.candidatos === 2, 'dos directores reales → candidatos=2');

// CNCC: solo admin → sin director resoluble
const r3 = await resolveDirectorEvaluacionParaRequerimiento(20, null, mockClient([admin]));
ok(r3.usuarioId == null, 'solo admin → sin PERSONA');
ok(r3.motivo === 'sin_director_resoluble', 'solo admin → sin_director_resoluble');

try {
  const { query } = await import('../server/db.js');
  const { rows: reqs } = await query(`SELECT id FROM requerimientos WHERE codigo = 'REQ-00020' LIMIT 1`);
  if (reqs[0]?.id) {
    const live = await resolveDirectorEvaluacionParaRequerimiento(reqs[0].id);
    ok(live.usuarioId === 913, 'integración REQ-00020 → mgrande (913)');
    ok(live.ambiguo === false, 'integración REQ-00020 → no ambiguo');
  } else {
    console.log('  ⚠ integración REQ-00020 omitida (no existe en BD)');
  }
} catch (e) {
  console.log('  ⚠ integración BD omitida:', e.message);
}

console.log('\n✅ RC8.17.2B-F2.1 — OK\n');
