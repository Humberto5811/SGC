/**
 * RC8.8.1 — buildEstadoVisual no puede alterar el contrato canónico cuando hay ERV.
 */
import assert from 'node:assert/strict';
import { buildEstadoVisual, renderEstadoVisualHtml } from '../src/utils/estadoVisualPresenter.js';
import { adaptEstadoResponsable } from '../src/ui/workflow/adaptEstadoResponsable.js';

const CONTRATO_FIELDS = Object.freeze([
  'estadoCodigo',
  'estadoLabel',
  'estadoCategoria',
  'etapaCodigo',
  'etapaLabel',
  'responsableTipo',
  'responsableUsuarioId',
  'responsableNombre',
  'responsableUnidad',
]);

function pickContrato(adapted) {
  return {
    estadoCodigo: adapted.estadoCodigo || '',
    estadoLabel: adapted.estadoLabel || '',
    estadoCategoria: adapted.categoria || adapted.estadoCategoria || '',
    etapaCodigo: adapted.etapaCodigo || '',
    etapaLabel: adapted.etapaLabel || '',
    responsableTipo: adapted.responsableTipo || '',
    responsableUsuarioId: adapted.responsableUsuarioId != null
      ? Number(adapted.responsableUsuarioId) : null,
    responsableNombre: adapted.responsableNombre || '',
    responsableUnidad: adapted.responsableUnidad || '',
  };
}

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

