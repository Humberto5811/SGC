// RC8.14.13 — Casos de prueba: presentación de fechas/horas en America/Lima.
// Script de SOLO LECTURA. No modifica datos, no envía SMTP, no confirma recepciones.
// Verifica los formateadores corregidos: formatDateTimeLima (TIMESTAMP) y fmtFecha (DATE).

import { formatDateTimeLima } from '../src/utils/dateTimeLima.js';
import { fmtFechaHora, fmtFecha } from '../src/utils/ordenesUtils.js';

let fallos = 0;

function assertEq(label, actual, esperado) {
  const ok = actual === esperado;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} -> obtenido="${actual}" esperado="${esperado}"`);
  if (!ok) fallos++;
}

console.log('='.repeat(70));
console.log('RC8.14.13 — Casos de prueba de presentación de fechas Lima');
console.log('='.repeat(70));
console.log('TZ del proceso Node en esta ejecución:', Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('(La prueba NO debe depender de que este valor sea America/Lima; ver CASO E)');

// -----------------------------------------------------------------------
// CASO A — timestamp UTC: 2026-08-17T01:45:00.000Z -> 16/08/2026 20:45 Lima
// -----------------------------------------------------------------------
console.log('\n--- CASO A: timestamp UTC 2026-08-17T01:45:00.000Z ---');
assertEq(
  'formatDateTimeLima (style ymd)',
  formatDateTimeLima('2026-08-17T01:45:00.000Z'),
  '2026-08-16 20:45'
);
assertEq(
  'formatDateTimeLima (style dmy)',
  formatDateTimeLima('2026-08-17T01:45:00.000Z', { style: 'dmy' }),
  '16/08/2026 20:45'
);
assertEq(
  'fmtFechaHora (Registro de Órdenes)',
  fmtFechaHora('2026-08-17T01:45:00.000Z'),
  '16/08/2026 20:45'
);

// -----------------------------------------------------------------------
// CASO B — timestamp UTC: 2026-08-17T06:45:33.732Z -> 17/08/2026 01:45 Lima
// Este es el valor real observado en OS 1105 durante RC8.14.12.
// -----------------------------------------------------------------------
console.log('\n--- CASO B: timestamp UTC 2026-08-17T06:45:33.732Z (OS 1105) ---');
assertEq(
  'formatDateTimeLima (style ymd)',
  formatDateTimeLima('2026-08-17T06:45:33.732Z'),
  '2026-08-17 01:45'
);
assertEq(
  'formatDateTimeLima (style dmy)',
  formatDateTimeLima('2026-08-17T06:45:33.732Z', { style: 'dmy' }),
  '17/08/2026 01:45'
);
assertEq(
  'fmtFechaHora (Registro de Órdenes)',
  fmtFechaHora('2026-08-17T06:45:33.732Z'),
  '17/08/2026 01:45'
);
console.log('-> Confirma que la conversión es aritmética de instante (UTC -5h), no una simple sustitución de texto:');
console.log('   Caso A y Caso B difieren en 5h05m33s en UTC y el resultado Lima refleja exactamente esa diferencia.');

// -----------------------------------------------------------------------
// CASO C — DATE: 2026-08-22 -> 22/08/2026 (NUNCA 21/08/2026)
// -----------------------------------------------------------------------
console.log('\n--- CASO C: DATE 2026-08-22 (primer entregable OS 1105) ---');
assertEq('fmtFecha', fmtFecha('2026-08-22'), '22/08/2026');

// -----------------------------------------------------------------------
// CASO D — DATE: 2026-09-21 -> 21/09/2026
// -----------------------------------------------------------------------
console.log('\n--- CASO D: DATE 2026-09-21 (segundo entregable OS 1105) ---');
assertEq('fmtFecha', fmtFecha('2026-09-21'), '21/09/2026');

// -----------------------------------------------------------------------
// CASO E — independencia del timezone del runtime.
// Prueba EMPÍRICA (no solo inspección de código): se relanza este mismo
// cálculo en subprocesos Node con TZ forzado a valores DISTINTOS de
// America/Lima (UTC, Asia/Tokyo). Si formatDateTimeLima/fmtFechaHora son
// correctos, el resultado debe ser IDÉNTICO en los tres casos, porque
// ambos fijan timeZone: 'America/Lima' explícitamente vía Intl.DateTimeFormat
// y nunca dependen de Date.prototype.getHours()/getDate()/etc. (locales).
// -----------------------------------------------------------------------
console.log('\n--- CASO E: independencia del timezone por defecto del proceso ---');
const { execFileSync } = await import('node:child_process');
const instanteAbsoluto = '2026-08-17T06:45:33.732Z';
const evalScript = `
  import('${new URL('../src/utils/dateTimeLima.js', import.meta.url).href}').then(m => {
    console.log(m.formatDateTimeLima('${instanteAbsoluto}', { style: 'dmy' }));
  });
`;
const timezonesAProbar = ['America/Lima', 'UTC', 'Asia/Tokyo'];
const resultadosPorTz = timezonesAProbar.map((tz) => {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', evalScript], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  }).trim();
  console.log(`  Subproceso con TZ=${tz.padEnd(14)} -> formatDateTimeLima(...) = "${out}"`);
  return out;
});
const todosIguales = resultadosPorTz.every((r) => r === resultadosPorTz[0]);
assertEq('Resultado idéntico con TZ=America/Lima, TZ=UTC y TZ=Asia/Tokyo', todosIguales, true);
assertEq('Valor correcto (17/08/2026 01:45) independientemente del TZ del proceso', resultadosPorTz[0], '17/08/2026 01:45');

// -----------------------------------------------------------------------
// Regresión: DATE contractual NO debe pasar por conversión UTC->Lima.
// Si por error se aplicara formatDateTimeLima() a un valor DATE puro
// "2026-08-22" (sin componente horario), Intl.DateTimeFormat lo interpreta
// como medianoche UTC y, al convertir a America/Lima (-5h), retrocede al
// día anterior. Se documenta explícitamente para que quede prohibido mezclar
// ambos formateadores.
// -----------------------------------------------------------------------
console.log('\n--- Documentación de riesgo: NO usar formatDateTimeLima() con DATE puro ---');
const dateBienFormateado = fmtFecha('2026-08-22');
const dateMalFormateadoSiFueraTimestamp = formatDateTimeLima('2026-08-22').split(' ')[0]; // "2026-08-21" (retrocede un día)
console.log(`fmtFecha('2026-08-22')            = "${dateBienFormateado}"  (correcto: DATE puro, sin aritmética TZ)`);
console.log(`formatDateTimeLima('2026-08-22')  = "${formatDateTimeLima('2026-08-22')}"  (INCORRECTO si se usara para DATE: retrocede al día anterior)`);
assertEq('fmtFecha mantiene 22/08/2026 (no retrocede de día)', dateBienFormateado, '22/08/2026');
assertEq('Demostración del riesgo: aplicar el formateador de TIMESTAMP a un DATE sí retrocede de día', dateMalFormateadoSiFueraTimestamp, '2026-08-21');

console.log('\n' + '='.repeat(70));
if (fallos > 0) {
  console.error(`RESULTADO: ${fallos} caso(s) FALLADO(S).`);
  process.exit(1);
} else {
  console.log('RESULTADO: todos los casos OK.');
  process.exit(0);
}
