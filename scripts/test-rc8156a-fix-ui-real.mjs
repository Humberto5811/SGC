/**
 * RC8.15.6A-FIX — Ruta y menú realmente usados por ejecución/presentación.
 *
 * Solo realiza lecturas. No modifica OS 1105 ni ningún dato operativo.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderPresentacionEntregableView,
  ordenMenuItems,
  entregableMenuItems,
} from '../src/views/ejecucion/presentacionEntregableView.js';
import {
  listarBandejaEntregablesServicios,
  getDetalleEntregableServicio,
} from '../server/lib/entregablesServicios.js';
import pool from '../server/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) { passed += 1; console.log(`  ✓ ${message}`); }
  else { failed += 1; console.error(`  ✗ ${message}`); }
}

console.log('\n=== RC8.15.6A-FIX — UI real ejecución/presentación ===\n');

const router = read('src/router.js');
const app = read('src/app.js');
const view = read('src/views/ejecucion/presentacionEntregableView.js');
const routes = read('server/routes/entregablesServicios.js');

ok(
  /from '\.\/views\/ejecucion\/presentacionEntregableView\.js'/.test(router)
    && /'ejecucion\/presentacion': \{ render: renderPresentacionEntregableView, init: initPresentacionEntregableView \}/.test(router)
    && /currentRoute === 'ejecucion\/presentacion'/.test(app)
    && /import\('\.\/views\/ejecucion\/presentacionEntregableView\.js'\)/.test(app),
  'ejecucion/presentacion carga exactamente presentacionEntregableView.js',
);
ok(
  renderPresentacionEntregableView().includes('presentacion-entregables-servicios'),
  'el render exportado crea el contenedor de la vista real',
);

const menuSinRecepcion = entregableMenuItems({
  situacion_codigo: 'PENDIENTE_RECEPCION',
  ultima_recepcion: null,
});
const menuConRecepcion = entregableMenuItems({
  situacion_codigo: 'RECIBIDO',
  ultima_recepcion: { id: 1 },
  puede_gestionar_conformidad: true,
});
ok(
  menuSinRecepcion.some((item) => item.label === 'Registrar entregable')
    && !menuSinRecepcion.some((item) => item.label === 'Registrar recepción'),
  'menú ejecutado sin recepción muestra Registrar entregable',
);
ok(
  menuConRecepcion.some((item) => item.label === 'Modificar entregable')
    && menuConRecepcion.some((item) => item.label === 'Generar Acta de Conformidad'),
  'menú ejecutado con recepción muestra Modificar y acción de acta',
);

const menuOrden = ordenMenuItems({ orden_id: 123 });
ok(
  menuOrden.some((item) => item.act === 'verExpedienteOrden')
    && !menuOrden.some((item) => item.act === 'verExpediente'),
  'la pestaña Órdenes usa una acción distinta de la acción por entregable',
);
ok(
  /ordenesCache\.find\(\(item\) => String\(item\.orden_id\) === String\(id\)\)/.test(view)
    && /openExpedienteOrdenModal\(row\)/.test(view),
  'Ver expediente de Órdenes conserva orden_id hasta el modal de orden',
);
ok(
  /router\.put\('\/:id\/recepcion'/.test(routes),
  'el endpoint PUT de modificación está registrado',
);

try {
  const bandeja = await listarBandejaEntregablesServicios({
    id: 1,
    rol: 'admin',
    alcance_datos: 'INSTITUCIONAL',
  });
  const recibido = bandeja.find((row) => row.ultima_recepcion?.id);
  ok(Boolean(recibido), 'la bandeja real devuelve al menos una recepción vigente');
  if (recibido) {
    const detalle = await getDetalleEntregableServicio(recibido.orden_entrega_id);
    ok(
      Number(detalle.recepcion_vigente?.id) === Number(recibido.ultima_recepcion.id),
      'el detalle real devuelve la misma recepción vigente que la bandeja',
    );
    ok(
      !detalle.documento_vigente
        || Number(detalle.documento_vigente.recepcion_id) === Number(detalle.recepcion_vigente.id),
      'el PDF vigente incluye recepcion_id para la acción Ver',
    );
  }
} catch (error) {
  ok(false, `lectura de integración completada (${error.message})`);
} finally {
  await pool.end();
}

console.log(`\n=== Resultado RC8.15.6A-FIX: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
