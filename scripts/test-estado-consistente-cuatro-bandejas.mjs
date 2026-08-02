/**
 * RC8.1B — Consistencia de estado global “Recibido por almacén” en las 4 bandejas:
 * Recepción de Cotizaciones, Validaciones, Cuadro Comparativo y CCP.
 *
 * Falta de BD disponible: los casos que requieren función de lectura DB
 * (loadCcpFlagsBySolicitudIds, listarBandejaCcp) se verifican por análisis
 * estático del código fuente (presencia de la propagación de los 3 campos RC8.1B).
 * La propagación real se prueba con applyCcpFlagsToRow (función pura, sin DB).
 */
import assert from 'assert/strict';
import { readFile } from 'node:fs/promises';

const FIXTURE_BASE = {
  estado_actual: 'RECEPCION_BIENES',
  estado: 'Orden notificada',
  orden_estado: 'ORDEN_NOTIFICADA',
  enviado_proveedor_at: '2026-08-01T12:00:00Z',
  recepcion_estado_global: 'BIEN_RECIBIDO_ALMACEN',
  recepcion_estado_interno: 'RECIBIDO',
  recepcion_bienes_expediente_id: 123,
  workflowSnapshot: { etapaActual: 'VALIDACION_USUARIO' },
  validacion_estado: 'APTO',
  estado_cuadro: 'DERIVADO_CCP',
  codigo_ccp: 'CCP-001',
};

let passed = 0;
function ok(msg) { passed += 1; console.log('OK', msg); }

