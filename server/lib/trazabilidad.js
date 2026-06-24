// Sistema transversal de trazabilidad de expedientes (requerimientos)
import { query } from '../db.js';
import { getUsuarioMap, aplicarNombresUsuariosHistorial, resolveUsuarioNombreSync } from './usuarioDisplay.js';
import { submoduloLabelToEtapa, resolveEstadoFromDestino, resolveResponsableFromDestino, formatSubsanacionTraza } from './observacionDestino.js';
import {
  getSubModuloMeta,
  parseMovimientos,
  buildMovimientoEntry,
  appendMovimiento,
  movimientosFromHistorialEstados,
  normalizeAccion,
  SUBMODULOS,
} from './movimientos.js';

export { SUBMODULOS, normalizeAccion, getSubModuloMeta };

export const ETAPAS = {
  REGISTRADO: { label: 'Registrado', responsable: 'Usuario AU' },
  EVALUACION: { label: 'Evaluación', responsable: 'Director / Gerente' },
  DEC: { label: 'DEC', responsable: 'DEC' },
  PROGRAMACION: { label: 'Programación', responsable: 'Programador' },
  ACTOS_PREPARATORIOS: { label: 'Coordinación CM', responsable: 'Coordinador de Contratos Menores' },
  INVITACIONES: { label: 'Invitaciones', responsable: 'Especialista Contrataciones' },
  RECEPCION_COTIZACIONES: { label: 'Recepción de Cotizaciones', responsable: 'Especialista Contrataciones' },
  VALIDACION_USUARIO: { label: 'Validación de Usuario', responsable: 'Área Usuaria' },
  CUADRO_COMPARATIVO: { label: 'Cuadro Comparativo', responsable: 'Especialista Contrataciones' },
  CCP: { label: 'CCP', responsable: 'Comité de Compras Públicas' },
  EJECUCION: { label: 'Ejecución Contractual', responsable: 'Ejecutor Contractual' },
  REGISTRO_ORDEN: { label: 'Registro de Orden', responsable: 'Registro de Órdenes' },
  ALMACEN: { label: 'Almacén', responsable: 'Almacén' },
  TESORERIA: { label: 'Tesorería', responsable: 'Tesorería' },
  FINALIZADO: { label: 'Finalizado', responsable: '—' },
  OBSERVADO: { label: 'Observado', responsable: 'Revisión' },
};

export const ESTADO_ACTUAL_TEXTO = {
  REGISTRADO: 'En Registro',
  EVALUACION: 'En Evaluación de Requerimientos',
  DEC: 'En DEC',
  PROGRAMACION: 'En Programación',
  ACTOS_PREPARATORIOS: 'En Coordinación CM',
  INVITACIONES: 'En Invitaciones',
  RECEPCION_COTIZACIONES: 'En Recep. Cotiz.',
  VALIDACION_USUARIO: 'En Valid. Usuario',
  CUADRO_COMPARATIVO: 'En Cuadro Comp.',
  CCP: 'En CCP',
  EJECUCION: 'En Ejecución',
  REGISTRO_ORDEN: 'En Reg. Orden',
  ALMACEN: 'En Almacén',
  TESORERIA: 'En Tesorería',
  FINALIZADO: 'Finalizado',
  OBSERVADO: 'Observado',
};

export function isEstadoObservado(estado) {
  return /observ/i.test(String(estado || '').trim());
}

export const TRAZA_EXTRA_SELECT = `
  r.estado_actual, r.sub_modulo_actual, r.responsable_actual, r.fecha_estado_actual,
  r.historial_estados, r.historial_movimientos
`;

export function mapEstadoToUbicacion(estado) {
  const e = String(estado || '').trim();
  if (!e || e === 'Registrado') return 'REGISTRADO';
  if (/observado program/i.test(e)) return 'PROGRAMACION';
  if (/en programaci/i.test(e)) return 'PROGRAMACION';
  if (/aprobad.*program/i.test(e)) return 'ACTOS_PREPARATORIOS';
  if (e === 'Aprobado DEC') return 'PROGRAMACION';
  if (/observado dec/i.test(e)) return 'PROGRAMACION';
  if (e === 'Aprobado') return 'DEC';
  if (e === 'Observado') return 'EVALUACION';
  if (/tr[aá]mite/i.test(e)) return 'EVALUACION';
  if (e === 'Programado') return 'ACTOS_PREPARATORIOS';
  if (/actos prep|coordinaci[oó]n cm/i.test(e)) return 'ACTOS_PREPARATORIOS';
  if (/observado actos|observado coordin/i.test(e)) return 'ACTOS_PREPARATORIOS';
  if (/invitaci/i.test(e)) return 'INVITACIONES';
  if (/cotizaci/i.test(e)) return 'RECEPCION_COTIZACIONES';
  if (/cuadro comp/i.test(e)) return 'CUADRO_COMPARATIVO';
  if (/\bccp\b/i.test(e) || /en ccp/i.test(e)) return 'CCP';
  if (/ejecuci/i.test(e)) return 'EJECUCION';
  if (/finaliz/i.test(e)) return 'FINALIZADO';
  return 'REGISTRADO';
}

