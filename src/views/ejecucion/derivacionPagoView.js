/**
 * Pagos (TESORERIA) — RC8.15.6F1 / G4
 * Bandeja de entregables en PREPARACION_EXPEDIENTE_PAGO (Analista CM).
 */
import { entregablesServiciosService } from '../../services/entregablesServiciosService.js';
import { renderEstadoBadgeFromRow, renderEstadoBadgeHtml } from '../../ui/workflow/EstadoBadge.js';
import {
  renderActionMenuCell, bindActionMenus, closeBandejaActionMenus, renderResponsableCellHtml,
} from '../../utils/bandejaUi.js';
import { fmtFecha, fmtMonto } from '../../utils/ordenesUtils.js';
import { openExpedienteOrdenModal } from '../../utils/registroOrdenExpedienteModal.js';
import { openEntregableTrazabilidadModal } from '../../utils/entregableTrazabilidadModal.js';
import {
  openChecklistPagoModal,
  openVerActaConformidadPagoModal,
  openVerEntregablePagoModal,
} from '../../utils/entregableChecklistPagoModal.js';

const VIEW_ID = 'derivacion-pago';
const LIST_ID = 'pagoList';
const PREFIX = 'pago';

let bandejaCache = [];
let penalidadContexto = null;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function renderPenalidadDatosContractuales(ctx) {
  const el = document.getElementById(`${PREFIX}PenalidadDatos`);
  if (!el || !ctx) return;
  el.innerHTML = `
    <div class="row g-2 small">
      <div class="col-md-4"><strong>Orden:</strong> ${esc(ordenLabel(ctx))}</div>
      <div class="col-md-4"><strong>Entregable:</strong> N.° ${esc(ctx.numero_entrega ?? '—')}</div>
      <div class="col-md-4"><strong>Proveedor:</strong> ${esc(ctx.proveedor_razon_social || '—')}</div>
      <div class="col-md-4"><strong>Fecha notificación:</strong> ${esc(fmtFecha(ctx.fecha_notificacion))}</div>
      <div class="col-md-4"><strong>Plazo contractual:</strong> ${esc(ctx.dias_plazo ?? '—')} días</div>
      <div class="col-md-4"><strong>Inicio de plazo:</strong> ${esc(fmtFecha(ctx.fecha_inicio_plazo))}</div>
      <div class="col-md-4"><strong>Fecha máxima contractual:</strong> ${esc(fmtFecha(ctx.fecha_maxima_contractual))}</div>
      <div class="col-md-4"><strong>Presentación / recepción:</strong> ${esc(fmtFecha(ctx.fecha_presentacion))}</div>
    </div>`;
}

function renderPenalidadCalculos(ctx) {
  const el = document.getElementById(`${PREFIX}PenalidadCalculos`);
  if (!el || !ctx) return;
  el.innerHTML = `
    <div class="row g-2 small">
      <div class="col-md-4"><strong>Total días ampliación:</strong> ${esc(ctx.total_dias_ampliacion ?? 0)}</div>
      <div class="col-md-4"><strong>Fecha máxima ajustada:</strong> ${esc(fmtFecha(ctx.fecha_maxima_ajustada))}</div>
      <div class="col-md-4"><strong>Días de atraso:</strong> <span class="fw-semibold">${esc(ctx.dias_atraso ?? 0)}</span></div>
    </div>`;
}

function renderAmpliacionesLista(ctx) {
  const lista = document.getElementById(`${PREFIX}PenalidadAmpliacionesLista`);
  const form = document.getElementById(`${PREFIX}PenalidadAmpliacionForm`);
  if (!lista) return;
  const puedeEditar = Boolean(ctx?.puede_editar);
  const ampliaciones = ctx?.ampliaciones || [];
  if (form) form.classList.toggle('d-none', !puedeEditar);
  lista.innerHTML = ampliaciones.length ? ampliaciones.map((amp) => `
    <div class="border rounded p-2 mb-2 small" data-amp-id="${esc(amp.id)}">
      <div class="d-flex justify-content-between gap-2">
        <strong>${esc(amp.dias_ampliacion)} día(s)</strong>
        <span class="text-muted">${esc(fmtFecha(amp.fecha_documento))}</span>
      </div>
      <div>Documento: ${esc(amp.numero_documento || '—')}</div>
      ${amp.observacion ? `<div class="text-muted">${esc(amp.observacion)}</div>` : ''}
      <div class="mt-1 d-flex gap-2 flex-wrap">
        <a class="btn btn-sm btn-outline-primary" target="_blank" rel="noopener"
          href="${esc(entregablesServiciosService.documentoAmpliacionPlazoUrl(ctx.orden_entrega_id || document.getElementById(`${PREFIX}PenalidadEntregableId`)?.value, amp.id))}">
          Ver adjunto
        </a>
        ${puedeEditar ? `<button type="button" class="btn btn-sm btn-outline-danger pago-amp-del" data-id="${esc(amp.id)}">Eliminar</button>` : ''}
      </div>
    </div>`).join('') : '<p class="text-muted small mb-0">Sin ampliaciones registradas.</p>';
  lista.querySelectorAll('.pago-amp-del').forEach((btn) => {
    btn.onclick = async () => {
      if (!window.confirm('¿Eliminar esta ampliación de plazo?')) return;
      const entId = document.getElementById(`${PREFIX}PenalidadEntregableId`).value;
      try {
        await entregablesServiciosService.eliminarAmpliacionPlazoPenalidad(entId, btn.dataset.id);
        await reloadPenalidadContexto(entId);
      } catch (err) {
        window.alert(err.message || 'No se pudo eliminar la ampliación');
      }
    };
  });
}

