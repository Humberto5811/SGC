/**
 * RC7.7B — Helpers server de formatos institucionales (sin dependencia de src/).
 */

export function normalizeTipoValidacion(tipo) {
  const t = String(tipo || '').trim().toUpperCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (t === 'B' || t === 'BIEN' || t === 'BIENES') return 'BIENES';
  if (t === 'S' || t === 'SERVICIO' || t === 'SERVICIOS') return 'SERVICIOS';
  if (t === 'L' || t === 'LOCADOR' || t === 'LOCADORES' || /LOCACI/.test(t)) return 'LOCADORES';
  return null;
}

export function esResultadoNegativo(tipoKey, resultado) {
  const r = String(resultado || '').trim();
  if (!r) return false;
  if (tipoKey === 'BIENES') return /NO\s*válid/i.test(r);
  if (tipoKey === 'SERVICIOS') {
    const u = r.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
    return u === 'NO VALIDA' || /^NO\s*VALIDA$/i.test(u);
  }
  return /NO\s*válid/i.test(r);
}

export function calcularResultadoCotizacion(tipoKey, filas = []) {
  const evaluated = (filas || []).filter((f) => f?.evaluacion?.resultado || f?.resultado);
  if (!evaluated.length) {
    return { cumple: '', resultado_global: '', estado: 'OBSERVADO' };
  }
  const algunaNegativa = evaluated.some((f) => {
    const res = f.evaluacion?.resultado ?? f.resultado;
    return esResultadoNegativo(tipoKey, res);
  });
  if (tipoKey === 'BIENES') {
    return algunaNegativa
      ? { cumple: 'No cumple', resultado_global: 'Especificaciones Técnicas NO válidas', estado: 'NO_APTO' }
      : { cumple: 'Cumple', resultado_global: 'Especificaciones Técnicas válidas', estado: 'APTO' };
  }
  if (tipoKey === 'SERVICIOS') {
    return algunaNegativa
      ? { cumple: 'No cumple', resultado_global: 'NO VALIDA', estado: 'NO_APTO' }
      : { cumple: 'Cumple', resultado_global: 'VALIDA', estado: 'APTO' };
  }
  return { cumple: '', resultado_global: '', estado: 'OBSERVADO' };
}

/**
 * Resultado oficial del expediente (todas las cotizaciones de la matriz).
 * ≥1 válida → APTO (Cuadro). Todas inválidas → NO_APTO (Invitaciones).
 * Alguna pendiente / sin filas → no derivable.
 */
export function calcularResultadoExpedienteValidacion(tipoKey, filas = []) {
  const list = Array.isArray(filas) ? filas : [];
  if (!list.length) {
    return {
      ok: false,
      pendiente: true,
      sin_cotizaciones: true,
      cumple: '',
      resultado_global: '',
      estado: '',
      validas: 0,
      invalidas: 0,
      pendientes: 0,
      motivo: 'Sin cotizaciones para derivar.',
    };
  }

  const byCot = new Map();
  list.forEach((f, idx) => {
    const cid = f.cotizacion_id != null ? String(f.cotizacion_id) : `row-${idx}`;
    if (!byCot.has(cid)) byCot.set(cid, []);
    byCot.get(cid).push(f);
  });

  let validas = 0;
  let invalidas = 0;
  let pendientes = 0;
  byCot.forEach((filasCot) => {
    const falta = filasCot.some((f) => !String(f?.evaluacion?.resultado || f?.resultado || '').trim());
    if (falta) {
      pendientes += 1;
      return;
    }
    const calc = calcularResultadoCotizacion(tipoKey, filasCot);
    if (calc.estado === 'APTO') validas += 1;
    else invalidas += 1;
  });

  if (pendientes > 0) {
    return {
      ok: false,
      pendiente: true,
      sin_cotizaciones: false,
      cumple: '',
      resultado_global: '',
      estado: '',
      validas,
      invalidas,
      pendientes,
      motivo: 'Hay cotizaciones pendientes de validación.',
    };
  }

  if (validas >= 1) {
    return {
      ok: true,
      pendiente: false,
      sin_cotizaciones: false,
      cumple: 'Cumple',
      resultado_global: 'Existe al menos una cotización válida',
      estado: 'APTO',
      validas,
      invalidas,
      pendientes,
      motivo: '',
    };
  }

  return {
    ok: true,
    pendiente: false,
    sin_cotizaciones: false,
    cumple: 'No cumple',
    resultado_global: 'Todas las cotizaciones son no válidas',
    estado: 'NO_APTO',
    validas,
    invalidas,
    pendientes,
    motivo: '',
  };
}