export function mapEstadoToEtapa(estado) {
  return mapEstadoToUbicacion(estado);
}

/** Corrige desfase entre `estado` (negocio) y `estado_actual` (trazabilidad). */
export function resolveEstadoNegocioFromRow(row) {
  const estado = String(row?.estado || '').trim();
  const etapaActual = String(row?.estado_actual || '').toUpperCase();
  if (etapaActual === 'PROGRAMACION' && /tr[aá]mite|observ/i.test(estado) && !/programaci/i.test(estado)) {
    return 'En Programación';
  }
  if (etapaActual === 'EVALUACION' && /programaci/i.test(estado)) {
    return 'En tramite de aprobación';
  }
  if (etapaActual === 'DEC' && /tr[aá]mite/i.test(estado)) {
    return 'Aprobado';
  }
  return estado;
}

/** Ubicación efectiva del expediente combinando estado de negocio y trazabilidad. */
export function resolveUbicacionExpediente(row) {
  const estadoNegocio = resolveEstadoNegocioFromRow(row);
  const fromEstado = mapEstadoToUbicacion(estadoNegocio);
  const fromDb = String(row?.estado_actual || '').toUpperCase();
  if (!fromDb) return fromEstado;
  if (fromDb === fromEstado) return fromDb;
  const stages = ['REGISTRADO', 'EVALUACION', 'DEC', 'PROGRAMACION', 'ACTOS_PREPARATORIOS', 'FINALIZADO'];
  const iEst = stages.indexOf(fromEstado);
  const iDb = stages.indexOf(fromDb);
  if (iDb >= 0 && iEst >= 0 && iDb > iEst) return fromDb;
  if (/tr[aá]mite/i.test(String(row?.estado || '')) && fromDb === 'PROGRAMACION') return 'PROGRAMACION';
  return fromEstado;
}

export function getEstadoActualTexto(ubicacionCode) {
  const code = String(ubicacionCode || 'REGISTRADO').toUpperCase();
  return ESTADO_ACTUAL_TEXTO[code] || ESTADO_ACTUAL_TEXTO.REGISTRADO;
}

export function inferAccion(estadoAnterior, estadoNuevo, accionExplicita) {
  if (accionExplicita) return accionExplicita;
  const nuevo = String(estadoNuevo || '');
  const anterior = String(estadoAnterior || '');
  if (/observ/i.test(nuevo)) return 'observado';
  if (/rechaz/i.test(nuevo)) return 'rechazado';
  if (/devuelt/i.test(nuevo)) return 'devuelto';
  if (/tr[aá]mite/i.test(nuevo) && /observ/i.test(anterior)) return 'reenviado';
  if (/aprobad/i.test(nuevo)) return 'aprobado';
  if (nuevo !== anterior) return 'derivado';
  return 'actualizado';
}