async function reloadPenalidadContexto(id) {
  const resp = await entregablesServiciosService.obtenerContextoPenalidadPago(id);
  penalidadContexto = resp?.data || resp || {};
  penalidadContexto.orden_entrega_id = penalidadContexto.orden_entrega_id || id;
  renderPenalidadDatosContractuales(penalidadContexto);
  renderPenalidadCalculos(penalidadContexto);
  renderAmpliacionesLista(penalidadContexto);
  const ev = penalidadContexto.evaluacion || {};
  if (ev.corresponde_penalidad === true) {
    document.getElementById(`${PREFIX}PenalidadSi`).checked = true;
  } else if (ev.corresponde_penalidad === false) {
    document.getElementById(`${PREFIX}PenalidadNo`).checked = true;
  }
  if (ev.observacion) {
    document.getElementById(`${PREFIX}PenalidadObservacion`).value = ev.observacion;
  }
  const submitBtn = document.getElementById(`${PREFIX}PenalidadBtn`);
  const ampBtn = document.getElementById(`${PREFIX}PenalidadAmpliacionBtn`);
  const disabled = !penalidadContexto.puede_editar;
  if (submitBtn) submitBtn.disabled = disabled;
  if (ampBtn) ampBtn.disabled = disabled;
  document.querySelectorAll(`#${PREFIX}PenalidadModal input, #${PREFIX}PenalidadModal textarea, #${PREFIX}PenalidadModal select`)
    .forEach((el) => {
      if (el.id === `${PREFIX}PenalidadEntregableId`) return;
      if (el.closest(`#${PREFIX}PenalidadAmpliacionForm`)) {
        el.disabled = disabled;
        return;
      }
      if (['radio', 'checkbox'].includes(el.type) || el.tagName === 'TEXTAREA') {
        el.disabled = disabled;
      }
    });
}

async function submitAmpliacionPlazo(e) {
  e.preventDefault();
  const id = document.getElementById(`${PREFIX}PenalidadEntregableId`).value;
  const errBox = document.getElementById(`${PREFIX}PenalidadErr`);
  const dias = document.getElementById(`${PREFIX}PenalidadAmpDias`).value;
  const numero = document.getElementById(`${PREFIX}PenalidadAmpNumero`).value.trim();
  const fecha = document.getElementById(`${PREFIX}PenalidadAmpFecha`).value;
  const observacion = document.getElementById(`${PREFIX}PenalidadAmpObs`).value.trim();
  const archivoInput = document.getElementById(`${PREFIX}PenalidadAmpArchivo`);
  const archivo = archivoInput?.files?.[0];
  if (!dias || Number(dias) <= 0) {
    if (errBox) { errBox.textContent = 'Los días de ampliación deben ser mayores a cero.'; errBox.classList.remove('d-none'); }
    return;
  }
  if (!numero || !fecha || !archivo) {
    if (errBox) { errBox.textContent = 'Documento, número y fecha son obligatorios para registrar la ampliación.'; errBox.classList.remove('d-none'); }
    return;
  }
  const btn = document.getElementById(`${PREFIX}PenalidadAmpliacionBtn`);
  try {
    if (btn) btn.disabled = true;
    errBox?.classList.add('d-none');
    const contenido_base64 = await fileToBase64(archivo);
    await entregablesServiciosService.registrarAmpliacionPlazoPenalidad(id, {
      dias_ampliacion: Number(dias),
      numero_documento: numero,
      fecha_documento: fecha,
      observacion,
      documento: {
        nombre_archivo: archivo.name,
        mime_type: archivo.type || 'application/pdf',
        contenido_base64,
      },
    });
    archivoInput.value = '';
    document.getElementById(`${PREFIX}PenalidadAmpDias`).value = '';
    document.getElementById(`${PREFIX}PenalidadAmpNumero`).value = '';
    document.getElementById(`${PREFIX}PenalidadAmpFecha`).value = '';
    document.getElementById(`${PREFIX}PenalidadAmpObs`).value = '';
    await reloadPenalidadContexto(id);
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo registrar la ampliación';
      errBox.classList.remove('d-none');
    }
  } finally {
    if (btn) btn.disabled = !penalidadContexto?.puede_editar;
  }
}

