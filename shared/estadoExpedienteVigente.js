/**
 * OD32 / OD35 — Resolución del estado vigente del expediente.
 * Fuente única FE/BE: prioriza avance del workflow sobre observaciones históricas.
 *
 * Prioridad (mayor gana):
 * CCP_REGISTRADO > ENVIADA_OPPM > DERIVADO_CCP > APROBADO_DEC > …
 */

/** Mayor índice = más avanzado (reemplaza visualmente a los anteriores). */
export const PRIORIDAD_ESTADO_CUADRO = Object.freeze([
  'PENDIENTE_ELABORAR',
  'BORRADOR',
  'EN_ELABORACION',
  'CUADRO_BORRADOR',
  'GENERADO',
  'GENERADO_PRELIMINAR',
  'ADJUDICADO',
  'OBSERVADO',
  'OBSERVADO_COORDINADOR',
  'PENDIENTE_COORDINADOR',
  'FIRMADO_COORDINADOR',
  'OBSERVADO_DEC',
  'PENDIENTE_DEC',
  'APROBADO_DEC',
  'PENDIENTE_CCP',
  'FIRMADO',
  'DERIVADO_CCP',
  'ENVIADA_OPPM',
  'CCP_REGISTRADO',
]);

export const ESTADOS_CUADRO_VIGENTE_LABEL = Object.freeze({
  PENDIENTE_ELABORAR: 'C.C. en elaboración',
  BORRADOR: 'C.C. en elaboración',
  EN_ELABORACION: 'C.C. en elaboración',
  CUADRO_BORRADOR: 'C.C. en elaboración',
  GENERADO: 'C.C. en elaboración',
  GENERADO_PRELIMINAR: 'C.C. en elaboración',
  ADJUDICADO: 'C.C. en elaboración',
  OBSERVADO: 'C.C. observado por Coordinador CM',
  OBSERVADO_COORDINADOR: 'C.C. observado por Coordinador CM',
  PENDIENTE_COORDINADOR: 'C.C. en revisión Coordinador CM',
  FIRMADO_COORDINADOR: 'C.C. en revisión Coordinador CM',
  OBSERVADO_DEC: 'C.C. observado por DEC',
  PENDIENTE_DEC: 'C.C. en revisión DEC',
  APROBADO_DEC: 'C.C. aprobado',
  PENDIENTE_CCP: 'C.C. aprobado',
  FIRMADO: 'C.C. aprobado',
  DERIVADO_CCP: 'Derivado a CCP',
  ENVIADA_OPPM: 'Solicitud enviada a OPPM',
  CCP_REGISTRADO: 'CCP registrado',
  ANULADO: 'Anulado',
});

const PRIORIDAD_INDEX = Object.freeze(
  Object.fromEntries(PRIORIDAD_ESTADO_CUADRO.map((c, i) => [c, i])),
);

export function normalizeEstadoCuadroVigente(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!s) return '';
  if (s === 'DERIVADO_A_CCP' || s === 'EN_CCP' || s === 'CCP') return 'DERIVADO_CCP';
  if (s === 'ENVIADO_OPPM' || s === 'SOLICITUD_ENVIADA_OPPM') return 'ENVIADA_OPPM';
  if (s === 'CCP_REGISTRADO' || s === 'REGISTRADO_CCP') return 'CCP_REGISTRADO';
  if (s === 'PENDIENTE' || s === 'PENDIENTE_DE_ELABORAR') return 'PENDIENTE_ELABORAR';
  if (s === 'ELABORACION') return 'CUADRO_BORRADOR';
  if (PRIORIDAD_INDEX[s] != null || ESTADOS_CUADRO_VIGENTE_LABEL[s]) return s;
  return s;
}

export function prioridadEstadoCuadro(code) {
  const n = normalizeEstadoCuadroVigente(code);
  return PRIORIDAD_INDEX[n] != null ? PRIORIDAD_INDEX[n] : -1;
}

export function labelEstadoCuadroVigente(code, opts = {}) {
  const e = normalizeEstadoCuadroVigente(code);
  if (e === 'CCP_REGISTRADO') return 'CCP registrado';
  if (e === 'ENVIADA_OPPM') return 'Solicitud enviada a OPPM';
  if (e === 'DERIVADO_CCP') return 'Derivado a CCP';
  const tieneRespuesta = !!(opts.subsanado
    || String(opts.respuesta_observaciones || opts.respuesta || '').trim());
  if (tieneRespuesta && (e === 'OBSERVADO_COORDINADOR' || e === 'OBSERVADO_DEC' || e === 'OBSERVADO')) {
    return 'C.C. subsanado';
  }
  return ESTADOS_CUADRO_VIGENTE_LABEL[e] || e || 'C.C. en elaboración';
}

function extractWorkflowSnapshot(row = {}) {
  const direct = row.workflowSnapshot || row.workflow_snapshot;
  if (direct && typeof direct === 'object') return direct;
  try {
    const p = typeof row.payload === 'string' ? JSON.parse(row.payload || '{}') : (row.payload || {});
    return p.workflowSnapshot || p.workflow_snapshot || null;
  } catch (_) {
    return null;
  }
}

