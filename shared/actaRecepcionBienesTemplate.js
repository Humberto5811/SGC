import { ACTA_LOGO_FALLBACK_DATA_URL } from './actaLogoFallbackDataUrl.js';

/**
 * Plantilla institucional fija — Acta de Recepción y Conformidad de Bienes.
 * Solo sustituye campos dinámicos; no altera la estructura según cantidad de datos.
 *
 * Título: ACTA DE RECEPCIÓN Y CONFORMIDAD DE BIENES
 * (el modelo adjunto dice "SERVICIO"; el módulo es bienes).
 *
 * Anexo: constante de plantilla ANEXO N.° 18 (modelo institucional).
 * No usar versión del acta ni número de orden como anexo.
 */

export const ACTA_ANEXO_NUMERO = '18';

export const ACTA_TITULO_BIENES = 'ACTA DE RECEPCIÓN Y CONFORMIDAD DE BIENES';

export const ACTA_TEXTO_DECLARATIVO = 'Por medio de la presente, quienes suscriben dejan constancia de la recepción '
  + 'y conformidad de los bienes que se detallan, verificando que cumplen con las '
  + 'especificaciones técnicas y condiciones contractuales acordadas.';

export const ACTA_ENCABEZADO_DEFAULT = {
  linea1: 'CONTRATACIÓN DE BIENES Y SERVICIOS IGUALES O INFERIORES A OCHO (8)',
  linea2: 'UNIDADES IMPOSITIVAS TRIBUTARIAS – UIT EN EL INSTITUTO NACIONAL DE SALUD',
};

export const ACTA_PENALIDAD_GLOSA = 'Si corresponde SÍ, el área competente realiza el cálculo, incorpora el '
  + 'formato de penalidad y lo adjunta al expediente. Si corresponde NO, continúa el trámite sin formato de penalidad.';

/**
 * @param {string} fechaDdMmYyyy
 * @returns {{ dia: string, mes: string, anio: string }}
 */
export function splitFechaParts(fechaDdMmYyyy) {
  const s = String(fechaDdMmYyyy || '').trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!m) return { dia: '—', mes: '—', anio: '—' };
  return {
    dia: String(m[1]).padStart(2, '0'),
    mes: String(m[2]).padStart(2, '0'),
    anio: m[3],
  };
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Normaliza data de buildActaRecepcionData para la ficha institucional.
 */
