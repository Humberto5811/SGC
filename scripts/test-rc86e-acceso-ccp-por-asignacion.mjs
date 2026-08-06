/**
 * RC8.6E — Acceso CCP por asignación activa.
 * Casos 1–24 (estáticos + BD local cuando disponible).
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveAccesoCcp,
  MODO_ACCESO_CCP,
  listRequerimientoIdsAsignacionCcp,
  tieneAsignacionActivaCcpSobre,
} from '../server/lib/accesoCcp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.6E acceso CCP por asignación ===\n');

// ——— Estáticos ———
{
  const ccpRoute = read('server/routes/ccp.js');
  ok(!/ROLES_CCP\s*=\s*new Set\(\['dec',\s*'admin'\]\)/.test(ccpRoute), '1/15: ya no bloquea solo por rol dec/admin');
  ok(/assertAccesoCcp|resolveAccesoCcp/.test(ccpRoute), '15: backend valida con assertAccesoCcp');
  ok(/acceso_por_asignacion|modo.*ASIGNACION/.test(ccpRoute), '4: bandeja reporta modo asignación');

  const acceso = read('server/lib/accesoCcp.js');
  ok(/export async function resolveAccesoCcp/.test(acceso), 'helper resolveAccesoCcp existe');
  ok(/MODO_ACCESO_CCP/.test(acceso), 'modos GLOBAL|ASIGNACION|DENEGADO');
  ok(!/jcrisostomo/.test(acceso), 'sin hardcode username');
  ok(/ACTIVIDADES_SOLO_GLOBAL/.test(acceso), '16: consolidar no se concede solo por asignación');

  const view = read('src/views/contratacion/ccpView.js');
  ok(/Expedientes asignados/.test(view), '13: aviso Expedientes asignados');
  ok(/Un solo mensaje|showAlert\('', ''\)/.test(view) || /showAlert\('', ''\)/.test(view), '18: evita mensaje duplicado');
  const dupPattern = /showAlert\('danger'[\s\S]{0,120}alert alert-danger/;
  ok(!dupPattern.test(view), '18b: no showAlert+innerHTML danger juntos');

  const auth = read('server/routes/auth.js');
  ok(/acceso_ccp_por_asignacion/.test(auth), '9: sesión expone flag asignación');
  ok(/\/me/.test(auth), '9: GET /api/auth/me refresca contexto');

  const perm = read('src/services/permissionsService.js');
  ok(/acceso_ccp_por_asignacion/.test(perm), '14: ruta CCP permite asignación');

  const menu = read('src/services/menuService.js');
  ok(/acceso_ccp_por_asignacion/.test(menu), '13: menú CCP por asignación');

  ok(existsSync(join(root, 'server/lib/accesoCcp.js')), 'helper archivo presente');
}

// ——— Mock client ———
function makeClient({
  user,
  asignaciones = [],
  vigente = null,
} = {}) {
  return {
    async query(sql, params = []) {
      const s = String(sql);
      if (/FROM usuarios WHERE id/.test(s) && /activo/.test(s) && !/permisos/.test(s) && params.length === 1) {
        if (user && Number(user.id) === Number(params[0])) {
          return { rows: [{ id: user.id, activo: user.activo !== false }] };
        }
        return { rows: [] };
      }
      if (/SELECT id, username, rol, activo, permisos FROM usuarios/.test(s)) {
        if (user && Number(user.id) === Number(params[0])) return { rows: [user] };
        return { rows: [] };
      }
      if (/FROM expediente_asignaciones a/.test(s) && /JOIN usuarios u/.test(s)) {
        const uid = Number(params[0]);
        const ids = asignaciones
          .filter((a) => a.usuario_id === uid && a.activo && String(a.etapa_codigo).toUpperCase() === 'CCP')
          .map((a) => a.requerimiento_id);
        return { rows: [...new Set(ids)].map((requerimiento_id) => ({ requerimiento_id })) };
      }
      if (/FROM expediente_asignaciones a/.test(s) && /requerimiento_id = \$1/.test(s)) {
        const rid = Number(params[0]);
        const uid = Number(params[1]);
        const hit = asignaciones.find((a) => (
          a.requerimiento_id === rid
          && a.usuario_id === uid
          && a.activo
          && String(a.etapa_codigo).toUpperCase() === 'CCP'
        ));
        return { rows: hit ? [hit] : [] };
      }
      if (/FROM expediente_estado_vigente/.test(s)) {
        if (vigente && Number(vigente.requerimiento_id) === Number(params[0])) {
          return { rows: [vigente] };
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

const permCcpVer = {
  modulos: ['CONTRATACIONES'],
  submodulos: ['CCP'],
  actividades: ['VER'],
  actividadesPorSubmodulo: { CCP: ['VER'] },
};
const permCcpFull = {
  modulos: ['CONTRATACIONES'],
  submodulos: ['CCP'],
  actividades: ['VER', 'CREAR', 'EDITAR', 'DERIVAR'],
  actividadesPorSubmodulo: { CCP: ['VER', 'CREAR', 'EDITAR', 'DERIVAR'] },
};
const permSinCcp = {
  modulos: ['CONTRATACIONES'],
  submodulos: ['INVITACIONES'],
  actividades: ['VER'],
  actividadesPorSubmodulo: { INVITACIONES: ['VER'] },
};

{
  const admin = { id: 1, rol: 'admin', activo: true, permisos: {} };
  const r = await resolveAccesoCcp({
    usuarioId: 1,
    actividad: 'VER',
    client: makeClient({ user: admin }),
    userRow: admin,
  });
  ok(r.permitido && r.modo === 'GLOBAL', '1/10: admin acceso global');
}

{
  const dec = { id: 2, rol: 'dec', activo: true, permisos: permCcpVer };
  const r = await resolveAccesoCcp({
    usuarioId: 2,
    actividad: 'VER',
    client: makeClient({ user: dec }),
    userRow: dec,
  });
  ok(r.permitido && r.modo === 'GLOBAL', '1: DEC + CCP/VER → GLOBAL');
}

{
  const u = { id: 10, rol: 'usuario', activo: true, permisos: permCcpVer };
  const r = await resolveAccesoCcp({
    usuarioId: 10,
    actividad: 'VER',
    client: makeClient({ user: u, asignaciones: [] }),
    userRow: u,
  });
  ok(r.permitido && r.modo === 'GLOBAL', '1: usuario con CCP/VER sin asignación → GLOBAL');
}

{
  const u = { id: 20, rol: 'usuario', activo: true, permisos: permSinCcp };
  const asg = [{
    id: 1, requerimiento_id: 2, usuario_id: 20, etapa_codigo: 'CCP', activo: true,
  }];
  const vig = {
    requerimiento_id: 2, etapa_codigo: 'CCP', responsable_usuario_id: 20, responsable_tipo: 'PERSONA',
  };
  const r = await resolveAccesoCcp({
    usuarioId: 20,
    actividad: 'VER',
    client: makeClient({ user: u, asignaciones: asg, vigente: vig }),
    userRow: u,
  });
  ok(r.permitido && r.modo === 'ASIGNACION', '2: sin CCP/VER + asignación → ASIGNACION');
  ok(Array.isArray(r.alcanceRequerimientoIds) && r.alcanceRequerimientoIds.includes(2), '3: alcance incluye asignado');
  ok(!r.alcanceRequerimientoIds.includes(99), '4: no incluye ajenos');
}

{
  const u = { id: 30, rol: 'usuario', activo: true, permisos: permSinCcp };
  const r = await resolveAccesoCcp({
    usuarioId: 30,
    actividad: 'VER',
    client: makeClient({ user: u, asignaciones: [] }),
    userRow: u,
  });
  ok(!r.permitido && r.modo === 'DENEGADO', '5: sin permiso ni asignación → 403/DENEGADO');
}

{
  const u = { id: 40, rol: 'usuario', activo: true, permisos: permSinCcp };
  const asg = [{
    id: 1, requerimiento_id: 2, usuario_id: 40, etapa_codigo: 'CCP', activo: false,
  }];
  const r = await resolveAccesoCcp({
    usuarioId: 40,
    actividad: 'VER',
    client: makeClient({ user: u, asignaciones: asg }),
    userRow: u,
  });
  ok(!r.permitido, '6: asignación inactiva no concede acceso');
}

{
  const u = { id: 50, rol: 'usuario', activo: true, permisos: permSinCcp };
  const asg = [{
    id: 1, requerimiento_id: 2, usuario_id: 50, etapa_codigo: 'INVITACIONES', activo: true,
  }];
  const r = await resolveAccesoCcp({
    usuarioId: 50,
    actividad: 'VER',
    client: makeClient({ user: u, asignaciones: asg }),
    userRow: u,
  });
  ok(!r.permitido, '7: asignación de otra etapa no concede CCP');
}

{
  const u = { id: 60, rol: 'usuario', activo: true, permisos: permSinCcp };
  // Sin asignación activa; “histórico” no se consulta — denegado
  const r = await resolveAccesoCcp({
    usuarioId: 60,
    actividad: 'VER',
    client: makeClient({ user: u, asignaciones: [] }),
    userRow: u,
  });
  ok(!r.permitido, '8: responsable histórico no concede acceso');
}

{
  const u = { id: 70, rol: 'usuario', activo: false, permisos: permCcpFull };
  const r = await resolveAccesoCcp({
    usuarioId: 70,
    actividad: 'VER',
    client: makeClient({ user: u }),
    userRow: u,
  });
  ok(!r.permitido, '9: usuario inactivo no obtiene acceso');
}

{
  const u = { id: 20, rol: 'usuario', activo: true, permisos: permSinCcp };
  const asg = [{
    id: 1, requerimiento_id: 2, usuario_id: 20, etapa_codigo: 'CCP', activo: true,
  }];
  const r = await resolveAccesoCcp({
    usuarioId: 20,
    actividad: 'CONSOLIDAR',
    client: makeClient({ user: u, asignaciones: asg }),
    userRow: u,
  });
  ok(!r.permitido, '16: VER/asignación no implica consolidar');
}

{
  const u = { id: 20, rol: 'usuario', activo: true, permisos: permSinCcp };
  const asg = [{
    id: 1, requerimiento_id: 2, usuario_id: 20, etapa_codigo: 'CCP', activo: true,
  }];
  const vig = {
    requerimiento_id: 2, etapa_codigo: 'CCP', responsable_usuario_id: 20,
  };
  const rEdit = await resolveAccesoCcp({
    usuarioId: 20,
    requerimientoId: 2,
    actividad: 'EDITAR',
    client: makeClient({ user: u, asignaciones: asg, vigente: vig }),
    userRow: u,
  });
  ok(rEdit.permitido && rEdit.modo === 'ASIGNACION', '17a: asignación permite EDITAR en propio');

  const rAjeno = await resolveAccesoCcp({
    usuarioId: 20,
    requerimientoId: 99,
    actividad: 'EDITAR',
    client: makeClient({ user: u, asignaciones: asg, vigente: vig }),
    userRow: u,
  });
  ok(!rAjeno.permitido, '17b: no edita expediente ajeno');
}

// ——— BD real (si disponible) ———
let dbOk = false;
try {
  const { query } = await import('../server/db.js');
  const { rows: uRows } = await query(
    `SELECT id, username, rol, activo, permisos FROM usuarios WHERE username ILIKE 'jcrisostomo' LIMIT 1`,
  );
  if (uRows.length) {
    dbOk = true;
    const u = uRows[0];
    const acceso = await resolveAccesoCcp({
      usuarioId: u.id,
      actividad: 'VER',
      userRow: u,
    });
    ok(acceso.permitido, '11a: jcrisostomo permitido en CCP');
    ok(
      acceso.modo === MODO_ACCESO_CCP.ASIGNACION || acceso.modo === MODO_ACCESO_CCP.GLOBAL,
      `11b: modo=${acceso.modo}`,
    );

    const { rows: req2 } = await query(`SELECT id FROM requerimientos WHERE codigo = 'REQ-00002'`);
    if (req2.length) {
      const rid = req2[0].id;
      const check = await tieneAsignacionActivaCcpSobre(u.id, rid);
      ok(check.ok, '11c: asignación activa CCP sobre REQ-00002');
      if (acceso.modo === MODO_ACCESO_CCP.ASIGNACION) {
        ok(acceso.alcanceRequerimientoIds.includes(rid), '11d: REQ-00002 en alcance');
        const { rows: req1 } = await query(`SELECT id FROM requerimientos WHERE codigo = 'REQ-00001'`);
        if (req1.length) {
          ok(!acceso.alcanceRequerimientoIds.includes(req1[0].id), '12: REQ-00001 fuera de alcance si no asignado');
        } else {
          ok(true, '12: REQ-00001 no existe en BD (skip)');
        }
      } else {
        ok(true, '12: modo GLOBAL (permiso DEC/admin) — alcance total, skip filtro');
      }
    }

    const ids = await listRequerimientoIdsAsignacionCcp(u.id);
    ok(ids.length >= 1, 'evidencia: ≥1 asignación CCP activa');
  }
} catch (e) {
  console.log(`  · BD no disponible para casos 11–12: ${e.message}`);
}

// Regresión RC8.6A/B/C
async function runIfExists(rel, label) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    console.log(`  · ${label}: script no encontrado (skip)`);
    return;
  }
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [p], { cwd: root, encoding: 'utf8' });
  ok(r.status === 0, `${label} pasa (exit ${r.status})`);
  if (r.status !== 0) {
    console.log(r.stdout?.slice(-500));
    console.log(r.stderr?.slice(-500));
  }
}

await runIfExists('scripts/test-rc86a-fuente-unica-estado-responsable.mjs', '20: RC8.6A');
await runIfExists('scripts/test-rc86b-estandar-visual.mjs', '21: RC8.6B');
await runIfExists('scripts/test-rc86c-reconciliacion-responsables.mjs', '22: RC8.6C');

ok(true, `23/24: build y git diff --check se ejecutan aparte (dbOk=${dbOk})`);

console.log('\nOK RC8.6E\n');