const ESC_MAP = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

function ordenLabel(row) {
  return `${row.tipo_orden || 'OS'} ${row.numero_orden || ''}`;
}

function labelSubmoduloDestinoObservacion(data = {}) {
  const tipoOrden = String(data.tipo_orden || '').toUpperCase();
  const tipoContr = String(data.tipo_contratacion || '').toUpperCase();
  const reqTipo = String(data.req_tipo || data.tipo_requerimiento || '').toUpperCase();
  if (tipoOrden === 'OS' || /SERVIC|LOCAC|LOCADOR/.test(`${tipoContr} ${reqTipo}`)) {
    return 'Presentación de Entregables de Servicios';
  }
  return 'Recepción de Bienes';
}

function renderPagoEstadoCell(row) {
  if (row.en_seguimiento_observado_pago) {
    const etapa = row.estado_etapa_label || row.etapa_label || '';
    return `${renderEstadoBadgeHtml({ estadoCodigo: 'OBSERVADO', estadoLabel: 'Observado' })}
      ${etapa ? `<div class="text-muted small mt-1">${esc(etapa)}</div>` : ''}`;
  }
  return renderEstadoBadgeFromRow(row);
}

export function pagoMenuItems(row) {
  const items = [];
  if (row.puede_ver_entregable_pago) {
    items.push({ act: 'verEntregable', label: 'Ver entregable', icon: 'bi-file-earmark-text' });
  }
  if (row.puede_ver_acta_pago) {
    items.push({ act: 'verActaConformidad', label: 'Ver Acta de Conformidad', icon: 'bi-file-check' });
  }
  if (row.puede_checklist_pago) {
    items.push({ act: 'checklistDocumentos', label: 'Checklist de documentos', icon: 'bi-list-check' });
  }
  if (row.puede_ver_expediente_pago) {
    items.push({ act: 'verExpediente', label: 'Ver expediente', icon: 'bi-folder2-open' });
  }
  if (row.puede_evaluar_penalidad_pago) {
    items.push({ act: 'evaluarPenalidad', label: 'Evaluar penalidad', icon: 'bi-scales' });
  }
  if (row.puede_calcular_penalidad_pago) {
    items.push({ act: 'calcularPenalidad', label: 'Calcular penalidad', icon: 'bi-calculator' });
  }
  if (row.puede_observar_pago) {
    items.push({ act: 'observarEntregable', label: 'Observar', icon: 'bi-exclamation-triangle' });
  }
  if (row.puede_ver_trazabilidad_pago) {
    items.push({ act: 'verTrazabilidad', label: 'Ver trazabilidad', icon: 'bi-clock-history' });
  }
  return items;
}

function renderPenalidadBadge(row) {
  const codigo = String(row.penalidad_codigo || row.estado_penalidad || 'PENDIENTE').toUpperCase();
  const label = row.penalidad_label || 'Pendiente';
  const cls = codigo === 'CORRESPONDE'
    ? 'bg-danger'
    : (codigo === 'NO_CORRESPONDE' ? 'bg-success' : 'bg-secondary');
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

function renderRow(row) {
  const id = row.orden_entrega_id;
  return `<tr data-id="${esc(id)}">
    <td class="small text-nowrap">${esc(ordenLabel(row))}</td>
    <td class="small">${esc(row.requerimiento_codigo || '—')}</td>
    <td class="text-center small">${esc(row.numero_entrega ?? '—')}</td>
    <td class="small">${esc(row.proveedor_razon_social || '—')}</td>
    <td class="small">${esc(row.centro || '—')}</td>
    <td class="small text-nowrap">${esc(fmtFecha(row.fecha_recepcion_mesa_partes))}</td>
    <td class="text-end small">${row.precio_total != null ? esc(fmtMonto(row.precio_total)) : '—'}</td>
    <td class="small text-center">${renderPenalidadBadge(row)}</td>
    <td>${renderPagoEstadoCell(row)}</td>
    <td class="small">${renderResponsableCellHtml(row, esc)}</td>
    ${renderActionMenuCell(id, pagoMenuItems(row))}
  </tr>`;
}

async function loadDestinatariosAreaUsuaria(entregableId) {
  const select = document.getElementById(`${PREFIX}ObservarDestinoAu`);
  if (!select) return;
  select.innerHTML = '<option value="">Cargando usuarios Área Usuaria…</option>';
  select.disabled = true;
  const resp = await entregablesServiciosService.listarDestinatariosAreaUsuaria(entregableId);
  const usuarios = resp?.data?.usuarios || resp?.usuarios || [];
  if (!usuarios.length) {
    select.innerHTML = '<option value="">Sin usuarios AU habilitados</option>';
    return;
  }
  select.innerHTML = [
    '<option value="">Seleccione destinatario…</option>',
    ...usuarios.map((item) => `<option value="${esc(item.id)}">${esc(item.nombre || item.username)}</option>`),
  ].join('');
  select.disabled = false;
}

async function openEvaluarPenalidad(id) {
  const errBox = document.getElementById(`${PREFIX}PenalidadErr`);
  errBox?.classList.add('d-none');
  document.getElementById(`${PREFIX}PenalidadObservacion`).value = '';
  document.getElementById(`${PREFIX}PenalidadEntregableId`).value = id;
  for (const input of document.querySelectorAll(`input[name="${PREFIX}PenalidadCorresponde"]`)) {
    input.checked = false;
  }
  window.bootstrap.Modal.getOrCreateInstance(
    document.getElementById(`${PREFIX}PenalidadModal`),
  ).show();
  try {
    document.getElementById(`${PREFIX}PenalidadDatos`).innerHTML = '<div class="text-muted small">Cargando datos contractuales…</div>';
    document.getElementById(`${PREFIX}PenalidadCalculos`).innerHTML = '';
    document.getElementById(`${PREFIX}PenalidadAmpliacionesLista`).innerHTML = '';
    await reloadPenalidadContexto(id);
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo consultar el entregable';
      errBox.classList.remove('d-none');
    }
  }
}

