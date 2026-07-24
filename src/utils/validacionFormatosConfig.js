/**
 * RC7.7B — Configuración central de formatos institucionales de Validación.
 * BIENES / SERVICIOS (LOCADORES fuera del formato completo).
 */

export const TIPO_VALIDACION = Object.freeze({
  BIENES: 'BIENES',
  SERVICIOS: 'SERVICIOS',
  LOCADORES: 'LOCADORES',
});

/** Normaliza tipo de solicitud/contratación → clave de formato. */
export function normalizeTipoValidacion(tipo) {
  const t = String(tipo || '').trim().toUpperCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (t === 'B' || t === 'BIEN' || t === 'BIENES') return TIPO_VALIDACION.BIENES;
  if (t === 'S' || t === 'SERVICIO' || t === 'SERVICIOS') return TIPO_VALIDACION.SERVICIOS;
  if (t === 'L' || t === 'LOCADOR' || t === 'LOCADORES' || /LOCACI/.test(t)) {
    return TIPO_VALIDACION.LOCADORES;
  }
  return null;
}

export const SI_NO = Object.freeze(['', 'SI', 'NO', 'NO APLICA']);
export const CUMPLE = Object.freeze(['', 'SI CUMPLE', 'NO CUMPLE']);
export const CUMPLE_NA = Object.freeze(['', 'SI CUMPLE', 'NO CUMPLE', 'NO REQUIERE']);
/** Compat: valores antiguos "NO APLICA" se normalizan a NO REQUIERE en UI. */
export const CUMPLE_NR = CUMPLE_NA;
export const RESULTADO_BIENES = Object.freeze([
  '',
  'Especificaciones Técnicas válidas',
  'Especificaciones Técnicas NO válidas',
]);
/** Valores oficiales del formato institucional Servicios (compat. con acentos legacy). */
export const RESULTADO_SERVICIOS = Object.freeze(['', 'VALIDA', 'NO VALIDA']);

/** @typedef {{ key: string, label: string, kind: 'auto'|'eval'|'docs', input?: string, options?: string[], short?: string }} ColDef */

