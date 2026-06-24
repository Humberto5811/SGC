// Recepción de Cotizaciones — bandeja (estructura; sin lógica operativa aún)
import {
  renderContratacionBandejaStub,
  initContratacionBandejaStub,
} from '../../utils/contratacionBandejaStub.js';

const VIEW_CONFIG = {
  prefix: 'recepCot',
  title: 'Recepción de Cotizaciones',
  icon: 'bi-inbox',
  description: 'Bandeja de expedientes en recepción y registro de cotizaciones.',
  listId: 'recepCotList',
};

export function renderRecepcionCotizacionesView() {
  return renderContratacionBandejaStub(VIEW_CONFIG);
}

export function initRecepcionCotizacionesView() {
  initContratacionBandejaStub(VIEW_CONFIG);
}
