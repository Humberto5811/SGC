// Menús contextuales ⋮ por bandeja (sin lógica de negocio — solo UI)
import {
  getObservacionPendiente,
  observacionPendienteParaSubmodulo,
  labelBotonObservaciones,
  hayObservacionPendienteAccion,
  requiereBadgeModulo,
} from './observacionDestino.js';
import {
  estaEnRegistroAccionable,
  estaEnEvaluacionAccionable,
  estaAprobadoEnEvaluacion,
} from './estadoAccionesExpediente.js';
import {
  puedeEnviarValidarRecepcion,
  puedeDerivarACcpRecepcion,
  puedeDevolverValidacionRecepcion,
} from './recepcionCotizacionUtils.js';

const MODULO_EVAL = 'Evaluación de Requerimiento';

/** @deprecated Usar estaEnEvaluacionAccionable — se mantiene por compatibilidad de tests/imports. */
export function estaEnEvaluacion(r = {}) {
  return estaEnEvaluacionAccionable(r);
}

export function registroMenuItems(r) {
  const enRegistro = estaEnRegistroAccionable(r);
  const obsLabel = labelBotonObservaciones(r, 'Registro de Requerimiento');
  return [
    { act: 'detail', label: 'Ver detalle', icon: 'bi-eye' },
    { act: 'edit', label: 'Editar', icon: 'bi-pencil', disabled: !enRegistro },
    { act: 'delete', label: 'Eliminar', icon: 'bi-trash', disabled: !enRegistro },
    { act: 'approve', label: 'Aprobar', icon: 'bi-check-circle', disabled: !enRegistro },
    { act: 'obs', label: obsLabel, icon: 'bi-chat-left-dots' },
    { act: 'attach', label: 'Adjuntos', icon: 'bi-paperclip' },
    { act: 'download', label: 'Descargar', icon: 'bi-printer' },
    { act: 'timeline', label: 'Trazabilidad', icon: 'bi-clock-history' },
  ];
}

export function registroHiddenActions(r, esc) {
  const enRegistro = estaEnRegistroAccionable(r);
  const pendienteSubsanar = hayObservacionPendienteAccion(r, 'Registro de Requerimiento');
  return `
    <button type="button" class="req-open" data-act-trigger="edit" data-id="${r.id}" ${enRegistro ? '' : 'disabled'}></button>
    <button type="button" class="req-print" data-act-trigger="download" data-id="${r.id}"></button>
    <button type="button" class="req-attach" data-act-trigger="attach" data-id="${r.id}" data-estado="${esc(r.estado || '')}"></button>
    <button type="button" class="req-obs-menu" data-act-trigger="obs" data-id="${r.id}"></button>
    ${pendienteSubsanar ? `<button type="button" class="req-observado" data-act-trigger="obs" data-id="${r.id}"></button>` : ''}
    <button type="button" class="req-approve" data-act-trigger="approve" data-id="${r.id}" ${enRegistro ? '' : 'disabled'}></button>
    ${enRegistro ? '' : `<button type="button" class="req-ver-obs" data-act-trigger="obs" data-id="${r.id}"></button>`}
    <button type="button" class="req-traza-hidden req-traza" data-act-trigger="timeline" data-id="${r.id}"></button>
    <button type="button" class="req-del" data-act-trigger="delete" data-id="${r.id}" ${enRegistro ? '' : 'disabled'}></button>`;
}

export function evalMenuItems(r) {
  const enEvaluacion = estaEnEvaluacionAccionable(r);
  const aprobado = estaAprobadoEnEvaluacion(r);
  const obsLabel = labelBotonObservaciones(r, 'Evaluación de Requerimiento');
  const motorObs = hayObservacionPendienteAccion(r, MODULO_EVAL)
    || requiereBadgeModulo(r, MODULO_EVAL)
    || enEvaluacion
    || aprobado;
  return [
    { act: 'detail', label: 'Ver detalle', icon: 'bi-eye' },
    { act: 'edit', label: 'Editar', icon: 'bi-pencil', disabled: aprobado },
    { act: 'delete', label: 'Eliminar', icon: 'bi-trash', disabled: aprobado },
    { act: 'approve', label: 'Aprobar', icon: 'bi-check-circle', disabled: aprobado || !enEvaluacion },
    { act: 'obs', label: obsLabel, icon: 'bi-chat-left-dots', disabled: !motorObs },
    { act: 'attach', label: 'Adjuntos', icon: 'bi-paperclip' },
    { act: 'download', label: 'Descargar', icon: 'bi-printer' },
    { act: 'timeline', label: 'Trazabilidad', icon: 'bi-clock-history' },
  ];
}

