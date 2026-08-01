// Pruebas de contratos A/B/C: ubicación, estados, visual (claves semánticas).
import { assert, summarize } from './workflowTestUtils.mjs';
import { buildContratoUbicacion, buildContratoEstados, buildContratoVisual, VERSION_WORKFLOW, ESTADO_VISUAL } from '../shared/workflow/workflowContract.js';

// A. Ubicación
const ubic = buildContratoUbicacion({
  expediente_id: 1, tipo_contratacion: 'BIEN', etapa_codigo: 'RECEPCION_COTIZACIONES',
  etapa_label: 'Recepción de Cotizaciones', submodulo_codigo: 'RECEPCION_COTIZACIONES',
  submodulo_label: 'Cotizaciones', responsable_codigo: 'ESPECIALISTA_CONTRATACIONES',
  responsable_label: 'Especialista Contrataciones', actualizado_en: '2026-08-01T10:00:00.000Z',
});
assert(ubic.expediente_id === 1, 'A.1 expediente_id');
assert(ubic.etapa_codigo === 'RECEPCION_COTIZACIONES', 'A.2 etapa_codigo');
assert(ubic.version_workflow === VERSION_WORKFLOW, 'A.3 version_workflow');
assert(ubic.responsable_label === 'Especialista Contrataciones', 'A.4 responsable_label');

// B. Estados con null para ausentes
const est = buildContratoEstados({
  tipo_contratacion: 'BIEN', etapa_codigo: 'RECEPCION_COTIZACIONES', etapa_label: 'X',
  submodulo_codigo: 'Y', submodulo_label: 'Z', responsable_codigo: 'R', responsable_label: 'RL',
  domainStates: {
    expediente: { codigo: 'EXP_RECEPCION_COTIZACIONES', label: 'En Recepción' },
    solicitud: { codigo: 'SC_EN_COTIZACIONES', label: 'En período de cotizaciones' },
    cotizacion: { codigo: 'COT_PRESENTADA', label: 'Presentada' },
  },
});
assert(est.estados.expediente?.codigo === 'EXP_RECEPCION_COTIZACIONES', 'B.1 expediente');
assert(est.estados.solicitud?.codigo === 'SC_EN_COTIZACIONES', 'B.2 solicitud');
assert(est.estados.cotizacion?.codigo === 'COT_PRESENTADA', 'B.3 cotizacion');
assert(est.estados.validacion === null, 'B.4 validacion null');
assert(est.estados.cuadro === null, 'B.5 cuadro null');
assert(est.estados.ccp === null, 'B.6 ccp null');
assert(est.estados.orden === null, 'B.7 orden null');
assert(est.estados.ejecucion === null, 'B.8 ejecucion null');
assert(est.estados.observacion === null, 'B.9 observacion null');
assert(est.workflow.tipo_contratacion === 'BIEN', 'B.10 workflow.tipo');

// C. Visual con claves semánticas (sin colores CSS)
const vis = buildContratoVisual({
  etapa_actual: 'RECEPCION_COTIZACIONES', etapa_label: 'Recepción',
  responsable_actual: 'ESPECIALISTA_CONTRATACIONES', responsable_label: 'Especialista',
  estado_visible: ESTADO_VISUAL.CURRENT, estado_visible_label: 'Cotizaciones recibidas',
  fecha_ingreso_etapa: '2026-08-01T10:00:00.000Z', dias_en_etapa: 2,
  proxima_accion: 'Derivar a validación', siguiente_etapa: 'VALIDACIONES',
});
assert(vis.estado_visible === 'current', 'C.1 clave semántica current');
assert(!('color' in vis), 'C.2 sin colores CSS en backend');
assert(typeof vis.bloqueado === 'boolean' && vis.bloqueado === false, 'C.3 bloqueado booleano');
assert(vis.dias_en_etapa === 2, 'C.4 dias_en_etapa');
assert(vis.siguiente_etapa === 'VALIDACIONES', 'C.5 siguiente_etapa');

// Claves semánticas completas
const claves = ['completed','current','pending','observed','blocked','returned','cancelled','finished'];
assert(claves.every((c) => Object.values(ESTADO_VISUAL).includes(c)), 'D.1 claves semánticas completas');

summarize('test-workflow-contract');