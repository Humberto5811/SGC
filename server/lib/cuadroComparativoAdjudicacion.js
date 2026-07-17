/**
 * Recomendación y adjudicación Cuadro Comparativo — Bienes (RC8.3).
 *
 * Decisión de modalidad (auditoría del repo):
 * - No hay regla operativa explícita por paquete/requerimiento/integral.
 * - Specs (SGC.md / tasks) hablan de evaluación y adjudicatarios por ítem.
 * - Se implementa: ADJUDICACIÓN POR ÍTEM + resumen agregado por proveedor.
 */
import { validateEconomiaCuadro } from './cuadroComparativoMapper.js';

export const MODALIDAD_ADJUDICACION = 'POR_ITEM';

export const CRITERIOS_SELECCION = Object.freeze([
  'MENOR_PRECIO_VALIDO',
  'CUMPLIMIENTO_INTEGRAL',
  'EMPATE',
  'MENOS_DE_TRES_COTIZACIONES',
  'DISTINTO_MENOR_PRECIO',
  'OTRO',
]);

export const CRITERIOS_LABEL = Object.freeze({
  MENOR_PRECIO_VALIDO: 'Menor precio válido',
  CUMPLIMIENTO_INTEGRAL: 'Cumplimiento integral',
  EMPATE: 'Empate',
  MENOS_DE_TRES_COTIZACIONES: 'Menos de tres cotizaciones',
  DISTINTO_MENOR_PRECIO: 'Selección distinta al menor precio',
  OTRO: 'Otro',
});

const TOL = 0.02;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Ofertas aptas y económicas completas. */
export function ofertasValidasItem(item) {
  return (item?.ofertas || []).filter((o) => (
    o.cumple_tecnicamente
    && !o.incompleto
    && o.precio_total != null
    && Number.isFinite(Number(o.precio_total))
  ));
}

/**
 * Recomendación por ítem: APTO + completa + menor precio total.
 * Empate → no selecciona automáticamente.
 */
export function recomendarOfertaItem(item) {
  const validas = ofertasValidasItem(item);
  if (!validas.length) {
    return {
      item_key: item?.item_key,
      estado_recomendacion: 'SIN_OFERTA',
      recomendado_proveedor_id: null,
      recomendados_ids: [],
      empate: false,
      menor_precio_valido: item?.menor_precio_valido ?? null,
    };
  }
  const menor = Math.min(...validas.map((o) => Number(o.precio_total)));
  const empatados = validas.filter((o) => Math.abs(Number(o.precio_total) - menor) <= TOL);
  if (empatados.length > 1) {
    return {
      item_key: item?.item_key,
      estado_recomendacion: 'EMPATE',
      recomendado_proveedor_id: null,
      recomendados_ids: empatados.map((o) => o.proveedor_id),
      empate: true,
      menor_precio_valido: menor,
      empatados: empatados.map((o) => ({
        proveedor_id: o.proveedor_id,
        ruc: o.ruc,
        razon_social: o.razon_social,
        precio_total: o.precio_total,
      })),
    };
  }
  const ganador = empatados[0];
  return {
    item_key: item?.item_key,
    estado_recomendacion: 'RECOMENDADO',
    recomendado_proveedor_id: ganador.proveedor_id,
    recomendados_ids: [ganador.proveedor_id],
    empate: false,
    menor_precio_valido: menor,
  };
}