export function evalHiddenActions(r, esc) {
  const enEvaluacion = estaEnEvaluacionAccionable(r);
  const aprobado = estaAprobadoEnEvaluacion(r);
  const pendienteSubsanar = hayObservacionPendienteAccion(r, 'Evaluación de Requerimiento');
  const obsEnabled = enEvaluacion || aprobado || pendienteSubsanar || requiereBadgeModulo(r, MODULO_EVAL);
  return `
    <button type="button" class="eval-edit" data-act-trigger="edit" data-id="${r.id}" ${aprobado ? 'disabled' : ''}></button>
    <button type="button" class="eval-print" data-act-trigger="download" data-id="${r.id}"></button>
    <button type="button" class="eval-attach" data-act-trigger="attach" data-id="${r.id}" data-estado="${esc(r.estado || '')}"></button>
    <button type="button" class="eval-obs-menu" data-act-trigger="obs" data-id="${r.id}"></button>
    ${pendienteSubsanar ? `<button type="button" class="eval-observado" data-act-trigger="obs" data-id="${r.id}"></button>` : ''}
    <button type="button" class="eval-observar" data-act-trigger="obs" data-id="${r.id}" ${obsEnabled ? '' : 'disabled'}></button>
    <button type="button" class="eval-approve" data-act-trigger="approve" data-id="${r.id}" ${aprobado || !enEvaluacion ? 'disabled' : ''}></button>
    <button type="button" class="req-traza" data-act-trigger="timeline" data-id="${r.id}"></button>
    <button type="button" class="eval-del" data-act-trigger="delete" data-id="${r.id}" ${aprobado ? 'disabled' : ''}></button>`;
}

/**
 * Expediente accionable para “Aprobar DEC” (legado "Aprobado" + canónico REQUERIMIENTO_EN_DEC).
 * False si ya fue aprobado por DEC o salió a etapas posteriores.
 */
export function estaEnDecAccionable(r = {}) {
  const norm = (v) => String(v || '').trim().toUpperCase();
  const etapa = norm(r.estado_actual || r.estadoActual || r.estadoVigente?.etapa);
  const estadoNeg = norm(r.estado);
  const codigo = norm(
    r.estado_codigo
    || r.estado_vigente
    || r.estadoVigente?.codigo
    || r.estado,
  );

  const etapasPosteriores = new Set([
    'PROGRAMACION',
    'ACTOS_PREPARATORIOS',
    'INVITACIONES',
    'RECEPCION_COTIZACIONES',
    'VALIDACION_USUARIO',
    'CUADRO_COMPARATIVO',
    'CCP',
    'EJECUCION',
    'REGISTRO_ORDEN',
    'ALMACEN',
    'TESORERIA',
    'FINALIZADO',
  ]);
  if (etapasPosteriores.has(etapa)) return false;

  const estadosNoAccionables = new Set([
    'APROBADO_DEC',
    'APROBADO DEC',
    'REQUERIMIENTO_APROBADO_DEC',
    'REQUERIMIENTO_EN_PROGRAMACION',
  ]);
  if (estadosNoAccionables.has(estadoNeg) || estadosNoAccionables.has(codigo)) return false;

  if (etapa !== 'DEC') return false;

  return estadoNeg === 'APROBADO'
    || estadoNeg === 'REQUERIMIENTO_EN_DEC'
    || codigo === 'REQUERIMIENTO_EN_DEC';
}

export function decMenuItems(r) {
  const puedeAprobarDEC = estaEnDecAccionable(r);
  const obsLabel = labelBotonObservaciones(r, 'DEC');
  return [
    { act: 'detail', label: 'Ver detalle', icon: 'bi-eye' },
    { act: 'approve', label: 'Aprobar DEC', icon: 'bi-check-circle', disabled: !puedeAprobarDEC },
    { act: 'obs', label: obsLabel, icon: 'bi-chat-left-dots' },
    { act: 'attach', label: 'Adjuntos', icon: 'bi-paperclip' },
    { act: 'download', label: 'Descargar', icon: 'bi-printer' },
    { act: 'timeline', label: 'Trazabilidad', icon: 'bi-clock-history' },
  ];
}

