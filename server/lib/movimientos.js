// Bitácora central historialMovimientos — append-only

export const SUBMODULOS = {
  REGISTRADO: { subModulo: 'Registro de Requerimiento', modulo: 'Requerimientos' },
  EVALUACION: { subModulo: 'Evaluación de Requerimiento', modulo: 'Requerimientos' },
  DEC: { subModulo: 'DEC', modulo: 'Contrataciones' },
  PROGRAMACION: { subModulo: 'Programación', modulo: 'Contrataciones' },
  ACTOS_PREPARATORIOS: { subModulo: 'Coordinación CM', modulo: 'Contrataciones' },
  INVITACIONES: { subModulo: 'Invitaciones', modulo: 'Contrataciones' },
  RECEPCION_COTIZACIONES: { subModulo: 'Cotización recibida', modulo: 'Contrataciones' },
  VALIDACION_USUARIO: { subModulo: 'Validación Usuario', modulo: 'Contrataciones' },
  CUADRO_COMPARATIVO: { subModulo: 'Cuadro Comparativo', modulo: 'Contrataciones' },
  CCP: { subModulo: 'CCP', modulo: 'Contrataciones' },
  EJECUCION: { subModulo: 'Ejecución Contractual', modulo: 'Contrataciones' },
  REGISTRO_ORDEN: { subModulo: 'Registro de Orden', modulo: 'Contrataciones' },
  ALMACEN: { subModulo: 'Almacén', modulo: 'Logística' },
  TESORERIA: { subModulo: 'Tesorería', modulo: 'Logística' },
  FINALIZADO: { subModulo: 'Finalizado', modulo: 'SGC' },
};

export const ACCIONES_TRAZA = [
  'CREADO', 'EDITADO', 'APROBADO', 'RECHAZADO', 'OBSERVADO', 'SUBSANADO',
  'DERIVADO', 'REENVIADO', 'FIRMADO', 'DESCARGADO', 'EXPORTADO', 'ANULADO', 'FINALIZADO',
];

export function getSubModuloMeta(etapaCode) {
  const code = String(etapaCode || 'REGISTRADO').toUpperCase();
  return SUBMODULOS[code] || { subModulo: code, modulo: 'SGC' };
}

export function normalizeAccion(accion) {
  const a = String(accion || 'ACTUALIZADO').toLowerCase().replace(/\s+/g, '_');
  if (a === 'creacion' || a === 'creado') return 'CREADO';
  if (a === 'editado' || a === 'actualizado') return 'EDITADO';
  if (a === 'aprobado') return 'APROBADO';
  if (a === 'rechazado') return 'RECHAZADO';
  if (a === 'observado') return 'OBSERVADO';
  if (a === 'subsanacion' || a === 'subsanado') return 'SUBSANADO';
  if (a === 'recibido') return 'RECIBIDO';
  if (a === 'recibido_observacion' || a === 'recibido_observación') return 'RECIBIDO_OBSERVACION';
  if (a === 'recibido_subsanacion' || a === 'recibido_subsanación') return 'RECIBIDO_SUBSANACION';
  if (a === 'cerrado') return 'CERRADO';
  if (a === 'asignacion' || a === 'asignado') return 'ASIGNADO';
  if (a === 'reasignacion' || a === 'reasignado') return 'REASIGNADO';
  if (a === 'derivado') return 'DERIVADO';
  if (a === 'reenviado') return 'REENVIADO';
  if (a === 'invitacion_enviada') return 'INVITACION_ENVIADA';
  if (a === 'correo_enviado') return 'CORREO_ENVIADO';
  if (a === 'firmado') return 'FIRMADO';
  if (a === 'descargado') return 'DESCARGADO';
  if (a === 'exportado') return 'EXPORTADO';
  if (a === 'anulado') return 'ANULADO';
  if (a === 'finalizado') return 'FINALIZADO';
  return a.toUpperCase();
}

export function parseMovimientos(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(p) ? p : [];
  } catch (_) {
    return [];
  }
}

let movIdSeq = 0;

export function buildMovimientoEntry({
  id,
  fecha,
  accion,
  etapa,
  usuario,
  responsable,
  observacion = '',
  subModuloDestino = '',
  subModuloOrigen = '',
}) {
  const meta = getSubModuloMeta(etapa);
  movIdSeq += 1;
  return {
    id: id || movIdSeq,
    fecha: fecha || new Date().toISOString(),
    accion: normalizeAccion(accion),
    modulo: meta.modulo,
    subModulo: meta.subModulo,
    etapa: String(etapa || 'REGISTRADO').toUpperCase(),
    subModuloOrigen: subModuloOrigen || '',
    subModuloDestino: subModuloDestino || '',
    usuario: usuario || 'Sistema',
    responsable: responsable || usuario || 'Sistema',
    observacion: observacion || '',
  };
}

export function appendMovimiento(movimientos, entry) {
  const list = parseMovimientos(movimientos);
  const nextId = list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
  list.push({ ...entry, id: entry.id || nextId });
  return list;
}

/** Convierte historial reconstruido a movimientos (backfill / compatibilidad). */
export function movimientosFromHistorialEstados(historial) {
  return (historial || []).map((h, idx) => buildMovimientoEntry({
    id: idx + 1,
    fecha: h.fechaIngreso,
    accion: h.tipoEvento === 'observacion' ? 'OBSERVADO'
      : h.tipoEvento === 'subsanacion' ? 'SUBSANADO'
        : h.accion || 'DERIVADO',
    etapa: h.estado,
    usuario: h.usuario,
    responsable: h.usuario,
    observacion: h.observacion || '',
  }));
}

/**
 * Une movimientos persistidos + reconstruidos sin duplicar.
 * Clave: fecha(~2min) + accion + etapa + observación.
 */
export function mergeMovimientos(existing, fromHistorial = []) {
  const a = parseMovimientos(existing);
  const b = parseMovimientos(fromHistorial);
  const out = [];
  const seen = new Set();
  const keyOf = (m) => {
    const ts = new Date(m.fecha || 0).getTime();
    const bucket = Number.isFinite(ts) ? Math.floor(ts / 120000) : 0;
    return [
      bucket,
      String(m.accion || '').toUpperCase(),
      String(m.etapa || m.subModulo || '').toUpperCase(),
      String(m.observacion || '').slice(0, 120).toLowerCase(),
    ].join('|');
  };
  [...a, ...b]
    .filter((m) => m && (m.fecha || m.accion || m.etapa))
    .sort((x, y) => new Date(x.fecha || 0) - new Date(y.fecha || 0))
    .forEach((m) => {
      const k = keyOf(m);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(m);
    });
  return out.map((m, idx) => ({ ...m, id: m.id || idx + 1 }));
}
