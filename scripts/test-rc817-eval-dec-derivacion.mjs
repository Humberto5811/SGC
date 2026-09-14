/**
 * RC8.17 — Evaluación → DEC: Director Unidad de Adquisiciones (no usuario legacy dec).
 */
import assert from 'node:assert/strict';
import {
  listarCandidatosTransicion,
  listarCandidatosDerivacionDec,
  esElegibleDirectorUnidadAdquisiciones,
  esCuentaLegacyDecSemilla,
  resolveUnidadAdquisicionesKeys,
  usuarioPerteneceUnidadAdquisiciones,
} from '../server/lib/workflowTransicionResponsable.js';
import { query } from '../server/db.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17 — Eval → DEC (Director UAD) ===\n');

const uadKeys = { codigos: new Set(['OA']), costPrefix: '010401' };

const lespinozaLike = {
  id: 549,
  username: 'lespinoza',
  apellidos: 'ESPINOZA MELLADO',
  nombres: 'LUIGI',
  rol: 'director',
  cargo: 'DIRECTOR UAD',
  centro: 'OA',
  codigo_centro_costo: '01.04.01.02.01',
  activo: true,
  permisos: {},
};

const decSeed = {
  id: 3,
  username: 'dec',
  nombre: 'Usuario DEC',
  rol: 'dec',
  activo: true,
  centro: '',
  permisos: { submodulos: ['DEC'], actividadesPorSubmodulo: { DEC: ['VER'] } },
};

const directorCncc = {
  id: 99,
  username: 'dircncc',
  rol: 'director',
  centro: 'CNCC',
  codigo_centro_costo: '01.06.06.01.01',
  activo: true,
  permisos: {},
};

const admin = { id: 1, username: 'admin', rol: 'admin', activo: true, centro: 'OA', permisos: {} };

ok(esElegibleDirectorUnidadAdquisiciones(lespinozaLike, uadKeys), 'director UAD activo es elegible');
ok(!esElegibleDirectorUnidadAdquisiciones(decSeed, uadKeys), 'usuario legacy dec no es elegible');
ok(!esElegibleDirectorUnidadAdquisiciones(directorCncc, uadKeys), 'director de otra unidad no es elegible');
ok(!esElegibleDirectorUnidadAdquisiciones({ ...lespinozaLike, activo: false }, uadKeys), 'inactivo no elegible');
ok(!esElegibleDirectorUnidadAdquisiciones(admin, uadKeys), 'admin no es responsable natural DEC');
ok(esCuentaLegacyDecSemilla(decSeed), 'cuenta semilla dec reconocida');
ok(usuarioPerteneceUnidadAdquisiciones(lespinozaLike, uadKeys), 'lespinoza-like pertenece UAD por centro/CC');

const reqRow = {
  id: 16,
  tipo: 'bienes',
  estado_actual: 'EVALUACION',
  payload: { area: { responsable: 'CNCC' } },
};

const mockClient = (usuarios = [], centros = [{ codigo: 'OA', nombre: 'Unidad de Adquisiciones' }]) => ({
  query: async (sql, params) => {
    if (/FROM requerimientos/i.test(sql)) return { rows: [reqRow] };
    if (/FROM centros/i.test(sql)) return { rows: centros };
    if (/FROM usuarios u/i.test(sql) && /codigo_centro_costo/i.test(sql)) {
      const codigos = (params?.[0] || []).map((c) => String(c).toUpperCase());
      const ccLike = String(params?.[1] || '').replace(/%/g, '');
      const filtered = usuarios.filter((u) => {
        const uc = String(u.centro || '').replace(/[\s.]/g, '').toUpperCase();
        const cc = String(u.codigo_centro_costo || '').replace(/\./g, '').toUpperCase();
        return codigos.includes(uc) || cc.startsWith(ccLike);
      });
      return { rows: filtered };
    }
    return { rows: [] };
  },
});

const lista = await listarCandidatosDerivacionDec(
  16,
  {},
  reqRow,
  mockClient([lespinozaLike, decSeed, directorCncc, admin]),
);
ok(lista.etapa_destino === 'DEC', 'etapa destino DEC');
ok(lista.recomendado?.id === 549, 'lespinoza-like recomendado');
ok(lista.recomendado?.username === 'lespinoza', 'recomendado username lespinoza');
ok(!lista.candidatos.some((c) => c.username === 'dec'), 'legacy dec no en candidatos');
ok(!lista.candidatos.some((c) => c.id === 99), 'director CNCC no en candidatos');

const mockClientDecProg = (usuarios = []) => ({
  query: async (sql) => {
    if (/FROM requerimientos/i.test(sql)) {
      return { rows: [{ id: 40, tipo: 'bienes', estado_actual: 'DEC', payload: reqRow.payload }] };
    }
    if (/FROM centros/i.test(sql)) {
      return { rows: [{ codigo: 'OA', nombre: 'Unidad de Adquisiciones' }] };
    }
    if (/FROM usuarios/i.test(sql) && /activo = TRUE/i.test(sql)) return { rows: usuarios };
    return { rows: [] };
  },
});
const progUser = {
  id: 602,
  username: 'coordprog',
  apellidos: 'PEREZ',
  nombres: 'JUAN',
  cargo: 'COORDINADOR-PROGRAM.',
  rol: 'coordinador',
  centro: 'OA',
  codigo_centro_costo: '01.04.01.02.01',
  equipo_uad: 'PROGRAMACION',
  activo: true,
  permisos: {
    submodulos: ['PROGRAMACION'],
    actividadesPorSubmodulo: { PROGRAMACION: ['VER', 'APROBAR'] },
  },
};
const listaDecPerfil = await listarCandidatosTransicion(
  40,
  'DEC_APROBADO',
  {},
  { id: 40, tipo: 'bienes', estado_actual: 'DEC', payload: {} },
  mockClientDecProg([progUser]),
);
ok(listaDecPerfil.perfil_responsable !== 'DIRECTOR_UAD', 'DEC_APROBADO no usa regla Director UAD');
ok(listaDecPerfil.perfil_responsable === 'COORDINADOR_EQUIPO_UAD', 'DEC_APROBADO usa Coordinador equipo UAD');
const idsDecEvento = [
  ...(listaDecPerfil.recomendado ? [listaDecPerfil.recomendado.id] : []),
  ...(listaDecPerfil.candidatos || []).map((c) => c.id),
];
ok(idsDecEvento.includes(602), 'DEC_APROBADO incluye coordinador equipo Programación');

try {
  const { rows: lesp } = await query(`
    SELECT id, username, rol, centro, codigo_centro_costo, activo
    FROM usuarios WHERE LOWER(username) = 'lespinoza' LIMIT 1
  `);
  if (lesp.length) {
    const keys = await resolveUnidadAdquisicionesKeys();
    ok(esElegibleDirectorUnidadAdquisiciones(lesp[0], keys), 'BD: lespinoza elegible Director UAD');
    const live = await listarCandidatosDerivacionDec(16, {}, reqRow);
    const todos = [...(live.recomendado ? [live.recomendado] : []), ...(live.candidatos || [])];
    ok(todos.some((c) => c.username === 'lespinoza'), 'BD: listado incluye lespinoza');
    ok(!todos.some((c) => c.username === 'dec'), 'BD: listado no recomienda legacy dec');
  }
} catch (e) {
  console.log('  ⚠ integración BD:', e.message);
}

console.log('\n✅ RC8.17 Eval→DEC — OK\n');