export function decHiddenActions(r) {
  const puedeAprobarDEC = estaEnDecAccionable(r);
  return `
    <button type="button" class="dec-ver" data-act-trigger="download" data-id="${r.id}" data-perm-act="VER"></button>
    <button type="button" class="dec-attach" data-act-trigger="attach" data-id="${r.id}" data-perm-act="VER"></button>
    <button type="button" class="dec-obs-menu" data-act-trigger="obs" data-id="${r.id}" data-perm-act="OBSERVAR"></button>
    <button type="button" class="dec-observar" data-act-trigger="obs" data-id="${r.id}" data-perm-act="OBSERVAR"></button>
    <button type="button" class="dec-aprobar" data-act-trigger="approve" data-id="${r.id}" data-perm-act="APROBAR" ${puedeAprobarDEC ? '' : 'disabled'}></button>
    <button type="button" class="req-traza" data-act-trigger="timeline" data-id="${r.id}"></button>`;
}

export function progMenuItems(r) {
  const ubicacion = String(r.estado_actual || r.estadoActual || '').toUpperCase();
  const enProgramacion = ubicacion === 'PROGRAMACION';
  const esAprobadoDec = /^Aprobado DEC$/i.test(String(r.estado || ''));
  const puedeGestionar = enProgramacion || esAprobadoDec;
  const puedeAprobar = enProgramacion || esAprobadoDec;
  const obsLabel = labelBotonObservaciones(r, 'Programación');
  const obsEnabled = enProgramacion || esAprobadoDec;
  const cmnLabel = r.cmn ? 'Editar CMN' : 'Agregar CMN';
  return [
    { act: 'detail', label: 'Ver detalle', icon: 'bi-eye' },
    { act: 'pedido', label: 'Agregar pedido', icon: 'bi-plus-circle', disabled: !puedeGestionar },
    { act: 'cmn', label: cmnLabel, icon: 'bi-card-text', disabled: !puedeGestionar },
    { act: 'approve', label: 'Aprobar', icon: 'bi-check-circle', disabled: !puedeAprobar },
    { act: 'obs', label: obsLabel, icon: 'bi-chat-left-dots', disabled: !obsEnabled },
    { act: 'attach', label: 'Adjuntos', icon: 'bi-paperclip' },
    { act: 'download', label: 'Descargar', icon: 'bi-printer' },
    { act: 'timeline', label: 'Trazabilidad', icon: 'bi-clock-history' },
  ];
}

export function progHiddenActions(r) {
  const ubicacion = String(r.estado_actual || r.estadoActual || '').toUpperCase();
  const enProgramacion = ubicacion === 'PROGRAMACION';
  const esAprobadoDec = /^Aprobado DEC$/i.test(String(r.estado || ''));
  const puedeGestionar = enProgramacion || esAprobadoDec;
  const puedeAprobar = enProgramacion || esAprobadoDec;
  const obsEnabled = enProgramacion || esAprobadoDec;
  return `
    <button type="button" class="prog-add-pedido" data-act-trigger="pedido" data-id="${r.id}" ${puedeGestionar ? '' : 'disabled'}></button>
    <button type="button" class="prog-edit-cmn" data-act-trigger="cmn" data-id="${r.id}" ${puedeGestionar ? '' : 'disabled'}></button>
    <button type="button" class="prog-ver" data-act-trigger="download" data-id="${r.id}"></button>
    <button type="button" class="prog-attach" data-act-trigger="attach" data-id="${r.id}"></button>
    <button type="button" class="prog-observar" data-act-trigger="obs" data-id="${r.id}" ${obsEnabled ? '' : 'disabled'}></button>
    <button type="button" class="prog-aprobar" data-act-trigger="approve" data-id="${r.id}" ${puedeAprobar ? '' : 'disabled'}></button>
    <button type="button" class="req-traza" data-act-trigger="timeline" data-id="${r.id}"></button>`;
}

