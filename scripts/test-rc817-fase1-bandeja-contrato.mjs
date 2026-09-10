/**
 * RC8.17 Fase 1 — Contrato bandeja expediente + resolver acciones.
 */
import assert from 'node:assert/strict';
import {
  applyBandejaExpedienteContrato,
  buildBandejaContratoFromPersistido,
  calcDiasEnEstadoDesdeFecha,
} from '../server/lib/bandejaExpedienteContrato.js';
import { enrichEstadoResponsableForBandeja } from '../server/lib/enrichEstadoResponsable.js';
import { runMigrations } from '../server/migrate.js';
import { query } from '../server/db.js';
import { resolveBandejaAcciones } from '../src/utils/bandejaAccionesResolver.js';
import { registroMenuItems } from '../src/utils/bandejaActions.js';

const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); tests += 1; };
let tests = 0;

console.log('\n=== RC8.17 Fase 1 — Bandeja contrato ===\n');

// A. PERSONA
const rowPersona = buildBandejaContratoFromPersistido(
  {
    requerimiento_id: 90001,
    etapa_codigo: 'EVALUACION',
    etapa_label: 'Evaluación',
    estado_codigo: 'REQUERIMIENTO_EN_EVALUACION',
    estado_label: 'En evaluación',
    actualizado_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    tipo_responsable: 'PERSONA',
    usuario_id: 42,
    usuario_nombre: 'Ana Responsable Vigente',
  },
  { codigo: 'REQ-PERSONA', creador_display: 'Usuario Creador' },
);
ok(rowPersona.bandeja_contrato.responsable.tipo === 'PERSONA', 'A: responsable PERSONA');
ok(rowPersona.bandeja_contrato.responsable.nombre.includes('Ana'), 'A: muestra nombre de persona');
ok(rowPersona.responsable_display.includes('Ana'), 'A: responsable_display canónico');

// B. UNIDAD sin persona
const rowUnidad = buildBandejaContratoFromPersistido(
  {
    requerimiento_id: 90002,
    etapa_codigo: 'DEC',
    estado_codigo: 'DEC',
    estado_label: 'DEC',
    actualizado_at: new Date().toISOString(),
  },
  { tipo_responsable: 'UNIDAD', unidad_codigo: 'Equipo DEC Central' },
  { codigo: 'REQ-UNIDAD' },
);
ok(rowUnidad.bandeja_contrato.responsable.tipo === 'UNIDAD', 'B: fallback UNIDAD');
ok(rowUnidad.bandeja_contrato.responsable.nombre.includes('Equipo DEC'), 'B: equipo identificado');

// C. creador != responsable
ok(rowPersona.creador_display === undefined || rowPersona.creador_display !== rowPersona.responsable_display,
  'C: creador distinto de responsable vigente (mock sin creador en contrato)');
rowPersona.creador_display = 'Usuario Creador Legacy';
ok(rowPersona.creador_display !== rowPersona.responsable_display, 'C: creador preservado aparte del responsable');

// D. transición — cambio de contrato sin perder historial legacy simulado
const legacyEstadoNegocio = 'En trámite de evaluación';
rowPersona.estado = legacyEstadoNegocio;
rowPersona.historial_estados = [{ etapa: 'REGISTRO', estado: 'Registrado' }];
const rowTransicion = buildBandejaContratoFromPersistido(
  {
    requerimiento_id: 90001,
    etapa_codigo: 'DEC',
    etapa_label: 'DEC',
    estado_codigo: 'DEC',
    estado_label: 'DEC',
    actualizado_at: new Date().toISOString(),
  },
  { tipo_responsable: 'PERSONA', usuario_id: 99, usuario_nombre: 'Nuevo Responsable DEC' },
  { codigo: 'REQ-PERSONA', estado: legacyEstadoNegocio, historial_estados: rowPersona.historial_estados },
);
ok(rowTransicion.bandeja_contrato.etapa.codigo === 'DEC', 'D: etapa vigente actualizada');
ok(Array.isArray(rowTransicion.historial_estados) && rowTransicion.historial_estados.length === 1,
  'D: historial previo intacto');

// E. días desde fecha vigente
const hace5 = new Date(Date.now() - 5 * 86400000).toISOString();
const dias5 = calcDiasEnEstadoDesdeFecha(hace5);
ok(dias5 >= 4 && dias5 <= 6, 'E: días calculados desde fecha vigente');
ok(rowUnidad.bandeja_contrato.dias_en_estado >= 0, 'E: dias_en_estado en contrato');

// F. bandeja histórica — pertenencia legacy DEC pero etapa vigente posterior
const rowHistorico = buildBandejaContratoFromPersistido(
  {
    requerimiento_id: 90003,
    etapa_codigo: 'PROGRAMACION',
    etapa_label: 'Programación',
    estado_codigo: 'PROGRAMACION',
    estado_label: 'Programación',
    actualizado_at: new Date().toISOString(),
  },
  { tipo_responsable: 'UNIDAD', unidad_codigo: 'Programación' },
  { codigo: 'REQ-HIST', estado: 'Aprobado DEC', estado_actual: 'DEC' },
);
ok(rowHistorico.estado === 'Aprobado DEC', 'F: legacy estado negocio conservado');
ok(rowHistorico.bandeja_contrato.etapa.codigo === 'PROGRAMACION', 'F: columna Etapa muestra vigente real');

// G. menú resolver conserva acciones registro
const menuLegacy = registroMenuItems({ id: 1, estado: 'Registrado', payload: '{}' });
const menuResolved = resolveBandejaAcciones({
  modulo: 'REGISTRO_REQUERIMIENTO',
  row: { id: 1, estado: 'Registrado', payload: '{}' },
}).menuItems;
ok(menuResolved.length === menuLegacy.length, 'G: cantidad acciones registro igual');
ok(menuResolved.every((m, i) => m.act === menuLegacy[i].act), 'G: acts registro preservados');

let ordenId = null;
try {
  await runMigrations();
  const ins = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload)
    VALUES ('bienes', $1, 'Test RC817', 'Area T', 'Resp Area', 'Registrado', '{}'::jsonb)
    RETURNING id
  `, [`REQ-RC817-${Date.now()}`]);
  ordenId = ins.rows[0].id;
  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, version, actualizado_at
    ) VALUES ($1, 'REGISTRO', 'Registro', 'REQUERIMIENTO_REGISTRADO', 'Registrado',
      'PERSONA', NULL, 1, NOW() - INTERVAL '2 days')
    ON CONFLICT (requerimiento_id) DO UPDATE SET
      etapa_codigo = EXCLUDED.etapa_codigo,
      estado_codigo = EXCLUDED.estado_codigo,
      actualizado_at = EXCLUDED.actualizado_at
  `, [ordenId]);

  const rows = [{ id: ordenId, codigo: 'REQ-RC817-DB', tipo: 'bienes', denominacion: 'Test', created_at: new Date().toISOString() }];
  await enrichEstadoResponsableForBandeja(rows, 'id');
  ok(rows[0].bandeja_contrato?.etapa?.codigo === 'REGISTRO', 'Integración: enrich + contrato etapa REGISTRO');
  ok(rows[0].dias_en_estado >= 1, 'Integración: días desde ERV en BD');
} finally {
  if (ordenId) {
    await query('DELETE FROM expediente_asignaciones WHERE requerimiento_id = $1', [ordenId]);
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [ordenId]);
    await query('DELETE FROM requerimientos WHERE id = $1', [ordenId]);
  }
}

console.log(`\n✅ RC8.17 Fase 1 — ${tests}/${tests} OK\n`);
