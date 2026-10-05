/**
 * Layout institucional Anexo 07-A BIENES (PDF) — funciones puras testeables.
 */

export const ANEXO_07A_TITULO_LINE1 = 'ANEXO N.° 07-A: FORMATO DE VALIDACIÓN DE PROPUESTAS TÉCNICAS RECIBIDAS';
export const ANEXO_07A_TITULO_LINE2 = 'BIENES';

export const CUADRO_INSTITUCIONAL_BIENES = 'CUADRO DE VERIFICACIÓN, VALIDACIÓN Y EVALUACIÓN DE CUMPLIMIENTO DE ESPECIFICACIONES TÉCNICAS, DE LAS PROPUESTAS TÉCNICAS RECIBIDAS PARA LA ADQUISICIÓN DE PRODUCTOS DE:';

export const BIENES_BLOCK_1_FIRST = 'item';
export const BIENES_BLOCK_1_LAST = 'cant_cotizaciones';
export const BIENES_BLOCK_2_FIRST = 'razon_social';
export const BIENES_BLOCK_2_LAST = 'obs_specs';
export const BIENES_BLOCK_3_FIRST = 'acredita_doc';
export const BIENES_BLOCK_3_LAST = 'observaciones';

export const BIENES_GROUP_TITLES = Object.freeze({
  block1: 'DETALLE DEL REQUERIMIENTO',
  block2: 'ESPECIFICACIONES TÉCNICAS RECIBIDAS',
  block3: 'VALIDACIÓN DEL ÁREA USUARIA',
});

/** Columnas PDF BIENES (sin docs). */
export function columnasPdfBienes(config) {
  return (config?.columnas || []).filter((c) => c.kind !== 'docs');
}

function indexOfKey(cols, key) {
  return cols.findIndex((c) => c.key === key);
}

/**
 * @param {{ key: string }[]} cols — columnas PDF BIENES en orden
 */
export function computeBienesBlockLayout(cols) {
  const iItem = indexOfKey(cols, BIENES_BLOCK_1_FIRST);
  const iCantCot = indexOfKey(cols, BIENES_BLOCK_1_LAST);
  const iRazon = indexOfKey(cols, BIENES_BLOCK_2_FIRST);
  const iObsSpecs = indexOfKey(cols, BIENES_BLOCK_2_LAST);
  const iAcredita = indexOfKey(cols, BIENES_BLOCK_3_FIRST);
  const iObsFin = indexOfKey(cols, BIENES_BLOCK_3_LAST);

  const ok = [iItem, iCantCot, iRazon, iObsSpecs, iAcredita, iObsFin].every((i) => i >= 0)
    && iItem <= iCantCot
    && iRazon === iCantCot + 1
    && iObsSpecs >= iRazon
    && iAcredita === iObsSpecs + 1
    && iObsFin >= iAcredita;

  if (!ok) {
    return {
      ok: false,
      block1Span: 0,
      block2Span: 0,
      block3Span: 0,
      separatorAfterColumnIndices: [],
    };
  }

  return {
    ok: true,
    block1Span: iCantCot - iItem + 1,
    block2Span: iObsSpecs - iRazon + 1,
    block3Span: iObsFin - iAcredita + 1,
    separatorAfterColumnIndices: [iCantCot, iObsSpecs],
    block2LastKey: BIENES_BLOCK_2_LAST,
    block3LastKey: BIENES_BLOCK_3_LAST,
  };
}

/** @param {object} [styleOverrides] */
export function buildGroupedHeadBienes(cols, styleOverrides = {}) {
  const layout = computeBienesBlockLayout(cols);
  if (!layout.ok) {
    throw new Error('Columnas PDF BIENES no coinciden con el layout institucional 07-A.');
  }
  const autoStyle = {
    fillColor: styleOverrides.autoFill || [207, 232, 245],
    textColor: styleOverrides.sectionText || [11, 83, 148],
    halign: 'center',
    fontStyle: 'bold',
    fontSize: 7,
  };
  const evalStyle = {
    fillColor: styleOverrides.evalFill || [212, 237, 218],
    textColor: styleOverrides.evalText || [21, 87, 36],
    halign: 'center',
    fontStyle: 'bold',
    fontSize: 7,
  };
  return [
    [
      { content: BIENES_GROUP_TITLES.block1, colSpan: layout.block1Span, styles: { ...autoStyle } },
      { content: BIENES_GROUP_TITLES.block2, colSpan: layout.block2Span, styles: { ...autoStyle } },
      { content: BIENES_GROUP_TITLES.block3, colSpan: layout.block3Span, styles: { ...evalStyle } },
    ],
    cols.map((c) => c.label),
  ];
}

/** Cabecera global PDF: número de invitación real o — */
export function formatNroInvitacionCabecera(nro) {
  if (nro == null || nro === '') return '—';
  if (Number(nro) === 0) return '—';
  return String(nro);
}

export function buildCabeceraGlobalBienes(cabecera = {}) {
  const sc = String(cabecera.solicitud_codigo || '').trim() || '—';
  const inv = formatNroInvitacionCabecera(cabecera.nro_invitacion);
  return `Solicitud: ${sc}   Invitación: ${inv}`;
}