/** Enriquece matriz con recomendación / flags por oferta. */
export function aplicarRecomendacionesMatriz(matriz) {
  const items = (matriz?.items || []).map((it) => {
    const rec = recomendarOfertaItem(it);
    const ofertas = (it.ofertas || []).map((of) => {
      const precio = of.precio_total != null ? Number(of.precio_total) : null;
      const diff = (precio != null && rec.menor_precio_valido != null)
        ? round2(precio - rec.menor_precio_valido)
        : null;
      const esRecomendado = rec.recomendado_proveedor_id != null
        && of.proveedor_id === rec.recomendado_proveedor_id;
      const enEmpate = rec.empate && rec.recomendados_ids.includes(of.proveedor_id);
      return {
        ...of,
        recomendado: esRecomendado,
        en_empate_menor_precio: enEmpate,
        diferencia_menor_precio: diff,
        adjudicable: !!of.cumple_tecnicamente && !of.incompleto && of.precio_total != null,
      };
    });
    return {
      ...it,
      menor_precio_valido: rec.menor_precio_valido ?? it.menor_precio_valido,
      estado_recomendacion: rec.estado_recomendacion,
      recomendado_proveedor_id: rec.recomendado_proveedor_id,
      empate: rec.empate,
      empatados_ids: rec.recomendados_ids,
      ofertas,
    };
  });

  const cotPresentadas = (matriz?.resumen_proveedores || []).length;
  const cotAptas = (matriz?.resumen_proveedores || [])
    .filter((p) => String(p.validacion_estado || '').toUpperCase() === 'APTO').length;
  const menosDeTresPresentadas = cotPresentadas < 3;
  const menosDeTresAptas = cotAptas < 3;

  const eco = validateEconomiaCuadro({ ...matriz, items });
  const hayEmpateSinResolver = items.some((it) => it.empate
    && !it.proveedor_adjudicado_id);

  return {
    ...matriz,
    items,
    modalidad_adjudicacion: MODALIDAD_ADJUDICACION,
    advertencias: {
      menos_de_tres_presentadas: menosDeTresPresentadas,
      menos_de_tres_aptas: menosDeTresAptas,
      mensaje_menos_de_tres: menosDeTresPresentadas
        ? 'Existen menos de tres cotizaciones válidas. Registre el sustento para continuar.'
        : null,
      cotizaciones_presentadas: cotPresentadas,
      cotizaciones_aptas: cotAptas,
    },
    meta: {
      ...matriz.meta,
      ...eco,
      modalidad_adjudicacion: MODALIDAD_ADJUDICACION,
      puede_seleccionar_ganador: eco.puede_generar || (eco.items_incompletos === 0 && items.length > 0
        && !(matriz.inconsistencias || []).some((i) => ['SIN_ITEMS', 'SOLO_MONTO_GLOBAL'].includes(i.tipo))),
      puede_adjudicar: false,
      hay_empate: items.some((it) => it.empate),
      menos_de_tres_presentadas: menosDeTresPresentadas,
    },
    _hayEmpateSinResolver: hayEmpateSinResolver,
  };
}

function criterioRequiereSustento(criterio, flags = {}) {
  const c = String(criterio || '').toUpperCase();
  if (!c) return true;
  if (c === 'OTRO') return true;
  if (c === 'EMPATE' || c === 'MENOS_DE_TRES_COTIZACIONES' || c === 'DISTINTO_MENOR_PRECIO') return true;
  if (flags.distintoRecomendado) return true;
  if (flags.menosDeTres) return true;
  if (flags.hayEmpate) return true;
  return false;
}

/**
 * Valida payload de adjudicación por ítem.
 * @param {object} matriz — con recomendaciones aplicadas
 * @param {object} payload — selecciones + sustento
 */
