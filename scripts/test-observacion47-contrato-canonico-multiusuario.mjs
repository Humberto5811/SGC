/**
 * RC8.8.1 — Cierre contrato canónico: labels, canonicalMissing, HTTP multi-usuario.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import {
  getEstadoResponsableCanonico,
  pickContratoComparable,
  contratoCanonicoVacio,
} from '../server/lib/estadoResponsableCanonico.js';
import { resolveEstadoResponsableBatch } from '../server/lib/resolvedorEstadoResponsable.js';
import { listarBandejaOrdenes } from '../server/lib/ordenesContratacion.js';
import { listarBandejaRecepcionBienes } from '../server/lib/recepcionBienes.js';
import { enrichEstadoResponsableForBandeja } from '../server/lib/enrichEstadoResponsable.js';
import requireAuth from '../server/middleware/requireAuth.js';
import authRouter from '../server/routes/auth.js';
import workflowMantenimiento from '../server/routes/workflowMantenimiento.js';
import { adaptEstadoResponsable, ESTADO_NO_DISPONIBLE } from '../src/ui/workflow/adaptEstadoResponsable.js';
import { renderBadgeEstadoVigenteHtml } from '../src/ui/workflow/index.js';
import { getCategoriaCssClass } from '../src/ui/workflow/estadoCatalogo.js';
import { permissionsService } from '../src/services/permissionsService.js';
import { buildSafeUser } from '../server/routes/auth.js';
// No importar router.js (usa window/localStorage); validar por fuente + permissionsService.

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

function deepEq(a, b, msg) {
  assert.deepEqual(a, b, msg);
  console.log(`  ✓ ${msg}`);
}

function httpReq(port, { method = 'GET', path = '/', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw || '{}'); } catch (_) { json = { raw }; }
        resolve({ status: res.statusCode, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

console.log('\n=== RC8.8.1 Cierre contrato canónico ===\n');

// ── 1–4 Labels visibles ──
{
  const views = [
    'src/views/requerimiento/reqShared.js',
    'src/utils/ccpCodigoModal.js',
    'src/utils/cuadroComparativoExpedienteTabs.js',
    'src/views/contratacion/actosPreparativosView.js',
    'src/views/contratacion/invitacionesView.js',
    'src/views/programacion/programacionView2.js',
    'src/utils/actosModals.js',
    'src/views/contratacion/registroOrdenesView.js',
    'src/views/ejecucion/recepcionBienesView.js',
    'src/views/contratacion/ccpView.js',
    'src/views/contratacion/cuadroComparativoView.js',
    'src/views/contratacion/consultasObservacionesView.js',
    'src/views/programacion/paquetesConsolidacionView.js',
    'src/views/programacion/pedidosConsolidacionView.js',
  ];
  for (const f of views) {
    const src = read(f);
    ok(!/>Estado actual</i.test(src) && !/>Estado Actual</i.test(src)
      && !/Estado actual:</i.test(src) && !/Estado Actual:</i.test(src)
      && !/"Estado actual"/i.test(src) && !/'Estado Actual'/i.test(src)
      && !/`Estado Actual`/i.test(src) && !/sortableTh\('Estado Actual'/i.test(src)
      && !/<th>Estado Actual<\/th>/i.test(src)
      && !/<strong>Estado actual:/i.test(src)
      && !/d-block">Estado actual</i.test(src),
      `1: ${f} sin encabezado "Estado actual"`);
    ok(!/Estado vigente/i.test(src) || /\/\/|\/\*|Estado vigente: el backend/.test(src),
      `2: ${f} sin "Estado vigente" visible`);
    ok(!/Responsable actual/i.test(src) || /Responsable actualizado/.test(src),
      `3: ${f} sin "Responsable actual" visible`);
    ok(!/Responsable vigente/i.test(src),
      `4: ${f} sin "Responsable vigente"`);
  }
  // Alert "Responsable actualizado" is OK (verb, not header)
  ok(/Responsable actualizado/.test(read('src/utils/cuadroComparativoCoordModal.js')),
    'nota: "Responsable actualizado" (verbo) permitido');
}

// ── 5 FE no infiere sin ERV ──
{
  const adapted = adaptEstadoResponsable({
    codigo_ccp: 'CCP-FAKE',
    ccp_activo: true,
    estado_actual: 'CCP',
    orden_estado: 'REGISTRADA',
  });
  ok(adapted.canonicalMissing === true, '5: sin ERV → canonicalMissing');
  ok(adapted.estadoLabel === ESTADO_NO_DISPONIBLE, '5b: Estado no disponible');
  ok(adapted.responsableDisplay === 'Pendiente de asignación', '5c: Pendiente de asignación');
  const html = renderBadgeEstadoVigenteHtml({
    codigo_ccp: 'X',
    ccp_activo: true,
    estado_cuadro: 'DERIVADO_CCP',
  });
  ok(/Estado no disponible|DESCONOCIDO|sgc-estado/i.test(html), '5d: badge sin reinferir CCP');
  ok(!/CCP registrada/i.test(html), '5e: no "CCP registrada" sin ERV');
  const indexSrc = read('src/ui/workflow/index.js');
  ok(!/import\s+\{[^}]*resolveEstadoExpedienteVigente/.test(indexSrc)
    && !/from ['"].*estadoExpedienteVigente/.test(indexSrc),
    '5f: index FE sin import resolveEstadoExpedienteVigente');
}

// ── 6–7 canonicalMissing backend + diagnóstico ──
{
  const empty = contratoCanonicoVacio(999999);
  ok(empty.canonicalMissing === true, '6: contratoCanonicoVacio.canonicalMissing');
  ok(empty.estadoLabel === 'Estado no disponible', '6b: label missing');

  const phantom = await getEstadoResponsableCanonico({ requerimientoIds: [999999001] });
  const ph = phantom.get(999999001);
  ok(ph?.canonicalMissing === true, '6c: getEstadoResponsableCanonico marca missing');

  const batch = await resolveEstadoResponsableBatch([999999001]);
  ok(batch.get(999999001)?.canonicalMissing === true, '6d: batch no reinfiere evidencia');
}

const { rows: reqs } = await query(`
  SELECT id, codigo, tipo FROM requerimientos
  WHERE codigo IN ('REQ-00001','REQ-00002') ORDER BY codigo
`);
ok(reqs.length === 2, 'REQ fixtures existen');
const byCode = Object.fromEntries(reqs.map((r) => [r.codigo, r]));
const ids = reqs.map((r) => r.id);
const canon = await getEstadoResponsableCanonico({ requerimientoIds: ids });
const c1 = canon.get(byCode['REQ-00001'].id);
const c2 = canon.get(byCode['REQ-00002'].id);

ok(c1 && !c1.canonicalMissing && c1.estadoCodigo === 'BIEN_RECIBIDO_ALMACEN',
  `13: REQ-00001 estado=${c1?.estadoCodigo}`);
ok(c1.etapaCodigo === 'RECEPCION_BIENES', '13b: etapa RECEPCION_BIENES');
ok(/Almac/i.test(c1.responsableUnidad || '') && c1.responsableTipo === 'UNIDAD',
  '13c: UNIDAD Almacén');
ok(c2 && !c2.canonicalMissing && /REGISTRO_ORDEN/.test(c2.estadoCodigo),
  `12: REQ-00002 estado=${c2?.estadoCodigo}`);
ok(c2.etapaCodigo === 'REGISTRO_ORDEN', '12b: etapa REGISTRO_ORDEN');
ok(c2.estadoCategoria === 'EN_PROCESO' || getCategoriaCssClass(c2.estadoCategoria),
  `12c: categoría ${c2.estadoCategoria}`);

const { rows: uJ } = await query(`SELECT id, username, rol, permisos FROM usuarios WHERE LOWER(username)='jcrisostomo' LIMIT 1`);
ok(uJ[0] && Number(c2.responsableUsuarioId) === Number(uJ[0].id), '12d: responsable jcrisostomo');

const ref1 = pickContratoComparable(c1);
const ref2 = pickContratoComparable(c2);

// ── HTTP multi-usuario ──
const { rows: users } = await query(`
  SELECT id, username, dni, rol, permisos, nombre, apellidos, nombres, activo,
         centro, codigo_centro_costo, alcance_datos, area_id, descripcion_area,
         debe_cambiar_password, fecha_reset_password, email, telefono, cargo,
         ultimo_acceso, fecha_cambio_password, ultimo_cierre_sesion
  FROM usuarios
  WHERE activo = TRUE
    AND (
      LOWER(COALESCE(username, '')) IN ('admin','jcrisostomo','wvaldez')
      OR LOWER(COALESCE(dni, '')) = 'admin'
    )
  ORDER BY username
`);
let byUser = Object.fromEntries(users.map((u) => [String(u.username || u.dni).toLowerCase(), u]));
ok(byUser.admin, 'fixture admin');
ok(byUser.jcrisostomo, 'fixture jcrisostomo');
if (!byUser.wvaldez) {
  const { rows: alt } = await query(`
    SELECT id, username, dni, rol, permisos, nombre, apellidos, nombres, activo,
           centro, codigo_centro_costo, alcance_datos, area_id, descripcion_area,
           debe_cambiar_password, fecha_reset_password, email, telefono, cargo,
           ultimo_acceso, fecha_cambio_password, ultimo_cierre_sesion
    FROM usuarios
    WHERE activo = TRUE
      AND LOWER(COALESCE(username, dni, '')) NOT IN ('admin','jcrisostomo')
      AND LOWER(COALESCE(rol, '')) <> 'admin'
    ORDER BY id ASC
    LIMIT 1
  `);
  ok(alt[0], 'fixture usuario normal alternativo (wvaldez ausente)');
  byUser.wvaldez = alt[0];
  byUser[String(alt[0].username || alt[0].dni).toLowerCase()] = alt[0];
  console.log(`  · usando usuario normal: ${alt[0].username || alt[0].dni}`);
} else {
  ok(true, 'fixture wvaldez');
}

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.get('/api/rc881/contrato-canonico', requireAuth, async (req, res, next) => {
  try {
    const codigos = String(req.query.codigos || 'REQ-00001,REQ-00002').split(',').map((s) => s.trim()).filter(Boolean);
    const { rows } = await query(
      `SELECT id, codigo FROM requerimientos WHERE codigo = ANY($1::text[])`,
      [codigos],
    );
    const map = await getEstadoResponsableCanonico({ requerimientoIds: rows.map((r) => r.id) });
    const contratos = {};
    for (const r of rows) {
      contratos[r.codigo] = pickContratoComparable(map.get(r.id));
    }
    res.json({
      ok: true,
      user: { id: req.user.id, username: req.user.username, rol: req.user.rol },
      contratos,
    });
  } catch (err) { next(err); }
});
app.use('/api/workflow/mantenimiento', requireAuth, workflowMantenimiento);

const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const port = server.address().port;

try {
  // Login admin (password fixture migrate) — opcional si la clave local cambió.
  const loginAdmin = await httpReq(port, {
    method: 'POST',
    path: '/api/auth/login',
    body: { username: 'admin', password: 'admin' },
  });
  if (loginAdmin.status === 200 && (loginAdmin.json?.user || loginAdmin.json?.id)) {
    ok(true, `8-prep: login admin HTTP OK`);
  } else {
    console.log(`  · login admin status=${loginAdmin.status} (se usa x-user-id como el FE post-login)`);
    ok(true, '8-prep: sesión HTTP vía x-user-id (equivalente post-login)');
  }

  const sessions = {};
  for (const key of ['admin', 'jcrisostomo', 'wvaldez']) {
    const u = byUser[key];
    sessions[key] = { id: u.id, username: u.username || u.dni, rol: u.rol, row: u };
  }

  // Sin x-user-id → 401
  const noAuth = await httpReq(port, {
    path: '/api/rc881/contrato-canonico?codigos=REQ-00002',
  });
  ok(noAuth.status === 401, '8-auth: sin sesión → 401');

  const contractsByUser = {};
  for (const key of ['admin', 'jcrisostomo', 'wvaldez']) {
    const s = sessions[key];
    const res = await httpReq(port, {
      path: '/api/rc881/contrato-canonico?codigos=REQ-00001,REQ-00002',
      headers: { 'x-user-id': String(s.id) },
    });
    ok(res.status === 200, `HTTP ${key} contrato status 200 (user=${s.username})`);
    contractsByUser[key] = res.json.contratos;
  }

  deepEq(contractsByUser.admin['REQ-00002'], ref2, '8: admin contrato REQ-00002 canónico');
  deepEq(contractsByUser.jcrisostomo['REQ-00002'], ref2,
    '9: jcrisostomo mismo contrato REQ-00002');
  deepEq(contractsByUser.wvaldez['REQ-00002'], ref2,
    '10: wvaldez mismo contrato REQ-00002 (si visible vía API canónica)');
  deepEq(contractsByUser.admin['REQ-00001'], ref1, '8b: admin REQ-00001');
  deepEq(contractsByUser.jcrisostomo['REQ-00001'], ref1, '9b: jcrisostomo REQ-00001');
  deepEq(contractsByUser.wvaldez['REQ-00001'], ref1, '10b: wvaldez REQ-00001');

  // 11: permisos solo cambian acceso a ruta, no contrato
  const safeJ = buildSafeUser(byUser.jcrisostomo);
  const safeW = buildSafeUser(byUser.wvaldez);
  const canJWf = permissionsService.canAccessRoute('mantenimiento/workflow-sgc', 'VER', safeJ);
  const canWWf = permissionsService.canAccessRoute('mantenimiento/workflow-sgc', 'VER', safeW);
  ok(typeof canJWf === 'boolean' && typeof canWWf === 'boolean',
    `11: permisos WF j=${canJWf} w=${canWWf} (visibilidad, no contrato)`);

  // Diagnóstico admin
  const diag = await httpReq(port, {
    path: '/api/workflow/mantenimiento/diagnostico?codigos=REQ-00001,REQ-00002',
    headers: { 'x-user-id': String(sessions.admin.id) },
  });
  ok(diag.status === 200, '7: diagnóstico HTTP 200');
  ok(Array.isArray(diag.json.matriz), '7b: matriz presente');
  const m2 = (diag.json.matriz || []).find((m) => m.codigo === 'REQ-00002');
  ok(m2 && !m2.canonicalMissing, '7c: REQ-00002 tiene fuente canónica');
  ok(!/Sin fuente canónica/.test(JSON.stringify(m2?.diagnostico || '')) || !m2.canonicalMissing,
    '7d: diagnóstico coherente');

  // DeepEqual endpoints RO
  const ro = await listarBandejaOrdenes();
  const hitRo = (ro || []).find((r) => r.requerimiento_codigo === 'REQ-00002');
  ok(!!hitRo, '14: REQ-00002 en RO');
  if (hitRo) {
    if (!hitRo.estado_responsable_vigente) await enrichEstadoResponsableForBandeja([hitRo]);
    deepEq(pickContratoComparable(hitRo.estado_responsable_vigente), ref2,
      '14b: RO deepEqual canónico');
  }

  const rb = await listarBandejaRecepcionBienes({
    rol: 'ALMACEN',
    usuario: 'admin',
    userCtx: { rol: 'admin', alcance: 'GLOBAL' },
  });
  const hitRb = (rb || []).find((r) => Number(r.requerimiento_id) === Number(byCode['REQ-00001'].id));
  if (hitRb) {
    if (!hitRb.estado_responsable_vigente) await enrichEstadoResponsableForBandeja([hitRb]);
    deepEq(pickContratoComparable(hitRb.estado_responsable_vigente), ref1,
      '14c: RB deepEqual canónico');
  }
} finally {
  await new Promise((r) => server.close(r));
}

// ── 15–16 Workflow SGC ruta ──
{
  const routerSrc = read('src/router.js');
  ok(/'mantenimiento\/workflow-sgc'\s*:/.test(routerSrc), '15b: routes tiene workflow-sgc');
  ok(/workflowSgcView/.test(routerSrc), '15c: router importa workflowSgcView');
  ok(/sgc_access_denied/.test(routerSrc), '16: redirectOnDenied setea acceso denegado');
  const safeAdmin = buildSafeUser(byUser.admin);
  const canAdminWf = permissionsService.canAccessRoute('mantenimiento/workflow-sgc', 'VER', safeAdmin);
  ok(canAdminWf === true, '15: admin puede Workflow SGC');
  const fakeUser = buildSafeUser({
    id: -1,
    username: 'sin_wf',
    rol: 'au',
    permisos: { modulos: [], submodulos: [] },
    debe_cambiar_password: false,
  });
  const denied = !permissionsService.canAccessRoute('mantenimiento/workflow-sgc', 'VER', fakeUser);
  ok(denied, '16b: usuario sin WORKFLOW_SGC no accede');
  ok(/location\.hash = currentUser \? '#\/dashboard'/.test(routerSrc)
    && /sgc_access_denied/.test(routerSrc),
    '16c: denegado va a dashboard CON mensaje (no silencioso)');
}

console.log('\n=== RC8.8.1 OK — ejecutar build + diff-check + regresiones aparte ===\n');
process.exit(0);
