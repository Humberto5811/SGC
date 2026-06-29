/**
 * Modal unificado de Observaciones — todos los módulos del SGC.
 */
import { requerimientosService } from '../services/requerimientosService.js';
import { authService } from '../services/authService.js';
import { getUserDisplayName } from '../utils/userDisplay.js';
import {
  getObservacionPendienteParaModulo,
  getObservacionEmisorPendienteCierre,
  getObservacionPadreParaDelegacion,
  puedeSubsanar,
  getSubmoduloByLabel,
} from '../utils/observacionDestino.js';
import {
  todasObservaciones,
  historialHtml,
  showObservacionDirigidaModal,
  showSubsanacionDirigidaModal,
} from '../views/requerimiento/reqShared.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function resolveOrigenDestinoSubsanacion(pending) {
  if (!pending) return 'Evaluación de Requerimiento';
  return pending.origen_submodulo
    || pending.moduloEmisor
    || pending.moduloOrigen
    || (String(pending.origen || '').includes('DEC') ? 'DEC' : 'Evaluación de Requerimiento');
}

async function refreshReq(req) {
  try {
    const fresh = await requerimientosService.getById(req.id);
    return fresh ? { ...req, ...fresh, payload: fresh.payload ?? req.payload } : req;
  } catch (_) {
    return req;
  }
}

/**
 * Abre el modal unificado de observaciones.
 * @param {Object} req - fila del requerimiento
 * @param {Object} opts
 * @param {string} opts.submoduloLabel - submódulo actual (ej. 'Registro de Requerimiento')
 * @param {boolean} opts.puedeObservar - puede registrar nueva observación
 * @param {boolean} opts.puedeSubsanar - puede responder/subsanar
 * @param {Function} opts.onObservar - async (id, data) => void
 * @param {Function} opts.onSubsanar - async (id, data) => void
 * @param {Function} opts.onAdjuntos - (id) => void
 * @param {Function} opts.onReload - () => void
 */
