import { authService } from '../services/authService.js';

export function mustChangePassword(user) {
  const u = user || authService.getCurrentUser();
  return !!(u && u.debeCambiarPassword);
}

export function passwordStatusBadge(estado) {
  if (estado === 'Configurada') return '<span class="text-success">✓ Configurada</span>';
  if (estado === 'Restablecida') return '<span class="text-warning">⚠ Restablecida</span>';
  return '<span class="text-warning">⚠ Cambio pendiente</span>';
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
