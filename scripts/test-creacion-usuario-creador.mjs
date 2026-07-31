/**
 * Prueba realista del origen: centro=CNCC, auth=WVASQUEZ → CREADO/historial con WVASQUEZ.
 */
import { resolveUsuarioCreadorRequerimiento } from '../server/lib/usuarioDisplay.js';
import { initHistorialFromRow, ETAPAS } from '../server/lib/trazabilidad.js';
import { buildMovimientoEntry } from '../server/lib/movimientos.js';
import { getUserAuditName } from '../src/utils/userDisplay.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const centro = 'CNCC';
const auth = { username: 'WVASQUEZ', apellidos: '', nombres: '', nombre: '', centro: 'CNCC' };
const row = {
  responsable: centro,
  usuario_modificacion: getUserAuditName(auth),
  estado: 'Registrado',
  created_at: new Date().toISOString(),
};

const usuarioCreador = resolveUsuarioCreadorRequerimiento(
  row,
  row.usuario_modificacion,
  getUserAuditName(auth),
) || 'Sistema';

const historial = initHistorialFromRow(row, usuarioCreador);
const mov = buildMovimientoEntry({
  fecha: row.created_at,
  accion: 'CREADO',
  etapa: 'REGISTRADO',
  usuario: usuarioCreador,
  responsable: ETAPAS.REGISTRADO.responsable,
});

assert(usuarioCreador === 'WVASQUEZ', `creador=${usuarioCreador}`);
assert(historial[0].usuario === 'WVASQUEZ', `historial=${historial[0].usuario}`);
assert(mov.usuario === 'WVASQUEZ', `mov.usuario=${mov.usuario}`);
assert(row.responsable === 'CNCC', 'centro intacto');
assert(mov.responsable !== 'CNCC', 'mov.responsable no es centro');

console.log(JSON.stringify({
  ok: true,
  centro: row.responsable,
  CREADO_usuario: mov.usuario,
  historial0_usuario: historial[0].usuario,
  responsable_etapa: mov.responsable,
}, null, 2));
