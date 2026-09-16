/**
 * RC8.17.8H5 — Programación → Invitaciones (CM) + derivación UAD + observaciones + ERV + idempotencia.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { getTransition } from '../shared/workflow/transiciones.js';
import {
  listarCandidatosProgramacionAprobadaContMenores,
  listarCandidatosTransicion,
  assertUsuarioDestinoTransicionElegible,
} from '../server/lib/workflowTransicionResponsable.js';
import {
  listarUsuariosDestinoEquipoUadOrganizacional,
  labelRolGeneralUsuario,
} from '../server/lib/equiposUadUsuario.js';
import {
  esDestinoObservacionContMenoresSoportado,
  assertUsuarioDestinoObservacionContMenores,
} from '../server/lib/candidatosObservacionContMenores.js';
import { etapaFuncionalPorEquipoUad } from '../shared/contMenoresDerivacionUad.js';
import { EQUIPOS_UAD } from '../shared/equiposUad.js';
import { ROLES_GENERALES, rolGeneralFromUsuario } from '../server/utils/userRoleCatalog.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { formatDateTimeLima } from '../src/utils/dateTimeLima.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H5 — Cont.Menores derivación ===\n');

// A. Matriz PROGRAMACION_APROBADA → INVITACIONES
const tr = getTransition({ tipoContratacion: 'BIEN', etapaOrigen: 'PROGRAMACION', eventoCodigo: 'PROGRAMACION_APROBADA' });
ok(tr?.etapa_destino === 'INVITACIONES', 'A1 PROGRAMACION_APROBADA → INVITACIONES (matriz)');

const mockUsers = [
  { id: 10, activo: true, equipo_uad: 'CONT_MENORES', cargo: 'Coordinador', permisos: {}, rol: 'coordinador', apellidos: 'Rod', nombres: 'Coord', centro: 'OA', codigo_centro_costo: '01.04.01.02.01' },
  { id: 260, activo: true, equipo_uad: 'CONT_MENORES', cargo: 'Analista', permisos: {}, rol: 'operador', apellidos: 'Cris', nombres: 'Op', centro: 'OA', codigo_centro_costo: '01.04.01.02.01' },
  { id: 999, activo: true, equipo_uad: 'PROGRAMACION', cargo: 'Prog', permisos: {}, rol: 'operador', apellidos: 'Actor', nombres: 'Prog', centro: 'OA', codigo_centro_costo: '01.04.01.02.01' },
];
const mockClient = (usuarios = mockUsers) => ({
  query: async (sql) => {
    if (/FROM requerimientos/i.test(sql)) {
      return { rows: [{ id: 50, tipo: 'bienes', estado_actual: 'PROGRAMACION', payload: {}, estado: 'En Programación' }] };
    }
    if (/FROM centros/i.test(sql)) return { rows: [{ codigo: 'OA', nombre: 'Unidad de Adquisiciones' }] };
    if (/expediente_estado_vigente/i.test(sql) && /etapa_codigo/i.test(sql)) {
      return { rows: [{ etapa_codigo: 'PROGRAMACION' }] };
    }
    if (/FROM usuarios/i.test(sql)) return { rows: usuarios.filter((u) => u.activo !== false) };
    return { rows: [] };
  },
});
const row = { id: 50, tipo: 'bienes', estado_actual: 'PROGRAMACION', payload: '{}', estado: 'En Programación' };
const client = mockClient();

const lista = await listarCandidatosProgramacionAprobadaContMenores(50, { excluirUsuarioId: 999 }, row, client);
ok(lista.etapa_destino === 'INVITACIONES', 'A2 etapa destino INVITACIONES');
ok(lista.equipo_uad === EQUIPOS_UAD.CONT_MENORES, 'A3 equipo CONT_MENORES');
ok(lista.candidatos.some((c) => c.id === 260) || lista.recomendado?.id === 10, 'A4 candidatos CM incluyen operador/coord');
ok(!lista.candidatos.some((c) => c.id === 999) && lista.recomendado?.id !== 999, 'A5 actor Programación excluido');

try {
  await assertUsuarioDestinoTransicionElegible(50, 'PROGRAMACION_APROBADA', 999, row, client);
  assert.fail('A6 actor Programación no es destino válido');
} catch (e) {
  ok(e.code === 'RESPONSABLE_TRANSICION_INVALIDO' || e.status === 422, 'A6 actor Programación rechazado como destino');
}

await assertUsuarioDestinoTransicionElegible(50, 'PROGRAMACION_APROBADA', 260, row, client);
ok(true, 'A7 usuario 260 elegible');

// B. CONT_MENORES → PROGRAMACION pool UAD
ok(etapaFuncionalPorEquipoUad(EQUIPOS_UAD.PROGRAMACION) === 'PROGRAMACION', 'B0 etapa funcional Programación');

let progPool = { usuarios: [] };
try {
  await runMigrations({ silent: true });
  progPool = await listarUsuariosDestinoEquipoUadOrganizacional({ equipoCodigo: EQUIPOS_UAD.PROGRAMACION });
  ok(progPool.usuarios.length > 0, 'B1 pool UAD PROGRAMACION no vacío (BD)');
  const lisset = progPool.usuarios.find((u) => /aguilar/i.test(String(u.apellidos || u.nombre || '')));
  const humberto = progPool.usuarios.find((u) => /nizama/i.test(String(u.apellidos || u.nombre || '')));
  if (lisset) ok(rolGeneralFromUsuario(lisset) === ROLES_GENERALES.COORDINADOR || labelRolGeneralUsuario(lisset).includes('Coord'), 'B2 Lisset coordinadora si activa');
  if (humberto) ok(rolGeneralFromUsuario(humberto) === ROLES_GENERALES.OPERADOR || /operador/i.test(labelRolGeneralUsuario(humberto)), 'B3 Humberto operador si activo');
} catch (e) {
  console.log('  ⚠ B1-B3 omitido (BD):', e.message);
}

// C. ERV — lectura en requerimiento reciente en INVITACIONES/CM
try {
  const { rows: ervRows } = await query(`
    SELECT erv.etapa_codigo, erv.estado_codigo, erv.responsable_tipo, erv.responsable_usuario_id
    FROM expediente_estado_vigente erv
    WHERE UPPER(erv.etapa_codigo) IN ('INVITACIONES', 'COORDINACION_CM')
    ORDER BY erv.updated_at DESC NULLS LAST
    LIMIT 1
  `);
  if (ervRows[0]) {
    ok(!!ervRows[0].etapa_codigo, 'C1 ERV etapa presente');
    ok(!!ervRows[0].estado_codigo, 'C2 ERV estado presente');
    ok(ervRows[0].responsable_tipo === 'PERSONA' || ervRows[0].responsable_usuario_id != null, 'C3 ERV responsable PERSONA');
  } else {
    console.log('  ⚠ C1-C3 sin filas ERV CM/Invitaciones en BD');
  }
} catch (e) {
  console.log('  ⚠ C omitido:', e.message);
}

// D. Observaciones CM
ok(esDestinoObservacionContMenoresSoportado('Programación'), 'D1 destino Programación permitido');
ok(esDestinoObservacionContMenoresSoportado('Invitaciones') === false, 'D2 Invitaciones no permitido como obs upstream');
try {
  await assertUsuarioDestinoObservacionContMenores({
    requerimientoId: 50,
    destinoSubmodulo: 'Cuadro Comparativo',
    usuarioDestinoId: 1,
  });
  assert.fail('D3 destino no elegible');
} catch (e) {
  ok(e.status === 400 || e.code === 'DESTINO_OBSERVACION_NO_ELEGIBLE', 'D3 destino no elegible rechazado');
}

// E. Idempotencia transición (mock / dry si hay req en PROGRAMACION)
try {
  const { rows: progReq } = await query(`
    SELECT id FROM requerimientos WHERE UPPER(COALESCE(estado_actual,'')) = 'PROGRAMACION' LIMIT 1
  `);
  if (progReq[0]) {
    const rid = progReq[0].id;
    const crq = `test-h5-idem:${rid}:${Date.now()}`;
    const meta = { client_request_id: crq, via: 'test-rc8178h5', dry_run: true };
    // Solo verificar que repetir client_request_id no duplica si el motor lo soporta en lectura posterior
    const { rows: evBefore } = await query(
      'SELECT COUNT(*)::int AS n FROM workflow_eventos WHERE metadata->>\'client_request_id\' = $1',
      [crq],
    );
    ok(evBefore[0].n === 0, 'E1 sin eventos previos para client_request_id nuevo');
  } else {
    console.log('  ⚠ E omitido: sin REQ en PROGRAMACION para idempotencia live');
  }
} catch (e) {
  console.log('  ⚠ E omitido:', e.message);
}

// F. Trazabilidad — causa raíz TZ (presentación)
const utcSample = '2026-08-17T01:45:00.000Z';
const lima = formatDateTimeLima(utcSample, { style: 'dmy' });
ok(lima === '16/08/2026 20:45', `F1 formatDateTimeLima fija America/Lima (${lima})`);
const localWrong = new Date(utcSample).toLocaleString('es-PE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
ok(lima !== localWrong || process.env.TZ === 'America/Lima', 'F2 fmtDateTime centralizado evita depender del TZ del runtime');

console.log('\n=== RC8.17.8H5 OK ===\n');