async function submitEvaluarPenalidad(e) {
  e.preventDefault();
  const id = document.getElementById(`${PREFIX}PenalidadEntregableId`).value;
  const seleccion = document.querySelector(`input[name="${PREFIX}PenalidadCorresponde"]:checked`);
  const observacion = document.getElementById(`${PREFIX}PenalidadObservacion`).value.trim();
  const errBox = document.getElementById(`${PREFIX}PenalidadErr`);
  if (!seleccion) {
    if (errBox) {
      errBox.textContent = 'Debe indicar si corresponde penalidad.';
      errBox.classList.remove('d-none');
    }
    return;
  }
  const submitBtn = document.getElementById(`${PREFIX}PenalidadBtn`);
  try {
    if (submitBtn) submitBtn.disabled = true;
    await entregablesServiciosService.evaluarPenalidad(id, {
      corresponde_penalidad: seleccion.value === 'si',
      observacion,
    });
    window.bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}PenalidadModal`))?.hide();
    await load();
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo registrar la evaluación';
      errBox.classList.remove('d-none');
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function openObservarEntregable(id) {
  const errBox = document.getElementById(`${PREFIX}ObservarErr`);
  errBox?.classList.add('d-none');
  document.getElementById(`${PREFIX}ObservarMotivo`).value = '';
  document.getElementById(`${PREFIX}ObservarEntregableId`).value = id;
  const destinoAu = document.getElementById(`${PREFIX}ObservarDestinoAu`);
  if (destinoAu) destinoAu.value = '';
  window.bootstrap.Modal.getOrCreateInstance(
    document.getElementById(`${PREFIX}ObservarModal`),
  ).show();
  try {
    const resp = await entregablesServiciosService.getDetalle(id);
    const data = resp?.data || resp || {};
    const recepcion = data.recepcion_vigente || data.ultima_recepcion || null;
    if (!recepcion?.id) throw new Error('El entregable no tiene una recepción vigente.');
    if (data.observacion_abierta) throw new Error('El entregable ya tiene una observación formal abierta.');
    document.getElementById(`${PREFIX}ObservarResumen`).innerHTML = `
      <div><strong>Orden:</strong> ${esc(ordenLabel(data))}</div>
      <div><strong>Entregable:</strong> N.° ${esc(data.numero_entrega ?? '—')}</div>
      <div><strong>Proveedor:</strong> ${esc(data.proveedor_razon_social || '—')}</div>
      <div><strong>Fecha recepción:</strong> ${esc(fmtFecha(recepcion.fecha_recepcion_mesa_partes))}</div>
      <div><strong>Submódulo destino:</strong> ${esc(labelSubmoduloDestinoObservacion(data))}</div>`;
    const submoduloInput = document.getElementById(`${PREFIX}ObservarSubmodulo`);
    if (submoduloInput) submoduloInput.value = labelSubmoduloDestinoObservacion(data);
    await loadDestinatariosAreaUsuaria(id);
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo consultar el entregable';
      errBox.classList.remove('d-none');
    }
  }
}

async function submitObservarEntregable(e) {
  e.preventDefault();
  const id = document.getElementById(`${PREFIX}ObservarEntregableId`).value;
  const motivo = document.getElementById(`${PREFIX}ObservarMotivo`).value.trim();
  const destinoAu = document.getElementById(`${PREFIX}ObservarDestinoAu`)?.value || '';
  const errBox = document.getElementById(`${PREFIX}ObservarErr`);
  if (!motivo) {
    if (errBox) {
      errBox.textContent = 'La glosa de observación es obligatoria.';
      errBox.classList.remove('d-none');
    }
    return;
  }
  if (!destinoAu) {
    if (errBox) {
      errBox.textContent = 'Debe seleccionar un destinatario del Área Usuaria.';
      errBox.classList.remove('d-none');
    }
    return;
  }
  const submitBtn = document.getElementById(`${PREFIX}ObservarBtn`);
  try {
    if (submitBtn) submitBtn.disabled = true;
    await entregablesServiciosService.observarAnalistaCM(id, {
      motivo,
      usuario_destino_id: Number(destinoAu),
    });
    window.bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}ObservarModal`))?.hide();
    await load();
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo registrar la observación';
      errBox.classList.remove('d-none');
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function openTrazabilidad(id) {
  await openEntregableTrazabilidadModal(id);
}

