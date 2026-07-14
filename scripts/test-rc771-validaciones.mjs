/**
 * RC7.7.1 — Pruebas bandeja y autorización Validaciones.
 */
import {
  listarValidacionesExpedientes,
  getValidacionTrabajoDetalle,
  canUserValidateExpediente,
} from '../server/lib/validacionesCotizacion.js';
import { buildValidacionesStats } from '../src/utils/validacionesUtils.js';

const tests = [];
function assert(cond, msg) { tests.push({ ok: !!cond, msg }); }

const adminRows = await listarValidacionesExpedientes('', '', { esAdmin: true });
const stats = buildValidacionesStats(adminRows);

assert(adminRows.length >= 1, 'hay expedientes en bandeja');
assert(stats.total === adminRows.length, 'total = filas bandeja');
assert(stats.total === stats.validado + stats.pendiente + stats.observado, 'total = validado + pendiente + observado');

const pendiente = adminRows.find((r) => r.validacion_estado === 'DERIVADA');
if (pendiente) {
  const respId = pendiente.responsable_id || pendiente.derivacion?.responsable_id;
  const permAsignado = canUserValidateExpediente(
    { validacion_estado: 'DERIVADA', validacion_responsable: pendiente.validacion_responsable, validacion_informe: { derivacion: { responsable_id: respId, responsable_nombre: pendiente.validacion_responsable } } },
    '',
    respId,
    {},
  );
  assert(permAsignado.puedeValidar, 'responsable asignado puede validar');
  assert(permAsignado.puedeVer, 'responsable asignado puede ver');

  const permOtro = canUserValidateExpediente(
    { validacion_estado: 'DERIVADA', validacion_responsable: pendiente.validacion_responsable, validacion_informe: { derivacion: { responsable_id: respId, responsable_nombre: pendiente.validacion_responsable } } },
    'usuario.desconocido',
    99999,
    {},
  );
  assert(!permOtro.puedeValidar, 'usuario diferente no puede validar');
  assert(!permOtro.puedeVer, 'usuario diferente no puede ver');

  const permAdmin = canUserValidateExpediente(
    { validacion_estado: 'DERIVADA', validacion_responsable: pendiente.validacion_responsable, validacion_informe: { derivacion: { responsable_id: respId, responsable_nombre: pendiente.validacion_responsable } } },
    'admin',
    1,
    { esAdmin: true },
  );
  assert(permAdmin.puedeValidar, 'admin puede validar expediente pendiente');

  const detalleAdmin = await getValidacionTrabajoDetalle(pendiente.id, 'admin', '1', { esAdmin: true });
  assert(!!detalleAdmin.formulario_07a, 'admin abre detalle sin error asignación');
  assert(detalleAdmin.puede_editar === true, 'admin puede editar');

  try {
    await getValidacionTrabajoDetalle(pendiente.id, 'usuario.x', '99999', { esAdmin: false });
    assert(false, 'usuario ajeno no debe abrir detalle');
  } catch (err) {
    assert(String(err.message).includes('asignada'), 'bloqueo usuario ajeno');
  }
}

const sinResp = canUserValidateExpediente({ validacion_estado: 'DERIVADA', validacion_informe: {} }, 'x', 1, {});
assert(sinResp.sinAsignacion, 'sin responsable detectado');
assert(!sinResp.puedeValidar, 'sin responsable no valida');

console.log('Stats:', stats);
console.log('Expedientes:', adminRows.map((r) => ({
  id: r.id, estado: r.validacion_estado, resp: r.validacion_responsable,
  puede_validar: r.puede_validar, puede_ver: r.puede_ver,
})));

const failed = tests.filter((t) => !t.ok);
tests.forEach((t) => console.log(t.ok ? 'OK' : 'FAIL', t.msg));
console.log(failed.length ? `\n${failed.length} fallos` : '\nTodos los tests RC7.7.1 pasaron');
process.exit(failed.length ? 1 : 0);