export function actosMenuItems(r, opts = {}) {
  const { esCoordinador = false, esAsignadoAMi = false, esPoolCoordinador = false } = opts;
  const pending = getObservacionPendiente(r);
  const pendActos = observacionPendienteParaSubmodulo(pending, 'Coordinación CM');
  const obsLabel = labelBotonObservaciones(r, 'Coordinación CM');
  const baseItems = [
    { act: 'detail', label: 'Ver expediente', icon: 'bi-eye' },
    { act: 'download', label: 'Descargar', icon: 'bi-printer' },
    { act: 'timeline', label: 'Trazabilidad', icon: 'bi-clock-history' },
    { act: 'attach', label: 'Adjuntos', icon: 'bi-paperclip' },
  ];
  if (esCoordinador) {
    return [
      { act: 'deriveAnalyst', label: 'Derivar a analista', icon: 'bi-person-plus' },
      { act: 'approve', label: esPoolCoordinador ? 'Asignar analista' : 'Reasignar', icon: 'bi-person-check' },
      { act: 'obs', label: obsLabel, icon: 'bi-chat-left-dots' },
      { act: 'derive', label: 'Derivar (otro destino)', icon: 'bi-arrow-right-circle' },
      ...baseItems,
    ];
  }
  const items = [...baseItems];
  if (esAsignadoAMi) {
    items.push(
      { act: 'obs', label: obsLabel, icon: 'bi-chat-left-dots' },
      { act: 'approve', label: 'Aprobar → Invitaciones', icon: 'bi-check-circle' },
    );
  }
  return items;
}

export function actosHiddenActions(r, opts = {}) {
  const { esCoordinador = false, esAsignadoAMi = false } = opts;
  let html = `
    <button type="button" class="actos-ver" data-act-trigger="download" data-id="${r.id}" data-perm-act="VER"></button>
    <button type="button" class="actos-attach" data-act-trigger="attach" data-id="${r.id}" data-perm-act="VER"></button>
    <button type="button" class="req-traza" data-act-trigger="timeline" data-id="${r.id}"></button>`;
  if (esCoordinador) {
    html += `
    <button type="button" class="actos-observar" data-act-trigger="obs" data-id="${r.id}" data-perm-act="OBSERVAR"></button>
    <button type="button" class="actos-derivar-analista" data-act-trigger="deriveAnalyst" data-id="${r.id}" data-perm-act="DERIVAR"></button>
    <button type="button" class="actos-derivar" data-act-trigger="derive" data-id="${r.id}" data-perm-act="DERIVAR"></button>
    <button type="button" class="actos-asignar" data-act-trigger="approve" data-id="${r.id}" data-perm-act="APROBAR"></button>`;
  } else if (esAsignadoAMi) {
    html += `
    <button type="button" class="actos-observar" data-act-trigger="obs" data-id="${r.id}" data-perm-act="OBSERVAR"></button>
    <button type="button" class="actos-aprobar-inv" data-act-trigger="approve" data-id="${r.id}" data-perm-act="APROBAR"></button>`;
  }
  return html;
}

export function invitacionesMenuItems(r) {
  const obsLabel = labelBotonObservaciones(r, 'Invitaciones');
  return [
    { act: 'detail', label: 'Ver detalle', icon: 'bi-eye' },
    { act: 'crearSc', label: 'Crear Solicitud de Cotización', icon: 'bi-file-earmark-plus' },
    { act: 'obs', label: obsLabel, icon: 'bi-chat-left-dots' },
    { act: 'attach', label: 'Adjuntos', icon: 'bi-paperclip' },
    { act: 'download', label: 'Descargar', icon: 'bi-printer' },
    { act: 'timeline', label: 'Trazabilidad', icon: 'bi-clock-history' },
  ];
}

export function invitacionesHiddenActions(r) {
  return `
    <button type="button" class="inv-ver" data-act-trigger="download" data-id="${r.id}"></button>
    <button type="button" class="inv-attach" data-act-trigger="attach" data-id="${r.id}"></button>
    <button type="button" class="inv-obs" data-act-trigger="obs" data-id="${r.id}"></button>
    <button type="button" class="req-traza" data-act-trigger="timeline" data-id="${r.id}"></button>
    <button type="button" class="inv-sc" data-act-trigger="crearSc" data-id="${r.id}"></button>`;
}

