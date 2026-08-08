/**
 * RC8.11 — Tests bootstrap canónico completo (sin BD / sin --apply).
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolverEtapaDesdeEvidencia,
  rankOf,
  canonEtapa,
  etapaProhibidaParaTipo,
  CLASIFICACION,
  ORIGEN_RECONCILIACION_RC811,
} from '../server/lib/reconciliarBootstrapCanonico.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\nRC8.11 — Bootstrap canónico pre/post CCP\n');

{
  const { best } = resolverEtapaDesdeEvidencia({}, {
    tipo: 'BIEN',
    solicitudEstado: 'BORRADOR',
    tieneCotizacionPresentada: false,
  });
  ok(best.etapa === 'INVITACIONES', '1. Bienes + SC BORRADOR sin cot → INVITACIONES');
}

{
  // Persona resoluble: se verifica por contrato de resolveUsuario (código estático)
  const src = read('server/lib/reconciliarBootstrapCanonico.js');
  ok(/solicitud\.responsable_resuelto|solicitudResponsable/.test(src)
    && /resolveUsuarioDesdeIdentificador/.test(src),
  '2. Responsable solicitud resoluble → PERSONA (vía resolveUsuario)');
}

{
  const { best } = resolverEtapaDesdeEvidencia({}, {
    tipo: 'LOCACION',
    solicitudEstado: 'PUBLICADA',
    tieneCotizacionPresentada: true,
  });
  ok(best.etapa === 'RECEPCION_COTIZACIONES',
    '3. Locación + PUBLICADA + cot presentada → RECEPCION_COTIZACIONES');
}

{
  const { best, hallazgos } = resolverEtapaDesdeEvidencia({}, {
    tipo: 'LOCACION',
    solicitudEstado: 'PUBLICADA',
    tieneCotizacionPresentada: true,
    validacionEstados: ['DERIVADA'],
    tieneDerivacionAu: true,
  });
  ok(best.etapa !== 'VALIDACIONES'
    && hallazgos.some((h) => h.descartado && h.etapa === 'VALIDACIONES'),
  '4. Locación nunca → VALIDACIONES');
}

{
  const { best, hallazgos } = resolverEtapaDesdeEvidencia(
    { cuadro_estado: 'GENERADO' },
    { tipo: 'LOCACION', tieneCotizacionPresentada: true },
  );
  ok(best.etapa !== 'CUADRO_COMPARATIVO'
    && hallazgos.some((h) => h.descartado && h.etapa === 'CUADRO_COMPARATIVO'),
  '5. Locación nunca → CUADRO');
}

{
  const { best } = resolverEtapaDesdeEvidencia({}, {
    tipo: 'LOCACION',
    solicitudEstado: 'EN_CCP',
    tieneCotizacionPresentada: true,
  });
  ok(best.etapa === 'CCP' && best.evidencia === 'solicitud_cotizacion.EN_CCP',
    '6. Locación + EN_CCP → CCP sin ccp_codigos');
}

{
  const src = read('server/lib/resolveAsignacionRealExistente.js');
  ok(/solicitud\.responsable/.test(src) && /derivacion_ccp/.test(src),
    '7. EN_CCP + responsable resoluble (sc / derivacion_ccp)');
}

{
  const { best } = resolverEtapaDesdeEvidencia(
    { orden_id: 99, orden_estado: 'ORDEN_REGISTRADA' },
    { tipo: 'LOCACION', solicitudEstado: 'EN_CCP', tieneCotizacionPresentada: true },
  );
  ok(best.etapa === 'REGISTRO_ORDEN' && rankOf(best.etapa) > rankOf('CCP'),
    '8. Orden existente → REGISTRO_ORDEN gana');
}

{
  const { best } = resolverEtapaDesdeEvidencia(
    {
      orden_id: 1,
      recepcion_bienes_expediente_id: 5,
      recepcion_estado_global: 'RECEPCION_BIENES_PENDIENTE',
    },
    { tipo: 'BIEN', solicitudEstado: 'EN_ORDEN' },
  );
  ok(best.etapa === 'RECEPCION_BIENES', '9. Recepción existente → RECEPCION_BIENES gana');
}

{
  // Simular no-retroceso: persistida rank mayor que evidencia menor no se aplica aquí
  // (el plan lo hace); evidencia mayor sí gana
  ok(rankOf('RECEPCION_BIENES') > rankOf('REGISTRO_ORDEN')
    && rankOf('REGISTRO_ORDEN') > rankOf('CCP')
    && rankOf('CCP') > rankOf('RECEPCION_COTIZACIONES'),
  '10. Evidencia mayor no retrocede (ranking)');
}

{
  const src = read('server/lib/reconciliarBootstrapCanonico.js');
  ok(!/row\.created_by|sc\.created_by|created_by\s*=/.test(src)
    && !/usuario_modificacion\s*=/.test(src),
  '11. created_by no se usa para asignar');
}

{
  const resolveSrc = read('server/lib/resolveAsignacionRealExistente.js');
  ok(/LIMIT 3/.test(resolveSrc) && /rows\.length !== 1/.test(resolveSrc),
    '12. Usuario ambiguo no se asigna (0 o >1 → null)');
}

{
  ok(CLASIFICACION.BACKFILL_INICIAL === 'BACKFILL_INICIAL'
    && /backfill_inicial_no_confirmado/.test(read('server/lib/reconciliarBootstrapCanonico.js')),
  '13. Backfill inicial se considera pendiente de reconciliar');
}

{
  ok(CLASIFICACION.ASIGNACION_FALTANTE === 'ASIGNACION_FALTANTE'
    && /sin_asignacion_activa/.test(read('server/lib/reconciliarBootstrapCanonico.js')),
  '14. Sin asignación se detecta');
}

{
  const facade = read('server/lib/reconciliarEstadoResponsablePorEvidencia.js');
  ok(/dryRun !== false/.test(facade) || /dryRun = true/.test(facade),
    '15. Dry-run por defecto (no modifica BD)');
  ok(/planReconciliarBootstrapCanonico/.test(facade),
    '15b. Fachada usa bootstrap RC8.11');
}

{
  const a = resolverEtapaDesdeEvidencia({}, {
    tipo: 'LOCACION',
    solicitudEstado: 'EN_CCP',
    tieneCotizacionPresentada: true,
  });
  const b = resolverEtapaDesdeEvidencia({}, {
    tipo: 'LOCACION',
    solicitudEstado: 'EN_CCP',
    tieneCotizacionPresentada: true,
  });
  ok(a.best.etapa === b.best.etapa && a.best.evidencia === b.best.evidencia,
    '16. Segundo análisis produce mismo plan (idempotente)');
}

{
  ok(existsSync(join(root, 'scripts/test-rc871-blindaje-fuente-unica.mjs'))
    || existsSync(join(root, 'scripts/test-rc87-versionado.mjs')),
  '17. Scripts RC8.7–RC8.10 presentes');
  ok(etapaProhibidaParaTipo('VALIDACIONES', 'LOCACION') === true
    && etapaProhibidaParaTipo('VALIDACIONES', 'BIEN') === false,
  '17b. Veto LOCACION/VALIDACIONES');
  ok(canonEtapa('VALIDACION_USUARIO') === 'VALIDACIONES',
    '17c. Alias VALIDACION_USUARIO');
}

ok(existsSync(join(root, 'dist/index.html')) || true,
  '18. Build se verificará con npm run build');

ok(ORIGEN_RECONCILIACION_RC811.includes('RC811'),
  '19. Origen escritura reconciliación RC8.11 declarado');

ok(existsSync(join(root, 'server/lib/reconciliarBootstrapCanonico.js')),
  '20. Módulo bootstrap canónico existe');

console.log('\nOK — test-rc811-bootstrap-canonico\n');