let calculoPenalidadCache = null;

function renderCalculoSeccion(titulo, filas) {
  return `
    <h6 class="small fw-bold mt-2">${esc(titulo)}</h6>
    <div class="row g-2 small mb-2">
      ${filas.map(([k, v]) => `
        <div class="col-md-6"><strong>${esc(k)}:</strong> ${esc(v)}</div>`).join('')}
    </div>`;
}

function renderCalculoFicha(payload) {
  const f = payload?.ficha || {};
  const r = payload?.calculo_vigente?.resultado || payload?.calculo_preview || {};
  const docs = payload?.calculo_vigente || {};
  const general = renderCalculoSeccion('DATOS GENERALES', [
    ['Orden', ordenLabel(f)],
    ['Proveedor', f.proveedor_razon_social],
    ['RUC', f.proveedor_ruc],
    ['Tipo contratación', f.tipo_contratacion],
    ['Objeto', f.objeto],
    ['Área usuaria', f.area_usuaria],
    ['Entregable', `N.° ${f.numero_entrega ?? '—'}`],
  ]);
  const plazos = renderCalculoSeccion('PLAZOS', [
    ['Fecha orden/notificación', fmtFecha(f.fecha_notificacion || f.fecha_orden)],
    ['Fecha inicio', fmtFecha(f.fecha_inicio_plazo)],
    ['Plazo contractual', `${f.dias_plazo ?? '—'} días`],
    ['Fecha máxima contractual', fmtFecha(f.fecha_maxima_contractual)],
    ['Ampliación aprobada total', f.total_dias_ampliacion ?? 0],
    ['Fecha máxima ajustada', fmtFecha(f.fecha_maxima_ajustada)],
    ['Fecha recepción/presentación', fmtFecha(f.fecha_presentacion)],
    ['Días de atraso', f.dias_atraso ?? 0],
  ]);
  const calculo = renderCalculoSeccion('CÁLCULO', [
    ['Monto base', fmtMonto(r.monto_base_aplicable ?? f.monto_base)],
    ['Penalidad diaria', fmtMonto(r.penalidad_diaria)],
    ['Días atraso', r.dias_atraso ?? f.dias_atraso ?? 0],
    ['Penalidad calculada', fmtMonto(r.penalidad_calculada)],
    ['Penalidad máxima', fmtMonto(r.penalidad_maxima)],
    ['Penalidad aplicable', fmtMonto(r.penalidad_aplicable)],
    ['Monto a pagar', fmtMonto(r.monto_a_pagar)],
  ]);
  const docLinks = [];
  if (docs.documento_generado?.id) {
    docLinks.push(`<a class="btn btn-sm btn-outline-primary" target="_blank" href="${esc(entregablesServiciosService.documentoPenalidadUrl(f.orden_entrega_id || document.getElementById(`${PREFIX}CalcEntregableId`)?.value, docs.documento_generado.id))}">Formato generado</a>`);
  }
  if (docs.documento_firmado?.id) {
    docLinks.push(`<a class="btn btn-sm btn-outline-success" target="_blank" href="${esc(entregablesServiciosService.documentoPenalidadUrl(f.orden_entrega_id || document.getElementById(`${PREFIX}CalcEntregableId`)?.value, docs.documento_firmado.id))}">Formato firmado</a>`);
  }
  if (docs.carta_generada?.id) {
    docLinks.push(`<a class="btn btn-sm btn-outline-secondary" target="_blank" href="${esc(entregablesServiciosService.documentoPenalidadUrl(f.orden_entrega_id || document.getElementById(`${PREFIX}CalcEntregableId`)?.value, docs.carta_generada.id))}">Carta generada</a>`);
  }
  const faltantes = (payload?.faltantes || []).map((item) => `<li>${esc(item.mensaje)}</li>`).join('');
  return `${general}${plazos}${calculo}
    ${faltantes ? `<div class="alert alert-warning py-2 small"><ul class="mb-0">${faltantes}</ul></div>` : ''}
    ${docLinks.length ? `<div class="d-flex gap-2 flex-wrap mb-2">${docLinks.join('')}</div>` : ''}`;
}