export function validarAdjudicacionCuadro(matriz, payload = {}) {
  const errors = [];
  const items = matriz?.items || [];
  const selecciones = Array.isArray(payload.selecciones)
    ? payload.selecciones
    : (items.map((it) => ({
      item_key: it.item_key,
      proveedor_adjudicado_id: it.proveedor_adjudicado_id ?? payload.items_map?.[it.item_key],
    })));

  if (!items.length) errors.push('No existen ítems para adjudicar');
  const hayApto = (matriz?.resumen_proveedores || []).some((p) => p.cumple_tecnicamente);
  if (!hayApto) errors.push('No existe proveedor APTO');

  const eco = validateEconomiaCuadro(matriz);
  if (eco.items_incompletos > 0 || !eco.ok) {
    errors.push('Hay precios incompletos o inconsistencias económicas');
  }

  const selByKey = new Map(selecciones.map((s) => [s.item_key, s.proveedor_adjudicado_id]));
  let distintoRecomendado = false;
  let hayEmpate = false;

  items.forEach((it) => {
    const pid = selByKey.get(it.item_key);
    if (pid == null || pid === '') {
      errors.push(`Falta selección en ítem ${it.item_key}`);
      return;
    }
    const of = (it.ofertas || []).find((o) => Number(o.proveedor_id) === Number(pid));
    if (!of) {
      errors.push(`Proveedor inválido en ítem ${it.item_key}`);
      return;
    }
    if (!of.cumple_tecnicamente) {
      errors.push(`No se puede adjudicar NO_APTO/no apto en ítem ${it.item_key}`);
      return;
    }
    if (of.incompleto || of.precio_total == null) {
      errors.push(`Oferta incompleta en ítem ${it.item_key}`);
      return;
    }
    if (it.empate) hayEmpate = true;
    if (it.recomendado_proveedor_id != null
      && Number(it.recomendado_proveedor_id) !== Number(pid)) {
      distintoRecomendado = true;
    }
  });

  const menosDeTres = !!matriz?.advertencias?.menos_de_tres_presentadas;
  const criterio = String(payload.criterio_seleccion || payload.criterio || '').toUpperCase();
  const sustento = String(payload.sustento_decision || payload.sustento || '').trim();
  const flags = {
    distintoRecomendado,
    menosDeTres,
    hayEmpate,
  };

  if (hayEmpate && criterio !== 'EMPATE') {
    errors.push('Existe empate: seleccione criterio «Empate» y registre el sustento de desempate');
  }
  if (hayEmpate && !sustento) {
    errors.push('Empate: sustento obligatorio');
  }
  if (menosDeTres && !sustento) {
    errors.push('Existen menos de tres cotizaciones válidas. Registre el sustento para continuar.');
  }
  if (distintoRecomendado && !sustento) {
    errors.push('Selección distinta al recomendado exige sustento obligatorio');
  }
  if (criterio === 'OTRO' && !sustento) {
    errors.push('Criterio «Otro» requiere explicación en el sustento');
  }
  if (!criterio) errors.push('Indique el criterio de selección');
  if (!CRITERIOS_SELECCION.includes(criterio)) errors.push('Criterio de selección no válido');
  if (criterioRequiereSustento(criterio, flags) && !sustento) {
    errors.push('Sustento de decisión obligatorio');
  }

  return {
    ok: errors.length === 0,
    errors,
    flags,
    selecciones,
  };
}