function resolveWorkflowEtapa(row = {}, snap = null) {
  const s = snap || extractWorkflowSnapshot(row);
  if (s?.etapaActual) return String(s.etapaActual).toUpperCase();
  const e = String(row.estado_actual || row.estadoActual || row.etapa || '').toUpperCase();
  return e;
}

function pickBestCode(codes) {
  let best = '';
  let bestPrio = -1;
  for (const raw of codes) {
    const c = normalizeEstadoCuadroVigente(raw);
    if (!c || (PRIORIDAD_INDEX[c] == null && c !== 'ANULADO')) continue;
    const p = c === 'ANULADO' ? 999 : prioridadEstadoCuadro(c);
    if (p > bestPrio) {
      bestPrio = p;
      best = c;
    }
  }
  return best;
}

function hasCodigoCcpActivo(row = {}, opts = {}) {
  if (opts.ccpActivo === true || opts.ccp_activo === true) return true;
  if (row.ccp_activo === true || row.tiene_codigo === true || row.ccp_registrado === true) return true;
  const estadoHint = normalizeEstadoCuadroVigente(
    opts.estadoCcp || row.estado_ccp || row.estado_codigo || row.estado_vigente || '',
  );
  if (estadoHint === 'CCP_REGISTRADO') return true;
  const codigo = String(opts.codigoCcp || row.codigo_ccp || row.codigoCcp || '').trim();
  return !!codigo;
}

function hasEnviadaOppm(row = {}, opts = {}) {
  if (opts.enviadaOppm === true || row.enviada_oppm === true) return true;
  const e = normalizeEstadoCuadroVigente(
    opts.consolidacionEstado || row.consolidacion_estado || row.estado_ccp || '',
  );
  return e === 'ENVIADA_OPPM';
}

/**
 * Resuelve el estado vigente del expediente.
 * Observaciones históricas NUNCA reemplazan un estado posterior (p. ej. DERIVADO_CCP / CCP_REGISTRADO).
 *
 * @returns {{ code: string, label: string, workflowEtapa: string, derivadoCcp: boolean, ccpRegistrado: boolean, soloLectura: boolean, fuente: string }}
 */
export function resolveEstadoActualExpediente(row = {}, opts = {}) {
  const snap = extractWorkflowSnapshot(row);
  const workflowEtapa = String(
    opts.workflowEtapa || resolveWorkflowEtapa(row, snap) || '',
  ).toUpperCase();
  const solicitudEstado = String(
    row.solicitud_estado || row.estado_solicitud || opts.solicitudEstado || '',
  ).toUpperCase();

  // 0) CCP registrado (código vigente) — máxima prioridad visual
  if (hasCodigoCcpActivo(row, opts)) {
    return {
      code: 'CCP_REGISTRADO',
      label: 'CCP registrado',
      workflowEtapa: workflowEtapa || 'CCP',
      derivadoCcp: true,
      ccpRegistrado: true,
      soloLectura: true,
      fuente: 'ccp_codigo_activo',
    };
  }

  // 0b) Solicitud CCP enviada a OPPM (sin código aún)
  if (hasEnviadaOppm(row, opts)) {
    return {
      code: 'ENVIADA_OPPM',
      label: 'Solicitud enviada a OPPM',
      workflowEtapa: workflowEtapa || 'CCP',
      derivadoCcp: true,
      ccpRegistrado: false,
      soloLectura: true,
      fuente: 'ccp_enviada_oppm',
    };
  }

  // 1) Última transición oficial / etapa CCP prevalece sobre cualquier obs. histórica
  if (
    workflowEtapa === 'CCP'
    || solicitudEstado === 'EN_CCP'
    || normalizeEstadoCuadroVigente(opts.estadoCuadro) === 'DERIVADO_CCP'
    || normalizeEstadoCuadroVigente(row.estado_cuadro) === 'DERIVADO_CCP'
    || normalizeEstadoCuadroVigente(row.cuadro_estado) === 'DERIVADO_CCP'
    || normalizeEstadoCuadroVigente(row.estado) === 'DERIVADO_CCP'
    || normalizeEstadoCuadroVigente(opts.revisionEstado) === 'DERIVADO_CCP'
    || normalizeEstadoCuadroVigente(snap?.revisionEstado) === 'DERIVADO_CCP'
  ) {
    return {
      code: 'DERIVADO_CCP',
      label: 'Derivado a CCP',
      workflowEtapa: workflowEtapa || 'CCP',
      derivadoCcp: true,
      ccpRegistrado: false,
      soloLectura: true,
      fuente: 'workflow_ccp',
    };
  }

  // 2) Preferir estado documental actual del cuadro (DB) sobre flags históricos
  const estadoCuadroAuth = pickBestCode([
    opts.estadoCuadro,
    row.estado_cuadro,
    row.cuadro_estado,
    row.estado_cuadro_db,
  ]);
  const revisionAuth = pickBestCode([
    opts.revisionEstado,
    snap?.revisionEstado,
  ]);

  let best = '';
  if (estadoCuadroAuth && revisionAuth) {
    best = prioridadEstadoCuadro(estadoCuadroAuth) >= prioridadEstadoCuadro(revisionAuth)
      ? estadoCuadroAuth
      : revisionAuth;
  } else {
    best = estadoCuadroAuth || revisionAuth || pickBestCode([row.estado]);
  }

  if (!best && workflowEtapa === 'CUADRO_COMPARATIVO') {
    best = 'CUADRO_BORRADOR';
  }

  const datos = row.datos_json || row.cuadro_datos || {};
  const label = labelEstadoCuadroVigente(best, {
    respuesta_observaciones: opts.respuesta_observaciones
      || row.respuesta_observaciones
      || datos.respuesta_observaciones
      || '',
    subsanado: !!opts.subsanado || !!row.subsanado,
  });

  return {
    code: best || 'PENDIENTE_ELABORAR',
    label: label || 'C.C. en elaboración',
    workflowEtapa,
    derivadoCcp: false,
    ccpRegistrado: false,
    soloLectura: ['DERIVADO_CCP', 'CCP_REGISTRADO', 'ENVIADA_OPPM', 'ANULADO', 'PENDIENTE_COORDINADOR', 'PENDIENTE_DEC', 'FIRMADO_COORDINADOR'].includes(best),
    fuente: best ? 'prioridad_cuadro' : 'default',
  };
}

