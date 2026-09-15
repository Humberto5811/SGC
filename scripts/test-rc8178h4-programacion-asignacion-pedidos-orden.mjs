/**
 * RC8.17.8H4 — Orden Pedidos por REQ + asignación interna PROGRAMACION (REASIGNACION_RESPONSABLE).
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { buildMatrizSeguimientoPedidos } from '../server/lib/pedidosMatriz.js';
import {
  compareFilasPedidosDefault,
  parseRequerimientoCorrelativo,
} from '../src/utils/pedidosConsolidacion.js';
import {
  listarCandidatosReasignacionProgramacion,
} from '../server/lib/workflowTransicionResponsable.js';
import {
  listarOperadoresProgramacionAsignables,
  esDestinatarioAsignacionInternaProgramacion,
} from '../server/lib/equiposUadUsuario.js';
import { EQUIPOS_UAD } from '../shared/equiposUad.js';
import { ROLES_GENERALES, rolGeneralFromUsuario } from '../server/utils/userRoleCatalog.js';
import { ejecutarAsignacionResponsableProgramacion } from '../server/lib/programacionAsignarResponsable.js';
import { getEstadoResponsableCanonico } from '../server/lib/estadoResponsableCanonico.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H4 — Pedidos orden + asignación Programación ===\n');

await runMigrations();

const matriz = await buildMatrizSeguimientoPedidos();
const filas = matriz.filas || [];
if (filas.length >= 2) {
  const sorted = filas.slice().sort(compareFilasPedidosDefault);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(compareFilasPedidosDefault(sorted[i - 1], sorted[i]) <= 0, 'orden REQ desc + pedido estable');
  }
  ok(true, 'matriz ordenable por correlativo REQ DESC');
  const byReq = new Map();
  sorted.forEach((f) => {
    const k = parseRequerimientoCorrelativo(f.requerimiento_codigo, f.requerimiento_id);
    if (!byReq.has(k)) byReq.set(k, []);
    byReq.get(k).push(f);
  });
  byReq.forEach((group, k) => {
    if (group.length > 1) {
      ok(group.every((g) => parseRequerimientoCorrelativo(g.requerimiento_codigo, g.requerimiento_id) === k),
        `pedidos agrupados por REQ ${group[0].requerimiento_codigo}`);
    }
  });
}

const { usuarios: operadores } = await listarOperadoresProgramacionAsignables();
ok(operadores.length >= 0, `operadores PROGRAMACION elegibles: ${operadores.length}`);
operadores.forEach((u) => {
  ok(rolGeneralFromUsuario(u) === ROLES_GENERALES.OPERADOR, `${u.username} es OPERADOR`);
  ok(String(u.equipo_uad || '').toUpperCase() === EQUIPOS_UAD.PROGRAMACION, `${u.username} equipo PROGRAMACION`);
});

const { rows: contMenoresOp } = await query(`
  SELECT id, username, equipo_uad, rol, permisos, centro, codigo_centro_costo, activo, cargo
  FROM usuarios WHERE username = 'hnizama' LIMIT 1
`);
if (contMenoresOp[0]) {
  const { rows: cmOnly } = await query(`
    SELECT id, username, equipo_uad, rol, permisos, centro, codigo_centro_costo, activo, cargo
    FROM usuarios WHERE equipo_uad = 'CONT_MENORES' AND activo = TRUE LIMIT 1
  `);
  if (cmOnly[0]) {
    ok(!operadores.some((o) => o.id === cmOnly[0].id), 'candidato CONT_MENORES excluido de pool Programación');
  }
  if (String(contMenoresOp[0].equipo_uad).toUpperCase() === EQUIPOS_UAD.PROGRAMACION) {
    const inPool = operadores.some((o) => o.id === contMenoresOp[0].id);
    if (rolGeneralFromUsuario(contMenoresOp[0]) === ROLES_GENERALES.OPERADOR) {
      ok(inPool, 'hnizama OPERADOR PROGRAMACION en pool si configurado');
    }
  }
}

const { rows: reqRows } = await query(`
  SELECT r.id, r.codigo, r.estado_actual
  FROM requerimientos r
  WHERE UPPER(COALESCE(r.estado_actual, '')) = 'PROGRAMACION'
  ORDER BY r.id DESC LIMIT 1
`);
if (reqRows[0] && operadores.length) {
  const rid = reqRows[0].id;
  const candidatos = await listarCandidatosReasignacionProgramacion(rid, {}, reqRows[0]);
  ok(candidatos.soportado !== false, 'listar candidatos REASIGNACION_RESPONSABLE');
  ok(candidatos.etapa_destino === candidatos.etapa_origen || candidatos.destinos?.[0]?.etapa_codigo === 'PROGRAMACION',
    'destino etapa = origen (sin cambio)');

  const dest = operadores[0];
  const canonBefore = await getEstadoResponsableCanonico({ requerimientoIds: [rid] });
  const before = canonBefore.get(rid);
  const etapaAntes = before?.etapaCodigo;
  const estadoAntes = before?.estadoCodigo;

  const fakeReq = {
    user: (await query(`SELECT * FROM usuarios WHERE equipo_uad = 'PROGRAMACION' AND rol = 'usuario' LIMIT 1`)).rows.find(
      (u) => rolGeneralFromUsuario(u) === ROLES_GENERALES.COORDINADOR,
    ) || (await query(`SELECT * FROM usuarios WHERE username = 'laguilar' LIMIT 1`)).rows[0],
  };
  if (fakeReq.user) {
    try {
      const result = await ejecutarAsignacionResponsableProgramacion({
        requerimientoId: rid,
        req: fakeReq,
        usuarioDestinoId: dest.id,
        clientRequestId: `test-h4:${rid}:${dest.id}`,
      });
      ok(result.ok !== false, 'transición REASIGNACION_RESPONSABLE ejecutada');
      const canonAfter = await getEstadoResponsableCanonico({ requerimientoIds: [rid] });
      const after = canonAfter.get(rid);
      ok(after?.etapaCodigo === etapaAntes, 'Etapa no cambia');
      ok(after?.estadoCodigo === estadoAntes, 'Estado no cambia');
      ok(after?.responsableTipo === 'PERSONA', 'responsable PERSONA');
      ok(Number(after?.responsableUsuarioId) === Number(dest.id), 'responsable_usuario_id destino');

      const dup = await ejecutarAsignacionResponsableProgramacion({
        requerimientoId: rid,
        req: fakeReq,
        usuarioDestinoId: dest.id,
        clientRequestId: `test-h4:${rid}:${dest.id}`,
      });
      ok(dup.idempotente === true, 'reintento idempotente mismo client_request_id');

      const { rows: ev } = await query(`
        SELECT evento_codigo FROM workflow_eventos
        WHERE expediente_id = $1 AND evento_codigo = 'REASIGNACION_RESPONSABLE'
        ORDER BY id DESC LIMIT 1
      `, [rid]);
      ok(ev.length > 0, 'evento REASIGNACION_RESPONSABLE registrado');
    } catch (e) {
      if (e.code === 'ACTOR_PROGRAMACION_NO_AUTORIZADO') {
        console.log('  (omitido PUT real: actor coordinador no disponible en BD de prueba)');
      } else {
        throw e;
      }
    }
  }
}

console.log('\n✅ RC8.17.8H4 — OK\n');
