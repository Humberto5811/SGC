/**
 * RC8.17.8H6-D10-E3-C2.5D — Analista: permanencia con alias ERV + solo lectura.
 */
import {
  ESTADO_GLOBAL_BANDEJA_COORDINADOR_CM,
  resolveEstadoCuadroPoliticaBandeja,
  esEstadoBandejaHistoricoCuadroAnalista,
} from '../shared/cuadroComparativoRol.js';
import { filtrarBandejaPorRolRevision, ESTADOS_CUADRO } from '../server/lib/cuadroComparativo.js';
import { accionesDisponiblesRevision } from '../server/lib/cuadroComparativoRevision.js';
import { cuadroComparativoMenuItems } from '../src/utils/cuadroComparativoUtils.js';

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

function politicasBandeja(estadoCode, estadoDocumental) {
  const estPolitica = resolveEstadoCuadroPoliticaBandeja({
    estado_cuadro: estadoCode,
    estado_cuadro_documental: estadoDocumental,
  });
  return {
    estPolitica,
    puede_elaborar: estPolitica !== ESTADOS_CUADRO.ANULADO
      && !esEstadoBandejaHistoricoCuadroAnalista(estadoCode)
      && ![
        ESTADOS_CUADRO.PENDIENTE_COORDINADOR,
        ESTADOS_CUADRO.FIRMADO_COORDINADOR,
        ESTADOS_CUADRO.PENDIENTE_DEC,
        ESTADOS_CUADRO.DERIVADO_CCP,
        ESTADOS_CUADRO.CCP_REGISTRADA,
        ESTADOS_CUADRO.FIRMADO,
      ].includes(estPolitica),
    solo_lectura: esEstadoBandejaHistoricoCuadroAnalista(estadoCode)
      || [
        ESTADOS_CUADRO.PENDIENTE_COORDINADOR,
        ESTADOS_CUADRO.FIRMADO_COORDINADOR,
        ESTADOS_CUADRO.PENDIENTE_DEC,
      ].includes(estPolitica),
    en_revision_externa: [
      ESTADOS_CUADRO.PENDIENTE_COORDINADOR,
      ESTADOS_CUADRO.FIRMADO_COORDINADOR,
      ESTADOS_CUADRO.PENDIENTE_DEC,
    ].includes(estPolitica),
  };
}

console.log('\n=== RC8.17.8H6-D10-E3-C2.5D Analista alias ERV ===\n');

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

const pol = politicasBandeja(casoVps.estado_cuadro, casoVps.estado_cuadro_documental);
const filaVps = { ...casoVps, ...pol, accion_cuadro_label: 'Ver cuadro' };

const bAn = filtrarBandejaPorRolRevision([filaVps], { cargo: 'Especialista Contrataciones' });
assert(bAn.data.length === 1, 'Analista data.length = 1 (caso VPS)');
assert(bAn.data[0].solo_lectura === true, 'Analista solo_lectura = true');
assert(bAn.data[0].puede_elaborar === false, 'Analista puede_elaborar = false');
assert((bAn.data[0].acciones_revision || []).length === 0, 'Analista sin acciones de modificación en filtro');

const menu = cuadroComparativoMenuItems(
  { ...filaVps, rol_revision: 'ANALISTA' },
  { rol: 'ANALISTA' },
);
assert(!menu.some((m) => m.act === 'elaborarCuadro' && !m.disabled), 'menú sin elaborar habilitado');
assert(menu.every((m) => ['verCuadro', 'descargarCuadro', 'trazabilidadCuadro'].includes(m.act)),
  'menú solo Ver/Descargar/Trazabilidad en revisión externa');

const bCoord = filtrarBandejaPorRolRevision([casoVps], { cargo: 'Coordinador CM' });
assert(bCoord.data.length === 1, 'Coord data.length = 1 mismo caso');
assert(
  (bCoord.data[0].acciones_revision || []).some((a) => a.accion === 'CONFORMIDAD_COORDINADOR' || a.accion === 'DERIVAR_DEC'),
  'Coord conserva acciones de revisión',
);

assert(
  accionesDisponiblesRevision('PENDIENTE_COORDINADOR', 'ANALISTA').length === 0,
  'catálogo: Analista no transita desde PENDIENTE_COORDINADOR',
);
assert(
  accionesDisponiblesRevision('CUADRO_BORRADOR', 'ANALISTA').some((a) => a.accion === 'DERIVAR_COORDINADOR'),
  'catálogo: derivar a Coord sigue desde elaboración',
);

const decAlias = {
  solicitud_id: 101,
  nro_invitacion: 7,
  estado_cuadro: 'CUADRO_EN_DEC',
  estado_cuadro_documental: 'PENDIENTE_DEC',
};
const bAnDec = filtrarBandejaPorRolRevision([decAlias], { cargo: 'Analista' });
const bDec = filtrarBandejaPorRolRevision([decAlias], { cargo: 'Especialista DEC' });
assert(bAnDec.data.length === 1, 'Analista ve alias CUADRO_EN_DEC + PENDIENTE_DEC');
assert(bDec.data.length === 1, 'DEC ve alias CUADRO_EN_DEC + PENDIENTE_DEC');

const inv6 = {
  solicitud_id: 100,
  nro_invitacion: 6,
  estado_cuadro: ESTADO_GLOBAL_BANDEJA_COORDINADOR_CM,
  estado_cuadro_documental: 'PENDIENTE_DEC',
};
const mezcla = [casoVps, inv6];
const fAn = filtrarBandejaPorRolRevision(mezcla, { cargo: 'Analista' });
assert(fAn.data.length === 2, 'invitaciones 6 y 7 independientes para Analista');
assert(fAn.data.every((r) => r.nro_invitacion === 7 || r.nro_invitacion === 6), 'sin mezclar claves de ronda');

const ccpHist = {
  solicitud_id: 300,
  estado_cuadro: 'CCP_REGISTRADA',
  estado_cuadro_documental: 'DERIVADO_CCP',
  solo_lectura: true,
  puede_elaborar: false,
};
const fCcp = filtrarBandejaPorRolRevision([ccpHist], { cargo: 'Analista' });
assert(fCcp.data.length === 1 && (fCcp.data[0].acciones_revision || []).length === 0,
  'CCP histórico sin acciones indebidas');

const obsAnalista = {
  solicitud_id: 400,
  estado_cuadro: ESTADO_GLOBAL_BANDEJA_COORDINADOR_CM,
  estado_cuadro_documental: 'OBSERVADO_COORDINADOR',
  solo_lectura: false,
  puede_elaborar: true,
  en_revision_externa: false,
};
const fObs = filtrarBandejaPorRolRevision([obsAnalista], { cargo: 'Analista' });
assert(fObs.data.length === 1, 'Analista ve OBSERVADO_COORDINADOR bajo alias CM');
assert(
  (fObs.data[0].acciones_revision || []).some((a) => a.accion === 'DERIVAR_COORDINADOR'),
  'Analista puede re-derivar tras observación (no es revisión externa)',
);

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) process.exit(1);
