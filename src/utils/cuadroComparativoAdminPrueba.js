/**
 * RC8.5-G — Modo Administrador para pruebas del workflow.
 * Contexto en sessionStorage (nunca URL / query params).
 */
import {
  ROLES_REVISION,
  ROLES_ACTUAR_COMO,
  normalizeActuarComo,
  labelRolRevision,
} from './cuadroComparativoRevisionUi.js';

const STORAGE_KEY = 'sgc_cc_admin_actuar_como';

export function getActuarComoAdmin() {
  try {
    return normalizeActuarComo(sessionStorage.getItem(STORAGE_KEY) || '');
  } catch (_) {
    return '';
  }
}

export function setActuarComoAdmin(rol) {
  const v = normalizeActuarComo(rol);
  try {
    if (v) sessionStorage.setItem(STORAGE_KEY, v);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) { /* noop */ }
  return v;
}

/** Ignora parámetros de URL (anti-suplantación vía navegador). */
export function resolveActuarComoDesdeUi(preferido = '') {
  return normalizeActuarComo(preferido) || getActuarComoAdmin() || '';
}

export function renderBannerAdminPrueba(actuarComo) {
  const ctx = normalizeActuarComo(actuarComo) || ROLES_REVISION.COORDINADOR_CM;
  const label = labelRolRevision(ctx);
  return `
    <div class="alert alert-warning border border-warning py-2 px-3 mb-2 d-flex flex-wrap align-items-center gap-2" id="ccAdminPruebaBanner" role="status">
      <div class="flex-grow-1 small mb-0">
        <strong>Administrador</strong> actuando como <strong>${label}</strong>
        <span class="text-muted"> — modo prueba (sesión y rol real no cambian)</span>
      </div>
      <label class="small mb-0 d-flex align-items-center gap-1">
        Actuar como
        <select id="ccAdminActuarComo" class="form-select form-select-sm" style="width:auto;min-width:10rem;">
          ${ROLES_ACTUAR_COMO.map((r) => `
            <option value="${r}" ${r === ctx ? 'selected' : ''}>${labelRolRevision(r)}</option>
          `).join('')}
        </select>
      </label>
    </div>`;
}

export function enEstadoRevisionDec(cuadro) {
  const e = String(cuadro?.estado || cuadro?.estado_cuadro || '').toUpperCase();
  return ['PENDIENTE_DEC', 'FIRMADO_COORDINADOR'].includes(e);
}
