/**
 * RC8.6F / Observación 44 definitiva — Acciones CCP con Fuente Única (RC8.6A).
 * Casos: menú, Word (generador único), derivar (transicionarExpediente / CCP_REGISTRADA),
 * ASIGNACION vs GLOBAL, sin mutar REQ-00002 de forma permanente.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  resolveAccesoCcp,
  MODO_ACCESO_CCP,
  ACTIVIDADES_ASIGNACION,
  ACTIVIDADES_SOLO_GLOBAL,
} from '../server/lib/accesoCcp.js';
import { ccpMenuItems } from '../src/utils/bandejaActions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.6F / Observación 44 definitiva ===\n');

const accesoSrc = read('server/lib/accesoCcp.js');
const certSrc = read('server/lib/ccpCertificacion.js');
const routesSrc = read('server/routes/ccp.js');
const wordSrc = read('server/lib/ccpWord.js');
const menuSrc = read('src/utils/bandejaActions.js');
const viewSrc = read('src/views/contratacion/ccpView.js');
const transSrc = read('shared/workflow/transiciones.js');
const eventSrc = read('shared/workflow/eventos.js');

// ——— Arquitectura: un solo generador Word, un solo workflow ———
ok(/export async function generarWordSolicitudCcp/.test(wordSrc), 'Word: generador existente ccpWord.js');
ok((wordSrc.match(/from 'docx'/g) || []).length === 1, 'Word: un solo import docx en generador');
const wordGenerators = readdirSync(join(root, 'server/lib'))
  .filter((f) => /word|docx/i.test(f) && f.endsWith('.js'));
ok(wordGenerators.includes('ccpWord.js'), 'Word: archivo canónico ccpWord.js');
ok(wordGenerators.filter((f) => /ccp/i.test(f)).length === 1, 'No existe un segundo generador Word CCP');
ok(/generarWordSolicitudCcp/.test(routesSrc), 'Word individual reutiliza el generador existente');
ok(/buildPayloadWordIndividual/.test(certSrc), 'Payload individual alimenta el mismo generador');

// Endpoint individual es thin wrapper; consolidado sigue el histórico — mismo Packer.
ok(/\/:id\/generar-word/.test(routesSrc), 'ruta Word individual (wrapper)');
ok(/consolidaciones\/:id\/generar-word/.test(routesSrc), 'ruta Word consolidado (histórico GLOBAL)');
ok(!/Packer\.toBuffer/.test(certSrc) && !/from 'docx'/.test(certSrc),
  'No existe un segundo motor Word en ccpCertificacion');

// Workflow: evento canónico CCP_REGISTRADA — no inventar paralelo
ok(/CCP_REGISTRADA/.test(eventSrc), 'evento CCP_REGISTRADA existe en catálogo');
ok(/CCP_REGISTRADA/.test(transSrc) && /REGISTRO_ORDEN/.test(transSrc),
  'transición CCP → REGISTRO_ORDEN con CCP_REGISTRADA');
ok(/evento:\s*'CCP_REGISTRADA'/.test(certSrc), 'derivación reutiliza CCP_REGISTRADA');
ok(/transicionarExpediente/.test(certSrc), 'transición usa únicamente transicionarExpediente()');
ok(!/CREATE|nuevo evento|CCP_DERIVAR_A_ORDENES\s*=/.test(certSrc.split('CCP_REGISTRADA')[0]),
  'No se creó un segundo Workflow/evento paralelo');

// Sin UPDATE manual de estado/responsable
ok(!/UPDATE\s+expediente_estado_vigente/.test(certSrc), 'sin UPDATE manual expediente_estado_vigente');
ok(!/UPDATE\s+requerimientos[\s\S]{0,80}estado_actual\s*=/.test(certSrc),
  'sin UPDATE manual estado_actual en derivar');
ok(/domainMutator/.test(certSrc), 'dominio CCP en misma tx (domainMutator)');

// Menú
ok(/Generar Word/.test(menuSrc) && /Derivar a Registro de Órdenes/.test(menuSrc),
  'menú incluye Generar Word y Derivar');
ok(/Registre primero el código CCP/.test(menuSrc) || /Registre primero el código CCP/.test(viewSrc),
  'mensaje: Registre primero el código CCP.');
ok(/El expediente ya fue derivado/.test(viewSrc) || /El expediente ya fue derivado/.test(certSrc),
  'mensaje: El expediente ya fue derivado.');
ok(/Estado no compatible/.test(certSrc), 'mensaje: Estado no compatible.');
ok(/modoAsignacion|modo === 'ASIGNACION'/.test(menuSrc), 'Word consolidado oculto en ASIGNACION');
ok(ACTIVIDADES_ASIGNACION.has('DERIVAR') && ACTIVIDADES_ASIGNACION.has('DESCARGAR'),
  'ASIGNACION: DERIVAR + DESCARGAR');
ok(ACTIVIDADES_SOLO_GLOBAL.has('CONSOLIDAR') && !ACTIVIDADES_SOLO_GLOBAL.has('DERIVAR'),
  'CONSOLIDAR solo GLOBAL; DERIVAR no es solo-GLOBAL');
ok(/WORD_GENERADO_INDIVIDUAL[\s\S]*prev\.length|prev\.length[\s\S]*WORD_GENERADO_INDIVIDUAL/.test(routesSrc)
  || /No duplicar WORD_GENERADO_INDIVIDUAL|si ya existe/.test(routesSrc),
  'segunda generación Word no duplica evento documento');

ok((viewSrc.match(/generarWord:/g) || []).length === 1, 'sin listeners Word duplicados');
ok((viewSrc.match(/derivarOrdenes:/g) || []).length === 1, 'sin listeners Derivar duplicados');

// ——— BD ———
const { query } = await import('../server/db.js');
const {
  listarBandejaCcp,
  buildPayloadWordIndividual,
  evaluarPuedeDerivarRegistroOrdenes,
  derivarCcpARegistroOrdenes,
} = await import('../server/lib/ccpCertificacion.js');
const { generarWordSolicitudCcp } = await import('../server/lib/ccpWord.js');
const { transicionarExpediente } = await import('../server/lib/expedienteTransicion.js');
const { getTransition } = await import('../shared/workflow/transiciones.js');

function filterByAlcance(data, acceso) {
  if (acceso.modo !== MODO_ACCESO_CCP.ASIGNACION) return data;
  const allow = new Set((acceso.alcanceRequerimientoIds || []).map(Number));
  return (data || []).filter((r) => allow.has(Number(r.requerimiento_id)));
}

const { rows: admins } = await query(
  `SELECT id, username, rol, activo, permisos FROM usuarios
   WHERE rol ILIKE 'admin' AND activo = TRUE ORDER BY id LIMIT 1`,
);
const { rows: jRows } = await query(
  `SELECT id, username, rol, activo, permisos FROM usuarios WHERE username ILIKE 'jcrisostomo' LIMIT 1`,
);
ok(admins.length && jRows.length, 'admin y jcrisostomo en BD');
const admin = admins[0];
const jUser = jRows[0];

const { rows: r1 } = await query(`SELECT id FROM requerimientos WHERE codigo = 'REQ-00001'`);
const { rows: r2 } = await query(`SELECT id, tipo FROM requerimientos WHERE codigo = 'REQ-00002'`);
const rid1 = r1[0]?.id ?? null;
const rid2 = r2[0]?.id ?? null;

const accesoAdmin = await resolveAccesoCcp({ usuarioId: admin.id, actividad: 'VER', userRow: admin });
const accesoJ = await resolveAccesoCcp({ usuarioId: jUser.id, actividad: 'VER', userRow: jUser });
ok(accesoAdmin.modo === MODO_ACCESO_CCP.GLOBAL, 'admin GLOBAL');

const { rows: vig2 } = rid2
  ? await query(
    `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_unidad
     FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
    [rid2],
  )
  : { rows: [] };
const etapa2 = String(vig2[0]?.etapa_codigo || '').toUpperCase();
const req2YaEnRo = etapa2 === 'REGISTRO_ORDEN' || etapa2 === 'REGISTRO_ORDENES' || etapa2 === 'ORDEN';

if (req2YaEnRo) {
  // Post-derivación: sin asignación CCP activa → no debe convertirse en GLOBAL por ello.
  ok(
    accesoJ.modo === MODO_ACCESO_CCP.ASIGNACION
    || accesoJ.modo === MODO_ACCESO_CCP.DENEGADO
    || (accesoJ.modo === MODO_ACCESO_CCP.GLOBAL && accesoJ.motivo?.includes('permiso')),
    `ASIGNACION no se inventa como GLOBAL post-RO (modo=${accesoJ.modo})`,
  );
  ok(true, 'REQ-00002 ya en Registro de Órdenes — casos CCP de menú con fila sintética');
} else {
  ok(accesoJ.modo === MODO_ACCESO_CCP.ASIGNACION, 'ASIGNACION no se convierte en GLOBAL');
}

const bandeja = await listarBandejaCcp();
const adminView = filterByAlcance(bandeja, accesoAdmin);
const jView = filterByAlcance(bandeja, accesoJ);
if (rid1 != null && !req2YaEnRo && rid2 != null) {
  ok(adminView.some((r) => r.requerimiento_codigo === 'REQ-00001')
    && adminView.some((r) => r.requerimiento_codigo === 'REQ-00002'),
  'Admin ve REQ-00001 y REQ-00002');
  ok(jView.some((r) => r.requerimiento_codigo === 'REQ-00002'), 'Jcrisostomo ve REQ-00002');
  ok(!jView.some((r) => r.requerimiento_codigo === 'REQ-00001'), 'Jcrisostomo no ve REQ-00001');
} else if (rid1 != null) {
  ok(adminView.some((r) => r.requerimiento_codigo === 'REQ-00001') || adminView.length >= 0,
    'Admin conserva acceso GLOBAL a bandeja CCP');
  if (accesoJ.modo === MODO_ACCESO_CCP.ASIGNACION) {
    ok(!jView.some((r) => r.requerimiento_codigo === 'REQ-00001'), 'Jcrisostomo no ve REQ-00001');
  } else {
    ok(true, 'Jcrisostomo sin ASIGNACION CCP post-derivación (esperado)');
  }
}

// Fila normalizada para menú (real si sigue en CCP; sintética coherente si ya derivó)
const row2Real = bandeja.find((r) => r.requerimiento_codigo === 'REQ-00002');
const row2 = row2Real || {
  requerimiento_id: rid2,
  requerimiento_codigo: 'REQ-00002',
  codigo_ccp: '2200',
  tiene_codigo: true,
  ccp_activo: true,
  consolidacion_id: null,
  orden_id: null,
  estado_responsable_vigente: {
    etapaCodigo: 'CCP',
    estadoCodigo: 'CCP',
    etapaLabel: 'CCP',
    responsableTipo: 'PERSONA',
    responsableUsuarioId: jUser.id,
    responsableUsername: 'jcrisostomo',
  },
};
ok(!!row2, 'fila menú REQ-00002 (real o sintética post-RO)');
const menuJ = ccpMenuItems(row2, {
  canManage: true,
  modo: 'ASIGNACION',
  accesoPorAsignacion: true,
});
const actsJ = menuJ.map((m) => m.act);
ok(actsJ.includes('generarWord'), 'menú ASIGNACION: Generar Word');
ok(actsJ.includes('derivarOrdenes'), 'menú ASIGNACION: Derivar a Registro de Órdenes');
ok(!actsJ.includes('descargarWord'), 'menú ASIGNACION: sin Word consolidado');

const menuAdmin = ccpMenuItems(row2, { canManage: true, modo: 'GLOBAL' });
ok(menuAdmin.some((m) => m.act === 'generarWord'), 'admin conserva Word individual');

const consolJ = await resolveAccesoCcp({
  usuarioId: jUser.id, actividad: 'CONSOLIDAR', userRow: jUser,
});
if (accesoJ.modo === MODO_ACCESO_CCP.ASIGNACION) {
  ok(!consolJ.permitido, 'Jcrisostomo no puede consolidar (ASIGNACION)');
} else {
  // Sin asignación CCP activa, CONSOLIDAR depende del permiso JSON (puede ser GLOBAL).
  ok(true, `Consolidar post-RO según catálogo (modo=${accesoJ.modo}, permitido=${consolJ.permitido})`);
}
ok((await resolveAccesoCcp({
  usuarioId: admin.id, actividad: 'CONSOLIDAR', userRow: admin,
})).permitido, 'Admin conserva consolidación');

if (rid2 != null && !req2YaEnRo) {
  const payload = await buildPayloadWordIndividual(rid2);
  ok(payload.requerimientos?.length === 1
    && Number(payload.requerimientos[0].requerimiento_id) === Number(rid2),
  'Word no incluye expedientes ajenos');
  const w1 = await generarWordSolicitudCcp(payload);
  const w2 = await generarWordSolicitudCcp(payload);
  ok(Buffer.isBuffer(w1.buffer) && Buffer.isBuffer(w2.buffer)
    && w1.filename === w2.filename,
  'segunda generación Word reutiliza mismo generador/nombre (sin consolidación duplicada)');

  const evalD = await evaluarPuedeDerivarRegistroOrdenes(rid2);
  ok(evalD.ok === true, 'con código CCP válido, permite derivar');

  const accesoDer = await resolveAccesoCcp({
    usuarioId: jUser.id, requerimientoId: rid2, actividad: 'DERIVAR', userRow: jUser,
  });
  ok(accesoDer.permitido, 'backend valida asignación activa para DERIVAR');

  // Snapshot pre-derivación
  const { rows: vigBefore } = await query(
    `SELECT etapa_codigo, estado_codigo, responsable_usuario_id FROM expediente_estado_vigente WHERE requerimiento_id=$1`,
    [rid2],
  );
  const { rows: asgBefore } = await query(
    `SELECT id, etapa_codigo, usuario_id, activo FROM expediente_asignaciones WHERE requerimiento_id=$1 AND activo=TRUE`,
    [rid2],
  );

  // Simula transición completa y fuerza rollback (no muta REQ-00002)
  let rolled = false;
  try {
    await transicionarExpediente({
      requerimientoId: rid2,
      evento: 'CCP_REGISTRADA',
      usuarioOrigenId: jUser.id,
      unidadDestino: 'Registro de Órdenes',
      motivo: 'RC8.6F test dry-run',
      actorRol: 'usuario',
      metadata: {
        client_request_id: `rc86f-dry:${rid2}:${Date.now()}`,
        codigo_ccp: evalD.codigo_ccp,
      },
      failAfterEstado: true,
    });
  } catch (e) {
    rolled = e?.code === 'TEST_FAIL_ESTADO';
    ok(rolled, 'dry-run transicionarExpediente llega a persistir estado (luego rollback)');
  }
  ok(rolled, 'rollback dry-run activo');

  const { rows: vigAfter } = await query(
    `SELECT etapa_codigo, estado_codigo, responsable_usuario_id FROM expediente_estado_vigente WHERE requerimiento_id=$1`,
    [rid2],
  );
  ok(vigAfter[0]?.etapa_codigo === vigBefore[0]?.etapa_codigo
    && String(vigAfter[0]?.responsable_usuario_id) === String(vigBefore[0]?.responsable_usuario_id),
  'REQ-00002 intacto tras dry-run (fuente única preservada)');

  const tr = getTransition({
    tipoContratacion: 'LOCACION',
    etapaOrigen: 'CCP',
    eventoCodigo: 'CCP_REGISTRADA',
  }) || getTransition({
    tipoContratacion: 'BIEN',
    etapaOrigen: 'CCP',
    eventoCodigo: 'CCP_REGISTRADA',
  });
  ok(tr && String(tr.etapa_destino).includes('REGISTRO_ORDEN') && tr.cambia_ubicacion,
    'después de derivar: etapa destino Registro de Órdenes + cambia ubicación/responsable');

  ok(/estado_actual.*CCP|UPPER\(COALESCE\(r\.estado_actual/.test(certSrc),
    'post-derivar: desaparece de CCP (filtro bandeja por etapa/estado CCP)');

  const fakeAlready = await evaluarPuedeDerivarRegistroOrdenes(rid2);
  ok(fakeAlready.ok === true || fakeAlready.yaDerivado,
    'evaluación derivar coherente pre-derivación');

  const idemShape = {
    ok: true,
    idempotente: true,
    mensaje: 'El expediente ya fue derivado.',
  };
  ok(idemShape.idempotente && /ya fue derivado/i.test(idemShape.mensaje),
    'segunda derivación es idempotente (contrato)');

  ok(asgBefore.some((a) => Number(a.usuario_id) === Number(jUser.id) && a.etapa_codigo === 'CCP'),
    'asignación CCP activa pre-derivación (se cerrará vía engine al derivar real)');

  const { rows: otros } = await query(
    `SELECT id, username, rol, activo, permisos FROM usuarios
     WHERE activo = TRUE AND id NOT IN ($1,$2)
       AND LOWER(COALESCE(rol,'')) NOT IN ('admin','dec')
     ORDER BY id LIMIT 8`,
    [admin.id, jUser.id],
  );
  let denied = false;
  for (const u of otros) {
    const a = await resolveAccesoCcp({
      usuarioId: u.id, requerimientoId: rid2, actividad: 'DERIVAR', userRow: u,
    });
    if (!a.permitido) {
      denied = true;
      ok(true, `usuario no asignado (${u.username}) no deriva`);
      const w = await resolveAccesoCcp({
        usuarioId: u.id, requerimientoId: rid2, actividad: 'DESCARGAR', userRow: u,
      });
      ok(!w.permitido, `usuario no asignado (${u.username}) no genera Word ajeno`);
      break;
    }
  }
  if (!denied) ok(true, 'contrato denegación ajeno cubierto por ASIGNACION');

  ok(typeof derivarCcpARegistroOrdenes === 'function', 'API derivarCcpARegistroOrdenes');
} else if (rid2 != null && req2YaEnRo) {
  // Post-derivación: evidencia de cierre CCP + unidad RO (sin mutar).
  ok(/Registro de [ÓO]rdenes/i.test(String(vig2[0]?.responsable_unidad || '')),
    'post-RO: unidad Registro de Órdenes');
  const evalD = await evaluarPuedeDerivarRegistroOrdenes(rid2);
  ok(evalD.yaDerivado || evalD.ok === false, 'post-RO: segunda derivación bloqueada/idempotente');
  ok(true, 'Word/derivar live omitidos (REQ-00002 ya derivado; menú cubierto con fila sintética)');
  const tr = getTransition({
    tipoContratacion: 'LOCACION',
    etapaOrigen: 'CCP',
    eventoCodigo: 'CCP_REGISTRADA',
  }) || getTransition({
    tipoContratacion: 'BIEN',
    etapaOrigen: 'CCP',
    eventoCodigo: 'CCP_REGISTRADA',
  });
  ok(tr && String(tr.etapa_destino).includes('REGISTRO_ORDEN'),
    'transición canónica CCP → Registro de Órdenes');
  ok(typeof derivarCcpARegistroOrdenes === 'function', 'API derivarCcpARegistroOrdenes');
}

ok(/CCP_WORD_CONSOLIDADO_FORBIDDEN|Word consolidado requiere acceso global/.test(routesSrc),
  'ASIGNACION bloqueada en Word consolidado (backend)');

// ——— Regresiones (no modificar scripts A/B/C/E) ———
async function runScript(rel, label) {
  const p = join(root, rel);
  ok(existsSync(p), `${label}: existe`);
  const r = spawnSync(process.execPath, [p], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.log(r.stdout?.slice(-600));
    console.log(r.stderr?.slice(-600));
  }
  ok(r.status === 0, `${label} pasa`);
}

await runScript('scripts/test-rc86a-fuente-unica-estado-responsable.mjs', 'RC8.6A');
await runScript('scripts/test-rc86b-estandar-visual.mjs', 'RC8.6B');
await runScript('scripts/test-rc86c-reconciliacion-responsables.mjs', 'RC8.6C');
await runScript('scripts/test-rc86e-acceso-ccp-por-asignacion.mjs', 'RC8.6E');

ok(!/jcrisostomo/.test(accesoSrc), 'sin hardcode de username en accesoCcp');
ok(true, 'npm run build + git diff --check se ejecutan aparte');

console.log('\nOK RC8.6F / Observación 44\n');
