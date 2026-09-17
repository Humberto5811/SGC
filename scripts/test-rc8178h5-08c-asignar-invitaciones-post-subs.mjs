/**
 * RC8.17.8H5-08C / H5-09B — CM→I (APROBADA) vs reasignación I→I (ASIGNADA).
 */
import assert from 'node:assert/strict';
import { getTransition } from '../shared/workflow/transiciones.js';
import {
  resolverEventoDerivarHaciaInvitaciones,
  buildClientRequestIdDerivarActos,
  WHERE_INGRESO_HISTORICO_CONT_MENORES,
  derivarActos,
} from '../server/lib/actosPreparatorios.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H5-08C/09B — Derivar hacia Invitaciones ===\n');

const ingreso = resolverEventoDerivarHaciaInvitaciones('COORDINACION_CM');
ok(ingreso.evento === 'COORDINACION_CM_APROBADA', 'A1 etapa CM → COORDINACION_CM_APROBADA');
ok(ingreso.modo === 'cm_a_invitaciones', 'A2 modo cm_a_invitaciones');
const trIngreso = getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: 'COORDINACION_CM',
  eventoCodigo: 'COORDINACION_CM_APROBADA',
});
ok(trIngreso?.etapa_destino === 'INVITACIONES' && trIngreso.cambia_ubicacion === true, 'A3 matriz CM→I APROBADA');
ok(
  buildClientRequestIdDerivarActos(47, { evento: 'COORDINACION_CM_APROBADA' }) === 'actos-derivar:cm-invitaciones:47',
  'A4 client_request_id CM→I estable',
);

const reasig = resolverEventoDerivarHaciaInvitaciones('INVITACIONES');
ok(reasig.evento === 'COORDINACION_CM_ASIGNADA', 'B1 ERV INVITACIONES → ASIGNADA');
ok(reasig.modo === 'reasignacion_invitaciones', 'B2 modo reasignacion_invitaciones');

const trAsign = getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: 'INVITACIONES',
  eventoCodigo: 'COORDINACION_CM_ASIGNADA',
});
ok(trAsign?.etapa_destino === 'INVITACIONES', 'C1 destino sigue INVITACIONES');
ok(trAsign?.cambia_ubicacion === false, 'C2 cambia_ubicacion false en ASIGNADA I→I');

ok(reasig.evento !== 'COORDINACION_CM_APROBADA', 'D1 reasignación no usa APROBADA');
ok(/PROGRAMACION_APROBADA/.test(WHERE_INGRESO_HISTORICO_CONT_MENORES), 'E1 WHERE histórico acepta PROGRAMACION_APROBADA');
ok(typeof derivarActos === 'function', 'F1 derivarActos exportado');

const crq120 = buildClientRequestIdDerivarActos(47, {
  evento: 'COORDINACION_CM_ASIGNADA',
  usuarioDestinoId: 120,
});
ok(crq120 === 'actos-derivar:asignar-i:47:120', 'G1 clave ASIGNADA por REQ+persona');
ok(
  buildClientRequestIdDerivarActos(47, { evento: 'COORDINACION_CM_APROBADA' }) !== crq120,
  'G2 CM→I vs ASIGNADA claves distintas',
);

console.log('\n=== RC8.17.8H5-08C/09B OK ===\n');