function normalizeSiNo(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s === 'SÍ' || s === 'SI') return 'SI CUMPLE';
  if (s === 'NO') return 'NO CUMPLE';
  if (s === 'NO APLICA' || s === 'NO REQUIERE') return 'NO REQUIERE';
  if (s === 'SI CUMPLE' || s === 'NO CUMPLE') return s;
  return v || '';
}

function normalizeCumpleNa(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s === 'NO APLICA') return 'NO REQUIERE';
  return v || '';
}

function mapLegacyResultadoServicios(resultado) {
  const r = String(resultado || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (/NO\s*VALIDA/i.test(r)) return 'NO VALIDA';
  if (/VALIDA/i.test(r)) return 'VALIDA';
  return resultado || '';
}

export function legacyItemToEvaluacion(item = {}, tipoKey = 'BIENES') {
  if (tipoKey === 'SERVICIOS') {
    return {
      plazo_ejecucion: normalizeCumpleNa(item.plazos_entrega_val || item.plazo_ejecucion || ''),
      formacion_academica: normalizeCumpleNa(item.formacion_academica || ''),
      capacitacion_personal: normalizeCumpleNa(item.capacitacion_personal || ''),
      experiencia_personal: normalizeCumpleNa(item.experiencia_personal || ''),
      experiencia_facturacion: normalizeCumpleNa(item.experiencia_facturacion || ''),
      canal_autorizado: normalizeCumpleNa(item.canal_autorizado || ''),
      resultado: mapLegacyResultadoServicios(item.resultado),
      observaciones: item.obs_validacion || item.observaciones || '',
    };
  }
  return {
    inserto: normalizeSiNo(item.inserto),
    certificado: normalizeSiNo(item.certificado),
    obs_specs: item.obs_specs || '',
    acredita_doc: item.acredita_doc || '',
    vigencia_minima: item.vigencia_minima_val || item.vigencia_minima || '',
    plazos_entrega: item.plazos_entrega_val || item.plazos_entrega || '',
    resultado: item.resultado || '',
    observaciones: item.obs_validacion || item.observaciones || '',
  };
}

export function filasV2ToLegacyItems(filas = [], tipoKey = 'BIENES') {
  return (filas || []).map((fila, idx) => {
    const auto = fila.automaticos || {};
    const ev = fila.evaluacion || {};
    const base = {
      item_key: fila.item_key || `${fila.requerimiento_id || 'x'}-${idx}`,
      item: auto.item ?? fila.item ?? idx + 1,
      nro_req: auto.nro_req || fila.requerimiento_codigo || '',
      codigo_sigamef: auto.codigo_siga || auto.codigo_sigamef || '',
      descripcion: auto.descripcion || '',
      cantidad: auto.cantidad ?? 1,
      um: auto.um || 'UND',
      cant_cotizaciones: auto.cant_cotizaciones ?? 1,
      razon_social: auto.razon_social || '',
      marca: auto.marca || '',
      procedencia: auto.procedencia || '',
      obs_validacion: ev.observaciones || '',
      resultado: ev.resultado || '',
    };
    if (tipoKey === 'SERVICIOS') {
      return {
        ...base,
        plazos_entrega_val: ev.plazo_ejecucion || '',
        formacion_academica: ev.formacion_academica || '',
        capacitacion_personal: ev.capacitacion_personal || '',
        experiencia_personal: ev.experiencia_personal || '',
        experiencia_facturacion: ev.experiencia_facturacion || '',
        canal_autorizado: ev.canal_autorizado || '',
        inserto: '',
        certificado: '',
        obs_specs: '',
        acredita_doc: '',
        vigencia_minima_val: '',
      };
    }
    return {
      ...base,
      inserto: ev.inserto || '',
      certificado: ev.certificado || '',
      obs_specs: ev.obs_specs || '',
      acredita_doc: ev.acredita_doc || '',
      vigencia_minima_val: ev.vigencia_minima || '',
      plazos_entrega_val: ev.plazos_entrega || '',
    };
  });
}

export function validarMatrizCompleta(tipoKey, filas = []) {
  const errores = [];
  if (!['BIENES', 'SERVICIOS'].includes(tipoKey)) {
    return { ok: false, errores: ['Tipo de validación no soportado para este formato.'] };
  }
  (filas || []).forEach((fila, idx) => {
    const ev = fila.evaluacion || {};
    const res = String(ev.resultado || '').trim();
    if (!res) {
      errores.push(`Fila ${idx + 1}: falta resultado.`);
      return;
    }
    if (esResultadoNegativo(tipoKey, res) && !String(ev.observaciones || '').trim()) {
      errores.push(`Fila ${idx + 1}: observación obligatoria cuando el resultado es negativo.`);
    }
    if (String(ev.observaciones || '').length > 4000) {
      errores.push(`Fila ${idx + 1}: observaciones superan 4000 caracteres.`);
    }
  });
  return { ok: errores.length === 0, errores };
}