export function recepcionCotizacionesMenuItems(c) {
  const items = [
    { act: 'verPropuesta', label: 'Ver propuesta', icon: 'bi-eye' },
  ];
  if (puedeDerivarACcpRecepcion(c)) {
    items.push({ act: 'derivarCcp', label: 'Enviar a CCP', icon: 'bi-send' });
  } else if (puedeEnviarValidarRecepcion(c)) {
    items.push({ act: 'enviarValidar', label: 'Enviar a Validaciones', icon: 'bi-send' });
  } else if (puedeDevolverValidacionRecepcion(c)) {
    items.push({
      act: 'enviarValidar',
      label: 'Devolver a Validación AU',
      icon: 'bi-arrow-counterclockwise',
    });
  }
  return items;
}

/**
 * Menú Acciones de la bandeja consolidada por Solicitud (Obs 05_02).
 * Destino según tipo: Bienes/Servicios → Validaciones; Locación → CCP.
 */
export function recepcionExpedienteMenuItems(exp = {}) {
  const tipo = exp.tipo || exp.solicitud_tipo || '';
  const cots = (exp.cotizaciones || []).map((c) => ({
    ...c,
    tipo: c.tipo || c.solicitud_tipo || tipo,
    solicitud_tipo: c.solicitud_tipo || c.tipo || tipo,
  }));
  const items = [
    { act: 'ver', label: 'Ver cotizaciones', icon: 'bi-eye' },
  ];
  if (cots.some((c) => puedeDerivarACcpRecepcion(c))) {
    items.push({ act: 'enviarCcp', label: 'Enviar a CCP', icon: 'bi-send' });
  } else if (cots.some((c) => puedeEnviarValidarRecepcion(c))) {
    items.push({ act: 'enviarValidar', label: 'Enviar a Validaciones', icon: 'bi-send' });
  } else if (cots.some((c) => puedeDevolverValidacionRecepcion(c))) {
    items.push({
      act: 'enviarValidar',
      label: 'Devolver a Validación AU',
      icon: 'bi-arrow-counterclockwise',
    });
  }
  return items;
}

export function pedidosMenuItems(f = {}) {
  const items = [
    { act: 'detail', label: 'Ver expediente', icon: 'bi-eye' },
    { act: 'timeline', label: 'Trazabilidad', icon: 'bi-clock-history' },
  ];
  if (f.paquete_id) {
    items.push({ act: 'goPaq', label: 'Ir al paquete', icon: 'bi-box-seam' });
  }
  return items;
}

export function paquetesMenuItems(estado) {
  const items = [
    { act: 'detail', label: 'Ver panel', icon: 'bi-layout-sidebar' },
  ];
  if (estado === 'Pendiente') {
    items.push(
      { act: 'approve', label: 'Aprobar', icon: 'bi-check-circle' },
      { act: 'delete', label: 'Eliminar', icon: 'bi-trash' },
    );
  }
  return items;
}

export function paquetesReqMenuItems() {
  return [
    { act: 'timeline', label: 'Trazabilidad', icon: 'bi-clock-history' },
  ];
}

/**
 * OD35 — menú Acciones bandeja CCP.
 * @param {object} row
 * @param {{ canManage?: boolean }} [opts]
 */
export function ccpMenuItems(row = {}, opts = {}) {
  const canManage = opts.canManage !== false;
  const tieneCodigo = !!(row.tiene_codigo || row.ccp_activo || row.codigo_ccp);
  const items = [];
  if (canManage && !tieneCodigo) {
    items.push({ act: 'registrarCcp', label: 'Registrar CCP', icon: 'bi-plus-circle' });
  }
  if (canManage && tieneCodigo) {
    items.push(
      { act: 'editarCcp', label: 'Editar CCP', icon: 'bi-pencil' },
      { act: 'eliminarCcp', label: 'Eliminar CCP', icon: 'bi-trash' },
    );
  }
  items.push({ act: 'ver', label: 'Ver', icon: 'bi-eye' });
  // Locación (origen RECEPCION_COTIZACION_LOCACION): sin acciones de Cuadro Comparativo.
  if (row.consolidacion_id) {
    items.push({ act: 'descargarWord', label: 'Descargar Word', icon: 'bi-file-earmark-word' });
  }
  return items;
}
