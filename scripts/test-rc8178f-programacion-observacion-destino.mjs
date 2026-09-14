/**
 * RC8.17.8F — PROGRAMACION_OBSERVADA con destino canónico (Registro).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { applyPilotObservacionDecDestino } from '../server/lib/workflowTransicionResponsable.js';
import { DESTINOS_OBSERVACION_DEC } from '../server/lib/candidatosObservacionDestino.js';
import { listarBandejaProgramacion } from '../server/lib/programacionBandeja.js';
import { fmtBandejaFechaDerivado } from '../src/utils/bandejaExpedienteColumns.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';
import { transicionarExpediente } from '../server/lib/expedienteTransicion.js';
import { buildObservacionDomainMutator } from '../server/lib/workflow/workflowIntegration.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8F — Programación observación destino ===\n');

console.log('A-H — applyPilotObservacionDecDestino (PROGRAMACION → REGISTRO)');
{
  const pilot = applyPilotObservacionDecDestino({
    resp: { responsableTipo: TIPO_RESPONSABLE.UNIDAD, responsableUnidad: 'X' },
    usuarioDestinoId: 249,
    metadata: {
      etapa_origen: 'PROGRAMACION',
      etapa_destino: 'REGISTRADO',
      evento: 'PROGRAMACION_OBSERVADA',
    },
    etapaEfectiva: 'PROGRAMACION',
    labels: {},
  });
  ok(pilot.etapaEfectiva === 'REGISTRO', 'REGISTRADO normaliza a REGISTRO');
  ok(pilot.labels.estadoCodigo === 'OBSERVADO', 'estado OBSERVADO');
  ok(pilot.labels.estadoLabel === 'Observado', 'label Observado');
  ok(pilot.resp.responsableTipo === 'PERSONA', 'responsable PERSONA');
  ok(Number(pilot.resp.responsableUsuarioId) === 249, 'usuario_id 249');
  ok(pilot.metaExtra.pilot_observacion_dirigida_destino === true, 'flag dirigida');
}

console.log('\nG — sin PERSONA no debe quedar UNIDAD con nombre (pilot sin uid)');
{
  const pilot = applyPilotObservacionDecDestino({
    resp: { responsableTipo: TIPO_RESPONSABLE.UNIDAD, responsableUnidad: 'VASQUEZ' },
    usuarioDestinoId: null,
    metadata: { etapa_destino: 'REGISTRO', evento: 'PROGRAMACION_OBSERVADA' },
    etapaEfectiva: 'PROGRAMACION',
    labels: {},
  });
  ok(pilot.etapaEfectiva === 'REGISTRO', 'etapa destino aplicada');
  ok(pilot.resp.responsableTipo !== 'PERSONA' || !pilot.resp.responsableUsuarioId,
    'sin uid no fuerza PERSONA');
}

console.log('\nRutas / UI');
{
  const routeSrc = readFileSync(join(__dir, '../server/routes/contrataciones.js'), 'utf8');
  ok(/programacion\/candidatos-observacion-destino/.test(routeSrc), 'GET candidatos Programación');
  ok(/assertUsuarioDestinoObservacionElegible/.test(routeSrc), 'PUT valida elegibilidad');
  ok(/buildObservacionDomainMutator/.test(routeSrc), 'workflow_observaciones mutator');
  const progView = readFileSync(join(__dir, '../src/views/programacion/programacionView2.js'), 'utf8');
  ok(/candidatosApiPath.*programacion\/candidatos-observacion-destino/.test(progView),
    'UI candidatosApiPath Programación');
  ok(/usuario_destino_id/.test(progView), 'UI envía usuario_destino_id');
}

console.log('\nTransición — expedienteTransicion.js');
{
  const src = readFileSync(join(__dir, '../server/lib/expedienteTransicion.js'), 'utf8');
  ok(/PROGRAMACION_OBSERVADA' \|\| eventoCodigo === 'DEC_OBSERVADA'/.test(src)
    || /DEC_OBSERVADA' \|\| eventoCodigo === 'PROGRAMACION_OBSERVADA'/.test(src),
    'PROGRAMACION_OBSERVADA usa pilot observación dirigida');
  ok(/pilot_observacion_dirigida/.test(src), 'pilotCambiaUbicacion dirigida');
}

await runMigrations();

console.log('\nI/J/K — REQ-00016 bandeja histórica + Derivado (post-reparación esperada)');
{
  const { rows: req16 } = await query(`SELECT id FROM requerimientos WHERE codigo = 'REQ-00016' LIMIT 1`);
  if (req16[0]) {
    const rid = req16[0].id;
    const { rows: erv } = await query(
      `SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id
       FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
      [rid],
    );
    const e = erv[0];
    if (e?.etapa_codigo === 'REGISTRO' && e?.estado_codigo === 'OBSERVADO') {
      ok(Number(e.responsable_usuario_id) === 249, 'ERV PERSONA 249 tras reparación');
      const lista = await listarBandejaProgramacion(1, 50, { q: 'REQ-00016' });
      const row = (lista.data || []).find((r) => Number(r.id) === Number(rid));
      ok(!!row, 'sigue en bandeja histórica Programación');
      ok(row.bandeja_contrato?.etapa?.codigo === 'REGISTRO', 'bandeja Etapa REGISTRO');
      ok(row.bandeja_contrato?.estado?.codigo === 'OBSERVADO', 'bandeja Estado OBSERVADO');
      const fmt = fmtBandejaFechaDerivado(row.fecha_ingreso_programacion);
      ok(fmt.display === '13/09/2026', `Derivado conservado ${fmt.display}`);
    } else {
      console.log('  (omitido K: ejecutar repair-req00016-rc8178f --execute para validar bandeja)');
    }
  }
}

console.log('\nL — transicionarExpediente rechaza destino sin PERSONA (simulación secuencia)');
{
  const { rows: reqs } = await query(
    `SELECT id FROM requerimientos WHERE estado_actual = 'PROGRAMACION' AND id <> 16 LIMIT 1`,
  );
  if (reqs[0]) {
    let threw = false;
    try {
      await transicionarExpediente({
        requerimientoId: reqs[0].id,
        evento: 'PROGRAMACION_OBSERVADA',
        usuarioDestinoId: null,
        metadata: {
          etapa_origen: 'PROGRAMACION',
          etapa_destino: 'REGISTRO',
          evento: 'PROGRAMACION_OBSERVADA',
          client_request_id: `test-8178f-no-persona:${reqs[0].id}:${Date.now()}`,
        },
        actorRol: 'test',
        domainMutator: buildObservacionDomainMutator({
          motivo: 'test sin persona',
          origen: 'PROGRAMACION',
          destinoSubmodulo: 'Registro de Requerimiento',
          destinoEtapa: 'REGISTRO',
        }),
      });
    } catch (err) {
      threw = true;
      ok(err.code === 'TRANSICION_SIN_PERSONA' || /persona responsable/i.test(String(err.message)),
        `error controlado: ${err.code || err.message}`);
    }
    ok(threw, 'no persiste transición sin persona');
  } else {
    console.log('  (omitido L: sin otro expediente PROGRAMACION para prueba destructiva)');
  }
}

ok(DESTINOS_OBSERVACION_DEC.some((d) => /registro/i.test(d)), 'destinos observación incluyen Registro');

console.log('\n✅ RC8.17.8F — OK\n');
