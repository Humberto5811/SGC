/** Renderizado del paso 1 del wizard de cotización por tipo (Portal Proveedores). */
import { esc } from './proveedorShared.js';
import {
  GLOSA_SERVICIOS_06B, GLOSA_SERVICIOS_06B_TODO_COSTO, GLOSA_SERVICIOS_06B_CONFIRMACION,
  TEXTO_CONFIRMACION_TR_06A, TEXTO_AUTORIZACION_CORREO_06,
  GLOSA_LOCADORES_FORMA_PAGO, GLOSA_PENALIDAD_ANEXO11, FORMULA_PENALIDAD_ANEXO11,
  FORMULA_F_ANEXO11, CIERRE_PENALIDAD_ANEXO11, DECLARO_CONOCER_ANEXO11, IMPORTANTE_ANEXO11,
  CONFIRMACION_ANEXO11, NOTA_COTIZACION_ANEXO11,
  MAX_ENTREGABLES_LOCADOR, cantidadPorTipo, normalizeTipoCotizacion,
} from './proveedorCotizacionConfig.js';
import { TEXTO_AUTORIZACION_CORREO, TEXTO_LEY_27444 } from './proveedorPdfCotizacion.js';
import {
  getAnexo05AInstitutionalScreenColumns,
  getAnexo05AProviderScreenColumns,
  displayItemCentro,
  resolveAnexo05ACellValue,
} from './proveedorAnexo05AConfig.js';

const RUBRO_OPTS = [
  'Medicamentos', 'Reactivos', 'Dispositivos Médicos', 'Equipos', 'Laboratorio',
  'Servicios', 'Consultoría', 'Locadores', 'Software', 'Mobiliario', 'Otros',
];
const ENTREGABLE_LABELS = ['Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto', 'Sexto'];

function roAttr(readonly) {
  return readonly ? ' disabled readonly' : '';
}

