/**
 * RC8.17.8H6-D10-E3-C2.5B — Visibilidad bandeja Coordinador CM (ERV vs documental).
 * Sin escritura a BD.
 */
import {
  BANDEJA_ESTADOS_POR_ROL,
  ESTADO_GLOBAL_BANDEJA_COORDINADOR_CM,
  esEstadoDocumentalBandejaCoordinadorCm,
  esVisibleFilaBandejaCoordinadorCm,
} from '../shared/cuadroComparativoRol.js';
import { filtrarBandejaPorRolRevision } from '../server/lib/cuadroComparativo.js';
import { accionesDisponiblesRevision } from '../server/lib/cuadroComparativoRevision.js';

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.17.8H6-D10-E3-C2.5B Bandeja Coordinador CM ===\n');

assert(
  BANDEJA_ESTADOS_POR_ROL.COORDINADOR_CM.includes(ESTADO_GLOBAL_BANDEJA_COORDINADOR_CM),
  'allow-list Coord incluye CUADRO_EN_COORDINACION_CM',
);
assert(
  esEstadoDocumentalBandejaCoordinadorCm('PENDIENTE_COORDINADOR'),
  'documental PENDIENTE_COORDINADOR elegible',
);
assert(
  !esEstadoDocumentalBandejaCoordinadorCm('PENDIENTE_DEC'),
  'documental PENDIENTE_DEC no elegible Coord',
);

/** Caso VPS: SC-00001-2026-INS, Inv. 7, cuadro id 2 v3 */
const casoVps = {
  solicitud_id: 100,
  solicitud_codigo: 'SC-00001-2026-INS',
  nro_invitacion: 7,
  cuadro_id: 2,
  version: 3,
  estado_cuadro: ESTADO_GLOBAL_BANDEJA_COORDINADOR_CM,
  estado_cuadro_documental: 'PENDIENTE_COORDINADOR',
  estado_db: 'PENDIENTE_COORDINADOR',
};

const mezclaInvitaciones = [
  casoVps,
  {
    solicitud_id: 100,
    solicitud_codigo: 'SC-00001-2026-INS',
    nro_invitacion: 6,
    estado_cuadro: ESTADO_GLOBAL_BANDEJA_COORDINADOR_CM,
    estado_cuadro_documental: 'PENDIENTE_DEC',
    estado_db: 'PENDIENTE_DEC',
  },
  {
    solicitud_id: 200,
    estado_cuadro: 'CUADRO_BORRADOR',
  },
  {
    solicitud_id: 201,
    estado_cuadro: 'CUADRO_EN_DEC',
    estado_cuadro_documental: 'PENDIENTE_DEC',
  },
  {
    solicitud_id: 202,
    estado_cuadro: ESTADO_GLOBAL_BANDEJA_COORDINADOR_CM,
    estado_cuadro_documental: 'OBSERVADO_COORDINADOR',
  },
];

const resultado = filtrarBandejaPorRolRevision(mezclaInvitaciones, { cargo: 'Coordinador CM' });
assert(resultado.rol === 'COORDINADOR_CM', 'rol resuelto COORDINADOR_CM');
assert(Array.isArray(resultado.data), 'resultado expone arreglo data');
assert(
  resultado.data.some(
    (r) => r.solicitud_codigo === 'SC-00001-2026-INS'
      && r.nro_invitacion === 7
      && r.cuadro_id === 2,
  ),
  'caso VPS visible en resultado.data',
);
assert(
  !resultado.data.some((r) => r.nro_invitacion === 6),
  'invitación 6 (DEC documental) no mezclada como pendiente Coord',
);
assert(
  !resultado.data.some((r) => r.solicitud_id === 201),
  'CUADRO_EN_DEC no visible para Coord',
);
assert(
  !resultado.data.some((r) => r.solicitud_id === 202),
  'OBSERVADO_COORDINADOR bajo global CM no visible para Coord',
);

const accionesVps = resultado.data.find((r) => r.nro_invitacion === 7)?.acciones_revision || [];
assert(
  accionesVps.some((a) => a.accion === 'CONFORMIDAD_COORDINADOR' || a.accion === 'DERIVAR_DEC'),
  'acciones revisión usan estado documental (no vacías por global ERV)',
);

const bDec = filtrarBandejaPorRolRevision(
  [{ solicitud_id: 9, estado_cuadro: 'PENDIENTE_DEC' }],
  { cargo: 'Especialista DEC' },
);
assert(bDec.data.length === 1, 'DEC sin cambio en filtro');

const filaVpsAn = {
  ...casoVps,
  solo_lectura: true,
  puede_elaborar: false,
  en_revision_externa: true,
};
const bAn = filtrarBandejaPorRolRevision(
  [
    filaVpsAn,
    { solicitud_id: 300, estado_cuadro: 'CUADRO_COMPARATIVO_APROBADO', solo_lectura: true, puede_elaborar: false },
  ],
  { cargo: 'Analista' },
);
assert(bAn.data.length === 2, 'Analista ve alias ERV VPS + histórico C2.3');

assert(
  accionesDisponiblesRevision('PENDIENTE_COORDINADOR', 'COORDINADOR_CM').length > 0,
  'transiciones Coord intactas desde PENDIENTE_COORDINADOR',
);

const allowed = new Set(BANDEJA_ESTADOS_POR_ROL.COORDINADOR_CM.map((s) => s.toUpperCase()));
assert(
  esVisibleFilaBandejaCoordinadorCm(casoVps, allowed),
  'helper esVisibleFilaBandejaCoordinadorCm acepta caso VPS',
);

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) process.exit(1);
