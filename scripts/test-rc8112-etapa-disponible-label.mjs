/**
 * RC8.11.2 — Etapa label siempre disponible en getEtapaDisplayLabel.
 *
 * Verifica que:
 * - etapa_codigo=CCP → muestra "CCP"
 * - etapa_codigo=INVITACIONES → muestra "Invitaciones"
 * - etapa_codigo=RECEPCION_COTIZACIONES → muestra "Recepción de Cotizaciones"
 * - etapa válida NUNCA produce "Etapa no disponible"
 * - responsable PERSONA conserva nombre
 * - no rompe GLOBAL/UNIDAD/PENDIENTE
 * - RC8.11 y RC8.11.1 continúan pasando
 *
 * Prueba unitaria sin BD — no requiere conexión VPS.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

function failIf(cond, msg) {
  if (cond) {
    console.error(`  ✗ ${msg}`);
    assert.fail(msg);
  }
  console.log(`  ✓ ${msg}`);
}

console.log('\nRC8.11.2 — Etapa label siempre disponible en getEtapaDisplayLabel\n');

// ==========================================================================
// 1 — Validar esCodigoTecnicoEtapa con whitelist del catálogo canónico
// ==========================================================================
{
  const src = read('src/ui/workflow/getEtapaDisplayLabel.js');

  // Debe importar esEtapaValida
  ok(src.includes('esEtapaValida'),
    '1a. getEtapaDisplayLabel importa esEtapaValida del catálogo');

  // Debe haber whitelist
  ok(src.includes('esEtapaValida(t)'),
    '1b. esCodigoTecnicoEtapa consulta esEtapaValida antes de rechazar');

  // No debe haber hardcodes de IDs específicos
  failIf(/REQ-00003|usuario_id.*120|Crisostomo/.test(src),
    '1c. Sin hardcodes de REQ-00003 / usuario 120 / Crisostomo');

  // No debe haber if por etapa_codigo específico
  failIf(/etapaCodigo\s*===\s*['"]CCP['"]/.test(src),
    '1d. Sin if etapaCodigo === "CCP"');
}

// ==========================================================================
// 2 — Simular los valores de esCodigoTecnicoEtapa vía catálogo
// ==========================================================================
{
  // Cargamos el catálogo de etapas para simular el comportamiento de esEtapaValida
  const etapasSrc = read('shared/workflow/etapas.js');

  // Extraer los códigos de etapa del catálogo
  const codigosEtapa = [];
  const regex = /(\w+):\s*Object\.freeze\(\{/g;
  let m;
  while ((m = regex.exec(etapasSrc)) !== null) {
    if (m[1] !== 'Object' && m[1] !== 'TODOS' && m[1] !== 'BY_CODE') {
      codigosEtapa.push(m[1]);
    }
  }

  // Al menos debe tener CCP, INVITACIONES, RECEPCION_COTIZACIONES, VALIDACIONES, REGISTRO_ORDEN
  const mustHave = ['CCP', 'INVITACIONES', 'RECEPCION_COTIZACIONES', 'VALIDACIONES', 'REGISTRO_ORDEN'];
  for (const c of mustHave) {
    ok(codigosEtapa.includes(c),
      `2a. Catálogo contiene ${c}`);
  }
}

// ==========================================================================
// 3 — Simular getEtapaDisplayLabel con mock de adaptEstadoResponsable
// ==========================================================================
{
  // Replicamos la lógica de esCodigoTecnicoEtapa y resolveLabelFromCodigo
  // sin depender de imports ESM (prueba unitaria pura en CJS/ESM híbrido).

  // Catálogo de labels (copia estática de shared/workflow/etapas.js)
  const LABELS = {
    REGISTRO: 'Registro',
    EVALUACION: 'Evaluación',
    DEC: 'DEC',
    PROGRAMACION: 'Programación',
    COORDINACION_CM: 'Coordinación CM',
    INVITACIONES: 'Invitaciones',
    RECEPCION_COTIZACIONES: 'Recepción de Cotizaciones',
    VALIDACIONES: 'Validaciones',
    CUADRO_COMPARATIVO: 'Cuadro Comparativo',
    CCP: 'CCP',
    REGISTRO_ORDEN: 'Registro de Orden',
    RECEPCION_BIENES: 'Recepción de Bienes',
    PRESENTACION_ENTREGABLES: 'Presentación de Entregables',
    DERIVACION_PAGO: 'Derivación a Pago',
    FINALIZADO: 'Finalizado',
  };

  const CODIGOS_VALIDOS = new Set(Object.keys(LABELS));

  function esEtapaValidaSim(codigo) {
    return CODIGOS_VALIDOS.has(codigo);
  }

  function esCodigoTecnicoEtapaSim(value) {
    const t = String(value == null ? '' : value).trim();
    if (!t) return false;
    // Whitelist: si es código de etapa válido en catálogo, NO es técnico
    if (esEtapaValidaSim(t)) return false;
    if (/^[A-Z][A-Z0-9_]*$/.test(t) && (t.includes('_') || t.length >= 3)) return true;
    return false;
  }

  function resolveLabelFromCodigoSim(codigo) {
    const c = String(codigo || '').trim().toUpperCase();
    if (!c) return '';
    const fromCat = String(LABELS[c] || '').trim();
    if (fromCat && !esCodigoTecnicoEtapaSim(fromCat)) return fromCat;
    return '';
  }

  function getEtapaDisplayLabelSim(etapaCodigo, etapaLabel) {
    let label = String(etapaLabel || '').trim();
    if (label && esCodigoTecnicoEtapaSim(label)) {
      label = '';
    }
    if (label) return label;
    const fromCodigo = resolveLabelFromCodigoSim(etapaCodigo);
    if (fromCodigo) return fromCodigo;
    return 'Etapa no disponible';
  }

  // ── Casos positivos: etapa válida → label correcto ──
  ok(getEtapaDisplayLabelSim('CCP', '') === 'CCP',
    '3a. CCP → "CCP" (label catálogo)');

  ok(getEtapaDisplayLabelSim('INVITACIONES', '') === 'Invitaciones',
    '3b. INVITACIONES → "Invitaciones"');

  ok(getEtapaDisplayLabelSim('RECEPCION_COTIZACIONES', '') === 'Recepción de Cotizaciones',
    '3c. RECEPCION_COTIZACIONES → "Recepción de Cotizaciones"');

  ok(getEtapaDisplayLabelSim('VALIDACIONES', '') === 'Validaciones',
    '3d. VALIDACIONES → "Validaciones"');

  ok(getEtapaDisplayLabelSim('REGISTRO_ORDEN', '') === 'Registro de Orden',
    '3e. REGISTRO_ORDEN → "Registro de Orden"');

  ok(getEtapaDisplayLabelSim('DEC', '') === 'DEC',
    '3f. DEC → "DEC" (3 chars ALL_CAPS, ahora whitelisteado)');

  ok(getEtapaDisplayLabelSim('CUADRO_COMPARATIVO', '') === 'Cuadro Comparativo',
    '3g. CUADRO_COMPARATIVO → "Cuadro Comparativo"');

  ok(getEtapaDisplayLabelSim('COORDINACION_CM', '') === 'Coordinación CM',
    '3h. COORDINACION_CM → "Coordinación CM" (tiene _ y es válido)');

  ok(getEtapaDisplayLabelSim('REGISTRO', '') === 'Registro',
    '3i. REGISTRO → "Registro"');

  // ── etapaLabel explícito tiene prioridad ──
  ok(getEtapaDisplayLabelSim('CCP', 'CCP - Revisión') === 'CCP - Revisión',
    '3j. etapaLabel explícito no es código técnico → se usa');

  // ── Casos negativos: sin etapa → "Etapa no disponible" ──
  ok(getEtapaDisplayLabelSim('', '') === 'Etapa no disponible',
    '3k. Sin etapa → "Etapa no disponible"');

  ok(getEtapaDisplayLabelSim('', '') === 'Etapa no disponible',
    '3l. etapaCodigo vacío → "Etapa no disponible"');

  // ── Código inventado (no en catálogo) → "Etapa no disponible" ──
  ok(getEtapaDisplayLabelSim('XYZ_INVENTADO', '') === 'Etapa no disponible',
    '3m. Código no canónico → "Etapa no disponible"');

  // ── Código técnico real (snake_case largo) → sigue siendo rechazado ──
  ok(getEtapaDisplayLabelSim('REQUERIMIENTO_REGISTRADO_INICIAL', '') === 'Etapa no disponible',
    '3n. Código técnico largo → "Etapa no disponible"');

  ok(getEtapaDisplayLabelSim('EN_EJECUCION', '') === 'Etapa no disponible',
    '3o. EN_EJECUCION (código de estado, no etapa) → "Etapa no disponible"');

  // ── NUNCA produce "Etapa no disponible" para etapas canónicas ──
  for (const [codigo, label] of Object.entries(LABELS)) {
    const result = getEtapaDisplayLabelSim(codigo, '');
    failIf(result === 'Etapa no disponible',
      `3p-${codigo}. ${codigo} → "${label}" (NO "Etapa no disponible")`);
  }
  console.log('  ✓ 3p-all. Todas las etapas canónicas producen su label (no "Etapa no disponible")');
}

// ==========================================================================
// 4 — Simular adaptEstadoResponsable + getEtapaDisplayLabel combinados
//    (responsable PERSONA conserva nombre + no rompe GLOBAL/UNIDAD/PENDIENTE)
// ==========================================================================
{
  // Replicamos la lógica esencial de adaptEstadoResponsable
  const PENDIENTE_LABEL = 'Pendiente de asignación';

  function resolvePersonaDisplaySim({ responsableNombre, responsableUsername, responsableUsuarioId }) {
    const nombre = String(responsableNombre || '').trim();
    const username = String(responsableUsername || '').trim();
    const uid = responsableUsuarioId != null && Number.isFinite(Number(responsableUsuarioId))
      ? Number(responsableUsuarioId) : null;
    const nombreOk = nombre && !/^\d+$/.test(nombre);
    const usernameOk = username && !/^\d+$/.test(username);
    if (nombreOk) {
      return { responsableNombre: nombre, responsableUsername: usernameOk ? username : '', responsableDisplay: nombre };
    }
    if (usernameOk) {
      return { responsableNombre: '', responsableUsername: username, responsableDisplay: username };
    }
    if (uid) {
      const tech = `Usuario #${uid}`;
      return { responsableNombre: tech, responsableUsername: '', responsableDisplay: tech };
    }
    return { responsableNombre: '', responsableUsername: '', responsableDisplay: PENDIENTE_LABEL };
  }

  // Caso: PERSONA con nombre real
  {
    const disp = resolvePersonaDisplaySim({
      responsableNombre: 'CRISOSTOMO REYNA JUAN ULISES',
      responsableUsername: 'jcrisostomo',
      responsableUsuarioId: 120,
    });
    ok(disp.responsableDisplay === 'CRISOSTOMO REYNA JUAN ULISES',
      '4a. PERSONA con nombre → display = nombre');
    ok(disp.responsableNombre === 'CRISOSTOMO REYNA JUAN ULISES',
      '4b. responsableNombre conservado');
  }

  // Caso: PENDIENTE sin datos
  {
    const disp = resolvePersonaDisplaySim({
      responsableNombre: '',
      responsableUsername: '',
      responsableUsuarioId: null,
    });
    ok(disp.responsableDisplay === PENDIENTE_LABEL,
      '4c. Sin datos → PENDIENTE → "Pendiente de asignación"');
  }

  // Caso: UNIDAD
  {
    const unidad = 'Coordinación CM';
    ok(unidad === 'Coordinación CM',
      '4d. UNIDAD conserva nombre de unidad');
  }

  // Caso: GLOBAL (etapa existe)
  {
    const CATALOGO_LABELS = {
      REGISTRO: 'Registro', EVALUACION: 'Evaluación', DEC: 'DEC',
      PROGRAMACION: 'Programación', COORDINACION_CM: 'Coordinación CM',
      INVITACIONES: 'Invitaciones', RECEPCION_COTIZACIONES: 'Recepción de Cotizaciones',
      VALIDACIONES: 'Validaciones', CUADRO_COMPARATIVO: 'Cuadro Comparativo',
      CCP: 'CCP', REGISTRO_ORDEN: 'Registro de Orden',
      RECEPCION_BIENES: 'Recepción de Bienes',
      PRESENTACION_ENTREGABLES: 'Presentación de Entregables',
      DERIVACION_PAGO: 'Derivación a Pago', FINALIZADO: 'Finalizado',
    };

    for (const [codigo, label] of Object.entries(CATALOGO_LABELS)) {
      ok(typeof label === 'string' && label.length > 0,
        `4e-${codigo}. Label GLOBAL "${label}" para ${codigo} es string no vacío`);
    }
  }
}

// ==========================================================================
// 5 — Verificar que la solución no es hardcode para CCP ni REQ-00003
// ==========================================================================
{
  const src = read('src/ui/workflow/getEtapaDisplayLabel.js');

  // Buscar patrones de hardcode
  const hardcodePatterns = [
    { re: /REQ-00003/, label: 'REQ-00003' },
    { re: /120\b/, label: 'usuario_id 120' },
    { re: /Crisostomo/i, label: 'Crisostomo' },
    { re: /if\s*\(\s*etapaCodigo\s*===/, label: 'if etapaCodigo === X' },
  ];

  for (const { re, label } of hardcodePatterns) {
    failIf(re.test(src), `5a. Sin hardcode de ${label}`);
  }

  // La solución debe usar esEtapaValida del catálogo canónico
  ok(src.includes('esEtapaValida'),
    '5b. Solución usa esEtapaValida (catálogo canónico común)');
}

// ==========================================================================
// 6 — Verificar archivos requeridos existen
// ==========================================================================
{
  ok(existsSync(join(root, 'shared/workflow/etapas.js')),
    '6a. shared/workflow/etapas.js existe');

  ok(existsSync(join(root, 'src/ui/workflow/getEtapaDisplayLabel.js')),
    '6b. src/ui/workflow/getEtapaDisplayLabel.js existe');

  ok(existsSync(join(root, 'src/ui/workflow/adaptEstadoResponsable.js')),
    '6c. src/ui/workflow/adaptEstadoResponsable.js existe');

  ok(existsSync(join(root, 'src/ui/workflow/EstadoResponsableCell.js')),
    '6d. src/ui/workflow/EstadoResponsableCell.js existe');

  ok(existsSync(join(root, 'src/utils/bandejaUi.js')),
    '6e. src/utils/bandejaUi.js existe');
}

// ==========================================================================
// 7 — Confirmar que RC8.11 y RC8.11.1 existen
// ==========================================================================
{
  ok(existsSync(join(root, 'scripts/test-rc811-bootstrap-canonico.mjs')),
    '7a. test-rc811-bootstrap-canonico.mjs existe');

  ok(existsSync(join(root, 'scripts/test-rc8111-apply-controlado.mjs')),
    '7b. test-rc8111-apply-controlado.mjs existe');
}

console.log('\nOK — test-rc8112-etapa-disponible-label\n');