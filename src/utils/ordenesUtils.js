/**
 * Utilidades y menú Acciones — Registro de Órdenes (OD36 / RC8.10.4).
 */
import { ESTADOS_ORDEN_LABEL, normalizeEstadoOrden } from '../../shared/estadoExpedienteVigente.js';

export { ESTADOS_ORDEN_LABEL, normalizeEstadoOrden };

export const CONDICIONES_INICIO_OPTS = [
  { value: 'EMISION_ORDEN', label: 'A partir de la emisión de la orden' },
  { value: 'DIA_SIGUIENTE_NOTIFICACION', label: 'Al día siguiente de la notificación de la orden' },
  { value: 'SUSCRIPCION_ACTA_INICIO', label: 'A partir de la suscripción del acta de inicio' },
  { value: 'DIA_SIGUIENTE_ACTA_INICIO', label: 'Al día siguiente de suscrita el acta de inicio' },
  { value: 'SUSCRIPCION_CONTRATO', label: 'A partir de la suscripción del contrato' },
  { value: 'DIA_SIGUIENTE_CONTRATO', label: 'Al día siguiente de suscrito el contrato' },
];

export function tipoOrdenSugerido(tipoContratacion) {
  return /servic|locador|locac/i.test(String(tipoContratacion || '')) ? 'OS' : 'OC';
}

export function esServicioTipo(tipo) {
  return /servic|locador|locac/i.test(String(tipo || ''));
}

