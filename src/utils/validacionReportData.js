/**
 * Mapper único: normaliza detalle de validación para vista, edición y PDF.
 * Una sola fuente de verdad a partir de matriz_v2 + formulario_07a.
 */
import { getValidacionConfig, calcularResultadoCotizacion } from './validacionFormatosConfig.js';
import {
  resolveValidationCentro,
  consolidateCentros,
} from './validacionCentro.js';

function safeStr(v) {
  if (v == null) return '';
  if (typeof v === 'object') return '';
  return String(v);
}

/**
 * @param {object} detalle — respuesta de getValidacionTrabajo
 * @param {object} [overrides] — matriz/formulario actuales del DOM
 */
export function buildValidationReportData(detalle = {}, overrides = {}) {
  const matriz = overrides.matriz_v2 || detalle.matriz_v2 || { filas: [], tipo: 'BIENES' };
  const form = overrides.formulario_07a || detalle.formulario_07a || {};
  const { tipoKey, config } = getValidacionConfig(matriz.tipo || detalle.tipo_formato || detalle.tipo_contratacion);

  const filas = (matriz.filas || []).map((fila, idx) => {
    const auto = fila.automaticos || {};
    const ev = fila.evaluacion || {};
    const reqDet = (detalle.requerimientos_detalle || []).find(
      (r) => String(r.id) === String(fila.requerimiento_id)
        || String(r.codigo) === String(auto.nro_req || fila.requerimiento_codigo),
    );
    // Si la fila ya trae centro resuelto (backend), no pisarlo con cabecera/req genérico.
    const centroFila = safeStr(auto.centro);
    const resolved = centroFila
      ? {
          centro: centroFila,
          centro_costo: safeStr(auto.centro_costo || reqDet?.centro_costo),
          fuente: safeStr(auto.centro_fuente) || 'informe',
          warning: null,
        }
      : resolveValidationCentro({
          requerimientoCentro: reqDet?.centro || '',
          pedidoCentro: auto.pedido_centro || '',
          cabeceraCentro: '',
          informeCentro: '',
          itemCentro: '',
          centroCosto: reqDet?.centro_costo || auto.centro_costo || '',
        });
    return {
      item_key: fila.item_key || `row-${idx}`,
      requerimiento_id: fila.requerimiento_id || null,
      requerimiento_codigo: safeStr(fila.requerimiento_codigo || auto.nro_req),
      automaticos: {
        item: auto.item ?? idx + 1,
        nro_req: safeStr(auto.nro_req || fila.requerimiento_codigo),
        centro: safeStr(resolved.centro),
        centro_costo: safeStr(resolved.centro_costo || auto.centro_costo),
        centro_fuente: safeStr(resolved.fuente || auto.centro_fuente),
        pedido_sigamef: safeStr(auto.pedido_sigamef),
        codigo_siga: safeStr(auto.codigo_siga || auto.codigo_sigamef),
        descripcion: safeStr(auto.descripcion),
        cantidad: auto.cantidad ?? '',
        um: safeStr(auto.um || 'UND'),
        cant_cotizaciones: auto.cant_cotizaciones ?? '',
        razon_social: safeStr(auto.razon_social || detalle.razon_social),
        marca: safeStr(auto.marca),
        procedencia: safeStr(auto.procedencia),
      },
      evaluacion: Object.fromEntries(
        Object.entries(ev || {}).map(([k, v]) => [k, safeStr(v)]),
      ),
      resultado: safeStr(ev.resultado || fila.resultado),
      observaciones: safeStr(ev.observaciones || fila.observaciones),
    };
  });

  const calc = calcularResultadoCotizacion(tipoKey, filas);
  const centrosInfo = consolidateCentros(filas.map((f) => f.automaticos.centro));
  const centrosCosto = consolidateCentros(filas.map((f) => f.automaticos.centro_costo));
  const reqs = [...new Set(filas.map((f) => f.automaticos.nro_req).filter(Boolean))];
  const pedidos = [...new Set(filas.map((f) => f.automaticos.pedido_sigamef).filter(Boolean))];

  const serialized = JSON.stringify({
    cabecera: true,
    filas: filas.map((f) => ({ a: f.automaticos, e: f.evaluacion })),
  });
  if (/undefined|\[object Object\]/.test(serialized)) {
    console.warn('[validacionReportData] posible valor no serializable detectado');
  }

  return {
    tipoKey,
    config,
    cabecera: {
      titulo: config?.anexoTitulo || 'Formato de Validación',
      solicitud_codigo: safeStr(detalle.solicitud_codigo),
      requerimientos: reqs.join(', ') || safeStr(detalle.requerimientos),
      pedidos_sigamef: pedidos.join(', '),
      area_usuaria: safeStr(detalle.area_usuaria),
      centro: centrosInfo.display,
      centro_label: centrosInfo.label,
      centro_multiple: centrosInfo.multiple,
      centro_costo: centrosCosto.display === '—' ? '' : centrosCosto.display,
      tipo_label: config?.label || safeStr(detalle.tipo_contratacion),
      proveedor: safeStr(detalle.razon_social),
      ruc: safeStr(detalle.ruc),
      descripcion: safeStr(form.producto_adquisicion || detalle.descripcion || detalle.denominacion),
      fecha: safeStr(form.fecha),
      profesional: safeStr(form.profesional || detalle.validacion_responsable),
      resultado_global: safeStr(form.resultado_global || calc.resultado_global),
      cumple: safeStr(form.cumple || calc.cumple),
      sustento: safeStr(form.sustento),
      observacion_global: safeStr(form.observacion_global),
      ...(detalle.observacion_retorno ? { observacion_retorno: detalle.observacion_retorno } : {}),
    },
    matriz_v2: {
      version: 2,
      tipo: tipoKey,
      cotizacion_id: matriz.cotizacion_id || detalle.id,
      proveedor_id: matriz.proveedor_id || detalle.proveedor_id,
      solicitud_id: matriz.solicitud_id || detalle.solicitud_id,
      filas,
    },
    formulario_07a: {
      ...form,
      resultado_global: form.resultado_global || calc.resultado_global,
      cumple: form.cumple || calc.cumple,
    },
    calc,
  };
}
