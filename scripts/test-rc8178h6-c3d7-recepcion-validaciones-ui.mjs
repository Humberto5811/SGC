/**
 * RC8.17.8H6-C3-D7 / D7.1 — Compactación PT + responsable + assert derivación.
 *
 *   node scripts/test-rc8178h6-c3d7-recepcion-validaciones-ui.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderPropuestaTecnicaRecepcion,
  getRtmColumnasRecepcion,
  RC_PROPUESTA_TABLE_WRAP,
  RC_PROPUESTA_TABLE_CLASS,
} from '../src/utils/recepcionPropuestaRows.js';
import { buildRecepcionMatrizContract } from '../shared/recepcionCotizacionMatriz.js';
import {
  listarCandidatosTransicion,
  assertUsuarioDestinoTransicionElegible,
} from '../server/lib/workflowTransicionResponsable.js';
import { resolverCentroDesdeRequerimiento } from '../server/lib/recepcionBienesAlcance.js';
import { query, getClient } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

console.log('\n=== RC8.17.8H6-C3-D7 ===\n');

{
  const rowsSrc = read('src/utils/recepcionPropuestaRows.js');
  ok(rowsSrc.includes('rc-doc-ver') && rowsSrc.includes('rc-doc-dl'), 'A. renderRtmCell conserva clases funcionales');
  ok(rowsSrc.includes('data-cot-id') && rowsSrc.includes('data-ref'), 'A. conserva data-*');
  ok(rowsSrc.includes('rc-propuesta-doc-actions') && rowsSrc.includes('bi-eye') && rowsSrc.includes('bi-download'),
    'A. iconos compactos');
  ok(rowsSrc.includes('text-danger rc-doc-dl'), 'D7.1 descarga text-danger');
  ok(rowsSrc.includes('aria-label="Ver documento"') && rowsSrc.includes('aria-label="Descargar documento"'),
    'A. accesibilidad');
}

{
  const css = read('src/styles/recepcion-cotizacion-detalle.css');
  ok(css.includes('.rc-propuesta-doc-actions .btn') && css.includes('background: transparent'), 'D7.1 override btn global');
  ok(css.includes('min-width: 92px') && css.includes('word-break: normal'), 'D7.1 RTM col wrap moderado');
}

{
  const valSrc = read('server/lib/validacionesCotizacion.js');
  ok(
    /assertUsuarioDestinoTransicionElegible\(\s*\n\s*rid,\s*\n\s*'COTIZACIONES_DERIVADAS_VALIDACION',\s*\n\s*responsableId,\s*\n\s*null,\s*\n\s*\)/.test(valSrc),
    'D7.1 derivar assert usa null (requerimiento completo vía loadReqRow)',
  );
  ok(!valSrc.includes("estado_actual: 'RECEPCION_COTIZACIONES' }"), 'D7.1 sin stub RECEPCION en derivar');
}

console.log('\n— D7.1 regresión stub vs null (fixture transaccional REQ-D71-*, ROLLBACK) —');
{
  const ev = 'COTIZACIONES_DERIVADAS_VALIDACION';
  const stubDerivar = (rid, tipo) => ({ id: rid, tipo, estado_actual: 'RECEPCION_COTIZACIONES' });
  let stubSinCentro = false;
  try {
    resolverCentroDesdeRequerimiento(stubDerivar(1, 'Bienes'));
  } catch (e) {
    stubSinCentro = e.code === 'CENTRO_NO_RESUELTO';
  }
  ok(stubSinCentro, 'D7.1 stub derivar no resuelve centro (PRE-D7.1)');

  await runMigrations();
  const pgClient = await getClient();
  try {
    await pgClient.query('BEGIN');
    const { rows: wRows } = await pgClient.query(
      `SELECT id FROM usuarios WHERE LOWER(username)='wvasquez' AND activo = TRUE LIMIT 1`,
    );
    ok(!!wRows[0], 'D7.1 wvasquez activo en BD fixture');
    const wvId = wRows[0].id;
    const codigo = `REQ-D71-${Date.now()}`;
    const payload = JSON.stringify({ area: { responsable: 'CNCC' } });
    const ins = await pgClient.query(`
      INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
      VALUES ('bienes', $1, 'Test D7.1 assert', 'CNCC', 'CNCC', 'En tramite', $2::jsonb, 'RECEPCION_COTIZACIONES')
      RETURNING id, tipo
    `, [codigo, payload]);
    const rid = ins.rows[0].id;
    const reqTipo = ins.rows[0].tipo || 'bienes';
    await pgClient.query(`
      INSERT INTO expediente_estado_vigente (
        requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
        responsable_tipo, responsable_usuario_id, version, actualizado_at
      ) VALUES ($1, 'RECEPCION_COTIZACIONES', 'Recepción de cotizaciones', 'EN_TRAMITE', 'En trámite',
        'PERSONA', $2, 1, NOW())
    `, [rid, wvId]);

    const listaGet = await listarCandidatosTransicion(rid, ev, {}, null, pgClient);
    const pickGet = listaGet.recomendado || listaGet.candidatos?.[0] || null;
    ok(pickGet?.id === wvId, 'GET(null) recomienda wvasquez (centro CNCC + VALIDACIONES)');
    ok(!!listaGet.centro?.codigo, 'GET(null) resuelve centro');

    const stub = stubDerivar(rid, reqTipo);
    const listaStub = await listarCandidatosTransicion(rid, ev, {}, stub, pgClient);
    const poolStub = [...(listaStub.recomendado ? [listaStub.recomendado] : []), ...(listaStub.candidatos || [])];
    ok(poolStub.length === 0, 'GET(stub derivar) pool vacío — regresión PRE-D7.1');

    await assertUsuarioDestinoTransicionElegible(rid, ev, wvId, null, pgClient);
    ok(true, 'assert(null) acepta wvasquez igual que GET');
    let stubAssertFail = false;
    try {
      await assertUsuarioDestinoTransicionElegible(rid, ev, wvId, stub, pgClient);
    } catch (e) {
      stubAssertFail = e.code === 'RESPONSABLE_TRANSICION_INVALIDO';
    }
    ok(stubAssertFail, 'assert(stub derivar) rechaza wvasquez — fallaba PRE-D7.1');
    let rej = false;
    try {
      await assertUsuarioDestinoTransicionElegible(rid, ev, 999999994, null, pgClient);
    } catch (e) { rej = e.code === 'RESPONSABLE_TRANSICION_INVALIDO'; }
    ok(rej, 'assert(null) no elegible sigue RESPONSABLE_TRANSICION_INVALIDO');
    ok(
      read('src/utils/derivarValidacionModal.js').includes('usuario_destino_id: seleccion.usuario_destino_id'),
      'payload D7 derivar sin cambios',
    );
  } finally {
    try { await pgClient.query('ROLLBACK'); } catch (_) { /* noop */ }
    pgClient.release();
  }
}

