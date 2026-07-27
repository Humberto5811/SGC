/**
 * RC8.8 — Generación / derivación del CCP desde Cuadro Comparativo aprobado.
 * OD34 — sin bloque técnico inútil ni descarga dinámica del generador.
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

/**
 * Panel CCP:
 * - DERIVADO_CCP: no se renderiza (consulta vía Anexo firmado + historial).
 * - APROBADO_DEC / PENDIENTE_CCP: solo acciones útiles (Ver firmas + Derivar).
 */
export function renderPanelGeneracionCcp(cuadro) {
  const e = String(cuadro?.estado || '').toUpperCase();
  // OD34 — ocultar bloque técnico tras derivación (datos quedan en historial/trazabilidad)
  if (e === 'DERIVADO_CCP') return '';
  if (!['APROBADO_DEC', 'PENDIENTE_CCP'].includes(e)) return '';

  const gates = evaluarGatesCcpCliente(cuadro);

  return `
    <div class="card border border-success mb-3" id="ccPanelCcp">
      <div class="card-body py-3">
        <h6 class="fw-bold mb-2"><i class="bi bi-send-check"></i> Derivación a CCP</h6>
        <p class="small text-muted mb-2">
          El expediente está aprobado. Use Ver firmas para consultar los PDFs persistidos
          o Derivar a CCP para continuar el flujo.
        </p>
        ${!gates.ok ? `
          <div class="alert alert-warning py-2 small mb-2">
            No se puede derivar a CCP: falta ${esc(gates.faltantes.join(', '))}.
          </div>` : ''}
        <div class="d-flex flex-wrap gap-2" id="ccCcpActions">
          <button type="button" class="btn btn-sm btn-outline-secondary" id="ccBtnCcpVerFirmas">
            <i class="bi bi-pen"></i> Ver Firmas
          </button>
          <button type="button" class="btn btn-sm btn-primary" id="ccBtnCcpDerivar"
            ${!gates.ok ? 'disabled' : ''}
            title="${gates.ok ? 'Derivar a CCP' : 'Faltan aprobaciones'}">
            <i class="bi bi-send"></i> Derivar a CCP
          </button>
        </div>
      </div>
    </div>`;
}