export function resolveActaTemplateFields(data = {}, opts = {}) {
  const encabezado = {
    linea1: opts.encabezadoLinea1 || data.entidad?.encabezado_linea1 || ACTA_ENCABEZADO_DEFAULT.linea1,
    linea2: opts.encabezadoLinea2 || data.entidad?.encabezado_linea2 || ACTA_ENCABEZADO_DEFAULT.linea2,
  };
  const titulo = opts.titulo || data.entidad?.documento || ACTA_TITULO_BIENES;
  const anexo = opts.anexoNumero || data.entidad?.anexo_numero || ACTA_ANEXO_NUMERO;
  const logoDataUrl = opts.logoDataUrl || data.entidad?.logo_data_url || ACTA_LOGO_FALLBACK_DATA_URL || '';

  const fechaOrdenParts = splitFechaParts(data.orden?.fecha_emision);
  const contratoParts = splitFechaParts(data.orden?.fecha_contrato || '');
  const tieneContrato = !!(data.orden?.numero_contrato && data.orden.numero_contrato !== '—');

  const itemLabel = [data.item?.codigo_sigamef, data.item?.descripcion]
    .filter((x) => x && x !== '—')
    .join(' – ') || '—';

  const guiasTexto = (data.guias || []).length
    ? (data.guias || []).map((g) => g.numero).filter(Boolean).join(', ')
    : '—';

  const penalidad = String(data.corresponde_penalidad || 'NO').toUpperCase().includes('SÍ')
    || String(data.corresponde_penalidad || '').toUpperCase() === 'SI'
    ? 'SÍ'
    : 'NO';

  const detalleAnexo = {
    items: data.items || [],
    guias: data.guias || [],
    necesitaAnexo: (data.items || []).length > 1
      || (data.guias || []).length > 3
      || !!opts.forzarAnexoDetalle,
  };

  return {
    encabezado,
    titulo,
    anexo,
    logoDataUrl,
    numero_acta: data.numero_acta || '—',
    version: data.version || 1,
    fecha_emision_acta: data.fecha_emision || '—',
    texto_declarativo: opts.textoDeclarativo || ACTA_TEXTO_DECLARATIVO,
    glosa_penalidad: ACTA_PENALIDAD_GLOSA,
    contrato: {
      numero: tieneContrato ? data.orden.numero_contrato : '—',
      ...contratoParts,
      tiene: tieneContrato,
    },
    orden: {
      numero: data.orden?.numero || '—',
      ...fechaOrdenParts,
    },
    monto_total: data.orden?.monto_total || '—',
    proveedor: data.proveedor?.razon_social || '—',
    proveedor_ruc: data.proveedor?.ruc || '',
    bien_item: itemLabel,
    monto_liquidar: data.recepcion?.monto_liquidar || data.orden?.monto_liquidar || '—',
    comprobante_pago: data.comprobante_pago || opts.comprobantePago || '—',
    guias: guiasTexto,
    entrega: data.entrega?.etiqueta || data.orden?.entrega || '—',
    folios: data.folios || opts.folios || '—',
    fecha_inicio: data.entrega?.fecha_inicio || '—',
    fecha_maxima: data.entrega?.fecha_maxima || '—',
    fecha_recepcion: data.recepcion?.fecha || '—',
    condicion_inicio: String(data.entrega?.condicion_inicio || data.orden?.condicion_inicio || '—').toUpperCase(),
    penalidad,
    firma_almacen: {
      nombres: data.responsable_almacen || '—',
      cargo: data.cargo_almacen || opts.cargoAlmacen || 'Responsable de Almacén',
      unidad: data.unidad_organica_almacen || opts.unidadAlmacen || 'Almacén',
    },
    firma_au: {
      nombres: data.requerimiento?.area_usuaria || 'Área Usuaria',
      cargo: 'Responsable del Área Usuaria',
      unidad: data.requerimiento?.area_usuaria || 'Área Usuaria',
    },
    detalleAnexo,
  };
}

export function getActaRecepcionCss() {
  return `
@page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }
.acta-inst {
  font-family: Arial, Helvetica, sans-serif;
  color: #000;
  font-size: 10px;
  line-height: 1.25;
  width: 186mm;
  max-width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}
.acta-inst * { box-sizing: border-box; }
.acta-inst .hdr-lines {
  text-align: center;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 9.5px;
  letter-spacing: 0.2px;
  margin: 0 0 6px;
}
.acta-inst .hdr-lines div { margin: 0; }
.acta-inst .title-box {
  display: grid;
  grid-template-columns: 22mm 1fr;
  border: 1.2px solid #000;
  min-height: 22mm;
  align-items: stretch;
  page-break-inside: avoid;
}
.acta-inst .logo-cell {
  border-right: 1.2px solid #000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2mm;
}
.acta-inst .logo-cell img {
  max-width: 16mm;
  max-height: 16mm;
  object-fit: contain;
}
.acta-inst .logo-fallback {
  width: 14mm; height: 14mm; border: 1px dashed #666; border-radius: 50%;
  display:flex; align-items:center; justify-content:center; font-size:7px; color:#666;
}
.acta-inst .title-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-weight: 700;
  font-size: 13px;
  text-transform: uppercase;
  padding: 2mm 3mm;
}
.acta-inst .anexo {
  text-align: center;
  font-weight: 700;
  margin: 4px 0 8px;
  font-size: 11px;
}
.acta-inst .meta-discreta {
  text-align: right;
  font-size: 7.5px;
  color: #333;
  margin: -4px 0 6px;
}
.acta-inst .declarativo {
  font-weight: 700;
  text-align: justify;
  margin: 0 0 8px;
  font-size: 9.5px;
}
.acta-inst table.blk {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 6px;
  page-break-inside: avoid;
}
.acta-inst table.blk td, .acta-inst table.blk th {
  border: 1px solid #000;
  padding: 3px 5px;
  vertical-align: middle;
}
.acta-inst .pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4mm;
  margin-bottom: 6px;
  page-break-inside: avoid;
}
.acta-inst .pair table { margin: 0; }
.acta-inst .ctr { text-align: center; font-weight: 700; }
.acta-inst .val-red { color: #c00000; font-weight: 700; }
.acta-inst .label { font-weight: 700; text-align: center; }
.acta-inst .left { text-align: left; }
.acta-inst .right { text-align: right; }
.acta-inst .pen-si { color: #c00000; font-size: 14px; font-weight: 700; text-align: center; }
.acta-inst .pen-no { color: #000; font-size: 14px; font-weight: 700; text-align: center; }
.acta-inst .glosa { font-size: 8px; text-align: justify; }
.acta-inst .fecha-linea { text-align: right; margin: 10px 0 14px; font-size: 10px; }
.acta-inst .firmas {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12mm;
  margin-top: 8px;
  page-break-inside: avoid;
}
.acta-inst .firma {
  text-align: center;
  min-height: 38mm;
  padding-top: 18mm;
}
.acta-inst .firma .linea {
  border-top: 1px solid #000;
  margin: 0 8mm 4px;
}
.acta-inst .firma .nm { font-weight: 700; font-size: 9px; }
.acta-inst .firma .sm { font-size: 8.5px; }
.acta-inst .anexo-detalle { page-break-before: always; }
.acta-inst .anexo-detalle h3 {
  text-align: center; font-size: 11px; margin: 0 0 8px;
}
`;
}

