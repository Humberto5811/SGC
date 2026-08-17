// RC8.14.12 — Auditoría integral de zona horaria y presentación de fechas del SGC
// Script de SOLO LECTURA. No modifica datos, no escribe, no envía SMTP.
// Ejecuta exclusivamente SELECT. No confirma recepción, no toca OS 1105.

import { query } from '../server/db.js';
import { formatFechaLima, fechaLimaISO } from '../server/lib/workflow/fechaLima.js';

function section(title) {
  console.log('\n' + '='.repeat(70));
  console.log(title);
  console.log('='.repeat(70));
}

async function main() {
  // A1. Timezone de PostgreSQL
  section('A1. TIMEZONE POSTGRESQL');
  const { rows: tzRows } = await query('SHOW timezone;');
  console.log('SHOW timezone ->', tzRows[0]);
  const { rows: nowRows } = await query("SELECT NOW() AS now_pg, NOW() AT TIME ZONE 'UTC' AS now_pg_utc;");
  console.log('NOW() en sesión pg ->', nowRows[0]);

  // A2. Timezone de Node
  section('A2. TIMEZONE NODE');
  console.log('process.env.TZ =', process.env.TZ || '(no definido)');
  console.log('Intl.DateTimeFormat().resolvedOptions().timeZone =', Intl.DateTimeFormat().resolvedOptions().timeZone);
  console.log('new Date().toString() =', new Date().toString());
  console.log('new Date().toISOString() =', new Date().toISOString());

  // A3. Tipos de columnas relevantes
  section('A3. TIPOS DE COLUMNAS (information_schema)');
  const tablasCampos = [
    ['ordenes_contratacion', ['creado_at', 'actualizado_at', 'enviado_proveedor_at', 'recibido_proveedor_at', 'fecha_orden']],
    ['orden_envios_proveedor', ['enviado_at', 'confirmado_at', 'created_at']],
    ['orden_eventos', ['creado_at']],
    ['orden_ejecucion_derivaciones', null],
    ['orden_entregas', ['fecha_maxima', 'fecha_base', 'creado_at', 'actualizado_at']],
  ];
  for (const [tabla, campos] of tablasCampos) {
    const { rows: cols } = await query(
      `SELECT column_name, data_type, datetime_precision
       FROM information_schema.columns
       WHERE table_name = $1
       ORDER BY ordinal_position`,
      [tabla]
    );
    if (cols.length === 0) {
      console.log(`\n[${tabla}] -> tabla no encontrada en information_schema (verificar nombre)`);
      continue;
    }
    console.log(`\n[${tabla}]`);
    for (const c of cols) {
      if (campos && !campos.includes(c.column_name)) continue;
      console.log(`  ${c.column_name.padEnd(28)} ${c.data_type}`);
    }
  }

  // A4. Localización dinámica de OS 1105
  section('A4-A9. LOCALIZACIÓN Y REPRODUCCIÓN OS 1105');
  const { rows: ordenRows } = await query(
    `SELECT id, tipo_orden, numero_orden, anio_orden, estado,
            creado_at, actualizado_at, enviado_proveedor_at, recibido_proveedor_at
     FROM ordenes_contratacion
     WHERE tipo_orden = 'OS' AND numero_orden = '1105' AND anio_orden = 2026`
  );

  if (ordenRows.length === 0) {
    console.log('OS 1105 (anio 2026) NO encontrada en esta base de datos. Esto no es un error del script: la PC local puede no tener esa orden. Continuando auditoría con datos genéricos si existen otras órdenes similares.');
  } else {
    const orden = ordenRows[0];
    console.log('Orden localizada -> id=%s estado=%s', orden.id, orden.estado);
    console.log('creado_at             :', orden.creado_at);
    console.log('actualizado_at         :', orden.actualizado_at);
    console.log('enviado_proveedor_at   :', orden.enviado_proveedor_at);
    console.log('recibido_proveedor_at  :', orden.recibido_proveedor_at);

    const { rows: envios } = await query(
      `SELECT id, intento, estado, enviado_at, confirmado_at, created_at
       FROM orden_envios_proveedor
       WHERE orden_id = $1
       ORDER BY id DESC`,
      [orden.id]
    );
    console.log(`\norden_envios_proveedor (${envios.length} fila(s)):`);
    for (const e of envios) {
      console.log(`  id=${e.id} intento=${e.intento} estado=${e.estado}`);
      console.log(`    enviado_at    :`, e.enviado_at);
      console.log(`    confirmado_at :`, e.confirmado_at);
      console.log(`    created_at    :`, e.created_at);
    }

    // A5-A9: Análisis técnico del timestamp de confirmación
    const confirmado = orden.recibido_proveedor_at || (envios[0] && envios[0].confirmado_at);
    if (confirmado) {
      section('A5-A9. ANÁLISIS TÉCNICO DEL TIMESTAMP DE CONFIRMACIÓN');
      console.log('1. Valor devuelto por PostgreSQL (objeto crudo)              :', confirmado);
      console.log('2. Valor recibido por Node (typeof)                          :', typeof confirmado);
      console.log('3. instanceof Date                                            :', confirmado instanceof Date);
      console.log('4. Representación JS (String(valor))                         :', String(confirmado));
      const d = confirmado instanceof Date ? confirmado : new Date(confirmado);
      console.log('5. toISOString()                                              :', d.toISOString());
      console.log('6. Representación America/Lima (helper fechaLima.js)         :', formatFechaLima(d));
      console.log('   fechaLimaISO() (helper fechaLima.js)                       :', fechaLimaISO(d));
      console.log('   Intl.DateTimeFormat es-PE America/Lima                     :',
        new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'medium' }).format(d));
      console.log('7. Diferencia respecto de UTC                                 : America/Lima = UTC-5 (fijo, sin DST)');

      // Simulación EXACTA del defecto detectado en pantallas (uso de getters locales, sin timeZone explícito)
      const pad = (n) => String(n).padStart(2, '0');
      const buggy = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      console.log('\n   >> Simulación fmtFechaHora() [ordenesUtils.js] con getters locales:', buggy);
      console.log('   >> (Coincide con lo mostrado en pantalla si el runtime del navegador/servidor usa TZ=UTC en vez de America/Lima)');
    } else {
      console.log('OS 1105 aún no tiene recibido_proveedor_at/confirmado_at registrado en esta base.');
    }
  }

  // A10. Verificación del helper existente dateTimeLima (import dinámico, uso client-side normalmente)
  section('A10. HELPER src/utils/dateTimeLima.js (formatDateTimeLima)');
  try {
    const mod = await import('../src/utils/dateTimeLima.js');
    const muestra = new Date().toISOString();
    console.log('Entrada de prueba (UTC ISO):', muestra);
    console.log('formatDateTimeLima(muestra):', mod.formatDateTimeLima(muestra));
    console.log('-> Este helper SÍ usa Intl.DateTimeFormat con timeZone: America/Lima (independiente del TZ del runtime).');
  } catch (err) {
    console.log('No se pudo importar dateTimeLima.js dinámicamente:', err.message);
  }

  // A11/A12: ya cubiertos por inspección estática documentada en el informe (fmtDt / fmtFechaHora).
  section('A11-A12. PORTAL PROVEEDOR / REGISTRO DE ÓRDENES (referencia)');
  console.log('Ver informe: Portal Proveedor usa fmtDt() -> formatCronogramaDisplay() (src/utils/cronogramaDatetime.js).');
  console.log('Ver informe: Registro de Órdenes usa fmtFechaHora() (src/utils/ordenesUtils.js).');
  console.log('Ambos formatean con getters locales de Date (getHours/getDate/...) SIN especificar timeZone America/Lima.');

  // A13. Campos DATE contractuales de OS 1105 (si existe)
  section('A13. CAMPOS DATE CONTRACTUALES (entregables OS 1105)');
  if (ordenRows.length > 0) {
    const orden = ordenRows[0];
    const { rows: entregables } = await query(
      `SELECT id, numero_entrega, estado, fecha_base, fecha_maxima
       FROM orden_entregas
       WHERE orden_id = $1
       ORDER BY numero_entrega, id`,
      [orden.id]
    ).catch(() => ({ rows: [] }));
    if (entregables.length === 0) {
      console.log('No se encontraron filas en orden_entregas para esta orden (o la tabla/nombre difiere). No se modifica nada.');
    } else {
      for (const e of entregables) {
        console.log(`  entrega #${e.numero_entrega} id=${e.id} estado=${e.estado} fecha_base=${e.fecha_base} fecha_maxima=${e.fecha_maxima}`);
      }
      console.log('-> Estos campos son DATE puro; no deben pasar por conversión UTC->Lima (podría restar un día indebidamente).');
    }
  } else {
    console.log('Omitido: OS 1105 no encontrada en esta base de datos.');
  }

  // A14. Confirmación de que este script no escribe nada
  section('A14. GARANTÍA DE SOLO LECTURA');
  console.log('Este script únicamente ejecutó sentencias SELECT/SHOW. No se ejecutó ningún UPDATE/INSERT/DELETE/TRUNCATE.');

  section('FIN DE AUDITORÍA RC8.14.12');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error durante la auditoría (solo lectura):', err);
  process.exit(1);
});
