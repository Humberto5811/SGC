/** Helpers compartidos — catálogos dinámicos Solicitud de Cotización por tipo. */
import { splitDatetimeParts as splitCronogramaParts } from './cronogramaDatetime.js';

export function getCatalogoTipo(catalogosPorTipo, tipo) {
  const t = tipo || 'Bienes';
  return catalogosPorTipo?.[t] || catalogosPorTipo?.Bienes || {
    docs_solicitados: [],
    requisitos_tecnicos: [],
  };
}

export function splitDatetimeParts(iso, toLocalFn) {
  return splitCronogramaParts(iso, toLocalFn);
}

export function mergeDateTime(date, time) {
  if (!date) return null;
  const t = (time || '00:00').slice(0, 5);
  return `${date}T${t}`;
}

export function displayCmnValue(cmn) {
  const v = String(cmn ?? '').trim();
  return v || '';
}

export function itemCantidadForTipo(tipo, cantidad) {
  if (tipo === 'Servicios' || tipo === 'Locadores') return 1;
  return cantidad ?? 1;
}

export function mapTipoFromRow(r) {
  const t = String(r?.tipo || '').toLowerCase();
  if (t === 'servicios') return 'Servicios';
  if (t === 'locacion') return 'Locadores';
  return 'Bienes';
}