export async function openModalObservaciones(req, opts = {}) {
  if (!req) return null;
  const row = await refreshReq(req);
  const obs = todasObservaciones(row);
  const pending = getObservacionPendienteParaModulo(row, opts.submoduloLabel);
  const padreDelegacion = getObservacionPadreParaDelegacion(opts.submoduloLabel, row);
  const pendienteAqui = pending && puedeSubsanar(opts.submoduloLabel, row);
  const pendienteCierre = getObservacionEmisorPendienteCierre(row, opts.submoduloLabel);
  const userName = getUserDisplayName(authService.getCurrentUser?.() || {});

  const id = 'modObsUnif_' + Date.now();
  const html = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-chat-left-dots"></i> Observaciones — ${esc(row.codigo || row.id)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" style="max-height:75vh;overflow-y:auto;overflow-x:hidden;">
            ${historialHtml(obs)}
            ${padreDelegacion ? `
              <div class="alert alert-light border small py-2">
                <i class="bi bi-diagram-2"></i> Puede crear una <strong>subobservación</strong> hacia otro módulo antes de subsanar al emisor (${esc(padreDelegacion.origen_submodulo || padreDelegacion.moduloEmisor || '—')}).
              </div>` : ''}
            ${pendienteAqui && opts.puedeSubsanar !== false ? `
              <div class="alert alert-warning border small py-2">
                <i class="bi bi-exclamation-triangle"></i> Tiene una observación pendiente de subsanar hacia <strong>${esc(resolveOrigenDestinoSubsanacion(pending))}</strong>.
              </div>` : ''}
            ${pendienteCierre && opts.onCerrar !== false ? `
              <div class="alert alert-info border small py-2">
                <i class="bi bi-info-circle"></i> Subsanación recibida — puede <strong>revisar y cerrar</strong> la observación emitida.
              </div>` : ''}
          </div>
          <div class="modal-footer flex-wrap gap-2">
            ${opts.onAdjuntos ? `<button type="button" class="btn btn-outline-secondary btn-sm" id="${id}_adj"><i class="bi bi-paperclip"></i> Adjuntos</button>` : ''}
            ${pendienteAqui && opts.puedeSubsanar !== false ? `<button type="button" class="btn btn-primary btn-sm" id="${id}_subsanar"><i class="bi bi-reply"></i> Subsanar</button>` : ''}
            ${pendienteCierre && opts.onObservar ? `<button type="button" class="btn btn-success btn-sm" id="${id}_cerrar"><i class="bi bi-check2-circle"></i> Cerrar observación</button>` : ''}
            ${opts.onObservar !== false ? `<button type="button" class="btn btn-danger btn-sm" id="${id}_nueva"><i class="bi bi-plus-circle"></i> Nueva observación</button>` : ''}
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`;

  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  const el = document.getElementById(id);
  const modal = new bootstrap.Modal(el);

  return new Promise((resolve) => {
    el.querySelector(`#${id}_adj`)?.addEventListener('click', () => {
      opts.onAdjuntos?.(row.id);
    });

    el.querySelector(`#${id}_subsanar`)?.addEventListener('click', async () => {
      modal.hide();
      const destinoDefault = resolveOrigenDestinoSubsanacion(pending);
      const data = await showSubsanacionDirigidaModal({
        title: 'Subsanar observación',
        historyHtml: historialHtml(obs),
        origenSubmodulo: opts.submoduloLabel || 'Registro de Requerimiento',
        defaultDestinoSubmodulo: destinoDefault,
        placeholder: 'Describa las acciones realizadas y la respuesta…',
        buttonText: 'Subsanar y reenviar',
        buttonClass: 'btn-primary',
      });
      if (!data) { modal.show(); return; }
      try {
        if (opts.onSubsanar) {
          await opts.onSubsanar(row.id, {
            ...data,
            usuario: userName,
            observacion_id: pending?.id,
            destino_submodulo: resolveOrigenDestinoSubsanacion(pending),
          }, row);
        } else {
          await requerimientosService.subsanarConDestino(row.id, {
            respuesta: data.texto,
            usuario: userName,
            observacion_id: pending?.id,
            origen_submodulo: data.origen_submodulo || opts.submoduloLabel,
            destino_submodulo: resolveOrigenDestinoSubsanacion(pending),
            destino_etapa: data.destino_etapa,
            destino_persona: data.destino_persona,
          });
        }
        opts.onReload?.();
        resolve('subsanado');
      } catch (e) {
        alert('Error al subsanar: ' + e.message);
        modal.show();
      }
    });

    el.querySelector(`#${id}_cerrar`)?.addEventListener('click', async () => {
      if (!pendienteCierre?.id || !opts.onObservar) return;
      if (!confirm('¿Cerrar definitivamente esta observación?')) return;
      try {
        await opts.onObservar(row.id, {
          accion: 'cerrar',
          observacion_id: pendienteCierre.id,
          usuario: userName,
          origen_submodulo: opts.submoduloLabel,
        }, row);
        modal.hide();
        opts.onReload?.();
        resolve('cerrada');
      } catch (e) {
        alert('Error al cerrar: ' + e.message);
      }
    });

    el.querySelector(`#${id}_nueva`)?.addEventListener('click', async () => {
      modal.hide();
      const data = await showObservacionDirigidaModal({
        title: padreDelegacion
          ? `Subobservación — ${opts.submoduloLabel || ''}`
          : `Registrar observación — ${opts.submoduloLabel || ''}`,
        historyHtml: historialHtml(obs),
        origenSubmodulo: opts.submoduloLabel || '',
        defaultDestinoSubmodulo: opts.defaultDestinoObservacion || 'Registro de Requerimiento',
      });
      if (!data) { modal.show(); return; }
      try {
        const sub = getSubmoduloByLabel(data.destino_submodulo);
        const payloadObs = {
          ...data,
          motivo: data.motivo,
          usuario: userName,
          destino_etapa: sub?.code || data.destino_etapa,
          origen_submodulo: data.origen_submodulo || opts.submoduloLabel,
        };
        if (padreDelegacion?.id) {
          payloadObs.observacion_padre_id = padreDelegacion.id;
        }
        if (opts.onObservar) {
          await opts.onObservar(row.id, payloadObs, row);
        }
        opts.onReload?.();
        resolve('observado');
      } catch (e) {
        alert('Error al registrar observación: ' + e.message);
        modal.show();
      }
    });

    el.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      resolve(null);
    }, { once: true });
    modal.show();
  });
}

/** Handler estándar para menú Acciones → Observaciones. */
export async function handleBandejaObservaciones(id, rows, config = {}) {
  const req = (rows || []).find((x) => String(x.id) === String(id));
  if (!req) return;
  const puedeSubsanarMod = config.puedeSubsanar?.(req) ?? puedeSubsanar(config.submoduloLabel, req);
  await openModalObservaciones(req, {
    submoduloLabel: config.submoduloLabel,
    puedeObservar: config.puedeObservar?.(req) ?? !!config.onObservar,
    puedeSubsanar: puedeSubsanarMod,
    onObservar: config.onObservar,
    onSubsanar: config.onSubsanar,
    onAdjuntos: config.onAdjuntos,
    onReload: config.onReload,
    defaultDestinoObservacion: config.defaultDestinoObservacion,
  });
}

export default { openModalObservaciones, handleBandejaObservaciones };