const run = async () => {
  // ===== Resolvedor central =====
  const { resolveEstadoExpedienteVigente, renderBadgeEstadoVigenteHtml, normalizeEstadoCode } =
    await import('../shared/estadoExpedienteVigente.js');
  const { normalizeEstadoCode: normalizeCat } = await import('../shared/estadoExpedienteCatalog.js');

  // 1. BIEN_RECIBIDO_ALMACEN gana sobre ORDEN_NOTIFICADA
  const v1 = resolveEstadoExpedienteVigente(FIXTURE_BASE);
  assert.equal(v1.codigo, 'BIEN_RECIBIDO_ALMACEN');
  ok('1. BIEN_RECIBIDO_ALMACEN gana sobre ORDEN_NOTIFICADA');

  // 2. Label final
  assert.equal(v1.label, 'Recibido por almacén');
  ok('2. Label = “Recibido por almacén”');

  // 3. workflowSnapshot obsoleto no gana
  assert.notEqual(v1.codigo, 'VALIDACION_USUARIO');
  assert.notEqual(v1.codigo, 'VALIDADO_POR_AU');
  ok('3. workflowSnapshot obsoleto (VALIDACION_USUARIO) no gana');

  // 4. Alias RECIBIDO_POR_ALMACEN
  assert.equal(normalizeEstadoCode('RECIBIDO_POR_ALMACEN'), 'BIEN_RECIBIDO_ALMACEN');
  assert.equal(normalizeCat('RECIBIDO_POR_ALMACEN'), 'BIEN_RECIBIDO_ALMACEN');
  ok('4. Alias RECIBIDO_POR_ALMACEN → BIEN_RECIBIDO_ALMACEN');

  // 5. Alias RECIBIDO_ALMACEN
  assert.equal(normalizeEstadoCode('RECIBIDO_ALMACEN'), 'BIEN_RECIBIDO_ALMACEN');
  assert.equal(normalizeCat('RECIBIDO_ALMACEN'), 'BIEN_RECIBIDO_ALMACEN');
  ok('5. Alias RECIBIDO_ALMACEN → BIEN_RECIBIDO_ALMACEN');

  // 6. Sin evidencia de recepción se conserva ORDEN_NOTIFICADA
  const sinRecepcion = {
    ...FIXTURE_BASE,
    recepcion_estado_global: '',
    recepcion_estado_interno: '',
    recepcion_bienes_expediente_id: null,
  };
  assert.equal(resolveEstadoExpedienteVigente(sinRecepcion).codigo, 'ORDEN_NOTIFICADA');
  ok('6. Sin evidencia de recepción → ORDEN_NOTIFICADA');

  // 7-10. Estados de dominio no alteran el estado global
  assert.equal(resolveEstadoExpedienteVigente(FIXTURE_BASE).codigo, 'BIEN_RECIBIDO_ALMACEN');
  ok('7. validacion_estado=APTO no altera el estado global');
  assert.equal(resolveEstadoExpedienteVigente(FIXTURE_BASE).codigo, 'BIEN_RECIBIDO_ALMACEN');
  ok('8. estado_cuadro=DERIVADO_CCP no altera el estado global');
  assert.equal(resolveEstadoExpedienteVigente(FIXTURE_BASE).codigo, 'BIEN_RECIBIDO_ALMACEN');
  ok('9. codigo_ccp=CCP-001 no altera el estado global');
  const conCot = { ...FIXTURE_BASE, estado: 'COTIZACION_PRESENTADA' };
  assert.equal(resolveEstadoExpedienteVigente(conCot).codigo, 'BIEN_RECIBIDO_ALMACEN');
  ok('10. estado de cotización no altera el estado global');

  // ===== Backend =====

  // 11. loadCcpFlagsBySolicitudIds conserva los tres campos (verificación estática)
  const flagsSrc = await readFile(new URL('../server/lib/ccpEstadoFlags.js', import.meta.url), 'utf8');
  const loadSection = flagsSrc.slice(
    flagsSrc.indexOf('for (const [sid, info] of map.entries())'),
    flagsSrc.indexOf('if (bestOrden) {'),
  );
  assert.ok(loadSection.includes('bestOrden'), 'recorre bestOrden');
  assert.ok(flagsSrc.includes('info.recepcion_estado_global = bestOrden.recepcion_estado_global;'),
    'assigna info.recepcion_estado_global desde bestOrden');
  assert.ok(flagsSrc.includes('info.recepcion_estado_interno = bestOrden.recepcion_estado_interno;'),
    'assigna info.recepcion_estado_interno desde bestOrden');
  assert.ok(flagsSrc.includes('info.recepcion_bienes_expediente_id = bestOrden.recepcion_bienes_expediente_id;'),
    'assigna info.recepcion_bienes_expediente_id desde bestOrden');
  // Preservación de campos existentes
  assert.ok(flagsSrc.includes('info.orden_id = bestOrden.orden_id;'), 'preserva orden_id');
  assert.ok(flagsSrc.includes('info.orden_estado = bestOrden.orden_estado;'), 'preserva orden_estado');
  assert.ok(flagsSrc.includes('info.enviado_proveedor_at = bestOrden.enviado_proveedor_at;'), 'preserva enviado_proveedor_at');
  ok('11. ccpEstadoFlags.loadCcpFlagsBySolicitudIds propaga los 3 campos de recepción (estático)');

  // 12. applyCcpFlagsToRow conserva los tres campos (función pura, real)
  const { applyCcpFlagsToRow } = await import('../server/lib/ccpEstadoFlags.js');
  const infoSint = {
    codigo_ccp: 'CCP-001',
    ccp_activo: true,
    enviada_oppm: false,
    orden_id: 555,
    orden_estado: 'ORDEN_NOTIFICADA',
    enviado_proveedor_at: '2026-08-01T12:00:00Z',
    recibido_proveedor_at: null,
    derivado_ejecucion_at: null,
    orden_resuelta: false,
    expediente_derivado_pago: false,
    recepcion_estado_global: 'BIEN_RECIBIDO_ALMACEN',
    recepcion_estado_interno: 'RECIBIDO',
    recepcion_bienes_expediente_id: 999,
  };
  const rowOut = applyCcpFlagsToRow(
    { id: 1, solicitud_id: 7, estado: 'COTIZACION_PRESENTADA' },
    infoSint,
    {},
  );
  assert.equal(rowOut.recepcion_estado_global, 'BIEN_RECIBIDO_ALMACEN');
  assert.equal(rowOut.recepcion_estado_interno, 'RECIBIDO');
  assert.equal(rowOut.recepcion_bienes_expediente_id, 999);
  assert.equal(rowOut.estado_vigente, 'BIEN_RECIBIDO_ALMACEN');
  assert.equal(rowOut.estado_vigente_label, 'Recibido por almacén');
  assert.equal(rowOut.orden_estado, 'ORDEN_NOTIFICADA');
  ok('12. applyCcpFlagsToRow conserva los tres campos de recepción');

  // 13. listarBandejaCcp devuelve recepcion_estado_global (verificación estática)
  // Nota: Windows usa CRLF; normalizar a LF antes de comparar literales multilínea.
  const ccpSrc = (await readFile(new URL('../server/lib/ccpCertificacion.js', import.meta.url), 'utf8')).replace(/\r/g, '');
  const seedSection = ccpSrc.slice(
    ccpSrc.indexOf('const seed = {'),
    ccpSrc.indexOf('const vigente = resolveEstadoActualExpediente(seed);'),
  );
  assert.ok(seedSection.includes("recepcion_estado_global: ev.recepcion_estado_global || ''"),
    'seed incluye recepcion_estado_global');
  assert.ok(seedSection.includes("recepcion_estado_interno: ev.recepcion_estado_interno || ''"),
    'seed incluye recepcion_estado_interno');
  assert.ok(seedSection.includes('recepcion_bienes_expediente_id: ev.recepcion_bienes_expediente_id ?? null'),
    'seed incluye recepcion_bienes_expediente_id');
  // JSON final
  assert.ok(ccpSrc.includes('// RC8.1B — propagar recepción de bienes en el JSON final.'),
    'out.push incluye comentario RC8.1B');
  assert.ok(ccpSrc.includes("recepcion_estado_global: ev.recepcion_estado_global || '',\n      recepcion_estado_interno: ev.recepcion_estado_interno || '',\n      recepcion_bienes_expediente_id: ev.recepcion_bienes_expediente_id ?? null,"),
    'out.push propaga los 3 campos');
  ok('13. ccpCertificacion.listarBandejaCcp propaga los 3 campos en seed y JSON final (estático)');

  // ===== Frontend render =====
  const { renderBadgeEstadoRecepcionHtml, consolidarExpedientesRecepcion } =
    await import('../src/utils/recepcionCotizacionUtils.js');
  const { renderBadgeEstadoValidacionHtml, estadoExpedienteValidacion, consolidarExpedientesValidacion } =
    await import('../src/utils/validacionesUtils.js');
  const { renderBadgeEstadoCuadroHtml, labelEstadoExpedienteUnificado } =
    await import('../src/utils/cuadroComparativoUtils.js');

  // 14. Recepción de Cotizaciones renderiza “Recibido por almacén”
  const expRecep = {
    ...FIXTURE_BASE,
    solicitud_id: 7,
    solicitud_codigo: 'SC-001',
    estado_recepcion_codigo: '',
    estado_recepcion_label: '',
  };
  const htmlRecep = renderBadgeEstadoRecepcionHtml(expRecep);
  assert.ok(htmlRecep.includes('Recibido por almacén'), htmlRecep);
  // Consolidación de Recepción conserva el campo de recepción
  const consRecep = consolidarExpedientesRecepcion([expRecep]);
  assert.equal(consRecep[0].recepcion_estado_global, 'BIEN_RECIBIDO_ALMACEN');
  assert.ok(renderBadgeEstadoRecepcionHtml(consRecep[0]).includes('Recibido por almacén'));
  ok('14. Recepción de Cotizaciones renderiza “Recibido por almacén”');

  // 15. Validaciones renderiza “Recibido por almacén”
  const expValid = { ...FIXTURE_BASE, solicitud_id: 7, validacion_estado: 'APTO' };
  const htmlValid = renderBadgeEstadoValidacionHtml(expValid);
  assert.ok(htmlValid.includes('Recibido por almacén'), htmlValid);
  const estValid = estadoExpedienteValidacion([expValid], {
    ...expValid,
    recepcion_estado_global: expValid.recepcion_estado_global,
    recepcion_estado_interno: expValid.recepcion_estado_interno,
    recepcion_bienes_expediente_id: expValid.recepcion_bienes_expediente_id,
  });
  assert.equal(estValid.label, 'Recibido por almacén');
  const consValid = consolidarExpedientesValidacion([expValid]);
  assert.equal(consValid[0].recepcion_estado_global, 'BIEN_RECIBIDO_ALMACEN');
  ok('15. Validaciones renderiza “Recibido por almacén”');

  // 16. Cuadro Comparativo renderiza “Recibido por almacén”
  const rowCuadro = { ...FIXTURE_BASE, solicitud_id: 7, estado_cuadro: 'DERIVADO_CCP' };
  const htmlCuadro = renderBadgeEstadoCuadroHtml(rowCuadro);
  assert.ok(htmlCuadro.includes('Recibido por almacén'), htmlCuadro);
  assert.equal(labelEstadoExpedienteUnificado(rowCuadro), 'Recibido por almacén');
  ok('16. Cuadro Comparativo renderiza “Recibido por almacén”');

  // 17. CCP renderiza “Recibido por almacén” (seed de renderEstadoCell de ccpView)
  const ccpSeed = {
    codigo_ccp: 'CCP-001',
    ccp_activo: true,
    estado_cuadro: 'DERIVADO_CCP',
    solicitud_estado: 'EN_CCP',
    consolidacion_estado: '',
    orden_estado: 'ORDEN_NOTIFICADA',
    enviado_proveedor_at: '2026-08-01T12:00:00Z',
    orden_id: 555,
    orden_resuelta: false,
    expediente_derivado_pago: false,
    recepcion_estado_global: 'BIEN_RECIBIDO_ALMACEN',
    recepcion_estado_interno: 'RECIBIDO',
    recepcion_bienes_expediente_id: 123,
  };
  const htmlCcp = renderBadgeEstadoVigenteHtml(ccpSeed);
  assert.ok(htmlCcp.includes('Recibido por almacén'), htmlCcp);
  ok('17. CCP (seed renderEstadoCell) renderiza “Recibido por almacén”');

  // 18. Estado específico de cada dominio sigue disponible por separado
  const rowSep = { ...FIXTURE_BASE, estado_cuadro: 'DERIVADO_CCP', codigo_ccp: 'CCP-001' };
  const vSep = resolveEstadoExpedienteVigente(rowSep);
  assert.equal(vSep.codigo, 'BIEN_RECIBIDO_ALMACEN');
  assert.equal(rowSep.estado_cuadro, 'DERIVADO_CCP');
  assert.equal(rowSep.validacion_estado, 'APTO');
  assert.equal(rowSep.orden_estado, 'ORDEN_NOTIFICADA');
  assert.equal(rowSep.codigo_ccp, 'CCP-001');
  assert.equal(rowSep.estado, 'Orden notificada');
  assert.equal(vSep.estadoInterno?.modulo, 'RECEPCION_BIENES');
  assert.equal(vSep.estadoInterno?.codigo, 'RECIBIDO');
  ok('18. Estados específicos de dominio preservados por separado');

  console.log(`\nOK test-estado-consistente-cuatro-bandejas (${passed}/18 casos)`);
};

run().catch((e) => {
  console.error('ERROR:', e?.stack || e);
  process.exitCode = 1;
});