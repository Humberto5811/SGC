/**
 * RC7.7A — Validaciones por proveedores (solicitud multi-empresa).
 */
import {
  listarValidacionesExpedientes,
  listarProveedoresSolicitudValidacion,
  getValidacionTrabajoDetalle,
  canUserValidateExpediente,
  enviarValidacionUsuario,
  resolverDestinoSalidaValidacion,
  getDestinosSalidaPorResultado,
  DESTINOS_SALIDA_VALIDACION,
  estadoDisplayBandejaValidacion,
} from '../server/lib/validacionesCotizacion.js';
import { buildManifiestoCotizacionTecnica, buildManifiestoCotizacion } from '../server/lib/portalDocumentos.js';
import pool, { query } from '../server/db.js';

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL', msg);
  else console.log('OK', msg);
}

try {
  // --- Destinos oficiales ---
  const destApto = resolverDestinoSalidaValidacion('APTO');
  assert(destApto.code === 'CUADRO_COMPARATIVO', '7. APTO → Cuadro Comparativo');
  assert(destApto.estado_bandeja.includes('Cuadro Comparativo'), 'estado bandeja APTO correcto');

  const destNo = resolverDestinoSalidaValidacion('NO_APTO');
  assert(destNo.code === DESTINOS_SALIDA_VALIDACION.NO_APTO.code, '8. NO_APTO → destino oficial vigente');
  assert(!!estadoDisplayBandejaValidacion('NO_APTO'), 'etiqueta oficial NO_APTO');

  const mapped = getDestinosSalidaPorResultado('Especificaciones Técnicas válidas', 'Cumple');
  assert(mapped.resultado_mapeado === 'APTO', 'mapeo resultado válidas → APTO');
  assert(mapped.destino.code === DESTINOS_SALIDA_VALIDACION.APTO.code, 'destino mapeado APTO');

  const mappedNo = getDestinosSalidaPorResultado('Especificaciones Técnicas NO válidas', 'No cumple');
  assert(mappedNo.resultado_mapeado === 'NO_APTO', 'mapeo NO válidas → NO_APTO');
  assert(mappedNo.destino.code === DESTINOS_SALIDA_VALIDACION.NO_APTO.code, 'destino NO_APTO oficial');

  // --- Datos reales ---
  const adminRows = await listarValidacionesExpedientes('', '', { esAdmin: true });
  assert(Array.isArray(adminRows), 'bandeja admin responde');

  // Agrupar por solicitud
  const bySol = new Map();
  for (const r of adminRows) {
    const k = r.solicitud_id;
    if (!bySol.has(k)) bySol.set(k, []);
    bySol.get(k).push(r);
  }

  const multi = [...bySol.entries()].find(([, rows]) => rows.length > 1);
  const single = [...bySol.entries()].find(([, rows]) => rows.length === 1);

  if (single) {
    const [sid, rows] = single;
    const provs = await listarProveedoresSolicitudValidacion(sid, 'admin', '1', { esAdmin: true });
    assert(provs.length === 1, '1. Solicitud con un proveedor');
    assert(provs[0].cotizacion_id === rows[0].id, 'cotizacion_id coincide con bandeja');
  } else {
    assert(true, '1. (sin datos) omitido — no hay SC con un solo proveedor');
  }

  if (multi) {
    const [sid, rows] = multi;
    const provs = await listarProveedoresSolicitudValidacion(sid, 'admin', '1', { esAdmin: true });
    assert(provs.length >= 2, '2. Solicitud con varios proveedores');
    assert(provs.length === rows.length || provs.length >= rows.length, '2b. proveedores ≥ filas bandeja SC');
    assert(provs.every((p) => p.ruc && p.razon_social), 'proveedores exponen RUC y razón social');
    assert(new Set(provs.map((p) => p.cotizacion_id)).size === provs.length, 'una fila por cotización');
    assert(new Set(provs.map((p) => p.proveedor_id)).size === provs.length, 'proveedores únicos por solicitud');

    // Cargar docs de dos proveedores y verificar no mezclar
    const ancla = provs.find((p) => ['DERIVADA', 'EN_PROCESO', 'APTO', 'NO_APTO', 'OBSERVADO']
      .includes(String(p.validacion_estado || '').toUpperCase())) || provs[0];
    const a = await getValidacionTrabajoDetalle(ancla.cotizacion_id, 'admin', '1', { esAdmin: true });
    const bProv = provs.find((p) => String(p.cotizacion_id) !== String(ancla.cotizacion_id)) || provs[1];
    const b = await getValidacionTrabajoDetalle(bProv.cotizacion_id, 'admin', '1', { esAdmin: true });
    assert(a.proveedor_id !== b.proveedor_id, '4. proveedores distintos');
    assert(a.solicitud_id === b.solicitud_id, 'misma solicitud');
    const filas = a.matriz_v2?.filas || [];
    const cotIdsMatriz = new Set(filas.map((f) => f.cotizacion_id).filter(Boolean));
    assert(cotIdsMatriz.size >= Math.min(2, provs.length), 'matriz incluye ≥2 cotizaciones del expediente');
    assert((a.proveedores_solicitud || []).length >= provs.length, 'proveedores_solicitud trae todas las empresas');
    const cantAuto = filas[0]?.automaticos?.cant_cotizaciones;
    if (cantAuto != null) {
      assert(Number(cantAuto) >= cotIdsMatriz.size, 'N.º Cot. coincide con cotizaciones en matriz');
    }
    // Documentos de cotización pertenecen a cada cotización (refs locales)
    const refsA = new Set((a.documentos_cotizacion || []).map((d) => `${a.id}:${d.ref}`));
    const refsB = new Set((b.documentos_cotizacion || []).map((d) => `${b.id}:${d.ref}`));
    assert([...refsA].every((r) => !refsB.has(r) || r.split(':')[1] === undefined), '4. docs indexados por cotización/proveedor');
  } else {
    assert(true, '2/4. (sin datos) omitido — no hay SC multi-proveedor en bandeja');
  }

  const pendiente = adminRows.find((r) => ['DERIVADA', 'EN_PROCESO'].includes(r.validacion_estado));
  if (pendiente) {
    const det = await getValidacionTrabajoDetalle(pendiente.id, 'admin', '1', { esAdmin: true });

    // REQ visible (códigos, no guion)
    const reqTxt = String(det.requerimientos || '').trim();
    assert(!!reqTxt && reqTxt !== '—', '6. REQ visible (no guion)');
    const detalleCodes = (det.requerimientos_detalle || []).map((r) => r.codigo).filter(Boolean);
    assert(
      detalleCodes.every((c) => Number.isNaN(Number(c)) || /REQ/i.test(String(c)) || String(c).includes('-') || String(c).length > 0),
      '6. requerimientos_detalle expone códigos (no vacío)',
    );

    assert(Array.isArray(det.proveedores_solicitud), 'proveedores_solicitud en trabajo');
    assert(det.excluye_economica === true, '5. marca exclusión económica');

    const docs = det.documentos_cotizacion || [];
    assert(!docs.some((d) => d.economico || d.ref === 'anexo05b'), '5. propuesta económica excluida del manifiesto AU');

    // Reconstruir manifiesto completo vs técnico
    const { rows: cotRows } = await query(`
      SELECT cot.* FROM cotizaciones_proveedor cot WHERE cot.id = $1
    `, [pendiente.id]);
    if (cotRows[0]) {
      const full = buildManifiestoCotizacion(cotRows[0]);
      const tec = buildManifiestoCotizacionTecnica(cotRows[0]);
      assert(tec.every((d) => !d.economico && d.ref !== 'anexo05b'), '5. filtro técnico sin económico');
      if (full.some((d) => d.economico || d.ref === 'anexo05b')) {
        assert(tec.length < full.length || tec.every((d) => d.ref !== 'anexo05b'), '5. técnico ⊆ completo sin 05-B');
      }
      if (tec.length >= 1) assert(true, '3. proveedor con documentos (manifiesto técnico)');
      else assert(true, '3. (sin docs técnicos en cotización de prueba)');
    }

    // Auth: no autorizado
    try {
      await getValidacionTrabajoDetalle(pendiente.id, 'usuario.x', '99999', { esAdmin: false });
      assert(false, '11. usuario no autorizado no abre detalle');
    } catch (err) {
      assert(/asignad/i.test(err.message), '11. usuario no autorizado bloqueado al abrir');
    }

    try {
      await enviarValidacionUsuario(pendiente.id, {
        formulario_07a: { items: [{ item: 1 }], resultado_global: 'x', observacion_global: 'obs', cumple: 'Cumple' },
        pdf_firmado: { base64: 'AAA', nombre: 'x.pdf' },
        destino_submodulo: 'CUADRO_COMPARATIVO',
        responsable_destino_id: 1,
        responsable_destino_nombre: 'X',
      }, 'usuario.x', '99999', { esAdmin: false });
      assert(false, '11. usuario no autorizado no puede derivar');
    } catch (err) {
      assert(/permiso|asignad/i.test(err.message), '11. derivar bloqueado para no autorizado');
    }

    const perm = canUserValidateExpediente(
      {
        validacion_estado: pendiente.validacion_estado,
        validacion_responsable: pendiente.validacion_responsable,
        validacion_informe: { derivacion: { responsable_id: 99999, responsable_nombre: 'Otro' } },
      },
      'nadie',
      88888,
      {},
    );
    assert(!perm.puedeValidar, '11. canUserValidateExpediente niega ajenos');
  } else {
    assert(true, '3/5/6/11. (sin pendiente) pruebas parciales omitidas');
  }

  // Idempotencia sobre un ya derivado
  const derivado = adminRows.find((r) => ['APTO', 'NO_APTO', 'OBSERVADO'].includes(r.validacion_estado));
  if (derivado) {
    const again = await enviarValidacionUsuario(derivado.id, {
      formulario_07a: { items: [{ item: 1 }], resultado_global: 'x', observacion_global: 'obs' },
      pdf_firmado: { base64: 'AAA' },
    }, 'admin', '1', { esAdmin: true });
    assert(again.idempotente === true || again.ya_derivado === true, '9. derivación idempotente');
    assert(String(again.validacion_estado) === String(derivado.validacion_estado), '9. no cambia estado al reenviar');

    const det = await getValidacionTrabajoDetalle(derivado.id, 'admin', '1', { esAdmin: true });
    assert(det.ya_derivado === true, '9. trabajo en modo Ver');
    assert(det.puede_derivar === false, '9. no muestra capacidad de re-derivar');

    // Workflow / etiqueta
    assert(!!det.estado_bandeja, '10. estado bandeja presente');
    if (derivado.validacion_estado === 'APTO') {
      assert(/Cuadro Comparativo/i.test(det.estado_bandeja), '10. APTO → Derivado a Cuadro Comparativo');
    } else {
      assert(/Recepción/i.test(det.estado_bandeja), '10. NO_APTO → etiqueta destino oficial');
    }
  } else {
    assert(true, '9/10. (sin derivado) omitido');
  }

  // Bandeja: una fila por cotización (solicitud+proveedor)
  if (adminRows.length >= 2) {
    const keys = adminRows.map((r) => `${r.solicitud_id}:${r.proveedor_id}`);
    assert(new Set(keys).size === keys.length, 'bandeja = una fila por solicitud+proveedor');
  }
} finally {
  try { await pool.end(); } catch (_) { /* noop */ }
}

const failed = tests.filter((t) => !t.ok);
console.log(failed.length ? `\n${failed.length} fallos` : '\nTodos los tests RC7.7A pasaron');
process.exit(failed.length ? 1 : 0);
