/**
 * OD33 / RC88 — Estado DERIVADO_CCP unificado (texto + morado) en bandejas.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BADGE_COLOR_CCP,
  resolveEstadoActualExpediente,
  badgeVisualEstadoVigente,
  renderBadgeEstadoVigenteHtml,
} from '../shared/estadoExpedienteVigente.js';
import { buildEstadoVisual, renderEstadoVisualHtml } from '../src/utils/estadoVisualPresenter.js';
import {
  renderBadgeEstadoCuadroHtml,
  badgeClassCuadro,
  badgeStyleCuadro,
} from '../src/utils/cuadroComparativoUtils.js';
import {
  estadoExpedienteRecepcion,
  consolidarExpedientesRecepcion,
  renderBadgeEstadoRecepcionHtml,
} from '../src/utils/recepcionCotizacionUtils.js';
import {
  estadoExpedienteValidacion,
  consolidarExpedientesValidacion,
  renderBadgeEstadoValidacionHtml,
} from '../src/utils/validacionesUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC88 / OD33 estado CCP unificado (morado) ===\n');

assert(BADGE_COLOR_CCP === '#6f42c1', 'color CCP = #6f42c1 (Invitaciones)');

const rowCcp = {
  solicitud_estado: 'EN_CCP',
  estado_cuadro: 'DERIVADO_CCP',
  estado: 'DERIVADO_CCP',
  payload: { workflowSnapshot: { etapaActual: 'CCP', revisionEstado: 'DERIVADO_CCP' } },
};

const vigente = resolveEstadoActualExpediente(rowCcp);
assert(vigente.label === 'Derivado a CCP', 'resolve label');
assert(vigente.derivadoCcp === true, 'derivadoCcp');

const visualInv = badgeVisualEstadoVigente(rowCcp);
assert(visualInv.label === 'Derivado a CCP', 'badge visual label');
assert(visualInv.color === '#6f42c1', 'badge visual morado');
assert(/background:#6f42c1/.test(visualInv.style), 'style inline morado');

const htmlInv = renderEstadoVisualHtml(rowCcp);
assert(/Derivado a CCP/.test(htmlInv), 'Invitaciones/presenter: texto');
assert(/#6f42c1/.test(htmlInv), 'Invitaciones/presenter: morado');

const htmlCc = renderBadgeEstadoCuadroHtml(rowCcp, null, (s) => s);
assert(/Derivado a CCP/.test(htmlCc), 'Cuadro Comparativo: texto');
assert(/#6f42c1/.test(htmlCc), 'Cuadro Comparativo: morado');
assert(!/bg-secondary/.test(htmlCc), 'Cuadro Comparativo: no gris');
assert(badgeClassCuadro('DERIVADO_CCP') !== 'secondary', 'badgeClass no secondary');
assert(/#6f42c1/.test(badgeStyleCuadro('DERIVADO_CCP')), 'badgeStyle morado');

const estRec = estadoExpedienteRecepcion(
  [{ validacion_estado: 'APTO', solicitud_estado: 'EN_CCP', estado_cuadro: 'DERIVADO_CCP' }],
  { solicitud_estado: 'EN_CCP', estado_cuadro: 'DERIVADO_CCP' },
);
assert(estRec.label === 'Derivado a CCP', 'Recepción: label DERIVADO_CCP');
assert(estRec.derivado_ccp === true, 'Recepción: flag');
const consRec = consolidarExpedientesRecepcion([{
  solicitud_id: 1,
  solicitud_codigo: 'SC-1',
  validacion_estado: 'APTO',
  solicitud_estado: 'EN_CCP',
  estado_cuadro: 'DERIVADO_CCP',
  derivado_ccp: true,
}]);
assert(consRec[0]?.estado_recepcion === 'Derivado a CCP', 'Recepción consolidada');
const htmlRec = renderBadgeEstadoRecepcionHtml(consRec[0], (s) => s);
assert(/Derivado a CCP/.test(htmlRec) && /#6f42c1/.test(htmlRec), 'Recepción badge morado');

const estVal = estadoExpedienteValidacion(
  [{ validacion_estado: 'APTO', solicitud_estado: 'EN_CCP', estado_cuadro: 'DERIVADO_CCP' }],
  { solicitud_estado: 'EN_CCP', estado_cuadro: 'DERIVADO_CCP' },
);
assert(estVal.label === 'Derivado a CCP', 'Validaciones: label');
const consVal = consolidarExpedientesValidacion([{
  solicitud_id: 2,
  solicitud_codigo: 'SC-2',
  validacion_estado: 'APTO',
  solicitud_estado: 'EN_CCP',
  estado_cuadro: 'DERIVADO_CCP',
  derivado_ccp: true,
}]);
assert(consVal[0]?.estado_bandeja === 'Derivado a CCP', 'Validaciones consolidada');
const htmlVal = renderBadgeEstadoValidacionHtml(consVal[0], (s) => s);
assert(/Derivado a CCP/.test(htmlVal) && /#6f42c1/.test(htmlVal), 'Validaciones badge morado');

// Misma etiqueta en las 4 “vistas” (presenter + 3 bandejas)
const labels = [
  buildEstadoVisual(rowCcp).textoPrincipal,
  estRec.label,
  estVal.label,
  vigente.label,
];
assert(labels.every((l) => l === 'Derivado a CCP'), 'texto idéntico en 4 contextos');

const viewCc = fs.readFileSync(path.join(root, 'src/views/contratacion/cuadroComparativoView.js'), 'utf8');
assert(/title:\s*'Cuadro Comparativo'/.test(viewCc), 'título Cuadro Comparativo');
assert(!/Supervisi[oó]n/.test(viewCc), 'sin Supervisión en título');

const bePortal = fs.readFileSync(path.join(root, 'server/lib/portalProveedores.js'), 'utf8');
assert(/solicitud_estado/.test(bePortal) && /estado_cuadro/.test(bePortal), 'API recepción expone estado vigente');
const beVal = fs.readFileSync(path.join(root, 'server/lib/validacionesCotizacion.js'), 'utf8');
assert(
  /estadoBandeja = vigente\.label/.test(beVal)
    || /derivadoCcp \? 'Derivado a CCP'/.test(beVal)
    || /resolveEstadoExpedienteVigente/.test(beVal),
  'API validaciones prioriza DERIVADO_CCP',
);

const failed = tests.filter((t) => !t.ok);
console.log(failed.length ? `\n${failed.length} fallos` : '\nPASS RC88 / OD33');
process.exit(failed.length ? 1 : 0);
