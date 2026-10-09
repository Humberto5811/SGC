/**
 * RC8.17.8H6-D10-E3-C2.3 — Permanencia histórica Cuadro Comparativo (Analista).
 * Sin escritura a BD.
 */
import {
  BANDEJA_ESTADOS_POR_ROL,
  esEstadoBandejaHistoricoCuadroAnalista,
  ESTADOS_BANDEJA_HISTORICO_CUADRO_ANALISTA,
} from '../shared/cuadroComparativoRol.js';
import { filtrarBandejaPorRolRevision } from '../server/lib/cuadroComparativo.js';
import { accionesDisponiblesRevision } from '../server/lib/cuadroComparativoRevision.js';
import {
  cuadroComparativoMenuItems,
  labelCuadroEstado,
} from '../src/utils/cuadroComparativoUtils.js';

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

console.log('\n=== RC8.17.8H6-D10-E3-C2.3 Bandeja histórico Analista ===\n');

assert(
  BANDEJA_ESTADOS_POR_ROL.ANALISTA.includes('CUADRO_COMPARATIVO_APROBADO'),
  'Analista allow-list incluye CUADRO_COMPARATIVO_APROBADO',
);

const casoVps = {
  solicitud_id: 100,
  solicitud_codigo: 'SC-00001-2026-INS',
  nro_invitacion: 7,
  estado_cuadro: 'CUADRO_COMPARATIVO_APROBADO',
  cuadro_id: 99,
  version: 3,
  puede_elaborar: false,
  solo_lectura: true,
  accion_cuadro_label: 'Ver cuadro',
};

const sample = [
  casoVps,
  { solicitud_id: 200, estado_cuadro: 'CUADRO_BORRADOR' },
  { solicitud_id: 201, estado_cuadro: 'CCP_REGISTRADA', cuadro_id: 1, solo_lectura: true, puede_elaborar: false },
  { solicitud_id: 202, estado_cuadro: 'REGISTRO_ORDENES', cuadro_id: 1, solo_lectura: true, puede_elaborar: false },
  { solicitud_id: 203, estado_cuadro: 'EN_EJECUCION', cuadro_id: 1, solo_lectura: true, puede_elaborar: false },
];

const bAn = filtrarBandejaPorRolRevision(sample, { cargo: 'Especialista Contrataciones' });
assert(bAn.rol === 'ANALISTA', 'rol resuelto ANALISTA');
assert(bAn.data.length === sample.length, 'Analista ve todos los expedientes históricos + borrador');
assert(
  bAn.data.some((r) => r.solicitud_codigo === 'SC-00001-2026-INS' && r.nro_invitacion === 7),
  'caso VPS SC-00001 Inv.7 permanece en bandeja',
);

for (const code of ESTADOS_BANDEJA_HISTORICO_CUADRO_ANALISTA) {
  const solo = [{ solicitud_id: code, estado_cuadro: code }];
  const f = filtrarBandejaPorRolRevision(solo, { cargo: 'Analista' });
  assert(f.data.length === 1, `filtrar incluye histórico ${code}`);
}

assert(
  BANDEJA_ESTADOS_POR_ROL.COORDINADOR_CM.includes('CUADRO_EN_COORDINACION_CM'),
  'Coord CM incluye global ERV CUADRO_EN_COORDINACION_CM (C2.5B)',
);
assert(
  !BANDEJA_ESTADOS_POR_ROL.CCP.includes('CUADRO_COMPARATIVO_APROBADO'),
  'CCP no gana visibilidad histórica global',
);

assert(
  accionesDisponiblesRevision('CUADRO_COMPARATIVO_APROBADO', 'ANALISTA').length === 0,
  'sin transiciones revisión en CUADRO_COMPARATIVO_APROBADO',
);

const menu = cuadroComparativoMenuItems(
  { ...casoVps, rol_revision: 'ANALISTA' },
  { rol: 'ANALISTA' },
);
assert(
  menu.find((m) => m.act === 'elaborarCuadro')?.icon === 'bi-eye',
  'menú Analista: abrir cuadro en modo ver (no elaborar)',
);
assert(
  menu.find((m) => m.act === 'elaborarCuadro')?.disabled === true,
  'elaborarCuadro deshabilitado en histórico',
);
assert(!menu.some((m) => m.act === 'adjudicar' || m.label?.includes('Firma')), 'sin acciones de firma/adjudicación');

assert(
  labelCuadroEstado('CUADRO_COMPARATIVO_APROBADO') === 'C.C. aprobado',
  'etiqueta visible conserva significado de negocio',
);

assert(esEstadoBandejaHistoricoCuadroAnalista('CUADRO_COMPARATIVO_APROBADO'), 'helper histórico');
assert(!esEstadoBandejaHistoricoCuadroAnalista('CUADRO_BORRADOR'), 'borrador no es histórico post-cuadro');

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} passed`);
if (failed.length) {
  process.exit(1);
}