{
  const html = renderPropuestaTecnicaRecepcion({
    id: 1,
    tipo: 'Bienes',
    recepcion_matriz: {
      contrato_rtm_por_item: true,
      requisitos_tecnicos_config: [
        { requisito: 'A', req_key: 'a' },
        { requisito: 'B', req_key: 'b' },
      ],
      items: [{ item_key: '1-0', descripcion: 'X' }],
    },
  }, esc);
  ok(html.includes(RC_PROPUESTA_TABLE_WRAP) && html.includes('overflow-x:auto'), 'B. overflow horizontal');
  ok(html.includes(RC_PROPUESTA_TABLE_CLASS), 'B. clase matriz');
}

{
  const modalSrc = read('src/utils/derivarValidacionModal.js');
  ok(modalSrc.includes('wireTransicionPicker'), 'C. wireTransicionPicker');
  ok(modalSrc.includes('COTIZACIONES_DERIVADAS_VALIDACION'), 'C. evento');
  ok(!modalSrc.includes('showWorkflowTransicionModal'), 'F. sin segundo modal');
  ok(!modalSrc.includes('listValidacionUsuarios'), 'C. sin validaciones/usuarios');
}

ok(read('src/styles.css').includes('recepcion-cotizacion-detalle.css'), ' estilos compactos');

console.log('\n— wvasquez / candidatos (read-only) —');
try {
  const { rows: wRows } = await query(`SELECT id, username, activo, centro FROM usuarios WHERE LOWER(username)='wvasquez' LIMIT 1`);
  const wvasquez = wRows[0];
  const { rows: scRows } = await query(`
    SELECT id, codigo FROM solicitudes_cotizacion WHERE codigo ILIKE '%SC-00001%' ORDER BY id DESC LIMIT 5
  `);
  const sc = scRows.find((r) => /2026-INS/i.test(r.codigo)) || scRows[0];
  if (!sc) {
    console.log('  ⚠ Sin SC-00001 en BD');
  } else {
    const { rows: sr } = await query(
      'SELECT requerimiento_id FROM solicitud_requerimientos WHERE solicitud_id=$1 LIMIT 1',
      [sc.id],
    );
    const rid = sr[0]?.requerimiento_id;
    const { rows: reqRow } = await query('SELECT * FROM requerimientos WHERE id=$1', [rid]);
    const { rows: ervRows } = await query(
      'SELECT etapa_codigo FROM expediente_estado_vigente WHERE requerimiento_id=$1',
      [rid],
    );
    const etapaErv = String(ervRows[0]?.etapa_codigo || reqRow[0]?.estado_actual || '').toUpperCase();
    if (etapaErv !== 'RECEPCION_COTIZACIONES') {
      console.log(`  ⚠ ERV/legacy etapa=${etapaErv} (se requiere RECEPCION_COTIZACIONES para listar candidatos)`);
      console.log(`  wvasquez en BD: ${wvasquez ? `sí (id ${wvasquez.id}, centro ${wvasquez.centro})` : 'no'}`);
      console.log('  Informe candidatos: omitido (expediente no en Recepción de Cotizaciones)');
    } else {
      const lista = await listarCandidatosTransicion(rid, 'COTIZACIONES_DERIVADAS_VALIDACION', {}, reqRow[0]);
    const todos = [...(lista.recomendado ? [lista.recomendado] : []), ...(lista.candidatos || [])];
    const wvHit = wvasquez && todos.some((c) => Number(c.id) === Number(wvasquez.id));
    console.log(`  SC: ${sc.codigo} | candidatos: ${todos.length} | recomendado: ${lista.recomendado?.username || '—'}`);
    console.log(`  wvasquez aparece: ${!!wvHit} | es recomendado: ${lista.recomendado && wvasquez && Number(lista.recomendado.id) === Number(wvasquez.id)}`);
    if (todos[0]) {
      await assertUsuarioDestinoTransicionElegible(rid, 'COTIZACIONES_DERIVADAS_VALIDACION', todos[0].id, reqRow[0]);
      ok(true, 'E. candidato elegible OK');
    }
    let rej = false;
    try {
      await assertUsuarioDestinoTransicionElegible(rid, 'COTIZACIONES_DERIVADAS_VALIDACION', 999999991, reqRow[0]);
    } catch (e) { rej = e.code === 'RESPONSABLE_TRANSICION_INVALIDO'; }
    ok(rej, 'E. no elegible rechazado');
    }
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}

console.log('\nC3-D7 / D7.1 OK\n');
