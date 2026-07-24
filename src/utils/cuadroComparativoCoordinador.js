/**
 * RC8.5 / RC8.5-D — Revisión institucional del Coordinador CM.
 * Solo lectura económica; firma externa; observar/devolver; derivar DEC.
 */
import { resolveRolRevisionCliente, ROLES_REVISION } from './cuadroComparativoRevisionUi.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ESTADOS_COORD = Object.freeze(['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR']);

const ESTADOS_CUADRO_CONOCIDOS = Object.freeze(new Set([
  'PENDIENTE_ELABORAR', 'CUADRO_BORRADOR', 'EN_ELABORACION', 'BORRADOR',
  'ADJUDICADO', 'GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO',
  'PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR',
  'OBSERVADO_COORDINADOR', 'PENDIENTE_DEC', 'OBSERVADO_DEC',
  'APROBADO_DEC', 'PENDIENTE_CCP', 'DERIVADO_CCP', 'OBSERVADO', 'ANULADO',
]));

/** Estado documental canónico (evita labels o campos vacíos). */
export function getEstadoCuadro(cuadro = {}) {
  const a = String(cuadro?.estado || '').toUpperCase().trim();
  const b = String(cuadro?.estado_cuadro || '').toUpperCase().trim();
  if (ESTADOS_CUADRO_CONOCIDOS.has(a)) return a;
  if (ESTADOS_CUADRO_CONOCIDOS.has(b)) return b;
  return a || b;
}

export function enRevisionCoordinador(cuadro = {}) {
  return ESTADOS_COORD.includes(getEstadoCuadro(cuadro));
}

/**
 * Gates UI Coordinador CM.
 * Tras Anexo 08-A firmado: Observar/Devolver + Derivar a DEC.
 * Conformidad se registra automáticamente al derivar (si hay firma vigente).
 */
export function evaluarAccionesCoordinador(cuadro = {}) {
  const e = getEstadoCuadro(cuadro);
  const enCoord = ESTADOS_COORD.includes(e);
  const tienePdf = !!(cuadro?.tiene_pdf || cuadro?.pdf_nombre);
  const tieneFirmado = !!(cuadro?.tiene_pdf_firmado || cuadro?.firmado_nombre);
  const conformidad = !!(cuadro?.conformidad_coordinador
    || cuadro?.revision_coordinador?.conformidad);
  const vigente = cuadro?.vigente !== false && e !== 'ANULADO';
  const obs = cuadro?.observacion_pendiente;
  const sinObservaciones = !obs
    || !!(obs.respuesta || obs.respondido_at || obs.respondido_por);

  const puedeDescargar = enCoord && !!(cuadro?.id || tienePdf);
  const puedeAdjuntar = enCoord && tienePdf;
  const puedeVerFirmado = enCoord && tieneFirmado;
  const puedeEliminarFirmado = enCoord && tieneFirmado && !conformidad;
  const puedeObservar = enCoord;
  // Derivar a DEC: exige PDF firmado vigente (conformidad se auto-registra)
  const puedeDerivar = enCoord && tieneFirmado && vigente && sinObservaciones;

  const condicionesDerivar = [
    { key: 'firma', ok: !!tieneFirmado, label: 'Anexo 08-A firmado cargado' },
    { key: 'version', ok: !!vigente, label: 'Versión vigente del cuadro' },
    { key: 'observaciones', ok: !!sinObservaciones, label: 'Sin observaciones pendientes' },
    { key: 'estado', ok: !!enCoord, label: 'Expediente en revisión Coordinador CM' },
  ];
  const faltantesDerivar = condicionesDerivar.filter((c) => !c.ok).map((c) => c.label);
  const motivoDerivar = puedeDerivar
    ? ''
    : (faltantesDerivar.length
      ? `Derivar a DEC no disponible. Falta: ${faltantesDerivar.join('; ')}.`
      : 'Derivar a DEC no disponible.');

  return {
    estado: e,
    enCoord,
    tienePdf,
    tieneFirmado,
    conformidad,
    vigente,
    sinObservaciones,
    puedeDescargar,
    puedeAdjuntar,
    puedeVerFirmado,
    puedeEliminarFirmado,
    puedeObservar,
    puedeDerivar,
    motivoDerivar,
    condicionesDerivar,
    faltantesDerivar,
  };
}

export function isModoCoordinador8Uit(user, cuadro) {
  return isModoCoordinadorCm(user, cuadro);
}

