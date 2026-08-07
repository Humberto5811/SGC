/**
 * RC8.10 / Obs48 — Prohibición de override del contrato canónico.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import { getEstadoResponsableCanonico } from '../server/lib/estadoResponsableCanonico.js';
import { listarBandejaCcp } from '../server/lib/ccpCertificacion.js';
import { listarBandejaOrdenes } from '../server/lib/ordenesContratacion.js';
import { listarCuadroComparativoExpedientes } from '../server/lib/cuadroComparativo.js';
import { listarValidacionesExpedientes } from '../server/lib/validacionesCotizacion.js';
import { adaptEstadoResponsable } from '../src/ui/workflow/adaptEstadoResponsable.js';
import { renderEstadoBadgeHtml, renderEstadoBadgeFromRow } from '../src/ui/workflow/EstadoBadge.js';
import {
  buildEstadoVisual,
  renderEstadoVisualHtml,
  hasObservacionActiva,
} from '../src/utils/estadoVisualPresenter.js';
import { consolidarExpedientesValidacion } from '../src/utils/validacionesUtils.js';
import { renderBadgeEstadoCuadroHtml } from '../src/utils/cuadroComparativoUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

function pickContrato(erv) {
  if (!erv) return null;
  return {
    estadoCodigo: erv.estadoCodigo ?? erv.estado_codigo ?? null,
    estadoLabel: erv.estadoLabel ?? erv.estado_label ?? null,
    estadoCategoria: erv.estadoCategoria ?? erv.estado_categoria ?? erv.categoria ?? null,
    etapaCodigo: erv.etapaCodigo ?? erv.etapa_codigo ?? null,
    etapaLabel: erv.etapaLabel ?? erv.etapa_label ?? null,
    responsableTipo: erv.responsableTipo ?? erv.responsable_tipo ?? null,
    responsableUsuarioId: erv.responsableUsuarioId ?? erv.responsable_usuario_id ?? null,
    responsableNombre: erv.responsableNombre ?? erv.responsable_nombre ?? null,
    responsableUnidad: erv.responsableUnidad ?? erv.responsable_unidad ?? null,
  };
}

function deepEqualContrato(a, b) {
  const A = pickContrato(a);
  const B = pickContrato(b);
  if (!A || !B) return false;
  return Object.keys(A).every((k) => String(A[k] ?? '') === String(B[k] ?? ''));
}

console.log('\n=== RC8.10 No override contrato canónico ===\n');

// ── Override prohibition with conflicting signals ──
{
  const row = {
    id: 1,
    codigo: 'REQ-TEST',
    observado: true,
    observacion: true,
    codigo_ccp: '999',
    ccp_activo: true,
    estado_ccp: 'CCP_REGISTRADO',
    validacion_estado: 'OBSERVADO',
    workflowSnapshot: { etapaActual: 'EVALUACION', revisionEstado: 'OBSERVADO' },
    payload: {
      observaciones: [{
        id: 'obs-old',
        estado: 'CERRADA',
        cerrada: true,
        texto: 'subsanada',
        destino_submodulo: 'Registro de Requerimiento',
      }],
    },
    estado_responsable_vigente: {
      estadoCodigo: 'BIEN_RECIBIDO_ALMACEN',
      estadoLabel: 'Recibido por almacén',
      estadoCategoria: 'COMPLETADO',
      etapaCodigo: 'RECEPCION_BIENES',
      etapaLabel: 'Recepción de Bienes',
      responsableTipo: 'UNIDAD',
      responsableUsuarioId: null,
      responsableNombre: null,
      responsableUnidad: 'Almacén',
      canonicalMissing: false,
    },
  };

  const adapted = adaptEstadoResponsable(row);
  ok(adapted.estadoCodigo === 'BIEN_RECIBIDO_ALMACEN', 'override: estadoCodigo intacto');
  ok(/almac[eé]n/i.test(adapted.estadoLabel || ''), 'override: estadoLabel Recibido por almacén');
  ok(adapted.etapaCodigo === 'RECEPCION_BIENES', 'override: etapa RECEPCION_BIENES');
  ok(adapted.responsableUnidad === 'Almacén', 'override: responsable Almacén');
  ok(adapted.categoria === 'COMPLETADO' || adapted.estadoCategoria === 'COMPLETADO'
    || /COMPLETADO/i.test(String(adapted.categoria || '')),
  'override: categoría COMPLETADO');

  const html = renderEstadoVisualHtml(row);
  ok(/Recibido por almac[eé]n|BIEN_RECIBIDO/i.test(html), 'badge HTML canónico');
  ok(!/sgc-estado-badge--observed/.test(html) || /data-categoria="COMPLETADO"/.test(html),
    'badge no pinta OBSERVADO por señales auxiliares');
  ok(!/>Observado</.test(html), 'sin chip Observado sobre contrato COMPLETADO');

  const badgeForced = renderEstadoBadgeHtml(adapted, { observed: true });
  ok(/data-categoria="COMPLETADO"/.test(badgeForced), 'EstadoBadge ignora opts.observed para categoría');
  ok(!/sgc-estado-badge--observed/.test(badgeForced), 'EstadoBadge no añade suffix observado');

  ok(hasObservacionActiva(row) === false, 'obs cerrada/subsanada → hasObservacionActiva false');
  const visual = buildEstadoVisual(row);
  ok(visual.contratoCanonico?.estadoCodigo === 'BIEN_RECIBIDO_ALMACEN', 'buildEstadoVisual no pisa contrato');
  ok(visual.textoPrincipal === adapted.estadoLabel, 'textoPrincipal = label canónico');
}

// ── Código fuente: CCP sin texto auxiliar ──
{
  const ccpView = read('src/views/contratacion/ccpView.js');
  ok(!/Trámite CCP concluido/.test(ccpView), 'CCP sin texto "Trámite CCP concluido"');
  ok(/renderEstadoBadgeFromRow/.test(ccpView), 'CCP usa EstadoBadge');
  const badgeSrc = read('src/ui/workflow/EstadoBadge.js');
  ok(!/opts\.observed \? 'OBSERVADO'/.test(badgeSrc), 'EstadoBadge no fuerza OBSERVADO por observed');
}

// ── REQ-00001 contratos entre fuentes ──
const { rows: reqs } = await query(`
  SELECT id, codigo FROM requerimientos WHERE codigo IN ('REQ-00001','REQ-00002')
`);
const byCode = Object.fromEntries(reqs.map((r) => [r.codigo, Number(r.id)]));
ok(!!byCode['REQ-00001'], 'fixture REQ-00001');

const canonMap = await getEstadoResponsableCanonico({
  requerimientoIds: [byCode['REQ-00001'], byCode['REQ-00002']].filter(Boolean),
});
const can1 = canonMap.get(byCode['REQ-00001']);
ok(can1?.estadoCodigo === 'BIEN_RECIBIDO_ALMACEN', 'canónico REQ-00001 BIEN_RECIBIDO_ALMACEN');
ok(can1?.etapaCodigo === 'RECEPCION_BIENES', 'canónico etapa RECEPCION_BIENES');
ok(can1?.responsableUnidad === 'Almacén' || /[Aa]lmac/.test(String(can1?.responsableUnidad || '')),
  'canónico responsable Almacén');

const ccp = await listarBandejaCcp();
const ro = await listarBandejaOrdenes();
const ccp1 = ccp.find((x) => x.requerimiento_codigo === 'REQ-00001');
const ro1 = ro.find((x) => x.requerimiento_codigo === 'REQ-00001');
if (ccp1) {
  ok(deepEqualContrato(ccp1.estado_responsable_vigente, can1), 'CCP deepEqual canónico REQ-00001');
  ok(!/Trámite CCP concluido/.test(renderEstadoBadgeFromRow(ccp1)), 'CCP render sin copy auxiliar');
}
if (ro1) {
  ok(deepEqualContrato(ro1.estado_responsable_vigente, can1), 'RO deepEqual canónico REQ-00001');
}

const cuadro = await listarCuadroComparativoExpedientes();
ok(!cuadro.some((x) => /locac/i.test(String(x.tipo_raw || x.tipo || ''))
  && String(x.requerimientos?.map?.((q) => q.codigo).join(',') || x.requerimientos_texto || '')
    .includes('REQ-00002')),
'LOCACION REQ-00002 no en Cuadro');

const cuadro1 = cuadro.find((x) => Number(x.requerimiento_id) === byCode['REQ-00001']
  || (x.requerimientos || []).some((q) => Number(q.id) === byCode['REQ-00001'])
  || String(x.requerimientos_texto || '').includes('REQ-00001'));
if (cuadro1) {
  ok(!!cuadro1.estado_responsable_vigente
    && cuadro1.estado_responsable_vigente.canonicalMissing !== true,
  'Cuadro tiene ERV para REQ-00001');
  ok(deepEqualContrato(cuadro1.estado_responsable_vigente, can1), 'Cuadro deepEqual canónico');
  const htmlC = renderBadgeEstadoCuadroHtml(cuadro1, '', (s) => String(s ?? ''));
  ok(/almac[eé]n|Recibido/i.test(htmlC), 'Cuadro badge muestra Recibido por almacén');
  ok(!/Estado no disponible/i.test(htmlC), 'Cuadro sin Estado no disponible');
} else {
  ok(true, 'Cuadro: REQ-00001 no listado (histórico fuera de elegibles) — skip visual');
}

const { rows: adminRows } = await query(
  `SELECT id, username, rol, permisos FROM usuarios WHERE LOWER(username)='admin' LIMIT 1`,
);
let valRows = [];
try {
  valRows = await listarValidacionesExpedientes(
    adminRows[0]?.username || 'admin',
    adminRows[0]?.id,
    { esAdmin: true },
  );
} catch (e) {
  ok(false, `Validaciones list error: ${e.message}`);
}
ok(!valRows.some((x) => /locac/i.test(String(x.tipo_contratacion || x.solicitud_tipo || ''))),
  'LOCACION no en Validaciones');

const valWithReq = valRows.filter((x) => Number(x.requerimiento_id) === byCode['REQ-00001']
  || String(x.requerimientos || x.requerimientos_texto || '').includes('REQ-00001'));
if (valWithReq.length) {
  ok(valWithReq.every((x) => x.estado_responsable_vigente
    && x.estado_responsable_vigente.canonicalMissing !== true),
  'Validaciones cotizaciones tienen ERV');
  const cons = consolidarExpedientesValidacion(valWithReq);
  const exp = cons[0];
  ok(!!exp?.estado_responsable_vigente, 'Validaciones consolidado conserva ERV');
  ok(deepEqualContrato(exp.estado_responsable_vigente, can1), 'Validaciones deepEqual canónico');
  ok(!/Estado no disponible/i.test(JSON.stringify(exp.estado_responsable_vigente)),
    'Validaciones sin Estado no disponible');
} else {
  ok(true, 'Validaciones: REQ-00001 no listado actualmente — skip');
}

// ── Multiusuario: canónico idéntico ──
{
  const again = await getEstadoResponsableCanonico({ requerimientoIds: [byCode['REQ-00001']] });
  ok(deepEqualContrato(again.get(byCode['REQ-00001']), can1), 'mismo contrato en lecturas repetidas');
}

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===\n`);
if (failed > 0) process.exit(1);
assert.ok(passed >= 15);
console.log('RC8.10 PASS');
