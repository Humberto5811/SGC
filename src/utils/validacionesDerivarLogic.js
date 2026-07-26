/**
 * Lógica pura Validaciones — RC7.7A.2 (sin DOM).
 * Fuente única para habilitación de Derivar y línea compacta del expediente.
 */
import { calcularResultadoExpedienteValidacion } from './validacionFormatosConfig.js';

/** Línea compacta del expediente. */
export function buildExpedienteLineaCompacta(d) {
  const sc = d?.solicitud_codigo || '—';
  const codes = (d?.requerimientos_detalle || []).map((r) => r.codigo).filter(Boolean);
  const req = codes.length ? codes.join(', ') : (d?.requerimientos || '—');
  const desc = d?.descripcion || d?.denominacion || '—';
  const tipo = d?.tipo_contratacion || '—';
  return `Información del expediente: ${sc} · ${req} · ${desc} · ${tipo}`;
}

/** Espejo cliente de destinos oficiales del expediente. */
export function resolverDestinoCliente(resultado, cumple) {
  const c = String(cumple || '').toLowerCase();
  const r = String(resultado || '');
  let estado = 'OBSERVADO';
  if (c.includes('no cumple') || c === 'no') estado = 'NO_APTO';
  else if (c === 'cumple' || c === 'sí' || c === 'si') estado = 'APTO';
  else if (/al menos una cotizaci[oó]n v[aá]lida/i.test(r)) estado = 'APTO';
  else if (/todas las cotizaciones son no v[aá]lidas/i.test(r)) estado = 'NO_APTO';
  else if (/no\s*válid/i.test(r) || /no\s*valid/i.test(r)) estado = 'NO_APTO';
  else if (/válid/i.test(r) || /valid/i.test(r)) estado = 'APTO';

  if (estado === 'APTO') {
    return { code: 'CUADRO_COMPARATIVO', label: 'Cuadro Comparativo', estado };
  }
  return { code: 'INVITACIONES', label: 'Invitaciones', estado };
}

function obsDesdeMatriz(matriz) {
  return (matriz?.filas || [])
    .map((f) => String(f?.evaluacion?.observaciones || f?.observaciones || '').trim())
    .filter(Boolean)
    .join(' | ');
}

const LABEL_FALTANTE = {
  cotizacionId: 'Falta identificador de cotización.',
  expediente: 'Expediente no cargado.',
  autorizacion: 'Usuario no autorizado para derivar.',
  ya_derivado: 'El expediente ya fue derivado anteriormente.',
  resultado: 'Falta registrar el resultado.',
  pendientes: 'Hay cotizaciones pendientes de validación.',
  sin_cotizaciones: 'Sin cotizaciones para derivar.',
  observaciones: 'Falta completar observaciones en la matriz (resultado negativo).',
  pdf_firmado: 'Falta adjuntar el PDF firmado.',
  destino: 'No se pudo resolver el destino oficial.',
};

/**
 * Única fuente de verdad para habilitar / validar Derivar.
 * @returns {{ ok: boolean, faltantes: string[], missing: string[], motivo: string, tooltip: string, destino?: object, calcExpediente?: object }}
 */
export function canDerivarValidacion(state) {
  const missing = [];
  const cotizacionId = state?.cotizacionId ?? state?.cotId ?? state?.detalle?.id;

  if (!cotizacionId) missing.push('cotizacionId');
  if (!state?.detalle) {
    missing.push('expediente');
    const labels = missing.map((k) => LABEL_FALTANTE[k] || k);
    return {
      ok: false,
      faltantes: labels,
      missing,
      motivo: `No se puede derivar el expediente.\n${labels.map((l) => `• ${l}`).join('\n')}`,
      tooltip: labels.join(' '),
    };
  }

  const est = String(state.estadoValidacion || state.detalle.validacion_estado || '').toUpperCase();
  const yaDerivado = !!(state.detalle.ya_derivado || state.derivado || ['APTO', 'NO_APTO', 'OBSERVADO'].includes(est));
  if (yaDerivado) missing.push('ya_derivado');
  else if (!state.detalle.puede_derivar) missing.push('autorizacion');

  const tipoKey = state.tipoFormato || state.matriz_v2?.tipo || state.detalle?.tipo_formato || 'BIENES';
  const calcExp = calcularResultadoExpedienteValidacion(tipoKey, state.matriz_v2?.filas || []);
  if (calcExp.sin_cotizaciones) missing.push('sin_cotizaciones');
  else if (calcExp.pendiente || !calcExp.ok) missing.push('pendientes');

  const form = state.formulario || {};
  const resultado = calcExp.ok
    ? calcExp.resultado_global
    : (state.resultado ?? form.resultado_global ?? '');
  const cumple = calcExp.ok ? calcExp.cumple : (state.cumple ?? form.cumple ?? '');
  const observaciones = state.observaciones
    || form.observacion_global
    || obsDesdeMatriz(state.matriz_v2)
    || '';

  if (calcExp.ok && !resultado) missing.push('resultado');
  else if (!calcExp.ok && !calcExp.pendiente && !calcExp.sin_cotizaciones && !resultado) {
    missing.push('resultado');
  }

  const noCumple = calcExp.estado === 'NO_APTO'
    || String(cumple || '').toLowerCase().includes('no')
    || /no\s*válid/i.test(String(resultado || ''));
  if (noCumple && !String(observaciones || '').trim()) {
    missing.push('observaciones');
  }

  const pdf = state.documentoFirmado || state.pdfAdjunto;
  if (!pdf?.base64) missing.push('pdf_firmado');

  let destino = null;
  if (calcExp.ok && calcExp.estado) {
    destino = resolverDestinoCliente(calcExp.resultado_global, calcExp.cumple);
  } else if (resultado) {
    destino = state.destinoOficial || resolverDestinoCliente(resultado, cumple);
  }
  if ((calcExp.ok || resultado) && !destino?.code) missing.push('destino');

  const unique = [...new Set(missing)];
  const labels = unique.map((k) => LABEL_FALTANTE[k] || k);
  const ok = unique.length === 0;
  return {
    ok,
    faltantes: labels,
    missing: unique,
    motivo: ok ? '' : `No se puede derivar el expediente.\n${labels.map((l) => `• ${l}`).join('\n')}`,
    tooltip: ok ? 'Derivar expediente' : labels.join(' '),
    destino: destino || null,
    calcExpediente: calcExp,
  };
}

/** Mensaje HTML de faltantes para el modal. */
export function formatFaltantesHtml(check) {
  if (!check || check.ok) return '';
  const items = (check.faltantes || []).map((f) => `<li>${escHtml(f)}</li>`).join('');
  return `<strong>No se puede derivar el expediente.</strong><ul class="mb-0 mt-1">${items}</ul>`;
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
