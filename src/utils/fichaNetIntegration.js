import { escapeHtml as esc } from './escapeHtml.js';

/** Campos visibles en formulario, modal y PDF del requerimiento (orden fijo). */
export const FICHA_NET_DISPLAY_FIELDS = [
  { key: 'dscartnombre', label: 'Nombre' },
  { key: 'dscartcaracteristica', label: 'Características' },
  { key: 'dscartpresentacion', label: 'Forma de presentación' },
  { key: 'dscclasdescripcion', label: 'Otras denominaciones' },
  { key: 'dscartdocumentos', label: 'Documentos' },
  { key: 'dspesomolecular', label: 'Peso molecular' },
  { key: 'dsporcentajepureza', label: 'Porcentaje de pureza' },
  { key: 'dsformula', label: 'Formula' },
  { key: 'dsdensidad', label: 'Densidad' },
  { key: 'dsph', label: 'PH' },
  { key: 'dstemperatura', label: 'Temperatura de almacenamiento' },
  { key: 'dscartfechavencimiento', label: 'Vigencia' },
  { key: 'dscartobservaciones', label: 'Observaciones' },
];

const SNAPSHOT_KEYS = [
  'idfichanet', 'idcartcodigosiga', 'dscartnombre', 'dscclasdescripcion',
  'dscartpresentacion', 'dspesomolecular', 'dsporcentajepureza', 'dsformula',
  'dsdensidad', 'dsph', 'dstemperatura', 'dscartdocumentos', 'dscartcaracteristica',
  'dscartfechavencimiento', 'dscartobservaciones', 'nu_version',
];

/**
 * Copia inmutable de la Ficha NET para persistir en el requerimiento.
 * @param {object} ficha
 * @returns {object|null}
 */
export function buildFichaNetSnapshot(ficha) {
  if (!ficha || ficha.idfichanet == null) return null;
  const snap = { codigoSigamef: String(ficha.idcartcodigosiga || '').trim() };
  for (const k of SNAPSHOT_KEYS) {
    if (ficha[k] != null && ficha[k] !== '') snap[k] = ficha[k];
  }
  return snap;
}

/**
 * Vincula datos de Ficha NET a un ítem del requerimiento.
 * @param {object} item
 * @param {object|null} ficha
 */
export function applyFichaNetToItem(item, ficha) {
  const codigo = String(item.item_bien || item.codigoSigamef || '').trim();
  item.codigoSigamef = codigo;
  if (!ficha) {
    item.fichaNetId = null;
    item.fichaNetVersion = null;
    item.fichaNetSnapshot = null;
    return { linked: false };
  }
  const snapshot = buildFichaNetSnapshot(ficha);
  item.fichaNetId = ficha.idfichanet;
  item.fichaNetVersion = ficha.nu_version != null ? ficha.nu_version : snapshot.nu_version;
  item.fichaNetSnapshot = snapshot;
  return { linked: true, snapshot };
}

function fieldValue(snapshot, key) {
  const v = snapshot && snapshot[key];
  return v == null ? '' : String(v);
}

function renderFieldRow(label, value, { compact = false } = {}) {
  const display = String(value || '').trim();
  return `<div class="mb-2${compact ? ' small' : ''}">
    <div class="fw-semibold text-secondary">${esc(label)}:</div>
    <div class="border rounded p-2 bg-white" style="white-space:pre-wrap; min-height:1.6rem">${display ? esc(display) : '&nbsp;'}</div>
  </div>`;
}

/**
 * Bloque HTML de solo lectura con todos los campos Ficha NET (incluso vacíos).
 */
export function renderFichaNetContentBlock(snapshot, { compact = false } = {}) {
  if (!snapshot) return '';
  const rows = FICHA_NET_DISPLAY_FIELDS
    .map(({ key, label }) => renderFieldRow(label, fieldValue(snapshot, key), { compact }))
    .join('');
  return `<div class="ficha-net-content mt-2">${rows}</div>`;
}

/**
 * Alerta informativa debajo del literal b).
 */
export function renderFichaNetAlert(linked) {
  if (linked) {
    return `<div class="alert alert-success py-2 px-3 mb-0 small">
      <i class="bi bi-check-circle-fill"></i> Ficha NET encontrada y vinculada automáticamente.
    </div>`;
  }
  return `<div class="alert alert-warning py-2 px-3 mb-0 small">
    <i class="bi bi-exclamation-triangle-fill"></i> No existe Ficha NET registrada para este ítem.
  </div>`;
}

function printField(label, value) {
  const v = value == null ? '' : String(value);
  const inner = v.trim() ? esc(v) : '&nbsp;';
  return `<div class="fld"><div class="lbl">${esc(label)}</div><div class="box">${inner}</div></div>`;
}

/**
 * Campos Ficha NET integrados en el PDF (sin separadores ni título adicional).
 */
export function renderFichaNetPrintBlock(snapshot) {
  if (!snapshot) return '';
  return FICHA_NET_DISPLAY_FIELDS
    .map(({ key, label }) => printField(label, fieldValue(snapshot, key)))
    .join('');
}

/**
 * Sección 4b + Ficha NET por ítem para el PDF.
 */
export function renderRequerimientoItemsPrintSection(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return `<div class="fld"><div class="lbl">b) Características técnicas</div><div class="box">&nbsp;</div></div>`;
  }
  const multi = list.length > 1;
  return list.map((it, i) => {
    const snap = it.fichaNetSnapshot || null;
    const manual = String(it.caracteristicas_tecnicas ?? '').trim();
    const suffix = multi ? ` (Ítem ${i + 1})` : '';
    const itemHdr = multi
      ? `<div class="lbl" style="margin-top:10px">ÍTEM ${i + 1} — ${esc(it.item_bien || '')} — ${esc(it.nombre_item || '')}</div>`
      : '';
    if (snap) {
      return `${itemHdr}
        <div class="fld"><div class="lbl">b) Características técnicas${suffix}</div></div>
        ${renderFichaNetPrintBlock(snap)}`;
    }
    return `${itemHdr}
      <div class="fld"><div class="lbl">b) Características técnicas${suffix}</div><div class="box">${esc(manual || '—')}</div></div>`;
  }).join('');
}

/**
 * Modal Bootstrap para vista previa de la Ficha NET vinculada.
 */
export function showFichaNetPreviewModal(snapshot) {
  if (!snapshot) return;
  const existing = document.getElementById('fichaNetPreviewModal');
  if (existing) existing.remove();

  const body = renderFichaNetContentBlock(snapshot);
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="modal fade" id="fichaNetPreviewModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="bi bi-file-earmark-medical"></i> Ficha NET vinculada</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
  const el = document.getElementById('fichaNetPreviewModal');
  const Modal = window.bootstrap?.Modal;
  if (Modal) {
    const m = Modal.getOrCreateInstance(el);
    el.addEventListener('hidden.bs.modal', () => el.remove(), { once: true });
    m.show();
  } else {
    el.classList.add('show');
    el.style.display = 'block';
  }
}

export const FICHA_NET_PRINT_CSS = '';
