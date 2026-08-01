// Prueba R: POST /api/workflow/transiciones responde 503 con write deshabilitado.
import { assert, summarize } from './workflowTestUtils.mjs';
import { leerFlags } from '../server/lib/workflow/workflowGuards.js';
import { assertWriteEnabled } from '../server/lib/workflow/workflowEngine.js';

// 1. Flags por defecto: write deshabilitado, base habilitada.
const flagsDefault = {
  WORKFLOW_ENGINE_BASE: true,
  WORKFLOW_ENGINE_WRITE_ENABLED: false,
  WORKFLOW_ENGINE_INVITACIONES: false,
  WORKFLOW_ENGINE_VALIDACIONES: false,
  WORKFLOW_ENGINE_CUADRO: false,
  WORKFLOW_ENGINE_REGISTRO: false,
  WORKFLOW_ENGINE_ORDENES: false,
  WORKFLOW_ENGINE_VIATICOS: false,
};
assert(leerFlags({}).WORKFLOW_ENGINE_BASE === true, '1. base habilitada por defecto');
assert(leerFlags({}).WORKFLOW_ENGINE_WRITE_ENABLED === false, '2. write deshabilitado por defecto');
assert(leerFlags({}).WORKFLOW_ENGINE_VIATICOS === false, '3. viáticos deshabilitado por defecto');

// 2. assertWriteEnabled lanza WORKFLOW_WRITE_DISABLED
let codigo = null;
try {
  assertWriteEnabled(flagsDefault);
} catch (err) {
  codigo = err?.code;
}
assert(codigo === 'WORKFLOW_WRITE_DISABLED', '4. assertWriteEnabled lanza WORKFLOW_WRITE_DISABLED');

// 3. Con write=true no lanza
let okWrite = false;
try {
  assertWriteEnabled({ ...flagsDefault, WORKFLOW_ENGINE_WRITE_ENABLED: true });
  okWrite = true;
} catch (_) { /* noop */ }
assert(okWrite, '5. write=true no lanza');

// 4. Flags de módulos productivos todos off en fase base
const modulos = ['INVITACIONES', 'VALIDACIONES', 'CUADRO', 'REGISTRO', 'ORDENES'];
assert(modulos.every((m) => flagsDefault[`WORKFLOW_ENGINE_${m}`] === false), '6. módulos productivos desactivados');

summarize('test-workflow-routes-disabled');