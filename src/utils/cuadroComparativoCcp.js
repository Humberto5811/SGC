/**
 * RC8.8 — Generación / derivación del CCP desde Cuadro Comparativo aprobado.
 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function isModoGeneracionCcp(cuadro) {
  const e = String(cuadro?.estado || '').toUpperCase();
  return ['APROBADO_DEC', 'PENDIENTE_CCP'].includes(e);
}

export function evaluarGatesCcpCliente(cuadro) {
  const g = cuadro?.ccp_gates || {};
  const faltantes = [];
  if (!(g.conformidad_coordinador ?? cuadro?.conformidad_coordinador)) {
    faltantes.push('aprobación Coordinador');
  }
  if (!(g.conformidad_dec ?? cuadro?.conformidad_dec)) {
    faltantes.push('aprobación DEC');
  }
  if (g.version_vigente === false || String(cuadro?.estado || '').toUpperCase() === 'ANULADO') {
    faltantes.push('versión vigente');
  }
  if (!(g.pdf_firmado ?? cuadro?.tiene_pdf_firmado ?? cuadro?.firmado_nombre)) {
    faltantes.push('PDF firmado Coordinador');
  }
  if (!(g.pdf_firmado_dec ?? cuadro?.tiene_pdf_firmado_dec ?? cuadro?.firmado_dec_nombre)) {
    faltantes.push('PDF firmado DEC');
  }
  return { ok: faltantes.length === 0, faltantes };
}

export function renderPanelGeneracionCcp(cuadro) {
  const e = String(cuadro?.estado || '').toUpperCase();
  if (!['APROBADO_DEC', 'PENDIENTE_CCP', 'DERIVADO_CCP'].includes(e)) return '';

  const gates = evaluarGatesCcpCliente(cuadro);
  const derivado = e === 'DERIVADO_CCP';
  const generado = e === 'PENDIENTE_CCP' || derivado;
  const badge = (ok, label) => `<span class="badge ${ok ? 'bg-success' : 'bg-warning text-dark'}">${esc(label)}: ${ok ? 'Sí' : 'No'}</span>`;
  const g = cuadro?.ccp_gates || {};

  return `
    <div class="card border border-success mb-3" id="ccPanelCcp">
      <div class="card-body py-3">
        <h6 class="fw-bold mb-2"><i class="bi bi-file-earmark-check"></i> Generación del CCP</h6>
        <p class="small text-muted mb-2">
          Solo disponible cuando el cuadro está completamente aprobado
          (Coordinador + DEC, versión vigente y PDFs firmados).
        </p>
        <div class="d-flex flex-wrap gap-2 mb-2">
          ${badge(!!(g.conformidad_coordinador ?? cuadro?.conformidad_coordinador), 'Aprob. Coordinador')}
          ${badge(!!(g.conformidad_dec ?? cuadro?.conformidad_dec), 'Aprob. DEC')}
          ${badge(g.version_vigente !== false && e !== 'ANULADO', 'Versión vigente')}
          ${badge(!!(g.pdf_firmado ?? cuadro?.tiene_pdf_firmado), 'PDF firmado Coord.')}
          ${badge(!!(g.pdf_firmado_dec ?? cuadro?.tiene_pdf_firmado_dec), 'PDF firmado DEC')}
        </div>
        ${!gates.ok && !derivado ? `
          <div class="alert alert-warning py-2 small mb-2">
            No se puede Generar CCP: falta ${esc(gates.faltantes.join(', '))}.
          </div>` : ''}
        <div class="d-flex flex-wrap gap-2" id="ccCcpActions">
          <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnCcpDescargarFinal">
            <i class="bi bi-download"></i> Descargar Cuadro Final
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="ccBtnCcpVerFirmas">
            <i class="bi bi-pen"></i> Ver Firmas
          </button>
          <button type="button" class="btn btn-sm btn-success" id="ccBtnCcpGenerar"
            ${derivado || !gates.ok || generado ? 'disabled' : ''}
            title="${generado ? 'CCP ya generado' : (gates.ok ? 'Generar CCP' : 'Faltan aprobaciones')}">
            <i class="bi bi-file-earmark-plus"></i> Generar CCP
          </button>
          <button type="button" class="btn btn-sm btn-primary" id="ccBtnCcpDerivar"
            ${derivado || !gates.ok ? 'disabled' : ''}
            title="${derivado ? 'Ya derivado' : (gates.ok ? 'Derivar a CCP' : 'Faltan aprobaciones')}">
            <i class="bi bi-send"></i> Derivar CCP
          </button>
        </div>
        ${generado && !derivado ? '<div class="small text-success mt-2">CCP generado — pendiente de derivación.</div>' : ''}
        ${derivado ? `<div class="small text-muted mt-2">Derivado a CCP${cuadro.responsable_ccp_nombre ? ` · ${esc(cuadro.responsable_ccp_nombre)}` : ''}.</div>` : ''}
      </div>
    </div>`;
}
