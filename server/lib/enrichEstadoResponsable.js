/**
 * RC8.4E — Enriquecimiento batch estado_responsable_vigente para bandejas independientes.
 *
 * Uso típico en cualquier listar*Bandeja():
 *
 *   import { enrichEstadoResponsableForBandeja } from './enrichEstadoResponsable.js';
 *   // ... después de obtener rows ...
 *   await enrichEstadoResponsableForBandeja(rows, 'requerimiento_id');
 *   return rows;
 *
 * No hace consultas N+1.
 * No crea otro resolvedor.
 * Conserva respuesta legacy.
 */

import { resolveEstadoResponsableBatch } from './resolvedorEstadoResponsable.js';

/**
 * Enriquece cada fila con estado_responsable_vigente usando true batch (sin N+1).
 *
 * @param {Array<object>} rows — filas de la bandeja (mutadas in-place)
 * @param {string} [idField='requerimiento_id'] — nombre del campo con el ID de requerimiento
 * @returns {Promise<void>}
 */
export async function enrichEstadoResponsableForBandeja(rows, idField = 'requerimiento_id') {
  if (!Array.isArray(rows) || !rows.length) return;

  try {
    const ids = [...new Set(
      rows
        .map((r) => parseInt(r?.[idField], 10))
        .filter((n) => Number.isFinite(n) && n > 0),
    )];
    if (!ids.length) return;

    const resolved = await resolveEstadoResponsableBatch(ids);

    for (const row of rows) {
      const rid = parseInt(row?.[idField], 10);
      if (Number.isFinite(rid) && resolved.has(rid)) {
        row.estado_responsable_vigente = resolved.get(rid);
      } else {
        row.estado_responsable_vigente = null;
      }
    }
  } catch (_) {
    /* resolvedor no disponible — sin enriquecer */
  }
}

export default enrichEstadoResponsableForBandeja;