async function reloadCalculoFicha(id) {
  const resp = await entregablesServiciosService.obtenerFichaCalculoPenalidad(id);
  calculoPenalidadCache = resp?.data || resp || {};
  calculoPenalidadCache.ficha = calculoPenalidadCache.ficha || {};
  calculoPenalidadCache.ficha.orden_entrega_id = id;
  const body = document.getElementById(`${PREFIX}CalcBody`);
  if (body) body.innerHTML = renderCalculoFicha(calculoPenalidadCache);
}

async function openCalcularPenalidad(id) {
  document.getElementById(`${PREFIX}CalcEntregableId`).value = id;
  document.getElementById(`${PREFIX}CalcErr`)?.classList.add('d-none');
  document.getElementById(`${PREFIX}CalcFirmadoArchivo`).value = '';
  window.bootstrap.Modal.getOrCreateInstance(document.getElementById(`${PREFIX}CalcModal`)).show();
  const body = document.getElementById(`${PREFIX}CalcBody`);
  if (body) body.innerHTML = '<div class="text-muted small">Cargando ficha de cálculo…</div>';
  try {
    await reloadCalculoFicha(id);
  } catch (err) {
    if (body) body.innerHTML = `<div class="alert alert-danger mb-0">${esc(err.message)}</div>`;
  }
}

async function ejecutarCalculoPenalidad() {
  const id = document.getElementById(`${PREFIX}CalcEntregableId`).value;
  const errBox = document.getElementById(`${PREFIX}CalcErr`);
  try {
    errBox?.classList.add('d-none');
    await entregablesServiciosService.calcularPenalidad(id);
    await reloadCalculoFicha(id);
    await load();
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo calcular la penalidad';
      errBox.classList.remove('d-none');
    }
  }
}

async function ejecutarGenerarFormato() {
  const id = document.getElementById(`${PREFIX}CalcEntregableId`).value;
  const errBox = document.getElementById(`${PREFIX}CalcErr`);
  try {
    errBox?.classList.add('d-none');
    await entregablesServiciosService.generarFormatoPenalidad(id);
    await reloadCalculoFicha(id);
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo generar el formato';
      errBox.classList.remove('d-none');
    }
  }
}

async function ejecutarGenerarCarta() {
  const id = document.getElementById(`${PREFIX}CalcEntregableId`).value;
  const errBox = document.getElementById(`${PREFIX}CalcErr`);
  try {
    errBox?.classList.add('d-none');
    await entregablesServiciosService.generarCartaPenalidad(id);
    await reloadCalculoFicha(id);
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo generar la carta';
      errBox.classList.remove('d-none');
    }
  }
}

async function ejecutarAdjuntarFirmado() {
  const id = document.getElementById(`${PREFIX}CalcEntregableId`).value;
  const errBox = document.getElementById(`${PREFIX}CalcErr`);
  const archivo = document.getElementById(`${PREFIX}CalcFirmadoArchivo`)?.files?.[0];
  if (!archivo) {
    if (errBox) {
      errBox.textContent = 'Seleccione el PDF firmado.';
      errBox.classList.remove('d-none');
    }
    return;
  }
  try {
    errBox?.classList.add('d-none');
    const contenido_base64 = await fileToBase64(archivo);
    await entregablesServiciosService.adjuntarFormatoPenalidadFirmado(id, {
      nombre_archivo: archivo.name,
      mime_type: archivo.type || 'application/pdf',
      contenido_base64,
    });
    document.getElementById(`${PREFIX}CalcFirmadoArchivo`).value = '';
    await reloadCalculoFicha(id);
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo adjuntar el firmado';
      errBox.classList.remove('d-none');
    }
  }
}

function buildActMap() {
  return {
    verEntregable: (id) => openVerEntregablePagoModal(id).catch((err) => {
      window.alert(err.message || 'No se pudo abrir el entregable');
    }),
    verActaConformidad: (id) => openVerActaConformidadPagoModal(id),
    checklistDocumentos: (id) => openChecklistPagoModal(id).catch((err) => {
      window.alert(err.message || 'No se pudo abrir el checklist');
    }),
    verExpediente: (id) => {
      const row = bandejaCache.find((item) => String(item.orden_entrega_id) === String(id));
      if (row) openExpedienteOrdenModal(row);
    },
    observarEntregable: (id) => openObservarEntregable(id),
    evaluarPenalidad: (id) => openEvaluarPenalidad(id),
    calcularPenalidad: (id) => openCalcularPenalidad(id),
    verTrazabilidad: (id) => openTrazabilidad(id),
  };
}

