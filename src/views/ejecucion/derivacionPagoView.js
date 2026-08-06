/**
 * Pagos (código interno TESORERIA) — RC8.6B
 * NO IMPLEMENTADO: no existe bandeja funcional de workflow.
 * Al desarrollarse debe usar adaptEstadoResponsable + EstadoResponsableCell.
 */
function renderDerivacionPagoView() {
  return `<h1 class="h3">Pagos</h1>
    <p class="text-muted mb-2">Vista en construcción.</p>
    <p class="small text-muted mb-0"><strong>NO IMPLEMENTADO</strong> — sin bandeja funcional de Estado/Responsable.
    Código interno y permisos: <code>TESORERIA</code>. Al implementarse, usar componentes centrales de <code>src/ui/workflow/</code>.</p>`;
}
function initDerivacionPagoView() { console.log('Pagos (TESORERIA) — stub NO IMPLEMENTADO'); }
export { renderDerivacionPagoView, initDerivacionPagoView };
