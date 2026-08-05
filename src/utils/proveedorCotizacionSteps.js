/** Renderizado del paso 1 del wizard de cotización por tipo (Portal Proveedores). */
import { esc } from './proveedorShared.js';
import {
  TEXTO_CONFIRMACION_TR_06A, TEXTO_AUTORIZACION_CORREO_06,
  GLOSA_LOCADORES_FORMA_PAGO, GLOSA_PENALIDAD_ANEXO11, FORMULA_PENALIDAD_ANEXO11,
  FORMULA_F_ANEXO11, CIERRE_PENALIDAD_ANEXO11, DECLARO_CONOCER_ANEXO11, IMPORTANTE_ANEXO11,
  CONFIRMACION_ANEXO11, NOTA_COTIZACION_ANEXO11,
  cantidadPorTipo, normalizeTipoCotizacion,
  unidadMedidaCotizacion, unidadMedidaAnexo11,
} from './proveedorCotizacionConfig.js';
import { TEXTO_AUTORIZACION_CORREO, TEXTO_LEY_27444 } from './proveedorPdfCotizacion.js';
import {
  resolveEntregablesCotizacion, mergeEntregablesConPrecios, sumPrecioEntregables,
} from './entregablesCotizacion.js';

const CANJE_OPTS = ['Sí', 'No', 'Parcial'];
const RUBRO_OPTS = [
  'Medicamentos', 'Reactivos', 'Dispositivos Médicos', 'Equipos', 'Laboratorio',
  'Servicios', 'Consultoría', 'Locadores', 'Software', 'Mobiliario', 'Otros',
];

function roAttr(readonly) {
  return readonly ? ' disabled readonly' : '';
}