/**
 * HTML de vista previa / impresión — misma estructura que el PDF institucional.
 */
export function buildActaRecepcionHtml(data = {}, opts = {}) {
  const f = resolveActaTemplateFields(data, opts);
  const logo = f.logoDataUrl
    ? `<img src="${esc(f.logoDataUrl)}" alt="Logo institucional" />`
    : '<div class="logo-fallback">LOGO</div>';

  const penClass = f.penalidad === 'SÍ' ? 'pen-si' : 'pen-no';

  const detalle = f.detalleAnexo.necesitaAnexo ? `
  <section class="anexo-detalle">
    <h3>ANEXO DE DETALLE — ${esc(f.numero_acta)}</h3>
    <table class="blk">
      <thead><tr>
        <th>N.°</th><th>Código</th><th>Descripción</th><th>U.M.</th><th>Cant.</th><th>Importe</th>
      </tr></thead>
      <tbody>
        ${(f.detalleAnexo.items || []).map((it) => `
          <tr>
            <td class="ctr">${esc(it.nro)}</td>
            <td>${esc(it.codigo)}</td>
            <td>${esc(it.descripcion)}</td>
            <td class="ctr">${esc(it.unidad)}</td>
            <td class="ctr">${esc(it.cantidad)}</td>
            <td class="right">${esc(it.importe)}</td>
          </tr>`).join('') || '<tr><td colspan="6">Sin ítems</td></tr>'}
      </tbody>
    </table>
    <table class="blk" style="margin-top:8px">
      <thead><tr><th>Guía</th><th>Fecha</th><th>Transportista</th></tr></thead>
      <tbody>
        ${(f.detalleAnexo.guias || []).map((g) => `
          <tr><td>${esc(g.numero)}</td><td>${esc(g.fecha)}</td><td>${esc(g.transportista)}</td></tr>
        `).join('') || '<tr><td colspan="3">Sin guías</td></tr>'}
      </tbody>
    </table>
  </section>` : '';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>${esc(f.numero_acta)}</title>
<style>${getActaRecepcionCss()}</style></head>
<body>
<article class="acta-inst" data-acta="${esc(f.numero_acta)}" data-version="${esc(f.version)}">
  <div class="hdr-lines">
    <div>${esc(f.encabezado.linea1)}</div>
    <div>${esc(f.encabezado.linea2)}</div>
  </div>
  <div class="title-box">
    <div class="logo-cell">${logo}</div>
    <div class="title-cell">${esc(f.titulo)}</div>
  </div>
  <div class="anexo">ANEXO N.° ${esc(f.anexo)}</div>
  <div class="meta-discreta">ACTA N.° ${esc(f.numero_acta)}</div>
  <p class="declarativo">${esc(f.texto_declarativo)}</p>

  <div class="pair">
    <table class="blk">
      <tr><td colspan="4" class="ctr">CONTRATO</td></tr>
      <tr>
        <td class="ctr">N.°</td><td class="ctr">DÍA</td><td class="ctr">MES</td><td class="ctr">AÑO</td>
      </tr>
      <tr>
        <td class="ctr">${esc(f.contrato.numero)}</td>
        <td class="ctr">${esc(f.contrato.dia)}</td>
        <td class="ctr">${esc(f.contrato.mes)}</td>
        <td class="ctr">${esc(f.contrato.anio)}</td>
      </tr>
    </table>
    <table class="blk">
      <tr><td colspan="4" class="ctr">ORDEN DE COMPRA</td></tr>
      <tr>
        <td class="ctr">N.°</td><td class="ctr">DÍA</td><td class="ctr">MES</td><td class="ctr">AÑO</td>
      </tr>
      <tr>
        <td class="ctr val-red">${esc(f.orden.numero)}</td>
        <td class="ctr">${esc(f.orden.dia)}</td>
        <td class="ctr">${esc(f.orden.mes)}</td>
        <td class="ctr">${esc(f.orden.anio)}</td>
      </tr>
    </table>
  </div>

  <table class="blk">
    <tr>
      <td class="label" style="width:38%">MONTO TOTAL<br/>(Contrato u Orden)</td>
      <td class="right">${esc(f.monto_total)}</td>
    </tr>
    <tr>
      <td class="label">PROVEEDOR</td>
      <td class="left">${esc(f.proveedor)}${f.proveedor_ruc ? ` · RUC ${esc(f.proveedor_ruc)}` : ''}</td>
    </tr>
    <tr>
      <td class="label">BIEN / ÍTEM RECEPCIONADO</td>
      <td class="left">${esc(f.bien_item)}</td>
    </tr>
  </table>

  <table class="blk">
    <tr>
      <td class="label" style="width:22%">MONTO A LIQUIDAR S/</td>
      <td class="right val-red" style="width:18%">${esc(f.monto_liquidar)}</td>
      <td class="label" style="width:28%">N.° COMPROBANTE DE PAGO</td>
      <td style="width:32%">${esc(f.comprobante_pago)}</td>
    </tr>
    <tr>
      <td class="label">N.° DE GUÍA DE REMISIÓN</td>
      <td class="left" colspan="1">${esc(f.guias)}</td>
      <td class="label">ENTREGA / ENTREGABLE</td>
      <td class="ctr val-red">${esc(f.entrega)}</td>
    </tr>
    <tr>
      <td class="label">N.° DE FOLIOS</td>
      <td colspan="3">${esc(f.folios)}</td>
    </tr>
  </table>

  <table class="blk">
    <tr>
      <td class="label" style="width:55%">Fecha de Inicio de Plazo</td>
      <td class="ctr">${esc(f.fecha_inicio)}</td>
    </tr>
    <tr>
      <td class="label">Fecha Límite de Entrega / Fecha Máxima</td>
      <td class="ctr">${esc(f.fecha_maxima)}</td>
    </tr>
    <tr>
      <td class="label">Fecha de Recepción</td>
      <td class="ctr">${esc(f.fecha_recepcion)}</td>
    </tr>
    <tr>
      <td class="label">CONDICIÓN DE INICIO DEL PLAZO</td>
      <td class="ctr">${esc(f.condicion_inicio)}</td>
    </tr>
    <tr>
      <td>
        <div class="label">¿CORRESPONDE APLICACIÓN DE PENALIDAD?</div>
        <div class="${penClass}">${esc(f.penalidad)}</div>
      </td>
      <td class="glosa">${esc(f.glosa_penalidad)}</td>
    </tr>
  </table>

  <div class="fecha-linea">Fecha: ${esc(f.fecha_emision_acta)}</div>

  <div class="firmas">
    <div class="firma">
      <div class="linea"></div>
      <div class="nm">${esc(f.firma_almacen.nombres)}</div>
      <div class="sm">${esc(f.firma_almacen.cargo)}</div>
      <div class="sm">${esc(f.firma_almacen.unidad)}</div>
      <div class="sm">(Firma y sello)</div>
    </div>
    <div class="firma">
      <div class="linea"></div>
      <div class="nm">${esc(f.firma_au.nombres)}</div>
      <div class="sm">${esc(f.firma_au.cargo)}</div>
      <div class="sm">${esc(f.firma_au.unidad)}</div>
      <div class="sm">(Firma y sello)</div>
    </div>
  </div>
  ${detalle}
</article>
</body></html>`;
}
