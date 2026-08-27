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
import { getEstadoResponsableCanonico } from './estadoResponsableCanonico.js';
import { buildEstadoLabels } from './expedienteEstadoPersistido.js';

/**
 * Enriquece cada fila con estado_responsable_vigente usando true batch (sin N+1).
 * RC8.8 — delega a getEstadoResponsableCanonico (misma fuente que todas las bandejas).
 *
 * @param {Array<object>} rows — filas de la bandeja (mutadas in-place)
 * @param {string} [idField='requerimiento_id'] — nombre del campo con el ID de requerimiento
 * @returns {Promise<void>}
 */
export async function enrichEstadoResponsableForBandeja(rows, idField = 'requerimiento_id') {
  if (!Array.isArray(rows) || !rows.length) return;

  const resolveRowReqId = (row) => {
    const direct = parseInt(row?.[idField], 10);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const alt = parseInt(row?.requerimiento_id || row?.solicitud_requerimiento_id, 10);
    if (Number.isFinite(alt) && alt > 0) return alt;
    const fromList = parseInt(row?.requerimientos?.[0]?.id, 10);
    if (Number.isFinite(fromList) && fromList > 0) return fromList;
    return null;
  };

  try {
    const ids = [...new Set(
      rows.map((r) => resolveRowReqId(r)).filter((n) => Number.isFinite(n) && n > 0),
    )];
    if (!ids.length) return;

    let resolved;
    try {
      resolved = await getEstadoResponsableCanonico({ requerimientoIds: ids });
    } catch (_) {
      resolved = await resolveEstadoResponsableBatch(ids);
    }

    for (const row of rows) {
      const rid = resolveRowReqId(row);
      if (Number.isFinite(rid) && resolved.has(rid)) {
        row.requerimiento_id = row.requerimiento_id || rid;
        row.estado_responsable_vigente = resolved.get(rid);
      } else if (Number.isFinite(rid)) {
        // ID conocido pero sin fila ERV real → missing explícito (no inventar).
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
          console.warn('[CANONICAL_STATE_MISSING_FOR_EXISTING_ERV]', { requerimiento_id: rid });
        }
        row.estado_responsable_vigente = {
          canonicalMissing: true,
          estadoLabel: 'Estado no disponible',
          responsableTipo: 'PENDIENTE',
          responsableFuente: 'sin_vigente',
        };
      }
      // Sin ID resoluble: no forzar canonicalMissing (evita falsos "Estado no disponible").
    }
  } catch (_) {
    /* resolvedor no disponible — sin enriquecer */
  }
}

export default enrichEstadoResponsableForBandeja;

function resolveResponsablePlano(contrato) {
  if (!contrato) return { responsable: '', responsable_tipo: 'PENDIENTE', responsable_usuario_id: null };
  const responsable = contrato.responsableNombre
    || contrato.responsableUsername
    || contrato.responsableUnidad
    || (contrato.responsableTipo === 'PENDIENTE' ? 'Pendiente' : '');
  return {
    responsable,
    responsable_tipo: contrato.responsableTipo || 'PENDIENTE',
    responsable_usuario_id: contrato.responsableUsuarioId ?? null,
  };
}

/**
 * RC8.15.6G-8D0 — Aplica contrato canónico a una fila de bandeja (expediente o entregable).
 * Normaliza labels vía catálogo; no reinfiere desde legacy.
 */
export function aplicarContratoEstadoResponsableEnFila(row, contrato, opts = {}) {
  if (!row) return row;
  if (!contrato || contrato.canonicalMissing === true) {
    if (contrato) row.estado_responsable_vigente = contrato;
    return row;
  }

  const etapaCodigoCanon = contrato.etapaCodigo || contrato.estadoCodigo || '';
  const labelsCanon = buildEstadoLabels(
    etapaCodigoCanon,
    contrato.estadoCodigo || etapaCodigoCanon,
  );
  const erv = {
    ...contrato,
    etapaCodigo: etapaCodigoCanon || labelsCanon.etapaCodigo,
    etapaLabel: contrato.etapaLabel || labelsCanon.etapaLabel,
    estadoCodigo: labelsCanon.estadoCodigo || contrato.estadoCodigo,
    estadoLabel: contrato.estadoLabel || labelsCanon.estadoLabel,
  };
  row.estado_responsable_vigente = erv;

  if (opts.syncFlatFields !== false) {
    row.estado_etapa_codigo = erv.etapaCodigo;
    row.estado_etapa_label = erv.etapaLabel;
    row.etapa_label = erv.etapaLabel;
    Object.assign(row, resolveResponsablePlano(erv));
  }
  return row;
}

export { resolveResponsablePlano };