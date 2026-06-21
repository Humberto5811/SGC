// Servicio central de trazabilidad — API + utilidades de bandeja
import { api } from './apiService.js';
import { computeTraceSummary } from '../utils/trazabilidad.js';

export const traceabilityService = {
  get: (requerimientoId) => api.get(`/requerimientos/${requerimientoId}/trazabilidad`),

  computeSummary(rows = []) {
    return computeTraceSummary(rows);
  },
};

export default traceabilityService;
