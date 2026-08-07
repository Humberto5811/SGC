import 'dotenv/config';
import { query } from '../server/db.js';
import { getEstadoResponsableCanonico } from '../server/lib/estadoResponsableCanonico.js';
import { enrichReqRow, getResponsableVigenteLabel, ETAPA_LABELS } from '../src/utils/trazabilidad.js';
import { getResponsableRol } from '../src/utils/bandejaUi.js';

const { rows: reqs } = await query(
  `SELECT id, codigo, estado_actual, payload FROM requerimientos WHERE codigo='REQ-00001'`,
);
const id = reqs[0].id;
const canon = await getEstadoResponsableCanonico({ requerimientoIds: [id] });
const can = canon.get(id);
console.log('CANON', can);

const { rows: vig } = await query(
  `SELECT * FROM expediente_estado_vigente WHERE requerimiento_id=$1`,
  [id],
);
console.log('VIG_ROW', vig[0]);

const row = { ...reqs[0], estado_responsable_vigente: can };
const enriched = enrichReqRow(row);
console.log('enrich.estado_actual', enriched.estado_actual);
console.log('enrich.estadoActualTexto', enriched.estadoActualTexto);
console.log('enrich.sub_modulo_actual', enriched.sub_modulo_actual);
console.log('enrich.subModuloActual', enriched.subModuloActual);
console.log('getResponsableRol', getResponsableRol(enriched));
console.log('ETAPA_LABELS', ETAPA_LABELS[enriched.estado_actual], ETAPA_LABELS.EN_EJECUCION, ETAPA_LABELS.RECEPCION_BIENES);

process.exit(0);