/** @type {Record<string, { label: string, columnas: ColDef[], resultadoNegativo: string }>} */
export const VALIDACION_CONFIG = Object.freeze({
  BIENES: Object.freeze({
    label: 'Bienes',
    anexoTitulo: 'ANEXO Nº 07-A: FORMATO DE VALIDACIÓN DE PROPUESTAS TÉCNICAS RECIBIDAS – BIENES',
    resultadoNegativo: 'Especificaciones Técnicas NO válidas',
    columnas: Object.freeze([
      { key: 'item', label: 'Ítem', kind: 'auto', short: 'Ítem' },
      { key: 'nro_req', label: 'N.° REQ', kind: 'auto', short: 'N.° REQ' },
      { key: 'centro', label: 'Centro', kind: 'auto', short: 'Centro' },
      { key: 'codigo_siga', label: 'Código SIGAMEF', kind: 'auto', short: 'Cód. SIGAMEF' },
      { key: 'descripcion', label: 'Descripción', kind: 'auto', short: 'Descripción' },
      { key: 'cantidad', label: 'Cantidad', kind: 'auto', short: 'Cant.' },
      { key: 'um', label: 'Unidad de medida', kind: 'auto', short: 'U.M.' },
      { key: 'cant_cotizaciones', label: 'Cantidad de cotizaciones', kind: 'auto', short: 'Nº Cot.' },
      { key: 'razon_social', label: 'Razón Social', kind: 'auto', short: 'Razón Social' },
      { key: 'marca', label: 'Marca', kind: 'auto', short: 'Marca' },
      { key: 'procedencia', label: 'Procedencia', kind: 'auto', short: 'Proced.' },
      { key: 'docs', label: 'Documentos técnicos', kind: 'docs', short: 'Docs' },
      {
        key: 'inserto',
        label: 'Inserto del producto (SI CUMPLE / NO CUMPLE / NO REQUIERE)',
        kind: 'eval',
        input: 'select',
        options: CUMPLE_NA,
        short: 'Inserto',
      },
      {
        key: 'certificado',
        label: 'Certificado de Análisis o Certificado de garantía o Certificado de Calidad del producto emitido por el fabricante (SI CUMPLE / NO CUMPLE / NO REQUIERE)',
        kind: 'eval',
        input: 'select',
        options: CUMPLE_NA,
        short: 'Certificado',
      },
      {
        key: 'obs_specs',
        label: 'Observaciones',
        kind: 'eval',
        input: 'textarea',
        short: 'Obs.',
      },
      {
        key: 'acredita_doc',
        label: 'Acredita la documentación obligatoria requerida en el literal c) de las EE.TT. (SI CUMPLE / NO CUMPLE)',
        kind: 'eval',
        input: 'select',
        options: CUMPLE,
        short: 'Doc. oblig.',
      },
      {
        key: 'vigencia_minima',
        label: 'Vigencia mínima del producto (SI CUMPLE / NO CUMPLE)',
        kind: 'eval',
        input: 'select',
        options: CUMPLE,
        short: 'Vigencia',
      },
      {
        key: 'plazos_entrega',
        label: 'Plazos de entrega (SI CUMPLE / NO CUMPLE)',
        kind: 'eval',
        input: 'select',
        options: CUMPLE,
        short: 'Plazo',
      },
      {
        key: 'resultado',
        label: 'RESULTADO: Especificaciones Técnicas válidas / Especificaciones Técnicas NO válidas',
        kind: 'eval',
        input: 'select',
        options: RESULTADO_BIENES,
        short: 'Resultado',
      },
      {
        key: 'observaciones',
        label: 'OBSERVACIONES (Explicar las razones en caso el resultado sea Especificaciones Técnicas NO válidas)',
        kind: 'eval',
        input: 'textarea',
        short: 'Obs. resultado',
      },
    ]),
  }),
  SERVICIOS: Object.freeze({
    label: 'Servicios',
    anexoTitulo: 'ANEXO Nº 07-B: FORMATO DE VALIDACIÓN DE PROPUESTAS TÉCNICAS RECIBIDAS – SERVICIOS',
    resultadoNegativo: 'NO VALIDA',
    columnas: Object.freeze([
      { key: 'item', label: 'Ítem', kind: 'auto', short: 'Ítem' },
      { key: 'nro_req', label: 'N.° REQ', kind: 'auto', short: 'N.° REQ' },
      { key: 'centro', label: 'Centro', kind: 'auto', short: 'Centro' },
      { key: 'codigo_siga', label: 'Código SIGAMEF', kind: 'auto', short: 'Cód. SIGAMEF' },
      { key: 'descripcion', label: 'Descripción', kind: 'auto', short: 'Descripción' },
      { key: 'cantidad', label: 'Cantidad', kind: 'auto', short: 'Cant.' },
      { key: 'um', label: 'Unidad de medida', kind: 'auto', short: 'U.M.' },
      { key: 'cant_cotizaciones', label: 'Cantidad de cotizaciones', kind: 'auto', short: 'Nº Cot.' },
      { key: 'razon_social', label: 'Razón Social', kind: 'auto', short: 'Razón Social' },
      { key: 'docs', label: 'Documentos técnicos', kind: 'docs', short: 'Docs' },
      {
        key: 'plazo_ejecucion',
        label: 'Plazo de ejecución (SI CUMPLE / NO CUMPLE)',
        kind: 'eval',
        input: 'select',
        options: CUMPLE,
        short: 'Plazo de ejecución (SI CUMPLE / NO CUMPLE)',
      },
      {
        key: 'formacion_academica',
        label: 'Formación académica, en caso de ser requerida en los TDR (SI CUMPLE / NO CUMPLE)',
        kind: 'eval',
        input: 'select',
        options: CUMPLE,
        short: 'Formación académica, en caso de ser requerida en los TDR (SI CUMPLE / NO CUMPLE)',
      },
      {
        key: 'capacitacion_personal',
        label: 'Capacitación del personal, en caso de ser requerida en los TDR (SI CUMPLE / NO CUMPLE)',
        kind: 'eval',
        input: 'select',
        options: CUMPLE,
        short: 'Capacitación del personal, en caso de ser requerida en los TDR (SI CUMPLE / NO CUMPLE)',
      },
      {
        key: 'experiencia_personal',
        label: 'Experiencia del personal, en caso de ser requerida en los TDR (SI CUMPLE / NO CUMPLE)',
        kind: 'eval',
        input: 'select',
        options: CUMPLE,
        short: 'Experiencia del personal, en caso de ser requerida en los TDR (SI CUMPLE / NO CUMPLE)',
      },
      {
        key: 'experiencia_facturacion',
        label: 'Experiencia (facturación), en caso de ser requerida en los TDR (SI CUMPLE / NO CUMPLE)',
        kind: 'eval',
        input: 'select',
        options: CUMPLE,
        short: 'Experiencia (facturación), en caso de ser requerida en los TDR (SI CUMPLE / NO CUMPLE)',
      },
      {
        key: 'canal_autorizado',
        label: 'Canal autorizado del fabricante de la marca y servicios solicitados, en caso de ser requerida en los TDR (SI CUMPLE / NO CUMPLE)',
        kind: 'eval',
        input: 'select',
        options: CUMPLE,
        short: 'Canal autorizado del fabricante de la marca y servicios solicitados, en caso de ser requerida en los TDR (SI CUMPLE / NO CUMPLE)',
      },
      {
        key: 'resultado',
        label: 'RESULTADO VALIDACIÓN (VALIDA / NO VALIDA)',
        kind: 'eval',
        input: 'select',
        options: RESULTADO_SERVICIOS,
        short: 'RESULTADO VALIDACIÓN (VALIDA / NO VALIDA)',
      },
      {
        key: 'observaciones',
        label: 'OBSERVACIONES (Explicar las razones en caso el resultado sea "Especificaciones Técnicas NO Validas")',
        kind: 'eval',
        input: 'textarea',
        short: 'OBSERVACIONES (Explicar las razones en caso el resultado sea "Especificaciones Técnicas NO Validas")',
      },
    ]),
  }),
});

