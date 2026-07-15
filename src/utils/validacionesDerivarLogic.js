/**
 * Lógica pura Validaciones — RC7.7A.2 (sin DOM).
 * Fuente única para habilitación de Derivar y línea compacta del expediente.
 */

/** Línea compacta del expediente. */
export function buildExpedienteLineaCompacta(d) {
  const sc = d?.solicitud_codigo || '—';
  const codes = (d?.requerimientos_detalle || []).map((r) => r.codigo).filter(Boolean);
  const req = codes.length ? codes.join(', ') : (d?.requerimientos || '—');
  const desc = d?.descripcion || d?.denominacion || '—';
  const tipo = d?.tipo_contratacion || '—';
  return `Información del expediente: ${sc} · ${req} · ${desc} · ${tipo}`;
}

/** Espejo cliente de destinos oficiales (sin tocar Workflow Engine). */
export function resolverDestinoCliente(resultado, cumple) {
  const c = String(cumple || '').toLowerCase();
  const r = String(resultado || '').toLowerCase();
  let estado = 'OBSERVADO';
  if (c.includes('no cumple') || c === 'no') estado = 'NO_APTO';
  else if (c === 'cumple' || c === 'sí' || c === 'si') estado = 'APTO';
  else if (r.includes('no válid') || r.includes('no valid')) estado = 'NO_APTO';
  else if (r.includes('válid') || r.includes('valid')) estado = 'APTO';

  if (estado === 'APTO') {
    return { code: 'CUADRO_COMPARATIVO', label: 'Cuadro Comparativo', estado };
  }
  return { code: 'RECEPCION_COTIZACIONES', label: 'Recepción de Cotizaciones', estado };
}

const LABEL_FALTANTE = {
  cotizacionId: 'Falta identificador de cotización.',
  expediente: 'Expediente no cargado.',
  autorizacion: 'Usuario no autorizado para derivar.',
  ya_derivado: 'El expediente ya fue derivado anteriormente.',
  resultado: 'Falta registrar el resultado.',
  observaciones: 'Falta completar observaciones.',
  sustento: 'Falta completar observaciones o sustento.',
  pdf_firmado: 'Falta adjuntar el PDF firmado.',
  destino: 'No se pudo resolver el destino oficial.',
};

/**
 * Única fuente de verdad para habilitar / validar Derivar.
 * @returns {{ ok: boolean, faltantes: string[], missing: string[], motivo: string, tooltip: string, destino?: object }}
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

  const form = state.formulario || {};
  const resultado = state.resultado ?? form.resultado_global ?? '';
  const observaciones = state.observaciones ?? form.observacion_global ?? '';
  const cumple = state.cumple ?? form.cumple ?? '';
  const sustento = state.sustento ?? form.sustento ?? '';

  if (!resultado) missing.push('resultado');
  if (!String(observaciones || '').trim()) missing.push('observaciones');

  const noCumple = String(cumple || '').toLowerCase().includes('no')
    || /no\s*válid/i.test(String(resultado || ''));
  if (noCumple && !String(sustento || '').trim() && !String(observaciones || '').trim()) {
    if (!missing.includes('observaciones')) missing.push('sustento');
  }

  const pdf = state.documentoFirmado || state.pdfAdjunto;
  if (!pdf?.base64) missing.push('pdf_firmado');

  let destino = state.destinoOficial || null;
  if (resultado && !destino) {
    destino = resolverDestinoCliente(resultado, cumple);
  }
  if (resultado && !destino?.code) missing.push('destino');

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
