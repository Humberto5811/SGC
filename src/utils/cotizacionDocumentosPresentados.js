/**
 * RC8.5-C4 — Vista de documentos presentados (misma fuente que Recepción → Cotización recibida).
 * Agrupa por `grupo` del manifiesto portal; relaciona SC↔archivo solo por `key` persistida.
 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  if (!iso) return '—';
  return String(iso).slice(0, 16).replace('T', ' ');
}

function fmtMonto(monto, moneda = 'PEN') {
  if (monto == null || monto === '') return '—';
  const n = Number(monto);
  if (!Number.isFinite(n)) return String(monto);
  try {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(n);
  } catch (_) {
    return `${moneda || 'PEN'} ${n.toFixed(2)}`;
  }
}

/** Misma clave que el portal proveedor (misCotizacionesView). */
export function docKeySolicitud(d, i) {
  return `doc-${i}-${d.documento || d.archivo || i}`;
}

export function reqKeySolicitud(r, i) {
  return `req-${i}-${r.requisito || i}`;
}

export function normalizeDocsFromRecepcionDetalle(det) {
  const d = det?.data || det || {};
  const list = d.documentos || d.archivos || d.docs || d.documentos_presentados || [];
  if (!Array.isArray(list)) return [];
  return list.map((x) => ({
    nombre: x.nombre || x.nombre_archivo || x.documento || x.tipo,
    ref: x.ref || x.clave || x.key || x.id || null,
    fecha: x.fecha || x.created_at || null,
    grupo: x.grupo || x.tipo || 'Documentos',
    mime_type: x.mime_type || x.mime || '',
    key: x.key || null,
    disponible: x.disponible !== false && !!(x.ref || x.clave),
    economico: !!x.economico,
  }));
}

/** Agrupa exactamente como Recepción (`renderDocumentosList`): por `grupo` API. */
export function groupByManifiestoGrupo(documentos = []) {
  const grupos = {};
  (documentos || []).forEach((d) => {
    const g = d.grupo || 'Documentos';
    if (!grupos[g]) grupos[g] = [];
    grupos[g].push(d);
  });
  return Object.entries(grupos);
}

/**
 * Deduplica archivos del manifiesto por ref (identidad portal).
 * Orden: ref → key → meta nombre+mime+grupo.
 */