function deepEq(a, b, msg) {
  assert.deepEqual(a, b, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.8.1 buildEstadoVisual no altera contrato ===\n');

const ervReq2 = Object.freeze({
  estadoCodigo: 'REGISTRO_ORDENES',
  estadoLabel: 'Registro de órdenes',
  estadoCategoria: 'EN_PROCESO',
  etapaCodigo: 'REGISTRO_ORDEN',
  etapaLabel: 'Registro de Órdenes',
  responsableTipo: 'PERSONA',
  responsableUsuarioId: 260,
  responsableUsername: 'jcrisostomo',
  responsableNombre: 'CRISOSTOMO REYNA JUAN ULISES',
  responsableUnidad: 'Registro de Órdenes',
  responsableFuente: 'persistido',
  canonicalMissing: false,
});

const row = {
  id: 2,
  codigo: 'REQ-00002',
  // Señales de evidencia que ANTES reinferían CCP / Invitaciones
  codigo_ccp: 'CCP-FAKE-999',
  ccp_activo: true,
  estado_cuadro: 'DERIVADO_CCP',
  solicitud_estado: 'EN_CCP',
  estado_actual: 'CCP',
  sub_modulo_actual: 'Invitaciones',
  orden_estado: 'REGISTRADA',
  estado_responsable_vigente: { ...ervReq2 },
};

const before = pickContrato(adaptEstadoResponsable(row));
ok(before.estadoCodigo === 'REGISTRO_ORDENES', 'pre: contrato REGISTRO_ORDENES');

const visual = buildEstadoVisual(row, { moduloContext: 'Invitaciones' });
ok(visual._canonico === true, 'buildEstadoVisual marca camino canónico');
ok(visual.estadoVigente == null, 'no expone estadoVigente reinferido');

const afterAdapt = pickContrato(adaptEstadoResponsable(row));
deepEq(afterAdapt, before, 'adapt post-buildEstadoVisual idéntico (row no mutado)');

const fromVisual = visual.contratoCanonico;
ok(!!fromVisual, 'visual.contratoCanonico presente');
deepEq({
  estadoCodigo: fromVisual.estadoCodigo,
  estadoLabel: fromVisual.estadoLabel,
  estadoCategoria: fromVisual.estadoCategoria,
  etapaCodigo: fromVisual.etapaCodigo,
  etapaLabel: fromVisual.etapaLabel,
  responsableTipo: fromVisual.responsableTipo,
  responsableUsuarioId: fromVisual.responsableUsuarioId != null
    ? Number(fromVisual.responsableUsuarioId) : null,
  responsableNombre: fromVisual.responsableNombre,
  responsableUnidad: fromVisual.responsableUnidad,
}, before, 'contratoCanonico en visual = adapt (sin deriva)');

ok(visual.textoPrincipal === before.estadoLabel,
  'textoPrincipal es passthrough de estadoLabel (no CCP registrada)');
ok(!/CCP registrada/i.test(String(visual.textoPrincipal || '')),
  'textoPrincipal no reinfiere CCP');

// Campos auxiliares permitidos
ok(typeof visual.badgeObservado === 'boolean', 'auxiliar: badgeObservado');
ok(visual.motor != null || visual.motorBadge != null, 'auxiliar: motor observaciones');
ok('puedeSubsanar' in visual && 'puedeCerrar' in visual, 'auxiliar: acciones');

// render no pisa contrato
const html = renderEstadoVisualHtml(row);
ok(/Registro de [oó]rdenes/i.test(html) || /REGISTRO_ORDENES/i.test(html) || html.includes(before.estadoLabel),
  'render usa label canónico');
ok(!/CCP registrada/i.test(html), 'render no muestra CCP registrada con ERV');

const afterRender = pickContrato(adaptEstadoResponsable(row));
deepEq(afterRender, before, 'adapt post-render idéntico');

// Mutación defensiva: si alguien aplicara visual sobre adapted, el test debe fallar
{
  const adapted = adaptEstadoResponsable(row);
  const snapshot = pickContrato(adapted);
  // Simular el anti-patrón prohibido (como hacía renderEstadoVisualHtml pre-RC8.8.1)
  if (visual.textoPrincipal && visual.textoPrincipal !== adapted.estadoLabel) {
    adapted.estadoLabel = visual.textoPrincipal;
  }
  // Con el fix, textoPrincipal === estadoLabel, así que no cambia.
  deepEq(pickContrato(adapted), snapshot,
    'aplicar textoPrincipal no cambia contrato cuando hay ERV');
}

// Caso REQ-00001 recepción
{
  const erv1 = {
    estadoCodigo: 'BIEN_RECIBIDO_ALMACEN',
    estadoLabel: 'Recibido por almacén',
    estadoCategoria: 'COMPLETADO',
    etapaCodigo: 'RECEPCION_BIENES',
    etapaLabel: 'Recepción de Bienes',
    responsableTipo: 'UNIDAD',
    responsableUsuarioId: null,
    responsableNombre: '',
    responsableUnidad: 'Almacén',
    canonicalMissing: false,
  };
  const row1 = {
    id: 1,
    codigo_ccp: 'CCP-OLD',
    ccp_activo: true,
    estado_actual: 'EN_EJECUCION',
    estado_responsable_vigente: erv1,
  };
  const b = pickContrato(adaptEstadoResponsable(row1));
  const v = buildEstadoVisual(row1);
  deepEq(pickContrato(adaptEstadoResponsable(row1)), b, 'REQ-00001: build no muta contrato');
  deepEq({
    estadoCodigo: v.contratoCanonico.estadoCodigo,
    estadoLabel: v.contratoCanonico.estadoLabel,
    estadoCategoria: v.contratoCanonico.estadoCategoria,
    etapaCodigo: v.contratoCanonico.etapaCodigo,
    etapaLabel: v.contratoCanonico.etapaLabel,
    responsableTipo: v.contratoCanonico.responsableTipo,
    responsableUsuarioId: v.contratoCanonico.responsableUsuarioId,
    responsableNombre: v.contratoCanonico.responsableNombre,
    responsableUnidad: v.contratoCanonico.responsableUnidad,
  }, b, 'REQ-00001: visual.contratoCanonico = adapt');
  ok(!/EN_EJECUCION/i.test(v.textoPrincipal || ''), 'REQ-00001: no EN_EJECUCION en textoPrincipal');
}

// Assert explícito por campo (falla puntual)
for (const field of CONTRATO_FIELDS) {
  const adapted = adaptEstadoResponsable(row);
  const beforeF = pickContrato(adapted)[field];
  buildEstadoVisual(row);
  const afterF = pickContrato(adaptEstadoResponsable(row))[field];
  assert.equal(afterF, beforeF, `campo ${field} inalterado tras buildEstadoVisual`);
}
ok(true, `todos los campos ${CONTRATO_FIELDS.join(', ')} intactos`);

console.log('\n=== RC8.8.1 buildEstadoVisual OK ===\n');
process.exit(0);