/** Resuelve entregables programados desde workspace (fuentes TDR / cronograma). */
export function resolveEntregablesFromWorkspace(workspace) {
  const tipo = workspace?.solicitud?.tipo;
  if (Array.isArray(workspace?.entregables_programados) && workspace.entregables_programados.length) {
    return resolveEntregablesCotizacion(workspace.entregables_programados, tipo);
  }
  const sources = workspace?.entregables_sources || [];
  for (const src of sources) {
    const list = resolveEntregablesCotizacion(src, tipo || src?.tipo);
    if (list.length) return list;
  }
  for (const it of workspace?.items || []) {
    if (it.entregables_source) {
      const list = resolveEntregablesCotizacion(it.entregables_source, tipo);
      if (list.length) return list;
    }
  }
  return [];
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
  const ro = roAttr(readonly);
  const total = Object.values(formState.precios).reduce((a, p) => a + (Number(p.total) || 0), 0);

  return `
    <div class="alert alert-light border small mb-2 py-2">
      <strong>${esc(sol.codigo)}</strong> — ${esc(sol.denominacion || sol.objeto || '')}
    </div>
    <h6 class="fw-bold mb-2">1. ${esc(config.labelTecnica)} — Información técnica solicitada (cumplimiento del ítem)</h6>
    <div class="table-responsive mb-2">
      <table class="table table-bordered table-sm prov-cot-table mb-0">
        <thead class="table-primary text-center align-middle">
          <tr>
            <th rowspan="2">Req.</th><th rowspan="2">Centro</th><th rowspan="2">Código SIGA</th>
            <th rowspan="2">Descripción</th><th rowspan="2">Cant.</th><th rowspan="2">U.M.</th>
            <th rowspan="2">Requerimiento/Pedidos</th>
            <th colspan="11">Cumplimiento del Ítem</th>
          </tr>
          <tr>
            <th>Presentación</th><th>Cant. ofertada</th><th>Marca</th><th>Modelo</th><th>País</th>
            <th>Año fab.</th><th>Garantía</th><th>Vigencia mín.</th><th>Canje</th><th>Plazo entrega</th><th>Doc. técnica</th>
          </tr>
        </thead>
        <tbody>
          ${workspace.items.map((it, idx) => {
            const f = formState.items[idx] || {};
            return `<tr data-idx="${idx}">
              <td>${esc(it.requerimiento_codigo || it.requerimiento_id)}</td>
              <td>${esc(it.centro || it.centro_nombre || '—')}</td>
              <td>${esc(it.codigo_sigamef || '—')}</td>
              <td>${esc(it.descripcion || '—')}</td>
              <td class="text-center">${esc(it.cantidad ?? 1)}</td>
              <td class="text-center">${esc(unidadMedidaCotizacion(it, 'Bienes'))}</td>
              ${renderDocsColumn(it, sid)}
              <td><input class="form-control form-control-sm prov-f-presentacion" value="${esc(f.presentacion)}"${ro}></td>
              <td><input class="form-control form-control-sm prov-f-cant" type="number" min="0" value="${esc(f.cantidad_ofertada)}"${ro}></td>
              <td><input class="form-control form-control-sm prov-f-marca" value="${esc(f.marca)}"${ro}></td>
              <td><input class="form-control form-control-sm prov-f-modelo" value="${esc(f.modelo)}"${ro}></td>
              <td><input class="form-control form-control-sm prov-f-pais" value="${esc(f.pais)}"${ro}></td>
              <td><input class="form-control form-control-sm prov-f-anio" value="${esc(f.anio_fabricacion)}"${ro}></td>
              <td><input class="form-control form-control-sm prov-f-garantia" value="${esc(f.garantia)}"${ro}></td>
              <td><input class="form-control form-control-sm prov-f-vigencia" value="${esc(f.vigencia_minima)}"${ro}></td>
              <td><select class="form-select form-select-sm prov-f-canje"${ro}>${CANJE_OPTS.map((o) =>
                `<option ${f.compromiso_canje === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
              <td><input class="form-control form-control-sm prov-f-plazo" type="number" min="0" value="${esc(f.plazo_entrega)}"${ro}></td>
              <td><input class="form-control form-control-sm prov-f-doctec" value="${esc(f.doc_tecnica)}"${ro}></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="prov-firma-bienes mb-3 p-2 border rounded bg-light small">
      <label class="form-label mb-1 fw-semibold">Firma del proveedor</label>
      <div style="min-height:48px;border-bottom:1px solid #adb5bd;"></div>
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
    ${(() => {
      const crono = resolveEntregablesFromWorkspace(workspace);
      if (!crono.length) return '';
      return `
    <h6 class="fw-bold mb-2">Cronograma de entregas programadas</h6>
    <div class="table-responsive mb-3">
      <table class="table table-bordered table-sm prov-cot-table mb-0">
        <thead class="table-light text-center">
          <tr><th>N°</th><th>Entrega</th><th>Cantidad</th><th>U.M.</th><th>Plazo / condición</th></tr>
        </thead>
        <tbody>
          ${crono.map((e) => `
            <tr>
              <td class="text-center">${e.numero}</td>
              <td style="white-space:normal;word-break:break-word;">${esc(e.nombre || e.descripcion || '—')}</td>
              <td class="text-center">${esc(e.cantidad ?? '—')}</td>
              <td class="text-center">${esc(e.unidad_medida || unidadMedidaCotizacion(e, tipo === 'Bienes' ? 'Bienes' : 'Servicios'))}</td>
              <td style="white-space:normal;word-break:break-word;">${esc(e.plazo_texto || e.descripcion || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
    })()}
    ${renderDatosProveedorCard(formState, config, readonly)}`;
}

export function renderStep1Servicios(ctx) {
  return renderStep1Entregables(ctx, { locador: false });
}

export function renderStep1Locadores(ctx) {
  return renderStep1Entregables(ctx, { locador: true });
}

/** Formulario técnico 06-A + económica Anexo 11 con entregables dinámicos. */
export function renderStep1Entregables(ctx, { locador = false } = {}) {
  const { workspace, formState, config, readonly, money, formatPriceDisplay } = ctx;
  const sol = workspace.solicitud;
  const tipo = normalizeTipoCotizacion(sol.tipo);
  const ro = roAttr(readonly);
  const ex = formState.extra || {};
  const it0 = workspace.items[0] || {};
  const descCol = locador ? 'Descripción del servicio de locación' : 'Descripción del Servicio';
  const programados = resolveEntregablesFromWorkspace(workspace);
  const entsRaw = formState.entregablesEco?.[it0.item_key] || [];
  const ents = entsRaw.length ? entsRaw : mergeEntregablesConPrecios(programados, []);
  const total = sumPrecioEntregables(ents);

  const servicioDesc = it0.descripcion || sol.denominacion || sol.objeto || '';
  const ecoRows = ents.map((e, eidx) => `
      <tr data-eidx="0" data-enidx="${eidx}">
        ${eidx === 0 ? `<td class="text-center align-middle" rowspan="${Math.max(ents.length, 1)}">${e.numero ?? 1}</td>
        <td class="small align-middle" rowspan="${Math.max(ents.length, 1)}" style="white-space:normal;word-break:break-word;">${esc(servicioDesc)}</td>` : ''}
        <td class="small" style="white-space:normal;word-break:break-word;">${esc(e.nombre || e.descripcion || `ENTREGABLE ${eidx + 1}`)}</td>
        <td class="text-center">${esc(unidadMedidaAnexo11(e.um || e.unidad_medida || it0, tipo))}</td>
        <td><input class="form-control form-control-sm prov-e-unit text-end" type="text" inputmode="decimal"
          value="${esc(formatPriceDisplay(e.precio_unitario ?? e.precio ?? e.total ?? 0))}"${ro}></td>
        <td class="text-end small fw-semibold prov-e-total-cell">${esc(formatPriceDisplay(e.precio_unitario ?? e.precio ?? e.total ?? 0))}</td>
      </tr>`).join('')
    || `<tr><td colspan="6" class="text-muted small text-center">Sin entregables programados en el TDR.</td></tr>`;

  const plazosHtml = ents.map((e, i) => `
    <div class="col-md-12"><label class="form-label mb-0">${esc(e.nombre || ('Entregable ' + (i + 1)))}</label>
      <input class="form-control form-control-sm prov-plazo-ent" data-i="${i}"
        placeholder="Hasta los … días calendario contados a partir del día de notificada la o.s."
        value="${esc((ex.plazos_entregables || [])[i] || e.plazo_texto || '')}"${ro}></div>`).join('');

  return `
    <div class="alert alert-light border small mb-2 py-2">
      <strong>${esc(sol.codigo)}</strong> — ${esc(sol.denominacion || sol.objeto || '')}
    </div>
    <h6 class="fw-bold mb-2">1. ${esc(config.labelTecnica)} — Propuesta técnica</h6>
    <div class="table-responsive mb-2">
      <table class="table table-bordered table-sm prov-cot-table mb-0">
        <thead class="table-primary text-center">
          <tr><th>Ítem</th><th>Nº REQ</th><th>${esc(descCol)}</th><th>Cantidad</th><th>Unidad de medida</th></tr>
        </thead>
        <tbody>
          ${workspace.items.map((it, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td>${esc(it.requerimiento_codigo || it.requerimiento_id)}</td>
              <td style="white-space:normal;word-break:break-word;">${esc(it.descripcion || '—')}</td>
              <td class="text-center">${esc(cantidadPorTipo(tipo, it.cantidad))}</td>
              <td class="text-center">${esc(unidadMedidaCotizacion(it, tipo))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(TEXTO_CONFIRMACION_TR_06A)}</div>
    <div class="row g-2 mb-3 small">
      <div class="col-md-6"><label class="form-label mb-0">Plazo de ejecución</label>
        <input class="form-control form-control-sm prov-extra" data-k="plazo_ejecucion" value="${esc(ex.plazo_ejecucion)}"
          placeholder="Hasta los … días calendario contados a partir de la orden de servicio"${ro}></div>
      <div class="col-md-6"><label class="form-label mb-0">Forma de pago</label>
        <input class="form-control form-control-sm prov-extra" data-k="forma_pago" value="${esc(ex.forma_pago || 'De acuerdo a lo indicado en los términos de referencia.')}"${ro}></div>
    </div>
    ${renderDatosProveedor06ACard(formState, readonly)}
    ${renderDownloadHint(config.labelTecnica)}
    <h6 class="fw-bold mb-2">2. ${esc(config.labelEconomica)} — Propuesta económica</h6>
    <p class="small text-muted mb-2">SERVICIO: <strong>${esc(it0.descripcion || sol.denominacion || sol.objeto || '')}</strong></p>
    <div class="table-responsive mb-2">
      <table class="table table-bordered table-sm prov-cot-table mb-0">
        <thead class="table-light text-center align-middle">
          <tr>
            <th>N°</th>
            <th>Descripción del Servicio</th>
            <th>N° de entregables</th>
            <th>Unidad de medida</th>
            <th>Precio Unitario por cada entregable S/<br>(Inc. IGV)</th>
            <th>Precio Total S/<br>(Inc. IGV)</th>
          </tr>
        </thead>
        <tbody>${ecoRows}</tbody>
      </table>
    </div>
    <div class="fw-semibold mb-2">Precio Total S/ (Incluido IGV): <span id="provCotMontoTotal">${money(total)}</span></div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(IMPORTANTE_ANEXO11)}</div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(CONFIRMACION_ANEXO11)}</div>
    <h6 class="small fw-semibold mt-2">Plazo para la presentación del producto</h6>
    <div class="row g-2 mb-3 small">${plazosHtml || '<div class="col-12 text-muted small">Sin plazos programados.</div>'}</div>
    <div class="mb-2 text-start">
      <button type="button" class="btn btn-outline-success btn-sm" id="provBtnDlEconomica">
        <i class="bi bi-download"></i> Descargar propuesta económica ${esc(config.labelEconomica)}
      </button>
      <div class="small text-muted mt-1 text-start">Imprima, firme y adjunte en el paso 2.</div>
    </div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(GLOSA_LOCADORES_FORMA_PAGO)}</div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(DECLARO_CONOCER_ANEXO11)}</div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(GLOSA_PENALIDAD_ANEXO11)}</div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(FORMULA_PENALIDAD_ANEXO11)}<br>${esc(FORMULA_F_ANEXO11)}<br>${esc(CIERRE_PENALIDAD_ANEXO11)}</div>
    <div class="p-2 bg-light border rounded small text-muted mb-2" style="user-select:none;">${esc(NOTA_COTIZACION_ANEXO11)}</div>
    <div class="prov-firma-locador mb-3 p-3 border rounded bg-light small">
      <div class="fw-semibold mb-2">Representante legal</div>
      <div>${esc(formState.datos?.representante_legal || '—')}</div>
      <div class="text-muted">DNI: ${esc(formState.datos?.firma_representante || ex.firma_dni || '—')}</div>
      <div class="mt-3" style="min-height:72px;border-bottom:1px solid #adb5bd;" title="Espacio de firma (4 líneas)"></div>
    </div>`;
}

export function renderStep1ByTipo(ctx) {
  const tipo = normalizeTipoCotizacion(ctx.workspace?.solicitud?.tipo);
  if (tipo === 'Servicios') return renderStep1Servicios(ctx);
  if (tipo === 'Locadores') return renderStep1Locadores(ctx);
  return renderStep1Bienes(ctx);
}

export function initEntregablesEco(items, prevEco = {}, tipo, workspace = null) {
  const t = normalizeTipoCotizacion(tipo);
  const usesEntregables = t === 'Locadores' || t === 'Servicios';
  const map = {};
  const programados = workspace ? resolveEntregablesFromWorkspace(workspace) : [];
  const prev = Array.isArray(prevEco)
    ? { entregables_cotizados: prevEco }
    : (prevEco && typeof prevEco === 'object' ? prevEco : {});

  items.forEach((it) => {
    const saved = prev[it.item_key];
    const savedList = Array.isArray(saved) ? saved
      : (Array.isArray(prev.entregables_cotizados) ? prev.entregables_cotizados : null);

    if (usesEntregables) {
      const src = it.entregables_source
        ? resolveEntregablesCotizacion(it.entregables_source, tipo)
        : programados;
      const base = src.length ? src : (savedList || []);
      map[it.item_key] = mergeEntregablesConPrecios(base, savedList || []);
      return;
    }

    if (Array.isArray(savedList) && savedList.length) {
      map[it.item_key] = savedList.map((e, i) => ({
        nro: e.nro ?? e.numero ?? i + 1,
        um: unidadMedidaAnexo11(e.um || e.unidad_medida || it, tipo),
        precio_unitario: e.precio_unitario ?? e.precio ?? 0,
        total: e.total ?? e.precio ?? e.precio_unitario ?? 0,
      }));
      return;
    }
    map[it.item_key] = [{
      nro: 1,
      um: unidadMedidaAnexo11(it, tipo),
      precio_unitario: 0,
      total: 0,
    }];
  });
  return map;
}