export function isModoCoordinadorCm(user, cuadro) {
  const rol = resolveRolRevisionCliente(user);
  return rol === ROLES_REVISION.COORDINADOR_CM && enRevisionCoordinador(cuadro);
}

export function renderPanelCoordinador(cuadro, matriz = {}) {
  const g = evaluarAccionesCoordinador(cuadro);
  void matriz;

  return `
    <div class="card border border-warning mb-3" id="ccPanelCoordinador"
      data-rol-requerido="COORDINADOR_CM" data-estado="${esc(g.estado)}">
      <div class="card-body py-3">
        <h6 class="fw-bold mb-2"><i class="bi bi-person-badge"></i> Revisión Coordinador CM</h6>
        <p class="small text-muted mb-2 mb-0">
          Tras cargar el Anexo 08-A firmado: <strong>Observar / Devolver al Analista</strong>
          o <strong>Derivar a DEC</strong>.
        </p>
        <div class="d-flex flex-wrap gap-2 mt-2 mb-2">
          <span class="badge ${g.tienePdf ? 'bg-success' : 'bg-secondary'}">PDF Anexo: ${g.tienePdf ? 'Sí' : 'No'}</span>
          <span class="badge ${g.tieneFirmado ? 'bg-success' : 'bg-warning text-dark'}">PDF firmado: ${g.tieneFirmado ? 'Sí' : 'Pendiente'}</span>
          <span class="badge ${g.vigente ? 'bg-success' : 'bg-danger'}">Versión: ${g.vigente ? 'Vigente' : 'No vigente'}</span>
        </div>
        <div class="d-flex flex-wrap gap-2" id="ccCoordActions">
          <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnCoordDescargar"
            ${g.puedeDescargar ? '' : 'disabled'}
            title="${g.puedeDescargar ? 'Descargar Cuadro Comparativo' : 'No hay cuadro para descargar'}">
            <i class="bi bi-download"></i> Descargar Cuadro
          </button>
          <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnCoordAdjuntar"
            ${g.puedeAdjuntar ? '' : 'disabled'}
            title="${g.puedeAdjuntar ? 'Adjuntar Cuadro Firmado' : 'Descargue y genere el PDF del Anexo primero'}">
            <i class="bi bi-paperclip"></i> Adjuntar Cuadro Firmado
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="ccBtnCoordVerFirmado"
            ${g.puedeVerFirmado ? '' : 'disabled'}
            title="${g.puedeVerFirmado ? 'Ver PDF firmado' : 'Adjuntar Cuadro Firmado primero'}">
            <i class="bi bi-eye"></i> Ver Firmado
          </button>
          ${g.puedeEliminarFirmado ? `
            <button type="button" class="btn btn-sm btn-outline-danger" id="ccBtnCoordEliminarFirmado"
              title="Eliminar PDF firmado para volver a adjuntar">
              <i class="bi bi-trash"></i> Eliminar firmado
            </button>` : ''}
          <button type="button" class="btn btn-sm btn-outline-danger" id="ccBtnCoordObservar"
            ${g.puedeObservar ? '' : 'disabled'}
            title="Observar y devolver el expediente al Analista">
            <i class="bi bi-exclamation-triangle"></i> Observar / Devolver al Analista
          </button>
          <button type="button" class="btn btn-sm btn-warning" id="ccBtnCoordDerivarDec"
            ${g.puedeDerivar ? '' : 'disabled'}
            title="${g.puedeDerivar ? 'Aprobar revisión y derivar al DEC' : esc(g.motivoDerivar)}">
            <i class="bi bi-send"></i> Derivar a DEC
          </button>
        </div>
        ${!g.puedeDerivar && g.enCoord ? `
          <div class="alert alert-warning py-2 small mb-0 mt-2" id="ccCoordDerivarBlocked">
            ${esc(g.motivoDerivar)}
          </div>` : ''}
        ${cuadro?.firmado_nombre ? `<div class="small text-muted mt-2">Firmado: <strong>${esc(cuadro.firmado_nombre)}</strong></div>` : ''}
        ${!g.enCoord ? '<div class="small text-danger mt-2">Estado actual no admite acciones de Coordinador CM.</div>' : ''}
      </div>
    </div>`;
}

/** @deprecated RC8.5-D1 — usar observarCuadroConModalInstitucional */
export function showObservarCoordinadorModal() {
  console.warn('showObservarCoordinadorModal eliminado (RC8.5-D1). Use observarCuadroConModalInstitucional.');
  return Promise.resolve(null);
}