export function dedupeDocsPresentados(docs = []) {
  const seen = new Set();
  const out = [];
  (docs || []).forEach((d) => {
    const id = d.ref
      || (d.key ? `key:${d.key}` : '')
      || `meta:${String(d.nombre || '').toLowerCase()}|${d.mime_type || ''}|${d.grupo || ''}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(d);
  });
  return out;
}

export function countDocsPresentados(docs = []) {
  return dedupeDocsPresentados(docs).filter((d) => d.disponible !== false && d.ref).length;
}

function findDocByKeyOrRef(docs, key, refPrefix, index) {
  if (key) {
    const byKey = (docs || []).find((d) => d.key && String(d.key) === String(key));
    if (byKey) return byKey;
  }
  if (refPrefix != null && index != null) {
    const ref = `${refPrefix}${index}`;
    return (docs || []).find((d) => d.ref === ref) || null;
  }
  return null;
}

/**
 * Construye la vista estructurada por proveedor a partir del detalle de recepción.
 * Relación requisito↔archivo solo si existe `key` (o índice estable del manifiesto).
 */
export function buildVistaCotizacionPresentada(detalle, { solicitud = null } = {}) {
  const d = detalle?.data || detalle || {};
  const docs = dedupeDocsPresentados(normalizeDocsFromRecepcionDetalle(d));
  const scDocs = Array.isArray(d.docs_solicitados_sc) && d.docs_solicitados_sc.length
    ? d.docs_solicitados_sc
    : (Array.isArray(solicitud?.docs_solicitados) ? solicitud.docs_solicitados : []);
  const scReqs = Array.isArray(d.requisitos_tecnicos_sc) && d.requisitos_tecnicos_sc.length
    ? d.requisitos_tecnicos_sc
    : (Array.isArray(solicitud?.requisitos_tecnicos) ? solicitud.requisitos_tecnicos : []);

  const docsSolicitados = scDocs.map((cfg, i) => {
    const key = docKeySolicitud(cfg, i);
    const file = findDocByKeyOrRef(docs, key, 'docs-', i);
    return {
      documento: cfg.documento || cfg.nombre || `Documento ${i + 1}`,
      obligatorio: cfg.obligatorio !== false,
      archivo: file?.nombre || '',
      ref: file?.ref || null,
      disponible: !!(file?.ref && file.disponible !== false),
      fecha: file?.fecha || null,
      estado: file?.ref ? 'Presentado' : 'Sin documento asociado',
      key,
    };
  });

  // Archivos docs-* no emparejados (key distinta / legacy)
  const pairedRefs = new Set(docsSolicitados.map((x) => x.ref).filter(Boolean));
  const docsSueltos = docs.filter((x) => x.grupo === 'Documentos solicitados' && x.ref && !pairedRefs.has(x.ref));

  const requisitos = scReqs.map((cfg, i) => {
    const key = reqKeySolicitud(cfg, i);
    const file = findDocByKeyOrRef(docs, key, 'req-', i);
    return {
      requisito: cfg.requisito || cfg.nombre || `Requisito ${i + 1}`,
      obligatorio: cfg.obligatorio !== false,
      archivo: file?.nombre || '',
      ref: file?.ref || null,
      disponible: !!(file?.ref && file.disponible !== false),
      observacion: cfg.observacion || cfg.comentario || '',
      resultado_validacion: d.validacion_estado || '',
      estado: file?.ref ? 'Presentado' : 'Sin documento asociado',
      key,
    };
  });
  const reqPaired = new Set(requisitos.map((x) => x.ref).filter(Boolean));
  const reqSueltos = docs.filter((x) => x.grupo === 'Requisitos técnicos' && x.ref && !reqPaired.has(x.ref));

  // Misma taxonomía del manifiesto recepción (sin remapear nombres de archivo)
  const propuestaTecnica = docs.filter((x) => x.ref === 'anexo05a');
  const propuestaEconomica = docs.filter((x) => x.ref === 'anexo05b'
    || x.grupo === 'Propuesta económica' || x.economico);
  const anexosFirmados = docs.filter((x) => x.grupo === 'Anexos firmados' && x.ref !== 'anexo05a');
  const adicionales = docs.filter((x) => x.grupo === 'Certificados'
    || (!['Documentos solicitados', 'Requisitos técnicos', 'Anexos firmados', 'Propuesta económica'].includes(x.grupo)
      && x.ref !== 'anexo05a' && x.ref !== 'anexo05b'));

  return {
    generales: {
      cotizacion_id: d.id,
      solicitud_id: d.solicitud_id,
      proveedor_id: d.proveedor_id,
      razon_social: d.razon_social,
      ruc: d.ruc,
      fecha_presentacion: d.fecha_presentacion,
      monto: d.monto,
      moneda: d.moneda || 'PEN',
      estado: d.estado,
      validacion_estado: d.validacion_estado,
      validacion_responsable: d.validacion_responsable || '',
    },
    docs_solicitados: docsSolicitados,
    docs_solicitados_sueltos: docsSueltos,
    requisitos,
    requisitos_sueltos: reqSueltos,
    propuesta_tecnica: propuestaTecnica,
    propuesta_economica: propuestaEconomica,
    anexos_firmados: anexosFirmados,
    adicionales: dedupeDocsPresentados([...adicionales, ...docsSueltos, ...reqSueltos]),
    documentos: docs,
    total_archivos: countDocsPresentados(docs),
  };
}

function renderAccionesArchivo(cotId, ref, nombre, disponible) {
  if (!disponible || !ref) {
    return '<span class="text-muted small">Archivo no disponible</span>';
  }
  return `
    <button type="button" class="btn btn-sm btn-outline-primary cc-exp-cot-doc"
      data-cot="${esc(cotId)}" data-ref="${esc(ref)}" data-mode="ver">Ver</button>
    <button type="button" class="btn btn-sm btn-outline-secondary cc-exp-cot-doc"
      data-cot="${esc(cotId)}" data-ref="${esc(ref)}" data-mode="dl"
      data-name="${esc(nombre || 'documento.pdf')}">Descargar</button>`;
}

function renderTablaArchivos(cotId, rows, { empty = 'Sin archivos' } = {}) {
  if (!rows?.length) return `<p class="small text-muted mb-0">${esc(empty)}</p>`;
  return `
    <div class="table-responsive cc-exp-table-sticky">
      <table class="table table-sm table-bordered mb-0">
        <thead class="table-light"><tr>
          <th>Archivo</th><th>Fecha</th><th>Estado</th><th>Acciones</th>
        </tr></thead>
        <tbody>${rows.map((d) => {
    const ok = !!(d.ref && d.disponible !== false);
    return `
          <tr>
            <td class="small">${esc(d.nombre || d.archivo || '—')}</td>
            <td class="small text-nowrap">${esc(fmtFecha(d.fecha))}</td>
            <td class="small">${esc(d.estado || (ok ? 'Disponible' : 'Archivo no disponible'))}</td>
            <td class="text-nowrap">${renderAccionesArchivo(cotId, d.ref, d.nombre || d.archivo, ok)}</td>
          </tr>`;
  }).join('')}</tbody>
      </table>
    </div>`;
}

/** HTML de un proveedor (solo lectura) — estructura C4. */
export function renderBloqueCotizacionPresentada(vista, { collapseId = '' } = {}) {
  const g = vista.generales || {};
  const cotId = g.cotizacion_id;
  const cid = collapseId || `ccCot_${cotId || Date.now()}`;

  const docsRows = (vista.docs_solicitados || []).map((r) => `
    <tr>
      <td class="small"><strong>${esc(r.documento)}</strong></td>
      <td class="text-center small">${r.obligatorio ? 'Sí' : 'No'}</td>
      <td class="small">${esc(r.archivo || '—')}</td>
      <td class="small">${esc(r.estado)}</td>
      <td class="small text-nowrap">${esc(fmtFecha(r.fecha))}</td>
      <td class="text-nowrap">${renderAccionesArchivo(cotId, r.ref, r.archivo, r.disponible)}</td>
    </tr>`).join('');

  const reqRows = (vista.requisitos || []).map((r) => `
    <tr>
      <td class="small"><strong>${esc(r.requisito)}</strong></td>
      <td class="text-center small">${r.obligatorio ? 'Sí' : 'No'}</td>
      <td class="small">${esc(r.archivo || 'Sin documento asociado')}</td>
      <td class="small">${esc(r.resultado_validacion || '—')}</td>
      <td class="small">${esc(r.observacion || '—')}</td>
      <td class="text-nowrap">${renderAccionesArchivo(cotId, r.ref, r.archivo, r.disponible)}</td>
    </tr>`).join('');

  const propTec = [...(vista.propuesta_tecnica || [])];
  const propEco = [...(vista.propuesta_economica || [])];
  const anexos = [...(vista.anexos_firmados || [])];
  const adicionales = [...(vista.adicionales || [])];

  return `
    <div class="card border mb-3" data-cc-cot-block="${esc(cotId)}">
      <div class="card-header py-2 bg-light">
        <button class="btn btn-link text-decoration-none text-dark p-0 w-100 text-start d-flex justify-content-between align-items-center"
          type="button" data-bs-toggle="collapse" data-bs-target="#${esc(cid)}" aria-expanded="true">
          <span>
            <strong>${esc(g.razon_social || '—')}</strong>
            <span class="small text-muted ms-2">RUC ${esc(g.ruc || '—')}</span>
            <span class="badge bg-secondary ms-2">${esc(g.validacion_estado || g.estado || '—')}</span>
          </span>
          <i class="bi bi-chevron-down"></i>
        </button>
      </div>
      <div id="${esc(cid)}" class="collapse show">
        <div class="card-body py-3">
          <h6 class="fw-bold small text-uppercase text-muted mb-2">Datos generales</h6>
          <div class="row g-2 small mb-3">
            <div class="col-md-4"><span class="text-muted">Razón social:</span> <strong>${esc(g.razon_social || '—')}</strong></div>
            <div class="col-md-2"><span class="text-muted">RUC:</span> <strong>${esc(g.ruc || '—')}</strong></div>
            <div class="col-md-3"><span class="text-muted">Presentación:</span> <strong>${esc(fmtFecha(g.fecha_presentacion))}</strong></div>
            <div class="col-md-3"><span class="text-muted">Monto ofertado:</span> <strong>${esc(fmtMonto(g.monto, g.moneda))}</strong></div>
            <div class="col-md-3"><span class="text-muted">Estado recepción:</span> <strong>${esc(g.estado || '—')}</strong></div>
            <div class="col-md-3"><span class="text-muted">Validación AU:</span> <strong>${esc(g.validacion_estado || '—')}</strong></div>
            <div class="col-md-3"><span class="text-muted">Cotización:</span> <strong>#${esc(g.cotizacion_id || '—')}</strong></div>
            <div class="col-md-3"><span class="text-muted">Archivos:</span> <strong>${esc(vista.total_archivos || 0)}</strong></div>
          </div>

          <h6 class="fw-bold small mb-1">1. Documentos solicitados</h6>
          <div class="table-responsive cc-exp-table-sticky mb-3">
            <table class="table table-sm table-bordered mb-0">
              <thead class="table-light"><tr>
                <th>Documento solicitado</th><th>Obligatorio</th><th>Archivo presentado</th>
                <th>Estado</th><th>Fecha</th><th>Acciones</th>
              </tr></thead>
              <tbody>${docsRows || '<tr><td colspan="6" class="text-muted small">Sin documentos solicitados en la SC</td></tr>'}</tbody>
            </table>
          </div>

          <h6 class="fw-bold small mb-1">2. Requerimientos técnicos mínimos</h6>
          <div class="table-responsive cc-exp-table-sticky mb-3">
            <table class="table table-sm table-bordered mb-0">
              <thead class="table-light"><tr>
                <th>Requisito</th><th>Obligatorio</th><th>Documento acreditante</th>
                <th>Resultado validación</th><th>Observación</th><th>Acciones</th>
              </tr></thead>
              <tbody>${reqRows || '<tr><td colspan="6" class="text-muted small">Sin requisitos técnicos en la SC</td></tr>'}</tbody>
            </table>
          </div>

          <h6 class="fw-bold small mb-1">3. Propuesta técnica</h6>
          <div class="mb-3">${renderTablaArchivos(cotId, propTec, { empty: 'Sin propuesta técnica adjunta' })}</div>

          <h6 class="fw-bold small mb-1">4. Propuesta económica</h6>
          <div class="mb-3">${renderTablaArchivos(cotId, propEco, { empty: 'Sin propuesta económica adjunta' })}</div>

          <h6 class="fw-bold small mb-1">5. Anexos firmados</h6>
          <div class="mb-3">${anexos.length
    ? renderTablaArchivos(cotId, anexos)
    : (propTec.length
      ? '<p class="small text-muted mb-0">El anexo técnico firmado se muestra en <strong>Propuesta técnica</strong> (misma fuente que Recepción).</p>'
      : '<p class="small text-muted mb-0">Sin anexos firmados</p>')}</div>

          <h6 class="fw-bold small mb-1">6. Documentos adicionales</h6>
          <div>${renderTablaArchivos(cotId, adicionales, { empty: 'Sin documentos adicionales' })}</div>
        </div>
      </div>
    </div>`;
}
