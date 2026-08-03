// Fase 2A.2 — fechas America/Lima + contrato mínimo por dominios.
import { assert, summarize } from './workflowTestUtils.mjs';
import { formatFechaLima, fechaLimaISO, buildFechasContrato } from '../server/lib/workflow/fechaLima.js';
import { buildContratoRecepcionCotizacion } from '../shared/workflow/workflowContract.js';

async function run() {
  // Z — 2026-08-01T00:13:00.000Z → 31/07/2026 19:13
  assert(formatFechaLima('2026-08-01T00:13:00.000Z') === '31/07/2026 19:13', 'Z. UTC → Lima (31/07/2026 19:13)');
  assert(fechaLimaISO('2026-08-01T00:13:00.000Z') === '2026-07-31T19:13:00.000-05:00', 'Z2. ISO con offset -05:00');
  assert(formatFechaLima(null) === '', 'Z3. null → vacío');
  assert(formatFechaLima('no-valid') === '', 'Z4. inválido → vacío');
  assert(buildFechasContrato({}).fecha_presentacion_lima === null, 'Z5. sin fecha → null');

  // 17. Contrato devuelve dominios separados.
  const c = buildContratoRecepcionCotizacion({
    tipo_contratacion: 'BIEN', etapa_codigo: 'RECEPCION_COTIZACIONES', etapa_label: 'Recepción',
    submodulo_codigo: 'RECEPCION_COTIZACIONES', submodulo_label: 'Cotizaciones',
    responsable_codigo: 'ESPECIALISTA_CONTRATACIONES', responsable_label: 'Especialista',
    estados: { expediente: { codigo: 'EXP_RECEPCION_COTIZACIONES', label: 'En Recepción' }, cotizacion: { codigo: 'COT_PRESENTADA', label: 'Presentada' } },
    fechas: { fecha_presentacion: '2026-08-01T00:13:00.000Z' },
  });
  assert(c.workflow.etapa_codigo === 'RECEPCION_COTIZACIONES', '17a. workflow.expediente');
  assert(c.estados.expediente?.codigo === 'EXP_RECEPCION_COTIZACIONES', '17b. estado expediente');
  assert(c.estados.recepcion === null, '17c. recepcion ausente = null (sin fallback a expediente)');
  assert(c.estados.cotizacion?.codigo === 'COT_PRESENTADA', '17d. estado cotizacion separado');
  assert(c.fechas.fecha_presentacion_lima === '31/07/2026 19:13', '17e. fecha Lima en contrato');

  // 18. (cubierto por Z)
}

run().then(() => summarize('test-workflow-fechas-lima')).catch((e) => { console.error(e); process.exitCode = 1; });