export function fmtMonto(n, moneda = 'PEN') {
  const val = Number(n || 0);
  const sym = String(moneda).toUpperCase() === 'USD' ? 'US$' : 'S/';
  return `${sym} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtFecha(v) {
  if (!v) return '—';
  try {
    const s = String(v);
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const d = v instanceof Date ? v : new Date(v);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    }
  } catch (_) { /* fallthrough */ }
  return String(v);
}

export function fmtFechaHora(v) {
  if (!v) return '—';
  try {
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return fmtFecha(v);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (_) {
    return String(v);
  }
}

/**
 * Menú Acciones RO — RC8.10.4.
 * En preparación: muestra acciones operativas (habilitadas o disabled+tooltip).
 * No reduce el menú a solo checklist.
 */
export function registroOrdenesMenuItems(row = {}, opts = {}) {
  const can = opts.canManage !== false;
  const estado = normalizeEstadoOrden(row.estado || row.orden_estado || 'REGISTRO_ORDENES');
  const tieneFirmado = !!row.ccp_firmado || !!row.ccp_firmado_id;
  const tieneOrden = !!row.orden_id;
  const esServicio = esServicioTipo(row.tipo || row.tipo_contratacion || row.tipo_proceso);
  const checklistCompleto = row.checklist_completo === true
    || row.checklist?.completo === true;
  const items = [];

  // F. Recepción confirmada / ejecución
  if (estado === 'ORDEN_RECEPCION_CONFIRMADA' || estado === 'EN_EJECUCION') {
    items.push({ act: 'verExpediente', label: 'Ver expediente', icon: 'bi-folder2-open' });
    items.push({ act: 'verConfirmacion', label: 'Ver confirmación', icon: 'bi-check2-circle' });
    items.push({ act: 'verCronograma', label: 'Ver cronograma', icon: 'bi-calendar-week' });
    items.push({ act: 'verFechasMaximas', label: 'Ver fechas máximas', icon: 'bi-calendar-check' });
    if (can && estado === 'ORDEN_RECEPCION_CONFIRMADA') {
      items.push({ act: 'derivarEjecucion', label: 'Derivar a Ejecución', icon: 'bi-box-arrow-right' });
    }
    items.push({ act: 'verHistorial', label: 'Ver historial', icon: 'bi-clock-history' });
    return items;
  }

  // E. Orden notificada
  if (estado === 'ORDEN_NOTIFICADA') {
    items.push({ act: 'verExpediente', label: 'Ver expediente', icon: 'bi-folder2-open' });
    items.push({ act: 'verNotificacion', label: 'Ver notificación', icon: 'bi-envelope' });
    if (can) items.push({ act: 'reenviar', label: 'Reenviar orden', icon: 'bi-arrow-repeat' });
    items.push({ act: 'verConfirmacion', label: 'Ver confirmación de recepción', icon: 'bi-check2-circle' });
    items.push({ act: 'verFechasMaximas', label: 'Ver fechas máximas', icon: 'bi-calendar-check' });
    items.push({ act: 'verHistorial', label: 'Ver historial', icon: 'bi-clock-history' });
    return items;
  }

  // D. Lista para notificación
  if (estado === 'ORDEN_LISTA_NOTIFICACION') {
    items.push({ act: 'verExpediente', label: 'Ver expediente', icon: 'bi-folder2-open' });
    items.push({ act: 'verOrdenFirmada', label: 'Ver orden firmada', icon: 'bi-file-earmark-pdf' });
    items.push({ act: 'descargarOrden', label: 'Descargar orden', icon: 'bi-download' });
    items.push({ act: 'verChecklist', label: 'Ver checklist', icon: 'bi-ui-checks' });
    if (can) {
      items.push({
        act: 'notificarProveedor',
        label: 'Notificar al proveedor',
        icon: 'bi-send',
        disabled: row.checklist_completo === false,
        title: row.checklist_completo === false ? 'Complete el checklist aplicable' : '',
      });
    }
    items.push({ act: 'verHistorial', label: 'Ver historial', icon: 'bi-clock-history' });
    return items;
  }

  // Preparación REGISTRO_ORDEN — menú operativo completo (disabled si falta prerequisito)
  items.push({ act: 'verChecklist', label: 'Ver checklist', icon: 'bi-ui-checks' });

  if (can) {
    if (!tieneFirmado) {
      items.push({ act: 'adjuntarCcpFirmado', label: 'Adjuntar CCP firmado', icon: 'bi-file-earmark-lock' });
    } else {
      items.push({ act: 'verCcpFirmado', label: 'Ver CCP firmado', icon: 'bi-file-earmark-pdf' });
      items.push({ act: 'eliminarCcpFirmado', label: 'Eliminar CCP firmado', icon: 'bi-trash' });
    }

    items.push({
      act: tieneOrden ? 'editarOrden' : 'registrarOrden',
      label: tieneOrden ? 'Editar orden' : 'Registrar orden',
      icon: tieneOrden ? 'bi-pencil' : 'bi-plus-circle',
      disabled: !tieneFirmado,
      title: !tieneFirmado ? 'Adjuntar primero el CCP firmado' : '',
    });

    items.push({
      act: 'adjuntarOrdenFirmada',
      label: 'Adjuntar orden firmada',
      icon: 'bi-file-earmark-pdf',
      disabled: !tieneOrden,
      title: !tieneOrden ? 'Registre primero la orden' : '',
    });

    items.push({
      act: 'adminEntregas',
      label: esServicio ? 'Configurar entregables' : 'Configurar entregas',
      icon: 'bi-calendar-week',
      disabled: !tieneOrden,
      title: !tieneOrden ? 'Registre primero la orden' : '',
    });

    if (esServicio) {
      items.push({
        act: 'inicioActividad',
        label: 'Configurar inicio de actividad',
        icon: 'bi-play-circle',
        disabled: !tieneOrden,
        title: !tieneOrden ? 'Registre primero la orden' : '',
      });
    }

    items.push({
      act: 'notificarProveedor',
      label: 'Notificar al proveedor',
      icon: 'bi-send',
      disabled: !tieneOrden || !checklistCompleto,
      title: !tieneOrden
        ? 'Registre primero la orden'
        : (!checklistCompleto ? 'Complete el checklist aplicable' : ''),
    });
  }

  if (tieneOrden) {
    items.push({ act: 'verExpediente', label: 'Ver expediente', icon: 'bi-folder2-open' });
  }
  items.push({ act: 'verHistorial', label: 'Ver trazabilidad', icon: 'bi-clock-history' });
  return items;
}

/** Acciones del menú Acciones que representan edición de información de la orden. */
const ACCIONES_EDICION_ORDEN = new Set([
  'editarOrden',
  'adminEntregas',
  'inicioActividad',
  'adjuntarOrdenFirmada',
  'adjuntarCcpFirmado',
  'eliminarCcpFirmado',
]);

/**
 * RC8.12 Obs.07 punto 1 — Acciones de edición disponibles para una orden, dado su
 * estado vigente. Reutiliza exactamente la misma regla de estados que ya gobierna
 * el menú Acciones (registroOrdenesMenuItems): no define una regla nueva de qué es
 * editable — solo filtra el subconjunto de acciones que corresponden a edición, para
 * poder exponerlas también desde "Ver expediente" sin un segundo flujo de edición.
 */
export function getOrdenEdicionAcciones(row = {}, opts = {}) {
  return registroOrdenesMenuItems(row, opts)
    .filter((item) => ACCIONES_EDICION_ORDEN.has(item.act));
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function openPdfBase64(base64, nombre = 'documento.pdf') {
  const raw = String(base64 || '');
  const b64 = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return nombre;
}

export function downloadPdfBase64(base64, nombre = 'documento.pdf') {
  const raw = String(base64 || '');
  const b64 = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
