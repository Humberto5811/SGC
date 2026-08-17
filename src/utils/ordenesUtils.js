/**
 * Utilidades y menú Acciones — Registro de Órdenes (OD36 / RC8.10.4).
 */
import { ESTADOS_ORDEN_LABEL, normalizeEstadoOrden } from '../../shared/estadoExpedienteVigente.js';
import { formatDateTimeLima } from './dateTimeLima.js';

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

/**
 * Formatea un TIMESTAMP (instante UTC) en hora America/Lima, independientemente
 * del timezone del navegador/servidor. RC8.14.13: delega en el helper central
 * dateTimeLima.js en lugar de usar getters locales (getHours/getDate/...).
 * NO usar con campos DATE contractuales (fecha_base, fecha_maxima): usar fmtFecha().
 */
export function fmtFechaHora(v) {
  if (!v) return '—';
  const out = formatDateTimeLima(v, { style: 'dmy' });
  return out === '—' ? fmtFecha(v) : out;
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
    // RC8.14.2 Obs.52 (corrección de regresión) — "Configurar entregas/entregables"
    // NO estaba en esta rama: checklist.completo===true (requisito económico, RC8.14.1)
    // hace que sincronizarEstadoSegunChecklist avance la orden a
    // ORDEN_LISTA_NOTIFICACION, pero eso no significa que el cronograma esté
    // completamente configurado (p. ej. Fecha efectiva/Fecha máxima pueden seguir
    // "Pendiente" hasta notificar). ORDEN_LISTA_NOTIFICACION sigue siendo un estado
    // de preparación editable (aún no se notificó al proveedor) — la acción debe
    // seguir disponible hasta que la orden realmente se notifique (rama E).
    if (can) {
      items.push({
        act: 'adminEntregas',
        label: esServicio ? 'Configurar entregables' : 'Configurar entregas',
        icon: 'bi-calendar-week',
      });
    }
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

    // RC8.13.2 Obs.50 — "Editar CCP" reutiliza openCcpCodigoModal + contratacionesService
    // .editarCodigoCcp (mismo modal/servicio del módulo CCP; ningún flujo nuevo). Regla
    // controlada (server/lib/ccpCertificacion.js → assertCcpEditableDesdeOrden): editable
    // mientras la orden sigue en preparación, antes de "lista para notificación"/"notificada"
    // (esas dos ramas de estado ni siquiera llegan a este bloque — return anticipado arriba).
    // Bloqueado en el servidor desde ORDEN_NOTIFICADA en adelante y en todo estado
    // realmente cerrado/histórico (recepción, ejecución, conformidad, pagos, finalizado,
    // anulada/resuelta) — la protección original no se eliminó, solo se acotó su ventana.
    items.push({
      act: 'editarCcp',
      label: 'Editar CCP',
      icon: 'bi-pencil-square',
      disabled: !row.codigo_ccp,
      title: !row.codigo_ccp ? 'No hay código CCP registrado' : '',
    });

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
  'editarCcp',
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

/** Acciones exclusivas del tab "Registro de CCP" (RC8.13.1 Obs.49). */
const ACCIONES_SOLO_CCP = new Set([
  'adjuntarCcpFirmado', 'verCcpFirmado', 'eliminarCcpFirmado', 'editarCcp',
]);

/**
 * RC8.13.1 Obs.49 — separa el menú Acciones (registroOrdenesMenuItems) ya calculado
 * en el subconjunto correspondiente a cada tab de la bandeja de Registro de Órdenes.
 * No define una regla nueva de qué acción corresponde a qué estado: solo proyecta el
 * mismo arreglo de acciones en dos vistas, para no duplicar el dispatcher ni los
 * handlers existentes.
 */
export function splitMenuItemsPorBandeja(items = []) {
  const list = Array.isArray(items) ? items : [];
  return {
    ccp: list.filter((it) => ACCIONES_SOLO_CCP.has(it.act) || it.act === 'verExpediente' || it.act === 'verHistorial'),
    orden: list.filter((it) => !ACCIONES_SOLO_CCP.has(it.act)),
  };
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
