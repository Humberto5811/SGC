/**
 * RC8.17.8H6-C3-D8-B — Bandeja Validaciones: Etapa | Estado | Responsable (ERV vigente).
 *
 *   node scripts/test-rc8178h6-c3d8b-validaciones-bandeja-etapa.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderBandejaCanonicoEtapaCell,
  renderBandejaCanonicoResponsableCell,
} from '../src/utils/bandejaExpedienteColumns.js';
import {
  consolidarExpedientesValidacion,
  renderBadgeEstadoValidacionHtml,
} from '../src/utils/validacionesUtils.js';
import { adaptEstadoResponsable } from '../src/ui/workflow/adaptEstadoResponsable.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-C3-D8-B — Validaciones bandeja Etapa ===\n');

const viewSrc = read('src/views/contratacion/validacionesView.js');

{
  const theadMatch = viewSrc.match(/VALIDACIONES_THEAD\s*=\s*`([\s\S]*?)`;/);
  ok(!!theadMatch, 'A — VALIDACIONES_THEAD definido');
  const thead = theadMatch[1];
  const etapaIdx = thead.indexOf('Etapa');
  const estadoIdx = thead.indexOf('>Estado<');
  const respIdx = thead.indexOf('>Responsable<');
  ok(etapaIdx >= 0 && estadoIdx > etapaIdx && respIdx > estadoIdx, 'A — orden Etapa | Estado | Responsable');
  ok(viewSrc.includes('renderBandejaCanonicoEtapaCell(exp)'), 'B — celda Etapa usa renderBandejaCanonicoEtapaCell');
  ok(viewSrc.includes('renderBadgeEstadoValidacionHtml(exp'), 'B — Estado conserva helper ERV/legacy');
  ok(viewSrc.includes('renderBandejaCanonicoResponsableCell(exp)'), 'B — Responsable canónico');
  const hardEtapa = /renderBandejaCanonicoEtapaCell\([^)]*['"]Validaciones['"]/i.test(viewSrc)
    || /req-col-etapa[^`]*>\s*Validaciones/i.test(viewSrc);
  ok(!hardEtapa, 'C — sin hardcode "Validaciones" en celda Etapa');
  ok(!viewSrc.includes('colspan'), 'G — sin colspan obsoleto en validacionesView');
  const thCount = (thead.match(/<th/g) || []).length;
  ok(thCount === 8, `G — thead 8 columnas (tiene ${thCount})`);
}

function mkCot(overrides = {}) {
  return {
    solicitud_id: 9001,
    solicitud_codigo: 'SC-D8B-TEST',
    denominacion: 'Demo',
    requerimientos: 'REQ-D8B',
    centros_texto: 'CNCC',
    validacion_estado: 'DERIVADA',
    validacion_responsable: 'Analista AU',
    requerimiento_id: 88001,
    estado: 'COTIZACION_PRESENTADA',
    ...overrides,
  };
}

{
  const ervActivo = {
    canonicalMissing: false,
    etapaCodigo: 'VALIDACION_USUARIO',
    etapaLabel: 'Validación AU',
    estadoCodigo: 'EN_TRAMITE',
    estadoLabel: 'En trámite',
    responsableNombre: 'wvasquez',
    responsableTipo: 'PERSONA',
  };
  const flat = [mkCot({ estado_responsable_vigente: ervActivo })];
  const [exp] = consolidarExpedientesValidacion(flat);
  const etapaHtml = renderBandejaCanonicoEtapaCell(exp);
  ok(/Validaci/i.test(etapaHtml), 'D — Etapa ERV actual (Validación AU)');
  const estadoHtml = renderBadgeEstadoValidacionHtml(exp);
  ok(estadoHtml.includes('sgc-estado-badge') || estadoHtml.includes('En trámite'), 'D — Estado desde ERV');
  const respHtml = renderBandejaCanonicoResponsableCell(exp);
  ok(/wvasquez/i.test(respHtml), 'D — Responsable ERV');
}

{
  const ervCuadro = {
    canonicalMissing: false,
    etapaCodigo: 'CUADRO_COMPARATIVO',
    etapaLabel: 'Cuadro Comparativo',
    estadoCodigo: 'EN_ELABORACION',
    estadoLabel: 'En elaboración',
    responsableNombre: 'Coordinador CM',
    responsableTipo: 'PERSONA',
  };
  const flat = [mkCot({
    validacion_estado: 'APTO',
    estado_responsable_vigente: ervCuadro,
  })];
  const [exp] = consolidarExpedientesValidacion(flat);
  const etapaHtml = renderBandejaCanonicoEtapaCell(exp);
  ok(/Cuadro Comparativo/i.test(etapaHtml), 'E — histórico en bandeja AU pero Etapa = ERV actual');
  ok(!/Validaci[oó]n AU/i.test(etapaHtml), 'E — Etapa no congela submódulo Validaciones');
  const adapted = adaptEstadoResponsable(exp);
  ok(adapted.etapaCodigo === 'CUADRO_COMPARATIVO' || /Cuadro/i.test(adapted.etapaLabel), 'E — adaptador alinea etapa vigente');
}

{
  const flat = [mkCot({
    estado_responsable_vigente: {
      canonicalMissing: true,
      estadoLabel: 'Estado no disponible',
      responsableTipo: 'PENDIENTE',
    },
  })];
  const [exp] = consolidarExpedientesValidacion(flat);
  const etapaHtml = renderBandejaCanonicoEtapaCell(exp);
  ok(etapaHtml.includes('sgc-etapa-badge') || etapaHtml.includes('—'), 'F — fallback legacy renderiza Etapa sin romper');
  ok(renderBadgeEstadoValidacionHtml(exp).length > 0, 'F — fallback legacy Estado');
  ok(renderBandejaCanonicoResponsableCell(exp).length > 0, 'F — fallback legacy Responsable');
}

console.log('\n✅ C3-D8-B OK\n');
