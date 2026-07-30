/**
 * Contrato uniforme de entrega contractual (Orden → Recepción de Bienes).
 * Distingue: id técnico, número secuencial, etiqueta contractual y tipo.
 */

/** Normaliza código técnico (sin tilde, mayúsculas). */
export function normalizeCodigoEntrega(raw) {
  const s = String(raw || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!s) return '';
  if (s === 'UNICO' || s === 'UNICA' || s === 'UNICA_ENTREGA') return 'UNICO';
  return s.slice(0, 40);
}

/**
 * Resuelve etiqueta contractual visible.
 * Prioridad: etiqueta_entrega → descripcion → fallback Entrega N [de M].
 */
export function resolveEtiquetaEntrega(entrega = {}, opts = {}) {
  const etiqueta = String(entrega.etiqueta_entrega || entrega.etiquetaEntrega || '').trim();
  if (etiqueta) return etiqueta;

  const codigo = normalizeCodigoEntrega(entrega.codigo_entrega || entrega.codigoEntrega || entrega.correlativo);
  if (codigo === 'UNICO') return 'ÚNICO';

  const desc = String(entrega.descripcion || entrega.descripcion_entrega || entrega.descripcionEntrega || '').trim();
  if (desc) {
    if (/^entrega\s+única$/i.test(desc) || /^entregable\s+únic[oa]$/i.test(desc)
      || /^prestaci[oó]n\s+única$/i.test(desc)) {
      return 'ÚNICO';
    }
    return desc;
  }

  const n = Number(entrega.numero_entrega ?? entrega.numeroEntrega ?? 0) || 0;
  const total = Number(opts.totalEntregas || opts.total || 0) || 0;
  if (n > 0 && total > 1) return `Entrega ${n} de ${total}`;
  if (n > 0) return `Entrega ${n}`;
  return '—';
}

export function resolveTipoEntregaContractual(entrega = {}) {
  const codigo = normalizeCodigoEntrega(entrega.codigo_entrega || entrega.correlativo);
  if (codigo === 'UNICO') return 'ÚNICA';
  const tipo = String(entrega.tipo_entrega || entrega.tipoEntrega || 'ENTREGA').toUpperCase();
  return tipo;
}

/** Contrato uniforme para API/FE. */
export function buildEntregaContract(entrega = {}, opts = {}) {
  const numeroEntrega = Number(entrega.numero_entrega ?? entrega.numeroEntrega ?? 0) || null;
  const codigo = normalizeCodigoEntrega(
    entrega.codigo_entrega || entrega.codigoEntrega || entrega.correlativo
    || (numeroEntrega === 1 && Number(opts.totalEntregas || 0) === 1 ? 'UNICO' : '')
    || (numeroEntrega ? `E${numeroEntrega}` : ''),
  );
  const etiqueta = resolveEtiquetaEntrega({
    ...entrega,
    codigo_entrega: codigo,
  }, opts);
  return {
    entregaId: entrega.id ?? entrega.entrega_id ?? entrega.entregaId ?? null,
    numeroEntrega,
    etiquetaEntrega: etiqueta,
    codigoEntrega: codigo || null,
    tipoEntrega: resolveTipoEntregaContractual({ ...entrega, codigo_entrega: codigo }),
    descripcionEntrega: String(entrega.descripcion || entrega.descripcion_entrega || '').trim() || etiqueta,
    fechaMaxima: entrega.fecha_maxima || entrega.fechaMaxima || null,
    fechaBase: entrega.fecha_base || entrega.fechaBase || null,
    cantidadProgramada: entrega.cantidad_programada ?? null,
    montoProgramado: entrega.importe != null ? Number(entrega.importe) : (entrega.montoProgramado ?? null),
    diasPlazo: entrega.dias_plazo != null ? Number(entrega.dias_plazo) : null,
    lugarEntrega: entrega.lugar_entrega || null,
    // Compat snake_case
    entrega_id: entrega.id ?? entrega.entrega_id ?? null,
    numero_entrega: numeroEntrega,
    etiqueta_entrega: etiqueta,
    codigo_entrega: codigo || null,
    tipo_entrega: entrega.tipo_entrega || entrega.tipoEntrega || 'ENTREGA',
    descripcion: String(entrega.descripcion || '').trim() || etiqueta,
    fecha_maxima: entrega.fecha_maxima || null,
  };
}

/** Resumen para bandeja (una o varias entregas). */
export function formatEntregasBandejaLabel(entregas = []) {
  const list = Array.isArray(entregas) ? entregas : [];
  if (!list.length) return { label: '—', tooltip: 'Sin entregas registradas', count: 0 };
  const total = list.length;
  const labels = list.map((e) => resolveEtiquetaEntrega(e, { totalEntregas: total }));
  const unique = [...new Set(labels)];
  const label = unique.length === 1 ? unique[0] : unique.join(' / ');
  const tipParts = list.map((e) => {
    const c = buildEntregaContract(e, { totalEntregas: total });
    return [
      c.etiquetaEntrega,
      c.tipoEntrega ? `tipo: ${c.tipoEntrega}` : null,
      c.numeroEntrega != null ? `N.° ${c.numeroEntrega}` : null,
      c.diasPlazo != null ? `plazo: ${c.diasPlazo} d` : null,
      c.fechaMaxima ? `máx: ${String(c.fechaMaxima instanceof Date ? c.fechaMaxima.toISOString() : c.fechaMaxima).slice(0, 10)}` : null,
    ].filter(Boolean).join(' · ');
  });
  return { label, tooltip: tipParts.join('\n'), count: total, etiquetas: labels };
}

export function correlativoFromEntrega(entrega = {}, total = 1) {
  const codigo = normalizeCodigoEntrega(entrega.codigo_entrega || entrega.correlativo);
  if (codigo === 'UNICO') return 'UNICO';
  const etiqueta = String(entrega.etiqueta_entrega || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (etiqueta === 'UNICO' || (Number(entrega.numero_entrega) === 1 && total === 1)) return 'UNICO';
  return String(entrega.numero_entrega || '1');
}