export function esExpedienteDerivadoCcp(row = {}, opts = {}) {
  return resolveEstadoActualExpediente(row, opts).derivadoCcp === true;
}

export function esExpedienteCcpRegistrado(row = {}, opts = {}) {
  return resolveEstadoActualExpediente(row, opts).ccpRegistrado === true
    || resolveEstadoActualExpediente(row, opts).code === 'CCP_REGISTRADO';
}

/** Mismo morado que Invitaciones / estadoVisualPresenter (CCP / DEC). */
export const BADGE_COLOR_CCP = '#6f42c1';
/** Verde institucional para CCP registrado (distinto de Derivado a CCP). */
export const BADGE_COLOR_CCP_REGISTRADO = '#198754';

/**
 * Atributos visuales del badge para el estado vigente.
 * CCP_REGISTRADO → verde; DERIVADO_CCP → morado.
 */
export function badgeVisualEstadoVigente(rowOrCode = {}, opts = {}) {
  const row = (rowOrCode && typeof rowOrCode === 'object')
    ? rowOrCode
    : { estado_cuadro: rowOrCode, estado: rowOrCode };
  const vigente = resolveEstadoActualExpediente(row, opts);

  if (vigente.code === 'CCP_REGISTRADO' || vigente.ccpRegistrado) {
    return {
      code: 'CCP_REGISTRADO',
      label: 'CCP registrado',
      className: 'badge badge-estado-mod',
      style: `background:${BADGE_COLOR_CCP_REGISTRADO};color:#fff`,
      bootstrap: 'success',
      derivadoCcp: true,
      ccpRegistrado: true,
      color: BADGE_COLOR_CCP_REGISTRADO,
    };
  }
  if (vigente.code === 'ENVIADA_OPPM') {
    return {
      code: 'ENVIADA_OPPM',
      label: 'Solicitud enviada a OPPM',
      className: 'badge badge-estado-mod',
      style: `background:#0d6efd;color:#fff`,
      bootstrap: 'primary',
      derivadoCcp: true,
      ccpRegistrado: false,
      color: '#0d6efd',
    };
  }
  if (vigente.derivadoCcp || vigente.code === 'DERIVADO_CCP') {
    return {
      code: 'DERIVADO_CCP',
      label: 'Derivado a CCP',
      className: 'badge badge-estado-mod',
      style: `background:${BADGE_COLOR_CCP};color:#fff`,
      bootstrap: null,
      derivadoCcp: true,
      ccpRegistrado: false,
      color: BADGE_COLOR_CCP,
    };
  }
  return {
    code: vigente.code,
    label: vigente.label,
    className: 'badge',
    style: '',
    bootstrap: null,
    derivadoCcp: false,
    ccpRegistrado: false,
    color: null,
  };
}

export function renderBadgeEstadoVigenteHtml(rowOrCode, escFn = (s) => String(s ?? ''), opts = {}) {
  const v = badgeVisualEstadoVigente(rowOrCode, opts);
  if (v.code === 'CCP_REGISTRADO' || v.code === 'ENVIADA_OPPM' || v.derivadoCcp) {
    return `<span class="${v.className}" style="${v.style}">${escFn(v.label)}</span>`;
  }
  const boot = opts.bootstrapClass || opts.fallbackBootstrap || 'secondary';
  return `<span class="badge bg-${boot}">${escFn(v.label || opts.fallbackLabel || '—')}</span>`;
}