function renderProviderInput(col, formItem, readonly) {
  const ro = roAttr(readonly);
  const val = formItem?.[col.field] ?? '';
  if (col.inputType === 'select') {
    const opts = col.options || [];
    return `<select class="form-select form-select-sm ${esc(col.inputClass)}"${ro}>${opts.map((o) =>
      `<option ${String(val) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }
  const type = col.inputType === 'number' ? 'number' : 'text';
  const extra = [
    type === 'number' ? 'min="0"' : '',
    col.maxlength ? `maxlength="${col.maxlength}"` : '',
    col.placeholder ? `placeholder="${esc(col.placeholder)}"` : '',
  ].filter(Boolean).join(' ');
  return `<input class="form-control form-control-sm ${esc(col.inputClass)}" type="${type}" value="${esc(val)}"${extra ? ` ${extra}` : ''}${ro}>`;
}

function renderInstitutionalCell(col, it, sid, renderDocsColumn) {
  if (col.source === 'docs') return renderDocsColumn(it, sid);
  if (col.key === 'centro') return `<td>${esc(displayItemCentro(it))}</td>`;
  const raw = resolveAnexo05ACellValue(col, it);
  const align = col.align === 'center' ? ' class="text-center"' : '';
  return `<td${align}>${esc(raw || '—')}</td>`;
}

function renderDatosProveedor06ACard(formState, readonly) {
  const d = formState.datos;
  const ro = roAttr(readonly);
  return `
    <div class="card border mb-3">
      <div class="card-header py-2 small fw-bold bg-light">Datos del proveedor — Anexo 06-A</div>
      <div class="card-body py-2">
        <div class="row g-2 small">
          <div class="col-md-6"><label class="form-label mb-0">Razón Social</label>
            <input class="form-control form-control-sm prov-dato" data-k="razon_social" value="${esc(d.razon_social)}"${ro}></div>
          <div class="col-md-6"><label class="form-label mb-0">Nº R.U.C.</label>
            <input class="form-control form-control-sm prov-dato" data-k="ruc" value="${esc(d.ruc)}"${ro}></div>
          <div class="col-md-12"><label class="form-label mb-0">Domicilio fiscal</label>
            <input class="form-control form-control-sm prov-dato" data-k="domicilio_fiscal" value="${esc(d.domicilio_fiscal)}"${ro}></div>
          <div class="col-md-6"><label class="form-label mb-0">Datos del Representante Legal</label>
            <input class="form-control form-control-sm prov-dato" data-k="representante_legal" value="${esc(d.representante_legal)}"${ro}></div>
          <div class="col-md-6"><label class="form-label mb-0">Persona de Contacto</label>
            <input class="form-control form-control-sm prov-dato" data-k="persona_contacto" value="${esc(d.persona_contacto)}"${ro}></div>
          <div class="col-md-6"><label class="form-label mb-0">Teléfono y/o Celular</label>
            <input class="form-control form-control-sm prov-dato" data-k="celular" value="${esc(d.celular)}"${ro}></div>
          <div class="col-md-6"><label class="form-label mb-0">Correo Electrónico</label>
            <input class="form-control form-control-sm prov-dato" data-k="correo" value="${esc(d.correo)}"${ro}></div>
        </div>
        <div class="mt-2 p-2 bg-light border rounded small text-muted" style="user-select:none;">
          <p class="mb-0">${esc(TEXTO_AUTORIZACION_CORREO_06)}</p>
        </div>
      </div>
    </div>`;
}

function renderDatosProveedorCard(formState, config, readonly) {
  const d = formState.datos;
  const ro = roAttr(readonly);
  const showGlosas = config.propuestaEconomica === '05-B';
  return `
    <div class="card border mb-3 prov-datos-eco-card">
      <div class="card-header py-2 small fw-bold bg-light">Datos del proveedor — ${esc(config.labelEconomica)}</div>
      <div class="card-body py-2">
        <div class="row g-2 small">
          <div class="col-md-6"><label class="form-label mb-0">Razón Social</label>
            <input class="form-control form-control-sm prov-dato" data-k="razon_social" value="${esc(d.razon_social)}"${ro}></div>
          <div class="col-md-6"><label class="form-label mb-0">RUC</label>
            <input class="form-control form-control-sm prov-dato" data-k="ruc" value="${esc(d.ruc)}"${ro}></div>
          <div class="col-md-12"><label class="form-label mb-0">Domicilio fiscal</label>
            <input class="form-control form-control-sm prov-dato" data-k="domicilio_fiscal" value="${esc(d.domicilio_fiscal)}"${ro}></div>
          <div class="col-md-6"><label class="form-label mb-0">Datos Representante Legal</label>
            <input class="form-control form-control-sm prov-dato" data-k="representante_legal" value="${esc(d.representante_legal)}"${ro}></div>
          <div class="col-md-6"><label class="form-label mb-0">Persona de Contacto</label>
            <input class="form-control form-control-sm prov-dato" data-k="persona_contacto" value="${esc(d.persona_contacto)}"${ro}></div>
          <div class="col-md-4"><label class="form-label mb-0">Teléfono / Celular</label>
            <input class="form-control form-control-sm prov-dato" data-k="celular" value="${esc(d.celular)}"${ro}></div>
          <div class="col-md-4"><label class="form-label mb-0">Correo electrónico</label>
            <input class="form-control form-control-sm prov-dato" data-k="correo" value="${esc(d.correo)}"${ro}></div>
          ${config.propuestaEconomica === '05-B' ? `
          <div class="col-md-4"><label class="form-label mb-0">Rubro</label>
            <select class="form-select form-select-sm prov-dato" data-k="rubro"${ro}>
              <option value="">— Seleccione —</option>
              ${RUBRO_OPTS.map((r) => `<option value="${esc(r)}" ${d.rubro === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
            </select></div>` : ''}
          <div class="col-md-4"><label class="form-label mb-0">Validez de la oferta</label>
            <input class="form-control form-control-sm prov-dato" data-k="validez_oferta" value="${esc(d.validez_oferta)}"${ro}></div>
          <div class="col-md-12 prov-firma-spacer"><label class="form-label mb-0">Firma del Representante legal</label>
            <input class="form-control form-control-sm prov-dato" data-k="firma_representante" value="${esc(d.firma_representante)}"
              placeholder="Se completará al firmar el documento impreso"${ro}></div>
        </div>
        ${showGlosas ? `
        <div class="mt-3 p-2 bg-light border rounded small text-muted" style="user-select:none;">
          <p class="mb-2">${esc(TEXTO_AUTORIZACION_CORREO)}</p>
          <p class="mb-0">${esc(TEXTO_LEY_27444)}</p>
        </div>` : ''}
      </div>
    </div>`;
}

function renderDownloadHint(labelTec) {
  return `
    <div class="mb-3 text-start">
      <button type="button" class="btn btn-outline-success btn-sm" id="provBtnDlTecnica">
        <i class="bi bi-download"></i> Descargar propuesta técnica ${esc(labelTec)}
      </button>
      <div class="small text-muted mt-1 text-start">Imprima, firme y adjunte en el paso 2.</div>
    </div>`;
}

export function renderStep1Bienes(ctx) {
  const { workspace, formState, config, readonly, renderDocsColumn, money, formatPriceDisplay } = ctx;
  const sol = workspace.solicitud;
  const sid = sol.id;
  const total = Object.values(formState.precios).reduce((a, p) => a + (Number(p.total) || 0), 0);
  const institutionalCols = getAnexo05AInstitutionalScreenColumns();
  const providerCols = getAnexo05AProviderScreenColumns();
  const baseCols = institutionalCols.filter((c) => c.headerGroup === 'base');

  return `
    <div class="alert alert-light border small mb-2 py-2">
      <strong>${esc(sol.codigo)}</strong> — ${esc(sol.denominacion || sol.objeto || '')}
    </div>
    <h6 class="fw-bold mb-2">1. ${esc(config.labelTecnica)} — Información técnica solicitada (cumplimiento del ítem)</h6>
    <div class="table-responsive mb-3">
      <table class="table table-bordered table-sm prov-cot-table mb-0">
        <thead class="table-primary text-center align-middle">
          <tr>
            ${baseCols.map((c) => `<th rowspan="2">${esc(c.label)}</th>`).join('')}
            <th colspan="${providerCols.length}">Cumplimiento del Ítem</th>
          </tr>
          <tr>
            ${providerCols.map((c) => `<th>${esc(c.label)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${workspace.items.map((it, idx) => {
            const f = formState.items[idx] || {};
            return `<tr data-idx="${idx}">
              ${baseCols.map((c) => renderInstitutionalCell(c, it, sid, renderDocsColumn)).join('')}
              ${providerCols.map((c) => `<td>${renderProviderInput(c, f, readonly)}</td>`).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${renderDownloadHint(config.labelTecnica)}
    <h6 class="fw-bold mb-2">2. ${esc(config.labelEconomica)} — Oferta económica</h6>
    <div class="table-responsive mb-2">
      <table class="table table-bordered table-sm prov-cot-table mb-0">
        <thead class="table-light text-center">
          <tr><th>Req.</th><th>Descripción</th><th>Cant.</th><th>Precio Unitario S/.</th><th>Precio Total S/.</th></tr>
        </thead>
        <tbody>
          ${workspace.items.map((it, idx) => {
            const p = formState.precios[it.item_key] || { unitario: 0, total: 0 };
            const ro = roAttr(readonly);
            return `<tr data-pidx="${idx}">
              <td>${esc(it.requerimiento_codigo || it.requerimiento_id)}</td>
              <td>${esc(it.descripcion || '—')}</td>
              <td class="text-center">${esc(it.cantidad ?? 1)}</td>
              <td><input class="form-control form-control-sm prov-p-unit text-end" type="text" inputmode="decimal"
                placeholder="0.00" value="${esc(formatPriceDisplay(p.unitario))}"${ro}></td>
              <td><input class="form-control form-control-sm prov-p-total text-end" type="text" readonly
                value="${esc(formatPriceDisplay(p.total))}"></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="mb-3 text-start">
      <button type="button" class="btn btn-outline-success btn-sm" id="provBtnDlEconomica">
        <i class="bi bi-download"></i> Descargar propuesta económica ${esc(config.labelEconomica)}
      </button>
      <div class="small text-muted mt-1 text-start">Imprima, firme y adjunte en el paso 2.</div>
    </div>
    <div class="fw-semibold mb-3">Monto total (IGV incl.): S/ <span id="provCotMontoTotal">${money(total)}</span></div>
    ${renderDatosProveedorCard(formState, config, readonly)}`;
}

export function renderStep1Servicios(ctx) {
  const { workspace, formState, config, readonly, money, formatPriceDisplay } = ctx;
  const sol = workspace.solicitud;
  const tipo = normalizeTipoCotizacion(sol.tipo);
  const ro = roAttr(readonly);
  const ex = formState.extra || {};
  const total = Object.values(formState.precios).reduce((a, p) => a + (Number(p.total) || 0), 0);

  return `
    <div class="alert alert-light border small mb-2 py-2">
      <strong>${esc(sol.codigo)}</strong> — ${esc(sol.denominacion || sol.objeto || '')}
    </div>
    <h6 class="fw-bold mb-2">1. ${esc(config.labelTecnica)} — Propuesta técnica (Anexo Nº 06-A)</h6>
    <div class="table-responsive mb-2">
      <table class="table table-bordered table-sm prov-cot-table mb-0">
        <thead class="table-primary text-center">
          <tr><th>Ítem</th><th>Nº REQ</th><th>Descripción del Servicio</th><th>Cantidad</th><th>Unidad de medida</th></tr>
        </thead>
        <tbody>
          ${workspace.items.map((it, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td>${esc(it.requerimiento_codigo || it.requerimiento_id)}</td>
              <td>${esc(it.descripcion || '—')}</td>
              <td class="text-center">${esc(cantidadPorTipo(tipo, it.cantidad))}</td>
              <td class="text-center">${esc(it.unidad_medida || 'servicio')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(TEXTO_CONFIRMACION_TR_06A)}</div>
    <div class="row g-2 mb-3 small">
      <div class="col-md-6"><label class="form-label mb-0">Plazo de ejecución</label>
        <input class="form-control form-control-sm prov-extra" data-k="plazo_ejecucion" value="${esc(ex.plazo_ejecucion)}"
          placeholder="Debe indicar el plazo de ejecución ofertado"${ro}></div>
      <div class="col-md-6"><label class="form-label mb-0">Forma de pago</label>
        <input class="form-control form-control-sm prov-extra" data-k="forma_pago" value="${esc(ex.forma_pago)}"
          placeholder="De acuerdo a lo indicado en al Requerimiento."${ro}></div>
    </div>
    ${renderDatosProveedor06ACard(formState, readonly)}
    ${renderDownloadHint(config.labelTecnica)}
    <h6 class="fw-bold mb-2">2. ${esc(config.labelEconomica)} — Propuesta económica (Anexo Nº 06-B)</h6>
    <div class="table-responsive mb-2">
      <table class="table table-bordered table-sm prov-cot-table mb-0">
        <thead class="table-light text-center">
          <tr>
            <th>Ítem</th><th>Nº REQ</th><th>Descripción del Servicio</th><th>Cantidad</th>
            <th>Unidad de medida</th><th>Precio Unitario S/. (Inc. IGV)</th><th>Precio Total S/. (Inc. IGV)</th>
          </tr>
        </thead>
        <tbody>
          ${workspace.items.map((it, idx) => {
            const p = formState.precios[it.item_key] || { unitario: 0, total: 0 };
            return `<tr data-pidx="${idx}">
              <td class="text-center">${idx + 1}</td>
              <td>${esc(it.requerimiento_codigo || it.requerimiento_id)}</td>
              <td>${esc(it.descripcion || '—')}</td>
              <td class="text-center">${esc(cantidadPorTipo(tipo, it.cantidad))}</td>
              <td class="text-center">${esc(it.unidad_medida || 'servicio')}</td>
              <td><input class="form-control form-control-sm prov-p-unit text-end" type="text" inputmode="decimal"
                value="${esc(formatPriceDisplay(p.unitario))}"${ro}></td>
              <td><input class="form-control form-control-sm prov-p-total text-end" type="text" readonly
                value="${esc(formatPriceDisplay(p.total))}"></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="mb-2 text-start">
      <button type="button" class="btn btn-outline-success btn-sm" id="provBtnDlEconomica">
        <i class="bi bi-download"></i> Descargar propuesta económica ${esc(config.labelEconomica)}
      </button>
      <div class="small text-muted mt-1 text-start">Imprima, firme y adjunte en el paso 2.</div>
    </div>
    <div class="fw-semibold mb-2">Precio Total S/ (Incluido IGV): <span id="provCotMontoTotal">${money(total)}</span></div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(GLOSA_SERVICIOS_06B_TODO_COSTO)}</div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(GLOSA_SERVICIOS_06B_CONFIRMACION)}</div>
    <div class="p-2 bg-light border rounded small text-muted mb-3" style="user-select:none;">${esc(TEXTO_AUTORIZACION_CORREO_06)}</div>`;
}

export function renderStep1Locadores(ctx) {
  const { workspace, formState, config, readonly, money, formatPriceDisplay } = ctx;
  const sol = workspace.solicitud;
  const tipo = normalizeTipoCotizacion(sol.tipo);
  const ro = roAttr(readonly);
  const ex = formState.extra || {};
  const it0 = workspace.items[0] || {};
  const total = Object.values(formState.entregablesEco || {}).flat()
    .reduce((a, e) => a + (Number(e.total) || 0), 0);

  const ents = formState.entregablesEco?.[it0.item_key] || [];
  const ecoRows = Array.from({ length: MAX_ENTREGABLES_LOCADOR }, (_, eidx) => {
    const e = ents[eidx] || { nro: eidx + 1, um: 'Servicio', precio_unitario: 0, total: 0 };
    return `
      <tr data-eidx="0" data-enidx="${eidx}">
        <td class="text-center">${eidx + 1}</td>
        <td>${eidx === 0 ? esc(it0.descripcion || '—') : ''}</td>
        <td class="text-center">${esc(e.nro ?? eidx + 1)}</td>
        <td class="text-center">${esc(e.um || 'Servicio')}</td>
        <td><input class="form-control form-control-sm prov-e-unit text-end" type="text" inputmode="decimal"
          value="${esc(formatPriceDisplay(e.precio_unitario))}"${ro}></td>
        <td><input class="form-control form-control-sm prov-e-total text-end" type="text" readonly
          value="${esc(formatPriceDisplay(e.total))}"></td>
      </tr>`;
  }).join('');

  const plazosHtml = ENTREGABLE_LABELS.map((lbl, i) => `
    <div class="col-md-12"><label class="form-label mb-0">${lbl} entregable</label>
      <input class="form-control form-control-sm prov-plazo-ent" data-i="${i}"
        placeholder="Hasta los … días calendario contados a partir del día de notificada la o.s."
        value="${esc((ex.plazos_entregables || [])[i] || '')}"${ro}></div>`).join('');

  return `
    <div class="alert alert-light border small mb-2 py-2">
      <strong>${esc(sol.codigo)}</strong> — ${esc(sol.denominacion || sol.objeto || '')}
    </div>
    <h6 class="fw-bold mb-2">1. ${esc(config.labelTecnica)} — Propuesta técnica (locación)</h6>
    <div class="table-responsive mb-2">
      <table class="table table-bordered table-sm prov-cot-table mb-0">
        <thead class="table-primary text-center">
          <tr><th>Ítem</th><th>Nº REQ</th><th>Descripción del servicio de locación</th><th>Cantidad</th><th>Unidad de medida</th></tr>
        </thead>
        <tbody>
          ${workspace.items.map((it, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td>${esc(it.requerimiento_codigo || it.requerimiento_id)}</td>
              <td>${esc(it.descripcion || '—')}</td>
              <td class="text-center">${esc(cantidadPorTipo(tipo, it.cantidad))}</td>
              <td class="text-center">${esc(it.unidad_medida || 'servicio')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="row g-2 mb-3 small">
      <div class="col-md-6"><label class="form-label mb-0">Plazo de ejecución</label>
        <input class="form-control form-control-sm prov-extra" data-k="plazo_ejecucion" value="${esc(ex.plazo_ejecucion)}"
          placeholder="Hasta los … días calendario contados a partir de la orden de servicio"${ro}></div>
      <div class="col-md-6"><label class="form-label mb-0">Forma de pago</label>
        <input class="form-control form-control-sm prov-extra" data-k="forma_pago" value="${esc(ex.forma_pago)}"${ro}></div>
    </div>
    ${renderDatosProveedor06ACard(formState, readonly)}
    ${renderDownloadHint(config.labelTecnica)}
    <h6 class="fw-bold mb-2">2. ${esc(config.labelEconomica)} — Propuesta económica (Anexo Nº 11)</h6>
    <p class="small text-muted mb-2">SERVICIO: <strong>${esc(it0.descripcion || sol.denominacion || sol.objeto || '')}</strong></p>
    <div class="table-responsive mb-2">
      <table class="table table-bordered table-sm prov-cot-table mb-0">
        <thead class="table-light text-center">
          <tr>
            <th>N°</th><th>Descripción del Servicio</th><th>N° de entregables</th><th>Unidad de medida</th>
            <th>Precio Unitario por entregable S/. (Inc. IGV)</th><th>Precio Total S/. (Inc. IGV)</th>
          </tr>
        </thead>
        <tbody>${ecoRows}</tbody>
      </table>
    </div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(IMPORTANTE_ANEXO11)}</div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(CONFIRMACION_ANEXO11)}</div>
    <h6 class="small fw-semibold mt-2">Plazo para la presentación del producto</h6>
    <div class="row g-2 mb-3 small">${plazosHtml}</div>
    <div class="mb-2 text-start">
      <button type="button" class="btn btn-outline-success btn-sm" id="provBtnDlEconomica">
        <i class="bi bi-download"></i> Descargar propuesta económica ${esc(config.labelEconomica)}
      </button>
      <div class="small text-muted mt-1 text-start">Imprima, firme y adjunte en el paso 2.</div>
    </div>
    <div class="fw-semibold mb-2">Precio Total S/ (Incluido IGV): <span id="provCotMontoTotal">${money(total)}</span></div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(GLOSA_LOCADORES_FORMA_PAGO)}</div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(DECLARO_CONOCER_ANEXO11)}</div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(GLOSA_PENALIDAD_ANEXO11)}</div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(FORMULA_PENALIDAD_ANEXO11)}<br>${esc(FORMULA_F_ANEXO11)}<br>${esc(CIERRE_PENALIDAD_ANEXO11)}</div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(NOTA_COTIZACION_ANEXO11)}</div>
    <div class="row g-2 mb-3 small">
      <div class="col-md-4"><label class="form-label mb-0">Firma (nombres completos)</label>
        <input class="form-control form-control-sm prov-extra" data-k="firma_nombre" value="${esc(ex.firma_nombre)}"${ro}></div>
      <div class="col-md-4"><label class="form-label mb-0">DNI</label>
        <input class="form-control form-control-sm prov-extra" data-k="firma_dni" value="${esc(ex.firma_dni)}"${ro}></div>
    </div>
    <div class="prov-firma-locador mb-3 p-2 border rounded bg-light small">
      <label class="form-label mb-1 fw-semibold">Espacio de firma</label>
      <div style="min-height:48px;border-bottom:1px solid #adb5bd;"></div>
    </div>`;
}

export function renderStep1ByTipo(ctx) {
  const tipo = normalizeTipoCotizacion(ctx.workspace?.solicitud?.tipo);
  if (tipo === 'Servicios') return renderStep1Servicios(ctx);
  if (tipo === 'Locadores') return renderStep1Locadores(ctx);
  return renderStep1Bienes(ctx);
}

export function initEntregablesEco(items, prevEco = {}, tipo) {
  const isLocador = normalizeTipoCotizacion(tipo) === 'Locadores';
  const map = {};
  items.forEach((it) => {
    const saved = prevEco[it.item_key];
    if (Array.isArray(saved) && saved.length) {
      map[it.item_key] = saved.map((e, i) => ({
        nro: e.nro ?? i + 1,
        um: e.um || (isLocador ? 'Servicio' : (it.unidad_medida || 'UND')),
        precio_unitario: e.precio_unitario || 0,
        total: e.total || 0,
      }));
      return;
    }
    if (isLocador) {
      map[it.item_key] = Array.from({ length: MAX_ENTREGABLES_LOCADOR }, (_, i) => ({
        nro: i + 1,
        um: 'Servicio',
        precio_unitario: 0,
        total: 0,
      }));
      return;
    }
    map[it.item_key] = [{
      nro: 1,
      um: it.unidad_medida || 'servicio',
      precio_unitario: 0,
      total: 0,
    }];
  });
  return map;
}
