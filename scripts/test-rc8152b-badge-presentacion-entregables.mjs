/**
 * RC8.15.2B — Normalizar badge visual de PRESENTACION_ENTREGABLES.
 *
 * Causa raíz corregida: el catálogo visual (estadoCatalogo.js) no registraba
 * PRESENTACION_ENTREGABLES → caía en DESCONOCIDO (gris + bi-question-circle).
 *
 * Valida A–J:
 *   A. existe en catálogo visual   B. label correcto   C. no fallback desconocido
 *   D. no icono ?   E. no badge gris unknown
 *   F. Registro de Requerimientos usa catálogo   G. Registro de Órdenes usa catálogo
 *   H. Presentación Entregables label coherente   I. responsable no cambia
 *   J. Recepción de Bienes no cambia
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

console.log('\n=== RC8.15.2B — Badge visual PRESENTACION_ENTREGABLES ===\n');

const { getEstadoCatalogEntry, getCategoriaCssClass } = await import('../src/ui/workflow/estadoCatalogo.js');
const { renderEstadoBadgeHtml } = await import('../src/ui/workflow/EstadoBadge.js');
const { adaptEstadoResponsable } = await import('../src/ui/workflow/adaptEstadoResponsable.js');

// ── A–E: catálogo visual central ─────────────────────────────────────────────
const entry = getEstadoCatalogEntry('PRESENTACION_ENTREGABLES');
ok(entry.categoria === 'EN_PROCESO', `A. PRESENTACION_ENTREGABLES existe en catálogo (categoria=${entry.categoria})`);
ok(entry.label === 'Presentación de Entregables', `B. label correcto (${entry.label})`);
ok(entry.categoria !== 'DESCONOCIDO', 'C. no usa fallback DESCONOCIDO');
ok(entry.icono === 'bi-arrow-repeat' && entry.icono !== 'bi-question-circle', `D. no usa icono ? (icono=${entry.icono})`);
ok(getCategoriaCssClass(entry.categoria) === 'progress' && getCategoriaCssClass(entry.categoria) !== 'unknown',
  `E. no usa badge gris unknown (css=${getCategoriaCssClass(entry.categoria)})`);

const html = renderEstadoBadgeHtml({ estadoCodigo: 'PRESENTACION_ENTREGABLES', estadoLabel: 'Presentación de Entregables' });
ok(html.includes('sgc-estado-badge--progress') && !html.includes('sgc-estado-badge--unknown'),
  'E2. render usa --progress (no --unknown)');
ok(html.includes('bi-arrow-repeat') && !html.includes('bi-question-circle'), 'E3. render sin icono ?');
ok(html.includes('Presentación de Entregables'), 'H. render label coherente "Presentación de Entregables"');

// ── F/G: consumidores usan el catálogo central ───────────────────────────────
const reqSharedSrc = read('src/views/requerimiento/reqShared.js');
const estadoPresenterSrc = read('src/utils/estadoExpedientePresenter.js');
const roViewSrc = read('src/views/contratacion/registroOrdenesView.js');
const estadoBadgeSrc = read('src/ui/workflow/EstadoBadge.js');

ok(/renderEstadoExpedienteHtml/.test(reqSharedSrc), 'F. Registro de Requerimientos usa renderEstadoExpedienteHtml (reqShared)');
ok(/getEstadoCatalogEntry/.test(estadoPresenterSrc), 'F2. estadoExpedientePresenter usa catálogo central (getEstadoCatalogEntry)');
ok(/renderEstadoBadgeFromRow/.test(roViewSrc), 'G. Registro de Órdenes usa renderEstadoBadgeFromRow');
ok(/getEstadoCatalogEntry/.test(estadoBadgeSrc), 'G2. EstadoBadge (FE) usa getEstadoCatalogEntry');

// ── I: responsable no cambia (PERSONA y UNIDAD) ──────────────────────────────
const adaptPersona = adaptEstadoResponsable({
  estado_responsable_vigente: {
    estadoCodigo: 'PRESENTACION_ENTREGABLES', estadoLabel: 'Presentación de Entregables',
    etapaCodigo: 'PRESENTACION_ENTREGABLES', etapaLabel: 'Presentación de Entregables',
    responsableTipo: 'PERSONA', responsableUsuarioId: 65,
    responsableNombre: 'VASQUEZ ANCHELIA WILLIAM GILDER', responsableUsername: 'wvasquez',
    responsableUnidad: 'Área Usuaria',
  },
});
ok(adaptPersona.responsableDisplay === 'VASQUEZ ANCHELIA WILLIAM GILDER', 'I. responsable PERSONA intacto');
ok(adaptPersona.estadoLabel === 'Presentación de Entregables', 'I2. estadoLabel normalizado correcto');
ok(adaptPersona.categoria === 'EN_PROCESO' && adaptPersona.icono === 'bi-arrow-repeat',
  'I3. adaptador toma categoría/icono EN_PROCESO (no DESCONOCIDO)');

const adaptUnidad = adaptEstadoResponsable({
  estado_responsable_vigente: {
    estadoCodigo: 'PRESENTACION_ENTREGABLES', estadoLabel: 'Presentación de Entregables',
    etapaCodigo: 'PRESENTACION_ENTREGABLES', etapaLabel: 'Presentación de Entregables',
    responsableTipo: 'UNIDAD', responsableUsuarioId: null, responsableUnidad: 'Área Usuaria',
  },
});
ok(adaptUnidad.responsableDisplay === 'Área Usuaria', 'I4. histórico UNIDAD sigue mostrando Área Usuaria');

// ── J: Recepción de Bienes no cambia ─────────────────────────────────────────
const rbAlmacen = getEstadoCatalogEntry('BIEN_RECIBIDO_ALMACEN');
ok(rbAlmacen.categoria === 'COMPLETADO' && rbAlmacen.icono === 'bi-check2-all',
  `J. BIEN_RECIBIDO_ALMACEN intacto (categoria=${rbAlmacen.categoria}, icono=${rbAlmacen.icono})`);
const rbPendiente = getEstadoCatalogEntry('RECEPCION_BIENES_PENDIENTE');
ok(rbPendiente.categoria === 'PENDIENTE' && rbPendiente.icono === 'bi-hourglass-split',
  'J2. RECEPCION_BIENES_PENDIENTE intacto');
const rbObs = getEstadoCatalogEntry('RECEPCION_BIENES_OBSERVADA');
ok(rbObs.categoria === 'OBSERVADO' && rbObs.icono === 'bi-exclamation-triangle',
  'J3. RECEPCION_BIENES_OBSERVADA intacto');

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
