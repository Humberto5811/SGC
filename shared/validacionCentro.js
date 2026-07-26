/**
 * Resolución centralizada y determinística de Centro para Validaciones.
 * Usado por backend (matriz), mapper/PDF y pruebas — una sola fuente de verdad.
 */

function trimStr(v) {
  if (v == null) return '';
  if (typeof v === 'object') return '';
  return String(v).trim();
}

/** CMN numérico (p. ej. 05277) no es denominación de centro. */
function esCmnNumerico(valor) {
  return /^\d{4,6}$/.test(trimStr(valor));
}

function preferCentroTextual(...candidatos) {
  const textuales = [];
  const numericos = [];
  for (const c of candidatos) {
    const t = trimStr(c);
    if (!t) continue;
    if (esCmnNumerico(t)) numericos.push(t);
    else textuales.push(t);
  }
  return textuales[0] || '';
}

/**
 * @typedef {object} CentroSources
 * @property {string} [requerimientoCentro] — cmn/centro/área del requerimiento
 * @property {string} [pedidoCentro] — centro del pedido SIGAMEF
 * @property {string} [cabeceraCentro] — centro de cabecera/expediente
 * @property {string} [informeCentro] — centro persistido en validacion_informe / matriz previa
 * @property {string} [itemCentro] — centro en payload del ítem (detalle_items)
 * @property {string} [centroCosto] — opcional, no sustituye centro
 */

/**
 * Prioridad:
 * 1) requerimiento  2) pedido SIGAMEF  3) cabecera  4) informe  5) ítem
 * No inventa valores. Si no hay fuente → centro vacío + warning técnico.
 *
 * @param {CentroSources} sources
 * @returns {{ centro: string, centro_costo: string, fuente: string|null, warning: string|null }}
 */
export function resolveValidationCentro(sources = {}) {
  const ordered = [
    ['pedido_sigamef', sources.pedidoCentro],
    ['requerimiento', sources.requerimientoCentro],
    ['cabecera', sources.cabeceraCentro],
    ['informe', sources.informeCentro],
    ['item', sources.itemCentro],
  ];
  for (const [fuente, raw] of ordered) {
    const centro = preferCentroTextual(raw);
    if (centro) {
      return {
        centro,
        centro_costo: trimStr(sources.centroCosto),
        fuente,
        warning: null,
      };
    }
  }
  return {
    centro: '',
    centro_costo: trimStr(sources.centroCosto),
    fuente: null,
    warning: 'centro_no_resuelto',
  };
}

/**
 * Consolida centros de varias filas para cabecera.
 * Varios centros distintos → lista consolidada (no elige uno arbitrario).
 *
 * @param {string[]} centros
 * @returns {{ display: string, multiple: boolean, centros: string[], label: string }}
 */
export function consolidateCentros(centros = []) {
  const unique = [];
  const seen = new Set();
  for (const c of centros || []) {
    const t = preferCentroTextual(c);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }
  if (!unique.length) {
    return {
      display: '—',
      multiple: false,
      centros: [],
      label: 'Sin centro',
    };
  }
  if (unique.length === 1) {
    return {
      display: unique[0],
      multiple: false,
      centros: unique,
      label: unique[0],
    };
  }
  return {
    display: unique.join(', '),
    multiple: true,
    centros: unique,
    label: `Múltiples centros (${unique.join(', ')})`,
  };
}

export function displayCentroOrDash(centro) {
  const t = trimStr(centro);
  return t || '—';
}