export function calcDiasEnEstado(fechaEstadoActual) {
  if (!fechaEstadoActual) return 0;
  const t = new Date(fechaEstadoActual).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

export function calcDiasBetween(fechaIngreso, fechaSalida) {
  if (!fechaIngreso) return 0;
  const ini = new Date(fechaIngreso).getTime();
  const fin = fechaSalida ? new Date(fechaSalida).getTime() : Date.now();
  if (Number.isNaN(ini) || Number.isNaN(fin)) return 0;
  return Math.max(0, Math.floor((fin - ini) / 86400000));
}

function parseHistorial(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function closeOpenEntry(historial, fechaSalida) {
  const h = historial.map((x) => ({ ...x }));
  for (let i = h.length - 1; i >= 0; i -= 1) {
    if (!h[i].fechaSalida) {
      h[i].fechaSalida = fechaSalida;
      h[i].dias = calcDiasBetween(h[i].fechaIngreso, fechaSalida);
      break;
    }
  }
  return h;
}

export function buildHistorialEntry({
  etapa, usuario, fechaIngreso, observacion = '', accion = 'derivado',
}) {
  const meta = ETAPAS[etapa] || { label: etapa, responsable: usuario };
  return {
    estado: etapa,
    estadoTexto: meta.label,
    usuario: usuario || 'Sistema',
    fechaIngreso,
    fechaSalida: null,
    dias: 0,
    observacion: observacion || '',
    accion,
  };
}

export function initHistorialFromRow(row, usuario) {
  const etapa = mapEstadoToEtapa(row.estado);
  const fecha = row.created_at || new Date().toISOString();
  return [buildHistorialEntry({
    etapa,
    usuario: usuario || row.usuario_modificacion || row.responsable || 'Sistema',
    fechaIngreso: fecha,
    observacion: 'Registro inicial del requerimiento',
    accion: 'creacion',
  })];
}

function parsePayload(row) {
  try { return JSON.parse(row?.payload || '{}'); } catch (_) { return {}; }
}

function getPipelineForEstado(estado) {
  const e = String(estado || 'Registrado').trim();
  const stages = ['REGISTRADO'];
  if (e === 'Registrado') return stages;
  stages.push('EVALUACION');
  if (e === 'Observado' || /tr[aá]mite/i.test(e)) return stages;
  if (/^Aprobado$/i.test(e)) { stages.push('DEC'); return stages; }
  if (/observado dec/i.test(e)) { stages.push('DEC'); return stages; }
  if (/aprobad.*dec/i.test(e)) { stages.push('DEC', 'PROGRAMACION'); return stages; }
  if (/observado program/i.test(e)) { stages.push('DEC', 'PROGRAMACION'); return stages; }
  if (/aprobad.*program/i.test(e)) { stages.push('DEC', 'PROGRAMACION'); return stages; }
  if (e === 'Programado') { stages.push('DEC', 'PROGRAMACION', 'ACTOS_PREPARATORIOS'); return stages; }
  return stages;
}

function collectRawEvents(row) {
  const payload = parsePayload(row);
  const events = [];

  const push = (evt) => {
    if (!evt.fecha) return;
    const t = new Date(evt.fecha).getTime();
    if (Number.isNaN(t)) return;
    events.push({
      ...evt,
      fecha: new Date(evt.fecha).toISOString(),
      ts: t,
    });
  };

  push({
    fecha: row.created_at,
    etapa: 'REGISTRADO',
    usuario: row.usuario_modificacion || row.responsable || 'Usuario AU',
    observacion: 'Registro inicial del requerimiento',
    accion: 'creacion',
    tipoEvento: 'etapa',
  });

  (payload.historial_evaluacion || []).forEach((h) => {
    const obs = h.motivo || h.respuesta || h.observacion || (
      h.tipo === 'aprobacion' ? 'Aprobado en evaluación — derivado a DEC'
        : h.tipo === 'derivacion' ? (h.observacion || 'Solicitud de aprobación enviada a evaluación')
          : h.tipo === 'subsanacion' ? 'Subsanación enviada por el usuario'
            : h.tipo === 'observacion' ? 'Observación registrada en evaluación' : ''
    );
    const tipoEv = h.tipo === 'observacion' ? 'observacion' : h.tipo === 'subsanacion' ? 'subsanacion' : 'etapa';
    push({
      fecha: h.fecha,
      etapa: 'EVALUACION',
      usuario: h.usuario || 'Gerente',
      observacion: obs,
      accion: h.tipo === 'aprobacion' ? 'aprobado' : h.tipo === 'observacion' ? 'observado' : h.tipo === 'subsanacion' ? 'reenviado' : h.tipo === 'derivacion' ? 'derivado' : 'actualizado',
      tipoEvento: tipoEv,
    });
  });

  (payload.observaciones || []).forEach((o) => {
    const origen = String(o.origen || o.moduloOrigen || 'GERENTE').toUpperCase();
    let etapa = 'EVALUACION';
    if (origen.includes('DEC')) etapa = 'DEC';
    else if (origen.includes('PROGRAM')) etapa = 'PROGRAMACION';
    else if (origen.includes('ACTOS') || String(o.origen_submodulo || '').includes('Actos')) etapa = 'ACTOS_PREPARATORIOS';
    else if (origen.includes('INVITAC')) etapa = 'INVITACIONES';
    if (o.motivo || o.observacion) {
      push({
        fecha: o.fecha || row.updated_at || row.created_at,
        etapa,
        usuario: o.gerente || o.usuarioOrigen || origen,
        observacion: o.motivo || o.observacion,
        accion: 'observado',
        tipoEvento: 'observacion',
      });
    }
    const respuestaTexto = o.respuesta || o.subsanacion;
    if (respuestaTexto) {
      const etapaSub = submoduloLabelToEtapa(o.subsanacion_origen_submodulo || o.modulo_respuesta)
        || (origen.includes('ACTOS') ? 'ACTOS_PREPARATORIOS' : origen.includes('PROGRAM') ? 'PROGRAMACION' : origen === 'DEC' ? 'DEC' : 'REGISTRADO');
      push({
        fecha: o.fecha_respuesta || o.fecha_subsana || o.fecha || row.updated_at,
        etapa: etapaSub,
        usuario: o.usuario_respuesta || o.usuario_subsana || row.usuario_modificacion || 'Usuario AU',
        observacion: respuestaTexto,
        accion: 'subsanado',
        tipoEvento: 'subsanacion',
        destinoSubmodulo: o.subsanacion_destino_submodulo || '',
        destinoEtapa: o.subsanacion_destino_etapa || submoduloLabelToEtapa(o.subsanacion_destino_submodulo) || '',
      });
    }
  });

  (payload.historial_actos || []).forEach((h) => {
    const obsMap = {
      asignacion: `Asignado a ${h.analista || 'analista'}`,
      derivacion_analista: `Derivado a ${h.analista || 'analista'}`,
      aprobacion_invitaciones: `Derivado a Invitaciones — ${h.responsable_destino || ''}`.trim(),
    };
    push({
      fecha: h.fecha,
      etapa: h.tipo === 'aprobacion_invitaciones' ? 'INVITACIONES' : 'ACTOS_PREPARATORIOS',
      usuario: h.usuario || 'Coordinador de Contratos Menores',
      observacion: obsMap[h.tipo] || h.observacion || 'Movimiento en Coordinación CM',
      accion: h.tipo === 'aprobacion_invitaciones' ? 'aprobado' : h.tipo === 'asignacion' ? 'asignacion' : 'derivado',
      tipoEvento: 'etapa',
    });
  });

  (payload.historial_dec || []).forEach((h) => {
    const esAprob = h.tipo === 'aprobacion_dec' || h.tipo === 'aprobacion';
    push({
      fecha: h.fecha,
      etapa: 'DEC',
      usuario: h.usuario || 'DEC',
      observacion: esAprob ? 'Aprobado por DEC — derivado a Programación' : (h.observacion || 'Movimiento en DEC'),
      accion: esAprob ? 'aprobado' : 'actualizado',
      tipoEvento: 'etapa',
    });
  });

  (payload.historial_programacion || []).forEach((h) => {
    push({
      fecha: h.fecha,
      etapa: 'PROGRAMACION',
      usuario: h.usuario || 'Programación',
      observacion: 'Aprobación en Programación',
      accion: 'aprobado',
      tipoEvento: 'etapa',
    });
  });

  if (String(row.estado || '') !== 'Registrado') {
    const subsanaciones = events.filter((e) => e.tipoEvento === 'subsanacion').sort((a, b) => a.ts - b.ts);
    const targets = [{ kind: 'initial' }];
    subsanaciones.forEach((s) => targets.push({ kind: 'resend', afterTs: s.ts, destinoEtapa: s.destinoEtapa, destinoSubmodulo: s.destinoSubmodulo }));
    let derivados = events.filter((e) => e.etapa === 'EVALUACION' && e.accion === 'derivado').length;
    let derivadosProg = events.filter((e) => e.etapa === 'PROGRAMACION' && e.accion === 'derivado').length;
    for (let i = derivados + derivadosProg; i < targets.length; i += 1) {
      const t = targets[i];
      const destEtapa = submoduloLabelToEtapa(t.destinoSubmodulo) || t.destinoEtapa || 'EVALUACION';
      let fecha;
      if (t.kind === 'initial') {
        const evalEvents = events.filter((e) => e.etapa === 'EVALUACION');
        const firstEvalTs = evalEvents.length
          ? Math.min(...evalEvents.map((e) => e.ts))
          : new Date(row.updated_at || row.created_at).getTime();
        fecha = new Date(Math.max(firstEvalTs - 60000, new Date(row.created_at).getTime())).toISOString();
      } else {
        fecha = new Date(t.afterTs + 1000).toISOString();
      }
      const destLabel = destEtapa === 'PROGRAMACION' ? 'Programación' : 'Evaluación de Requerimiento';
      push({
        fecha,
        etapa: destEtapa,
        usuario: row.usuario_modificacion || ETAPAS[destEtapa]?.responsable || ETAPAS.EVALUACION.responsable,
        observacion: t.kind === 'initial'
          ? 'Solicitud de aprobación enviada a evaluación'
          : `Reenviado a ${destLabel} tras subsanación`,
        accion: 'derivado',
        tipoEvento: 'etapa',
        inferido: true,
      });
      if (destEtapa === 'PROGRAMACION') derivadosProg += 1;
      else derivados += 1;
    }
  }

  const estadoStr = String(row.estado || '');
  if (/^Aprobado$/i.test(estadoStr) || /observado dec/i.test(estadoStr) || /aprobad/i.test(estadoStr)) {
    const aprobacionesEval = events.filter((e) => e.etapa === 'EVALUACION' && e.accion === 'aprobado').length;
    const aprobacionesPayload = (payload.historial_evaluacion || []).filter((h) => h.tipo === 'aprobacion').length;
    const faltantes = Math.max(aprobacionesPayload, /^Aprobado$/i.test(estadoStr) || /observado dec/i.test(estadoStr) ? 1 : 0) - aprobacionesEval;
    for (let i = 0; i < faltantes; i += 1) {
      const decTs = events.filter((e) => e.etapa === 'DEC').map((e) => e.ts);
      const refTs = decTs.length ? Math.min(...decTs) - 60000 : new Date(row.updated_at || row.created_at).getTime();
      push({
        fecha: new Date(Math.max(refTs, new Date(row.created_at).getTime())).toISOString(),
        etapa: 'EVALUACION',
        usuario: ETAPAS.EVALUACION.responsable,
        observacion: 'Aprobado en evaluación — derivado a DEC',
        accion: 'aprobado',
        tipoEvento: 'etapa',
        inferido: true,
      });
    }
  }

  return events;
}

function inferStageTransitions(row, events) {
  const pipeline = getPipelineForEstado(row.estado);
  const created = new Date(row.created_at || Date.now()).getTime();
  const end = new Date(row.fecha_estado_actual || row.updated_at || Date.now()).getTime();
  const span = Math.max(end - created, 3600000);
  const step = Math.max(Math.floor(span / Math.max(pipeline.length - 1, 1)), 3600000);

  pipeline.forEach((etapa, idx) => {
    if (idx === 0) return;
    const hasStage = events.some((e) => e.etapa === etapa && (
      (e.tipoEvento === 'etapa' && e.accion !== 'observado')
      || e.tipoEvento === 'observacion'
      || e.tipoEvento === 'subsanacion'
    ));
    if (!hasStage) {
      const fecha = new Date(created + step * idx).toISOString();
      const meta = ETAPAS[etapa];
      events.push({
        fecha,
        ts: new Date(fecha).getTime(),
        etapa,
        usuario: meta?.responsable || 'Sistema',
        observacion: `Expediente en ${meta?.label || etapa}`,
        accion: 'derivado',
        tipoEvento: 'etapa',
        inferido: true,
      });
    }
  });
}

function dedupeEvents(events) {
  const sorted = events.slice().sort((a, b) => a.ts - b.ts);
  const out = [];
  sorted.forEach((e) => {
    if (e.tipoEvento === 'observacion' || e.tipoEvento === 'subsanacion') {
      out.push(e);
      return;
    }
    const dup = out.find((d) => (
      d.tipoEvento !== 'observacion'
      && d.tipoEvento !== 'subsanacion'
      && Math.abs(d.ts - e.ts) < 120000
      && d.etapa === e.etapa
      && d.accion === e.accion
      && String(d.observacion || '') === String(e.observacion || '')
    ));
    if (!dup) out.push(e);
  });
  return out;
}

export function reconstruirHistorialCompleto(row) {
  let events = collectRawEvents(row);
  inferStageTransitions(row, events);
  events = dedupeEvents(events);

  return events.map((e, idx) => {
    const next = events[idx + 1];
    const meta = ETAPAS[e.etapa] || { label: e.etapa };
    let estadoTexto = meta.label;
    if (e.tipoEvento === 'observacion') estadoTexto = `${meta.label} — Observación`;
    else if (e.tipoEvento === 'subsanacion') estadoTexto = `${meta.label} — Subsanación`;

    return {
      estado: e.etapa,
      estadoTexto,
      usuario: e.usuario || '—',
      fechaIngreso: e.fecha,
      fechaSalida: next ? next.fecha : null,
      dias: next ? calcDiasBetween(e.fecha, next.fecha) : calcDiasBetween(e.fecha, null),
      observacion: e.observacion || '',
      accion: e.accion,
      tipoEvento: e.tipoEvento || 'etapa',
      esActual: idx === events.length - 1,
      inferido: !!e.inferido,
    };
  });
}

export function enrichRequerimientoRow(row) {
  if (!row) return row;
  const historial = reconstruirHistorialCompleto(row);
  const ultimo = historial[historial.length - 1];
  const estadoNegocio = resolveEstadoNegocioFromRow(row);
  const ubicacion = resolveUbicacionExpediente(row);
  const subMeta = getSubModuloMeta(ubicacion);
  const fechaEstado = ultimo?.fechaIngreso || row.fecha_estado_actual || row.created_at || row.updated_at;
  const meta = ETAPAS[ubicacion] || {};
  const dias = calcDiasEnEstado(fechaEstado);
  const estadoTexto = /^En /i.test(estadoNegocio)
    ? estadoNegocio
    : getEstadoActualTexto(ubicacion);
  let movimientos = parseMovimientos(row.historial_movimientos);
  if (!movimientos.length && historial.length) {
    movimientos = movimientosFromHistorialEstados(historial);
  }
  return {
    ...row,
    estado: estadoNegocio,
    estado_actual: ubicacion,
    estadoActual: ubicacion,
    estado_actual_texto: estadoTexto,
    estadoActualTexto: estadoTexto,
    sub_modulo_actual: row.sub_modulo_actual || subMeta.subModulo,
    subModuloActual: row.sub_modulo_actual || subMeta.subModulo,
    responsable_actual: row.responsable_actual || meta.responsable || row.responsable || '',
    responsableActual: row.responsable_actual || meta.responsable || row.responsable || '',
    fecha_estado_actual: fechaEstado,
    fechaEstadoActual: fechaEstado,
    fechaIngresoActual: fechaEstado,
    dias_en_estado: dias,
    diasEnEstado: dias,
    retrasado: dias > 10,
    historial_estados: historial,
    historialEstados: historial,
    historial_movimientos: movimientos,
    historialMovimientos: movimientos,
  };
}

export async function registrarMovimiento({
  requerimientoId,
  estadoNuevo,
  usuario = 'Sistema',
  accion,
  observacion = '',
  responsable = null,
}) {
  const { rows } = await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
  if (!rows.length) throw new Error('Requerimiento no encontrado');
  const row = rows[0];
  const now = new Date().toISOString();
  const etapaNueva = mapEstadoToEtapa(estadoNuevo);
  const etapaAnterior = row.estado_actual || mapEstadoToEtapa(row.estado);
  const accionFinal = inferAccion(row.estado, estadoNuevo, accion);

  let historial = parseHistorial(row.historial_estados);
  if (!historial.length) historial = initHistorialFromRow(row, usuario);

  const cambioEtapa = etapaNueva !== etapaAnterior;
  const cambioEstado = String(estadoNuevo) !== String(row.estado);

  if (cambioEtapa || cambioEstado) {
    historial = closeOpenEntry(historial, now);
    historial.push(buildHistorialEntry({
      etapa: etapaNueva,
      usuario,
      fechaIngreso: now,
      observacion,
      accion: accionFinal,
    }));
  } else if (observacion) {
    for (let i = historial.length - 1; i >= 0; i -= 1) {
      if (!historial[i].fechaSalida) {
        historial[i].observacion = observacion;
        historial[i].accion = accionFinal;
        break;
      }
    }
  }

  const responsableActual = responsable || ETAPAS[etapaNueva]?.responsable || usuario || row.responsable_actual || '';
  const subMeta = getSubModuloMeta(etapaNueva);

  let movimientos = parseMovimientos(row.historial_movimientos);
  if (cambioEtapa || cambioEstado || observacion) {
    movimientos = appendMovimiento(movimientos, buildMovimientoEntry({
      fecha: now,
      accion: accionFinal,
      etapa: etapaNueva,
      usuario,
      responsable: responsableActual,
      observacion,
    }));
  }

  await query(`
    UPDATE requerimientos SET
      estado = $2,
      estado_actual = $3,
      sub_modulo_actual = $4,
      responsable_actual = $5,
      fecha_estado_actual = $6,
      historial_estados = $7::jsonb,
      historial_movimientos = $8::jsonb,
      updated_at = NOW()
    WHERE id = $1
  `, [
    requerimientoId, estadoNuevo, etapaNueva, subMeta.subModulo,
    responsableActual, now, JSON.stringify(historial), JSON.stringify(movimientos),
  ]);

  const { rows: freshRows } = await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
  const fresh = freshRows[0];
  const historialCompleto = reconstruirHistorialCompleto(fresh);
  const ultimoEvt = historialCompleto[historialCompleto.length - 1];
  const fechaEstado = ultimoEvt?.fechaIngreso || now;
  await query(
    `UPDATE requerimientos SET historial_estados = $2::jsonb, historial_movimientos = $3::jsonb, fecha_estado_actual = $4, sub_modulo_actual = $5 WHERE id = $1`,
    [
      requerimientoId,
      JSON.stringify(historialCompleto),
      JSON.stringify(movimientosFromHistorialEstados(historialCompleto)),
      fechaEstado,
      getSubModuloMeta(etapaNueva).subModulo,
    ],
  );

  return enrichRequerimientoRow(fresh);
}

/** Registra subsanación en origen y derivación al submódulo destino seleccionado. */
export async function registrarSubsanacionDerivacion({
  requerimientoId,
  usuario = 'Sistema',
  textoSubsanacion,
  origenSubmodulo = 'Registro de Requerimiento',
  destinoSubmodulo = '',
  destinoEtapa = '',
  destinoPersona = '',
}) {
  const { rows } = await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
  if (!rows.length) throw new Error('Requerimiento no encontrado');
  const row = rows[0];
  const now = new Date().toISOString();
  const etapaOrigen = submoduloLabelToEtapa(origenSubmodulo) || 'REGISTRADO';
  const etapaDestino = submoduloLabelToEtapa(destinoSubmodulo) || String(destinoEtapa || 'EVALUACION').toUpperCase();
  const estadoNuevo = resolveEstadoFromDestino(destinoSubmodulo, etapaDestino);
  const responsableDestino = resolveResponsableFromDestino(destinoSubmodulo, destinoPersona, etapaDestino);
  const subMetaDest = getSubModuloMeta(etapaDestino);
  const t2 = new Date(Date.now() + 1).toISOString();

  let movimientos = parseMovimientos(row.historial_movimientos);
  movimientos = appendMovimiento(movimientos, buildMovimientoEntry({
    fecha: now,
    accion: 'subsanado',
    etapa: etapaOrigen,
    usuario,
    responsable: usuario,
    observacion: textoSubsanacion,
  }));
  movimientos = appendMovimiento(movimientos, buildMovimientoEntry({
    fecha: t2,
    accion: 'derivado',
    etapa: etapaDestino,
    usuario,
    responsable: responsableDestino,
    observacion: `Derivado a ${subMetaDest.subModulo} tras subsanación`,
  }));

  let historial = parseHistorial(row.historial_estados);
  if (!historial.length) historial = initHistorialFromRow(row, usuario);
  historial = closeOpenEntry(historial, now);
  historial.push(buildHistorialEntry({
    etapa: etapaOrigen,
    usuario,
    fechaIngreso: now,
    observacion: textoSubsanacion,
    accion: 'subsanado',
  }));
  historial.push(buildHistorialEntry({
    etapa: etapaDestino,
    usuario,
    fechaIngreso: t2,
    observacion: `Derivado a ${subMetaDest.subModulo}`,
    accion: 'derivado',
  }));

  await query(`
    UPDATE requerimientos SET
      estado = $2,
      estado_actual = $3,
      sub_modulo_actual = $4,
      responsable_actual = $5,
      fecha_estado_actual = $6,
      historial_movimientos = $7::jsonb,
      historial_estados = $8::jsonb,
      usuario_modificacion = $9,
      updated_at = NOW()
    WHERE id = $1
  `, [
    requerimientoId,
    estadoNuevo,
    etapaDestino,
    subMetaDest.subModulo,
    responsableDestino,
    t2,
    JSON.stringify(movimientos),
    JSON.stringify(historial),
    usuario,
  ]);

  const { rows: freshRows } = await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
  const fresh = freshRows[0];
  const historialCompleto = reconstruirHistorialCompleto(fresh);
  const ultimoEvt = historialCompleto[historialCompleto.length - 1];
  await query(
    `UPDATE requerimientos SET historial_estados = $2::jsonb, historial_movimientos = $3::jsonb, fecha_estado_actual = $4, sub_modulo_actual = $5 WHERE id = $1`,
    [
      requerimientoId,
      JSON.stringify(historialCompleto),
      JSON.stringify(movimientosFromHistorialEstados(historialCompleto)),
      ultimoEvt?.fechaIngreso || t2,
      subMetaDest.subModulo,
    ],
  );

  return enrichRequerimientoRow(fresh);
}

export async function inicializarTrazabilidad(requerimientoId, usuario = 'Sistema') {
  const { rows } = await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
  if (!rows.length) return null;
  const row = rows[0];
  if (row.estado_actual && parseHistorial(row.historial_estados).length) {
    return enrichRequerimientoRow(row);
  }
  const historial = initHistorialFromRow(row, usuario);
  const etapa = mapEstadoToEtapa(row.estado);
  const subMeta = getSubModuloMeta(etapa);
  const fecha = row.created_at || new Date().toISOString();
  const responsable = ETAPAS[etapa]?.responsable || row.responsable || usuario;
  const movimientos = appendMovimiento([], buildMovimientoEntry({
    fecha,
    accion: 'CREADO',
    etapa,
    usuario,
    responsable,
    observacion: 'Registro inicial del requerimiento',
  }));
  await query(`
    UPDATE requerimientos SET
      estado_actual = $2,
      sub_modulo_actual = $3,
      responsable_actual = $4,
      fecha_estado_actual = $5,
      historial_estados = $6::jsonb,
      historial_movimientos = $7::jsonb
    WHERE id = $1
  `, [requerimientoId, etapa, subMeta.subModulo, responsable, fecha, JSON.stringify(historial), JSON.stringify(movimientos)]);
  return enrichRequerimientoRow({
    ...row,
    estado_actual: etapa,
    responsable_actual: responsable,
    fecha_estado_actual: fecha,
    historial_estados: historial,
  });
}

export async function obtenerTrazabilidad(requerimientoId) {
  const { rows } = await query(`
    SELECT r.*, COALESCE(c.nombre, '') AS centro_nombre
    FROM requerimientos r
    LEFT JOIN areas a ON r.area = a.nombre
    LEFT JOIN centros c ON a.centro_id = c.id
    WHERE r.id = $1
  `, [requerimientoId]);
  if (!rows.length) return null;
  const enriched = enrichRequerimientoRow(rows[0]);
  const usuarioMap = await getUsuarioMap();
  let historial = aplicarNombresUsuariosHistorial(enriched.historial_estados || [], usuarioMap);
  const historialConDias = historial.map((h, idx) => ({
    ...h,
    dias: h.fechaSalida
      ? calcDiasBetween(h.fechaIngreso, h.fechaSalida)
      : calcDiasBetween(h.fechaIngreso, null),
    esActual: idx === historial.length - 1 && !h.fechaSalida,
  }));
  const responsableActual = resolveUsuarioNombreSync(enriched.responsable_actual, usuarioMap);
  const movimientos = (enriched.historialMovimientos || []).map((m) => ({
    ...m,
    usuario: resolveUsuarioNombreSync(m.usuario, usuarioMap),
    responsable: resolveUsuarioNombreSync(m.responsable, usuarioMap),
  }));
  return {
    requerimiento: {
      id: enriched.id,
      codigo: enriched.codigo,
      tipo: enriched.tipo,
      denominacion: enriched.denominacion,
      area: enriched.area,
      centro: enriched.centro_nombre || enriched.responsable,
      estado: enriched.estado,
    },
    estadoActual: enriched.estado_actual,
    estadoActualTexto: enriched.estadoActualTexto || getEstadoActualTexto(enriched.estado_actual),
    subModuloActual: enriched.subModuloActual,
    responsableActual,
    fechaEstadoActual: enriched.fecha_estado_actual,
    fechaIngresoActual: enriched.fechaIngresoActual || enriched.fecha_estado_actual,
    diasEnEstado: enriched.dias_en_estado,
    retrasado: enriched.retrasado || enriched.dias_en_estado > 10,
    historialEstados: historialConDias,
    historialMovimientos: movimientos,
  };
}

export async function rebuildAllHistorial() {
  const { rows } = await query('SELECT * FROM requerimientos ORDER BY id ASC');
  for (const row of rows) {
    const historial = reconstruirHistorialCompleto(row);
    const ultimo = historial[historial.length - 1];
    const etapa = ultimo?.estado || mapEstadoToEtapa(row.estado);
    const subMeta = getSubModuloMeta(etapa);
    const movs = movimientosFromHistorialEstados(historial);
    const estadoNegocio = resolveEstadoNegocioFromRow({ ...row, estado_actual: etapa });
    await query(`
      UPDATE requerimientos SET
        historial_estados = $2::jsonb,
        historial_movimientos = $3::jsonb,
        estado = $8,
        estado_actual = $4,
        sub_modulo_actual = $5,
        responsable_actual = COALESCE(NULLIF(responsable_actual, ''), $6),
        fecha_estado_actual = $7
      WHERE id = $1
    `, [
      row.id,
      JSON.stringify(historial),
      JSON.stringify(movs),
      etapa,
      subMeta.subModulo,
      ETAPAS[etapa]?.responsable || row.responsable || '',
      ultimo?.fechaIngreso || row.updated_at || row.created_at,
      estadoNegocio,
    ]);
  }
  return rows.length;
}

export async function backfillTrazabilidad() {
  return rebuildAllHistorial();
}

export function buildListFilters(queryParams = {}) {
  const clauses = [];
  const params = [];
  const search = String(queryParams.search || '').trim();
  const estadoActual = String(queryParams.estado_actual || queryParams.estadoActual || '').trim();
  const responsableActual = String(queryParams.responsable_actual || queryParams.responsableActual || '').trim();
  const area = String(queryParams.area || '').trim();
  const codigo = String(queryParams.codigo || queryParams.numero || '').trim();
  const codigoSigamef = String(queryParams.codigo_sigamef || queryParams.codigoSigamef || '').trim();

  const subModulo = String(queryParams.sub_modulo_actual || queryParams.subModuloActual || '').trim();

  if (search) {
    params.push(`%${search}%`);
    const i = params.length;
    clauses.push(`(
      r.codigo ILIKE $${i} OR r.denominacion ILIKE $${i} OR r.area ILIKE $${i}
      OR r.responsable ILIKE $${i} OR r.responsable_actual ILIKE $${i}
      OR r.estado ILIKE $${i} OR r.estado_actual ILIKE $${i}
      OR r.payload ILIKE $${i}
    )`);
  }
  if (estadoActual) {
    params.push(estadoActual.toUpperCase());
    clauses.push(`r.estado_actual = $${params.length}`);
  }
  if (responsableActual) {
    params.push(`%${responsableActual}%`);
    clauses.push(`r.responsable_actual ILIKE $${params.length}`);
  }
  if (area) {
    params.push(`%${area}%`);
    clauses.push(`r.area ILIKE $${params.length}`);
  }
  if (subModulo) {
    params.push(`%${subModulo}%`);
    clauses.push(`r.sub_modulo_actual ILIKE $${params.length}`);
  }
  if (codigo) {
    params.push(`%${codigo}%`);
    clauses.push(`r.codigo ILIKE $${params.length}`);
  }
  if (codigoSigamef) {
    params.push(`%${codigoSigamef}%`);
    clauses.push(`r.payload ILIKE $${params.length}`);
  }
  return { whereExtra: clauses.length ? clauses.join(' AND ') : '', params };
}