/** Aplica selecciones y calcula valor / resumen por proveedor. */
export function aplicarAdjudicacionMatriz(matriz, payload = {}, usuario = '') {
  const check = validarAdjudicacionCuadro(matriz, payload);
  if (!check.ok) {
    const err = new Error(check.errors.join('; '));
    err.code = 'ADJUDICACION_INVALIDA';
    err.errors = check.errors;
    throw err;
  }

  const selByKey = new Map(check.selecciones.map((s) => [s.item_key, Number(s.proveedor_adjudicado_id)]));
  let valorTotal = 0;
  const porProveedor = new Map();

  const items = (matriz.items || []).map((it) => {
    const pid = selByKey.get(it.item_key);
    const of = (it.ofertas || []).find((o) => Number(o.proveedor_id) === pid);
    const valor = of ? Number(of.precio_total) : 0;
    valorTotal += valor;
    if (!porProveedor.has(pid)) {
      porProveedor.set(pid, {
        proveedor_id: pid,
        ruc: of?.ruc || '',
        razon_social: of?.razon_social || '',
        items: 0,
        valor_adjudicado: 0,
      });
    }
    const agg = porProveedor.get(pid);
    agg.items += 1;
    agg.valor_adjudicado = round2(agg.valor_adjudicado + valor);
    return {
      ...it,
      proveedor_adjudicado_id: pid,
      valor_adjudicado_item: valor,
      adjudicado_ruc: of?.ruc || '',
      adjudicado_razon_social: of?.razon_social || '',
    };
  });

  valorTotal = round2(valorTotal);
  const resumen = [...porProveedor.values()].sort((a, b) => b.valor_adjudicado - a.valor_adjudicado);
  const principal = resumen[0] || null;

  const adjudicacion = {
    modalidad: MODALIDAD_ADJUDICACION,
    criterio_seleccion: String(payload.criterio_seleccion || payload.criterio || '').toUpperCase(),
    criterio_label: CRITERIOS_LABEL[String(payload.criterio_seleccion || payload.criterio || '').toUpperCase()] || '',
    sustento_decision: String(payload.sustento_decision || payload.sustento || '').trim(),
    observacion_analista: String(payload.observacion_analista || '').trim(),
    observacion_area_usuaria: String(payload.observacion_area_usuaria || '').trim(),
    fecha_adjudicacion: new Date().toISOString(),
    usuario_adjudicacion: String(usuario || '').slice(0, 150),
    valor_adjudicado: valorTotal,
    proveedor_ganador_id: principal?.proveedor_id ?? null,
    resumen_proveedores: resumen,
    menos_de_tres_presentadas: !!matriz.advertencias?.menos_de_tres_presentadas,
    cotizaciones_presentadas: matriz.advertencias?.cotizaciones_presentadas ?? 0,
    cotizaciones_aptas: matriz.advertencias?.cotizaciones_aptas ?? 0,
  };

  const historial = Array.isArray(matriz.historial_adjudicacion)
    ? [...matriz.historial_adjudicacion]
    : [];
  historial.push({
    at: adjudicacion.fecha_adjudicacion,
    usuario: adjudicacion.usuario_adjudicacion,
    criterio: adjudicacion.criterio_seleccion,
    valor: valorTotal,
    proveedor_ganador_id: adjudicacion.proveedor_ganador_id,
    items: items.map((i) => ({
      item_key: i.item_key,
      proveedor_adjudicado_id: i.proveedor_adjudicado_id,
      valor: i.valor_adjudicado_item,
    })),
  });

  return {
    ...matriz,
    items,
    adjudicacion,
    historial_adjudicacion: historial,
    meta: {
      ...matriz.meta,
      puede_seleccionar_ganador: true,
      adjudicado: true,
      valor_adjudicado: valorTotal,
    },
  };
}

/** Fusiona selección/adjudicación guardada sobre matriz fresca. */
export function mergeAdjudicacionCuadro(matrizFresh, datosGuardados) {
  if (!datosGuardados || typeof datosGuardados !== 'object') return matrizFresh;
  const savedItems = Array.isArray(datosGuardados.items) ? datosGuardados.items : [];
  const byKey = new Map(savedItems.map((it) => [it.item_key, it]));
  const items = (matrizFresh.items || []).map((it) => {
    const prev = byKey.get(it.item_key);
    if (!prev) return it;
    return {
      ...it,
      proveedor_adjudicado_id: prev.proveedor_adjudicado_id ?? it.proveedor_adjudicado_id,
      valor_adjudicado_item: prev.valor_adjudicado_item,
      adjudicado_ruc: prev.adjudicado_ruc,
      adjudicado_razon_social: prev.adjudicado_razon_social,
      ofertas: (it.ofertas || []).map((of) => {
        const po = (prev.ofertas || []).find((x) => x.proveedor_id === of.proveedor_id);
        return {
          ...of,
          observacion_analista: po?.observacion_analista || of.observacion_analista || '',
        };
      }),
    };
  });
  return aplicarRecomendacionesMatriz({
    ...matrizFresh,
    items,
    notas_internas: datosGuardados.notas_internas || matrizFresh.notas_internas || '',
    adjudicacion: datosGuardados.adjudicacion || null,
    historial_adjudicacion: datosGuardados.historial_adjudicacion || [],
    segunda_fuente: datosGuardados.segunda_fuente || matrizFresh.segunda_fuente || [],
    primera_fuente: matrizFresh.primera_fuente,
  });
}
