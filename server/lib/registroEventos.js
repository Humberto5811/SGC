/**
 * Registro de eventos de trazabilidad — cada acción en el módulo ejecutor.
 * Aprobación + derivación = eventos separados. Derivación = DERIVADO (origen) + RECIBIDO (destino).
 */
import {
  getSubModuloMeta,
  buildMovimientoEntry,
  appendMovimiento,
  normalizeAccion,
} from './movimientos.js';

function tsOffset(baseIso, ms) {
  return new Date(new Date(baseIso).getTime() + ms).toISOString();
}

function metaEtapa(code) {
  return getSubModuloMeta(String(code || 'REGISTRADO').toUpperCase());
}

/**
 * Append eventos según tipo de acción. Retorna lista actualizada.
 */
export function appendEventosPorAccion(movimientos, {
  accion,
  etapaEjecutor,
  etapaDestino = null,
  etapaDestinoEvento = null,
  usuario,
  responsable,
  observacion = '',
  now,
}) {
  const acc = normalizeAccion(accion);
  const ejec = String(etapaEjecutor || 'REGISTRADO').toUpperCase();
  const metaEjec = metaEtapa(ejec);
  const dest = etapaDestino ? String(etapaDestino).toUpperCase() : null;
  const metaDest = dest ? metaEtapa(dest) : null;
  const destEvento = etapaDestinoEvento ? String(etapaDestinoEvento).toUpperCase() : null;
  const metaDestEvento = destEvento ? metaEtapa(destEvento) : null;
  const resp = responsable || usuario || 'Sistema';

  let list = movimientos;

  const push = (entry) => {
    list = appendMovimiento(list, entry);
    return list;
  };

  if (acc === 'APROBADO') {
    const obsAprob = observacion.includes('—')
      ? observacion.split('—')[0].trim()
      : observacion.replace(/\s*—\s*derivado.*/i, '').trim() || observacion;
    list = push(buildMovimientoEntry({
      fecha: tsOffset(now, 0),
      accion: 'APROBADO',
      etapa: ejec,
      usuario,
      responsable: resp,
      observacion: obsAprob || `Aprobado en ${metaEjec.subModulo}`,
      subModuloDestino: metaDest?.subModulo || '',
    }));
    if (dest && dest !== ejec) {
      list = push(buildMovimientoEntry({
        fecha: tsOffset(now, 1),
        accion: 'DERIVADO',
        etapa: ejec,
        usuario,
        responsable: resp,
        observacion: observacion.includes('derivado')
          ? observacion.split('—').slice(1).join('—').trim() || `Derivado a ${metaDest.subModulo}`
          : `Derivado a ${metaDest.subModulo}`,
        subModuloDestino: metaDest.subModulo,
      }));
      list = push(buildMovimientoEntry({
        fecha: tsOffset(now, 2),
        accion: 'RECIBIDO',
        etapa: dest,
        usuario: resp,
        responsable: resp,
        observacion: `Requerimiento recibido en ${metaDest.subModulo}`,
        subModuloOrigen: metaEjec.subModulo,
      }));
    }
    return list;
  }

  if (acc === 'DERIVADO') {
    list = push(buildMovimientoEntry({
      fecha: tsOffset(now, 0),
      accion: 'DERIVADO',
      etapa: ejec,
      usuario,
      responsable: resp,
      observacion: observacion || `Derivado a ${metaDest?.subModulo || 'siguiente módulo'}`,
      subModuloDestino: metaDest?.subModulo || '',
    }));
    if (dest) {
      list = push(buildMovimientoEntry({
        fecha: tsOffset(now, 1),
        accion: 'RECIBIDO',
        etapa: dest,
        usuario: resp,
        responsable: resp,
        observacion: `Requerimiento recibido en ${metaDest.subModulo}`,
        subModuloOrigen: metaEjec.subModulo,
      }));
    }
    return list;
  }

  if (acc === 'OBSERVADO') {
    list = push(buildMovimientoEntry({
      fecha: tsOffset(now, 0),
      accion: 'OBSERVADO',
      etapa: ejec,
      usuario,
      responsable: resp,
      observacion,
      subModuloDestino: metaDestEvento?.subModulo || metaDest?.subModulo || '',
    }));
    const receptor = destEvento || (dest && dest !== ejec ? dest : null);
    if (receptor) {
      const metaRec = metaEtapa(receptor);
      list = push(buildMovimientoEntry({
        fecha: tsOffset(now, 1),
        accion: 'RECIBIDO_OBSERVACION',
        etapa: receptor,
        usuario: resp,
        responsable: resp,
        observacion: 'Observación recibida',
        subModuloOrigen: metaEjec.subModulo,
      }));
    }
    return list;
  }

  if (acc === 'SUBSANADO') {
    list = push(buildMovimientoEntry({
      fecha: tsOffset(now, 0),
      accion: 'SUBSANADO',
      etapa: ejec,
      usuario,
      responsable: resp,
      observacion,
      subModuloDestino: metaDestEvento?.subModulo || metaDest?.subModulo || '',
    }));
    const receptor = destEvento || (dest && dest !== ejec ? dest : null);
    if (receptor) {
      list = push(buildMovimientoEntry({
        fecha: tsOffset(now, 1),
        accion: 'RECIBIDO_SUBSANACION',
        etapa: receptor,
        usuario: resp,
        responsable: resp,
        observacion: 'Subsanación recibida',
        subModuloOrigen: metaEjec.subModulo,
      }));
    }
    if (dest && dest !== ejec && dest !== receptor) {
      list = push(buildMovimientoEntry({
        fecha: tsOffset(now, 2),
        accion: 'DERIVADO',
        etapa: ejec,
        usuario,
        responsable: resp,
        observacion: `Derivado a ${metaDest.subModulo}`,
        subModuloDestino: metaDest.subModulo,
      }));
      list = push(buildMovimientoEntry({
        fecha: tsOffset(now, 3),
        accion: 'RECIBIDO',
        etapa: dest,
        usuario: resp,
        responsable: resp,
        observacion: `Requerimiento recibido en ${metaDest.subModulo}`,
        subModuloOrigen: metaEjec.subModulo,
      }));
    }
    return list;
  }

  if (acc === 'CERRADO') {
    return push(buildMovimientoEntry({
      fecha: now,
      accion: 'CERRADO',
      etapa: ejec,
      usuario,
      responsable: resp,
      observacion: observacion || 'Observación cerrada',
    }));
  }

  return push(buildMovimientoEntry({
    fecha: now,
    accion: acc,
    etapa: ejec,
    usuario,
    responsable: resp,
    observacion,
    subModuloDestino: metaDest?.subModulo || '',
  }));
}

export default { appendEventosPorAccion };