export const OBS_MAX_CHARS = 4000;

export function getValidacionConfig(tipo) {
  const key = normalizeTipoValidacion(tipo);
  if (key === TIPO_VALIDACION.BIENES || key === TIPO_VALIDACION.SERVICIOS) {
    return { tipoKey: key, config: VALIDACION_CONFIG[key] };
  }
  return { tipoKey: key, config: null };
}

/** ¿La fila/cotización es no válida según reglas institucionales? */
export function esResultadoNegativo(tipoKey, resultado) {
  const r = String(resultado || '').trim();
  if (!r) return false;
  if (tipoKey === TIPO_VALIDACION.BIENES) {
    return /NO\s*válid/i.test(r);
  }
  if (tipoKey === TIPO_VALIDACION.SERVICIOS) {
    const u = r.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
    return u === 'NO VALIDA' || /^NO\s*VALIDA$/i.test(u);
  }
  return /NO\s*válid/i.test(r);
}

/** Resultado global de una cotización a partir de sus filas. */
export function calcularResultadoCotizacion(tipoKey, filas = []) {
  const cfg = VALIDACION_CONFIG[tipoKey];
  if (!cfg) return { cumple: '', resultado_global: '', estado: 'OBSERVADO' };
  const evaluated = (filas || []).filter((f) => f?.evaluacion?.resultado || f?.resultado);
  if (!evaluated.length) {
    return { cumple: '', resultado_global: '', estado: 'OBSERVADO' };
  }
  const algunaNegativa = evaluated.some((f) => {
    const res = f.evaluacion?.resultado ?? f.resultado;
    return esResultadoNegativo(tipoKey, res);
  });
  if (tipoKey === TIPO_VALIDACION.BIENES) {
    return algunaNegativa
      ? {
          cumple: 'No cumple',
          resultado_global: 'Especificaciones Técnicas NO válidas',
          estado: 'NO_APTO',
        }
      : {
          cumple: 'Cumple',
          resultado_global: 'Especificaciones Técnicas válidas',
          estado: 'APTO',
        };
  }
  return algunaNegativa
    ? { cumple: 'No cumple', resultado_global: 'NO VALIDA', estado: 'NO_APTO' }
    : { cumple: 'Cumple', resultado_global: 'VALIDA', estado: 'APTO' };
}

/**
 * Resultado oficial del expediente (todas las cotizaciones de la matriz).
 * ≥1 válida → APTO (Cuadro). Todas inválidas → NO_APTO (Invitaciones).
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

/** Valida filas antes de guardar completo / derivar. */
export function validarMatrizCompleta(tipoKey, filas = []) {
  const errores = [];
  const cfg = VALIDACION_CONFIG[tipoKey];
  if (!cfg) {
    return { ok: false, errores: ['Tipo de validación no soportado para este formato.'] };
  }
  (filas || []).forEach((fila, idx) => {
    const ev = fila.evaluacion || fila;
    const res = String(ev.resultado || '').trim();
    if (!res) {
      errores.push(`Fila ${idx + 1}: falta resultado.`);
      return;
    }
    if (esResultadoNegativo(tipoKey, res) && !String(ev.observaciones || '').trim()) {
      errores.push(`Fila ${idx + 1}: observación obligatoria cuando el resultado es negativo.`);
    }
  });
  return { ok: errores.length === 0, errores };
}

/** Compat: mapea item legacy formulario_07a → evaluación v2. */
export function legacyItemToEvaluacion(item = {}, tipoKey = TIPO_VALIDACION.BIENES) {
  if (tipoKey === TIPO_VALIDACION.SERVICIOS) {
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

/** Convierte filas v2 → items legacy para enviarValidacionUsuario. */
export function filasV2ToLegacyItems(filas = [], tipoKey = TIPO_VALIDACION.BIENES) {
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
    if (tipoKey === TIPO_VALIDACION.SERVICIOS) {
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
