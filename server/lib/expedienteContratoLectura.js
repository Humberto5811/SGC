/**
 * RC8.17.4 — Punto único de lectura Etapa / Estado / Responsable.
 * ERV (expediente_estado_vigente + expediente_asignaciones) tiene prioridad absoluta.
 * Legacy solo vía sync desde transición canónica; no se reinfiere aquí.
 */
import { getEstadoResponsableCanonico, buildContratoCanonico } from './estadoResponsableCanonico.js';
import {
  enrichEstadoResponsableForBandeja,
  aplicarContratoEstadoResponsableEnFila,
} from './enrichEstadoResponsable.js';
import {
  buildBandejaExpedienteContrato,
  applyBandejaExpedienteContrato,
} from './bandejaExpedienteContrato.js';

export {
  getEstadoResponsableCanonico,
  buildContratoCanonico,
  enrichEstadoResponsableForBandeja,
  aplicarContratoEstadoResponsableEnFila,
  buildBandejaExpedienteContrato,
  applyBandejaExpedienteContrato,
};

const CONTRATO_VACIO = Object.freeze({
  etapa: { codigo: '', label: '' },
  estado: { codigo: '', label: 'Estado no disponible' },
  responsable: {
    tipo: 'PENDIENTE',
    usuario_id: null,
    nombre: 'Pendiente de asignación',
    unidad: '',
  },
  canonicalMissing: true,
});

/**
 * Contrato único de lectura para bandejas, APIs y diagnóstico.
 * @param {number|string} requerimientoId
 * @param {object} [client] — cliente pg opcional (transacción)
 * @returns {Promise<{ etapa, estado, responsable, dias_en_estado?, canonicalMissing? }>}
 */
export async function getExpedienteContratoUnificado(requerimientoId, client = null) {
  const id = parseInt(requerimientoId, 10);
  if (!Number.isFinite(id) || id <= 0) return { ...CONTRATO_VACIO };

  const map = await getEstadoResponsableCanonico({ requerimientoIds: [id], client });
  const contrato = map.get(id);
  if (!contrato || contrato.canonicalMissing) return { ...CONTRATO_VACIO };

  const bc = buildBandejaExpedienteContrato({ id, estado_responsable_vigente: contrato });
  return {
    etapa: bc.etapa,
    estado: bc.estado,
    responsable: {
      tipo: bc.responsable.tipo,
      usuario_id: bc.responsable.usuarioId,
      nombre: bc.responsable.nombre,
      unidad: bc.responsable.unidad,
    },
    dias_en_estado: bc.dias_en_estado,
    canonicalMissing: false,
  };
}

export default {
  getExpedienteContratoUnificado,
  getEstadoResponsableCanonico,
  enrichEstadoResponsableForBandeja,
  buildBandejaExpedienteContrato,
};