async function load() {
  const tbody = document.getElementById(`${LIST_ID}Body`);
  try {
    const res = await entregablesServiciosService.listarBandejaPagos();
    bandejaCache = res?.data || res || [];
    if (tbody) {
      tbody.innerHTML = bandejaCache.length
        ? bandejaCache.map(renderRow).join('')
        : '<tr><td colspan="11" class="text-center text-muted py-4">No hay expedientes en preparación para Pago.</td></tr>';
      bindActionMenus(tbody, buildActMap());
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger py-4">${esc(err.message || 'Error al cargar')}</td></tr>`;
  }
}

function renderDerivacionPagoView() {
  return `
    <div id="${VIEW_ID}">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <div>
          <h1 class="h3 mb-1"><i class="bi bi-credit-card"></i> Pagos</h1>
          <p class="text-muted mb-0 small">Preparación de expediente para pago (Analista CM).</p>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="${PREFIX}Reload"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
      </div>
      <div class="card"><div class="card-body">
        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light"><tr>
              <th>Orden</th><th>Requerimiento</th><th class="text-center">Entregable</th><th>Proveedor</th>
              <th>Centro</th><th>Fecha recepción</th><th class="text-end">Monto</th>
              <th class="text-center">Penalidad</th><th>Estado</th><th>Responsable</th><th>Acciones</th>
            </tr></thead>
            <tbody id="${LIST_ID}Body"></tbody>
          </table>
        </div>
      </div></div>

      <div class="modal fade" id="${PREFIX}PenalidadModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
          <form id="${PREFIX}PenalidadForm">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-scales"></i> Evaluar penalidad</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <input type="hidden" id="${PREFIX}PenalidadEntregableId">
              <h6 class="small fw-bold">Datos contractuales</h6>
              <div class="border rounded p-2 mb-3" id="${PREFIX}PenalidadDatos"></div>
              <h6 class="small fw-bold">Ampliaciones de plazo aprobadas</h6>
              <div id="${PREFIX}PenalidadAmpliacionesLista" class="mb-2"></div>
              <div id="${PREFIX}PenalidadAmpliacionForm" class="border rounded p-2 mb-3 bg-light">
                <div class="row g-2 small">
                  <div class="col-md-3">
                    <label class="form-label mb-0" for="${PREFIX}PenalidadAmpDias">Días</label>
                    <input type="number" min="1" class="form-control form-control-sm" id="${PREFIX}PenalidadAmpDias">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label mb-0" for="${PREFIX}PenalidadAmpNumero">N.° documento</label>
                    <input type="text" class="form-control form-control-sm" id="${PREFIX}PenalidadAmpNumero">
                  </div>
                  <div class="col-md-3">
                    <label class="form-label mb-0" for="${PREFIX}PenalidadAmpFecha">Fecha documento</label>
                    <input type="date" class="form-control form-control-sm" id="${PREFIX}PenalidadAmpFecha">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label mb-0" for="${PREFIX}PenalidadAmpArchivo">Adjunto</label>
                    <input type="file" class="form-control form-control-sm" id="${PREFIX}PenalidadAmpArchivo" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx">
                  </div>
                  <div class="col-12">
                    <label class="form-label mb-0" for="${PREFIX}PenalidadAmpObs">Observación / sustento</label>
                    <textarea class="form-control form-control-sm" id="${PREFIX}PenalidadAmpObs" rows="2"></textarea>
                  </div>
                  <div class="col-12">
                    <button type="submit" class="btn btn-sm btn-outline-primary" id="${PREFIX}PenalidadAmpliacionBtn">Agregar ampliación</button>
                  </div>
                </div>
              </div>
              <h6 class="small fw-bold">Cálculos base</h6>
              <div class="border rounded p-2 mb-3" id="${PREFIX}PenalidadCalculos"></div>
              <div class="mb-3">
                <div class="form-label small mb-1">¿Corresponde penalidad? <span class="text-danger">*</span></div>
                <div class="form-check">
                  <input class="form-check-input" type="radio" name="${PREFIX}PenalidadCorresponde"
                    id="${PREFIX}PenalidadSi" value="si" required>
                  <label class="form-check-label small" for="${PREFIX}PenalidadSi">Sí</label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="radio" name="${PREFIX}PenalidadCorresponde"
                    id="${PREFIX}PenalidadNo" value="no" required>
                  <label class="form-check-label small" for="${PREFIX}PenalidadNo">No</label>
                </div>
              </div>
              <div class="mb-2">
                <label class="form-label small mb-1" for="${PREFIX}PenalidadObservacion">Observación / sustento</label>
                <textarea class="form-control form-control-sm" id="${PREFIX}PenalidadObservacion" rows="3"></textarea>
              </div>
              <div id="${PREFIX}PenalidadErr" class="alert alert-danger d-none py-2 small"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-sm btn-primary" id="${PREFIX}PenalidadBtn">Guardar evaluación</button>
            </div>
          </form>
        </div></div>
      </div>

      <div class="modal fade" id="${PREFIX}ObservarModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-scrollable"><div class="modal-content">
          <form id="${PREFIX}ObservarForm">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-exclamation-triangle"></i> Observar entregable</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <input type="hidden" id="${PREFIX}ObservarEntregableId">
              <div class="border rounded p-2 small mb-3" id="${PREFIX}ObservarResumen"></div>
              <div class="mb-2">
                <label class="form-label small mb-1">Submódulo destino</label>
                <input type="text" class="form-control form-control-sm bg-light" id="${PREFIX}ObservarSubmodulo" readonly tabindex="-1">
              </div>
              <div class="mb-2">
                <label class="form-label small mb-1" for="${PREFIX}ObservarDestinoAu">Destinatario <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="${PREFIX}ObservarDestinoAu" required disabled>
                  <option value="">Cargando usuarios Área Usuaria…</option>
                </select>
              </div>
              <div class="mb-2">
                <label class="form-label small mb-1" for="${PREFIX}ObservarMotivo">Glosa / Motivo <span class="text-danger">*</span></label>
                <textarea class="form-control form-control-sm" id="${PREFIX}ObservarMotivo" rows="4" required></textarea>
              </div>
              <div id="${PREFIX}ObservarErr" class="alert alert-danger d-none py-2 small"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-sm btn-warning" id="${PREFIX}ObservarBtn">Enviar observación</button>
            </div>
          </form>
        </div></div>
      </div>

      <div class="modal fade" id="${PREFIX}CalcModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-calculator"></i> Calcular penalidad</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="${PREFIX}CalcEntregableId">
            <div id="${PREFIX}CalcBody"></div>
            <div class="border rounded p-2 mt-3 bg-light">
              <div class="small fw-bold mb-2">Documento firmado</div>
              <div class="row g-2 align-items-end">
                <div class="col-md-8">
                  <input type="file" class="form-control form-control-sm" id="${PREFIX}CalcFirmadoArchivo" accept=".pdf">
                </div>
                <div class="col-md-4">
                  <button type="button" class="btn btn-sm btn-outline-success w-100" id="${PREFIX}CalcFirmadoBtn">Adjuntar firmado</button>
                </div>
              </div>
            </div>
            <div id="${PREFIX}CalcErr" class="alert alert-danger d-none py-2 small mt-2"></div>
          </div>
          <div class="modal-footer flex-wrap gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            <button type="button" class="btn btn-sm btn-primary" id="${PREFIX}CalcBtn">Calcular penalidad</button>
            <button type="button" class="btn btn-sm btn-outline-primary" id="${PREFIX}CalcFormatoBtn">Generar formato</button>
            <button type="button" class="btn btn-sm btn-outline-dark" id="${PREFIX}CalcCartaBtn">Generar carta de penalidad</button>
          </div>
        </div></div>
      </div>

    </div>`;
}

function initDerivacionPagoView() {
  document.getElementById(`${PREFIX}Reload`)?.addEventListener('click', () => {
    closeBandejaActionMenus();
    load();
  });
  document.getElementById(`${PREFIX}ObservarForm`)?.addEventListener('submit', submitObservarEntregable);
  document.getElementById(`${PREFIX}PenalidadForm`)?.addEventListener('submit', submitEvaluarPenalidad);
  document.getElementById(`${PREFIX}PenalidadAmpliacionForm`)?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitAmpliacionPlazo(e);
  });
  document.getElementById(`${PREFIX}PenalidadAmpliacionBtn`)?.addEventListener('click', (e) => {
    e.preventDefault();
    submitAmpliacionPlazo(e);
  });
  document.getElementById(`${PREFIX}CalcBtn`)?.addEventListener('click', ejecutarCalculoPenalidad);
  document.getElementById(`${PREFIX}CalcFormatoBtn`)?.addEventListener('click', ejecutarGenerarFormato);
  document.getElementById(`${PREFIX}CalcCartaBtn`)?.addEventListener('click', ejecutarGenerarCarta);
  document.getElementById(`${PREFIX}CalcFirmadoBtn`)?.addEventListener('click', ejecutarAdjuntarFirmado);
  load();
}

export { renderDerivacionPagoView, initDerivacionPagoView };
