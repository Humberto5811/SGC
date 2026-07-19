/**
 * RC8.7 — UI versionado del Cuadro Comparativo (historial + respuesta a observaciones).
 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (_) {
    return String(v);
  }
}

export function isCuadroObservadoEditable(cuadro) {
  const e = String(cuadro?.estado || '').toUpperCase();
  return ['OBSERVADO', 'OBSERVADO_COORDINADOR', 'OBSERVADO_DEC'].includes(e);
}

/**
 * @param {object} cuadro
 * @param {Array} versiones — listado de listCuadroVersiones
 */
export function renderPanelVersionado(cuadro, versiones = []) {
  const vigente = Number(cuadro?.version || 1);
  const obs = cuadro?.observacion_pendiente
    || (Array.isArray(cuadro?.historial_versiones)
      ? cuadro.historial_versiones.slice(-1)[0]
      : null);
  const rows = (versiones || []).length
    ? versiones
    : (Array.isArray(cuadro?.historial_versiones) ? cuadro.historial_versiones.map((h) => ({
      version: h.version_nueva || h.version_origen,
      estado: h.estado || 'ANULADO',
      vigente: false,
      motivo: h.motivo,
      usuario_version: h.usuario,
      fecha_version: h.fecha,
      observacion: h.observacion,
    })) : []);

  const histHtml = rows.length
    ? rows.map((v) => {
      const esVig = v.vigente === true || (Number(v.version) === vigente && String(v.estado || '').toUpperCase() !== 'ANULADO');
      return `
        <tr class="${esVig ? 'table-success' : ''}">
          <td><strong>v${esc(v.version)}</strong>${esVig ? ' <span class="badge bg-success">Vigente</span>' : ''}</td>
          <td class="small">${esc(v.estado || '—')}</td>
          <td class="small">${esc(fmtFecha(v.fecha_version || v.actualizado_at))}</td>
          <td class="small">${esc(v.usuario_version || v.actualizado_por || '—')}</td>
          <td class="small">${esc(v.motivo || '—')}</td>
        </tr>`;
    }).join('')
    : `<tr><td colspan="5" class="text-muted small">Sin historial de versiones aún.</td></tr>`;

  const observado = isCuadroObservadoEditable(cuadro);

  return `
    <div class="card border mb-3" id="ccPanelVersionado">
      <div class="card-body py-3">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h6 class="fw-bold mb-0"><i class="bi bi-stack"></i> Versionado del cuadro</h6>
          <span class="badge bg-primary">Versión vigente: v${esc(vigente)}</span>
        </div>
        ${obs ? `
          <div class="alert alert-warning py-2 small mb-2">
            <div><strong>Observación pendiente</strong> (${esc(obs.accion || 'OBSERVAR')})</div>
            <div><strong>Motivo:</strong> ${esc(obs.motivo || '—')}</div>
            ${obs.descripcion ? `<div><strong>Descripción:</strong> ${esc(obs.descripcion)}</div>` : ''}
            <div><strong>Observación:</strong> ${esc(obs.observacion || '—')}</div>
            ${obs.comentario ? `<div><strong>Comentario:</strong> ${esc(obs.comentario)}</div>` : ''}
            <div class="text-muted mt-1">${esc(obs.usuario || '')} · ${esc(fmtFecha(obs.fecha))}</div>
          </div>
        ` : ''}
        ${observado ? `
          <div class="mb-2">
            <label class="form-label small fw-semibold mb-0" for="ccRespuestaObs">
              Respuesta a observaciones <span class="text-danger">*</span>
            </label>
            <textarea class="form-control form-control-sm" id="ccRespuestaObs" rows="3"
              placeholder="Indique las correcciones realizadas…">${esc(cuadro?.respuesta_observaciones || '')}</textarea>
            <div class="form-text">Obligatoria antes de derivar nuevamente al Coordinador.</div>
          </div>
        ` : (cuadro?.respuesta_observaciones ? `
          <div class="small mb-2"><strong>Respuesta del Analista:</strong>
            <div class="border rounded p-2 bg-light">${esc(cuadro.respuesta_observaciones)}</div>
          </div>
        ` : '')}
        <div class="table-responsive">
          <table class="table table-sm table-bordered mb-0 align-middle">
            <thead class="table-light">
              <tr>
                <th>Versión</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>${histHtml}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

export function collectRespuestaObservaciones(root) {
  const el = root?.querySelector?.('#ccRespuestaObs');
  return el ? String(el.value || '').trim() : '';
}
