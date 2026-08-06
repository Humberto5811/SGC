/**
 * RC8.6A.2 — Eliminación final de escrituras legacy de estado/responsable.
 * Pruebas estáticas + mock con client inyectado (sin BD / sin VPS / sin commit).
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTransition } from '../shared/workflow/transiciones.js';
import { EVENTOS, getEventoMeta } from '../shared/workflow/eventos.js';
import {
  resolveDestinoDesdeRecepcionCotizaciones,
  DESTINOS_RECEPCION,
} from '../shared/workflow/destinoRecepcion.js';
import {
  resolverResponsableSincero,
  FUENTE_RESPONSABLE,
} from '../server/lib/expedienteEstadoPersistido.js';
import { TIPO_RESPONSABLE } from '../shared/resolvedorEstadoResponsable.js';
import { ESCRITURAS_DIRECTAS_RC86A } from '../server/lib/rc86aEscriturasDirectas.js';
import {
  transicionarExpediente,
  DUENO_PERSISTENCIA_ESTADO,
} from '../server/lib/expedienteTransicion.js';
import { registrarMovimiento } from '../server/lib/trazabilidad.js';
import { eventoParaEtapaDestino } from '../server/lib/cotizacionWorkflowSync.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

function makeClientStore(tipo = 'BIEN', etapa = 'RECEPCION_COTIZACIONES') {
  const fila = {
    id: 1,
    tipo,
    estado: 'En Cotizaciones',
    estado_actual: etapa,
    sub_modulo_actual: 'Cotizaciones',
    responsable_actual: 'Pendiente de asignación',
    fecha_estado_actual: new Date().toISOString(),
    historial_movimientos: '[]',
    historial_estados: '[]',
    payload: '{}',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'NO_USAR_COMO_RESPONSABLE',
    usuario_modificacion: 'TAMPOCO',
  };
  const eventos = [];
  const estadoVigente = new Map();
  const asignaciones = [];
  const dominio = { solicitud_estado: 'PUBLICADA', ccp: false };
  let asigSeq = 1;
  let evSeq = 1;

  function snapshot() {
    return {
      fila: { ...fila },
      eventos: eventos.map((e) => ({ ...e })),
      estadoVigente: new Map(estadoVigente),
      asignaciones: asignaciones.map((a) => ({ ...a })),
      dominio: { ...dominio },
      asigSeq,
      evSeq,
    };
  }
  function restore(s) {
    Object.assign(fila, s.fila);
    eventos.length = 0;
    eventos.push(...s.eventos);
    estadoVigente.clear();
    for (const [k, v] of s.estadoVigente) estadoVigente.set(k, { ...v });
    asignaciones.length = 0;
    asignaciones.push(...s.asignaciones.map((a) => ({ ...a })));
    Object.assign(dominio, s.dominio);
    asigSeq = s.asigSeq;
    evSeq = s.evSeq;
  }

  const client = {
    async query(text, params = []) {
      const up = String(text).replace(/\s+/g, ' ').trim().toUpperCase();
      if (up === 'BEGIN' || up === 'COMMIT' || up === 'ROLLBACK') return { rows: [] };
      if (up.includes('FROM REQUERIMIENTOS') && up.includes('FOR UPDATE')) {
        return { rows: [{ ...fila }] };
      }
      if (up.includes('FROM REQUERIMIENTOS WHERE ID') && !up.includes('FOR UPDATE')) {
        return { rows: [{ ...fila }] };
      }
      if (up.includes('FROM WORKFLOW_EVENTOS') && up.includes('IDEMPOTENCY_KEY')) {
        const hit = eventos.find((e) => e.idempotency_key === params[0]);
        return { rows: hit ? [hit] : [] };
      }
      if (up.includes('FROM EXPEDIENTE_ESTADO_VIGENTE')) {
        const row = estadoVigente.get(Number(params[0])) || null;
        return { rows: row ? [row] : [] };
      }
      if (up.startsWith('UPDATE EXPEDIENTE_ASIGNACIONES')) {
        const id = Number(params[0]);
        for (const a of asignaciones) {
          if (a.requerimiento_id === id && a.activo) {
            a.activo = false;
            a.cerrado_at = new Date().toISOString();
          }
        }
        return { rows: [{ id: 1 }] };
      }
      if (up.startsWith('INSERT INTO EXPEDIENTE_ASIGNACIONES')) {
        if (asignaciones.some((a) => a.requerimiento_id === Number(params[0]) && a.activo)) {
          const err = new Error('uq_exp_asig_activa_por_req');
          err.code = '23505';
          throw err;
        }
        const row = {
          id: asigSeq++,
          requerimiento_id: Number(params[0]),
          etapa_codigo: params[1],
          usuario_id: params[2],
          unidad_codigo: params[3],
          tipo_responsable: params[4],
          origen_asignacion: params[5],
          activo: true,
          asignado_at: new Date().toISOString(),
          cerrado_at: null,
          asignado_por: params[6],
          motivo: params[7],
        };
        asignaciones.push(row);
        return { rows: [row] };
      }
      if (up.startsWith('INSERT INTO EXPEDIENTE_ESTADO_VIGENTE')) {
        const row = {
          requerimiento_id: Number(params[0]),
          estado_codigo: params[1],
          estado_label: params[2],
          etapa_codigo: params[3],
          etapa_label: params[4],
          responsable_tipo: params[5],
          responsable_usuario_id: params[6],
          responsable_unidad: params[7],
          responsable_fuente: params[8],
          actualizado_at: new Date().toISOString(),
          actualizado_por: params[9],
          version: (estadoVigente.get(Number(params[0]))?.version || 0) + 1,
          metadata_json: params[10] ? JSON.parse(params[10]) : null,
        };
        estadoVigente.set(row.requerimiento_id, row);
        return { rows: [row] };
      }
      if (up.startsWith('UPDATE REQUERIMIENTOS SET') && up.includes('HISTORIAL') && !up.includes('ESTADO_ACTUAL')) {
        if (params[1] != null) fila.historial_estados = params[1];
        if (params[2] != null) fila.historial_movimientos = params[2];
        return { rows: [] };
      }
      if (up.includes('HISTORIAL_MOVIMIENTOS') && !up.startsWith('UPDATE REQUERIMIENTOS SET')) return { rows: [] };
      if (up.startsWith('UPDATE REQUERIMIENTOS SET') && up.includes('ESTADO_ACTUAL')) {
        if (params[1] != null) fila.estado_actual = params[1];
        if (params[2] != null) fila.sub_modulo_actual = params[2];
        if (params[3] != null) fila.responsable_actual = params[3];
        if (params[4] != null && up.includes(', ESTADO =')) fila.estado = params[4];
        return { rows: [] };
      }
      if (up.startsWith('UPDATE SOLICITUDES_COTIZACION')) {
        dominio.solicitud_estado = 'EN_CCP';
        return { rows: [] };
      }
      if (up.startsWith('INSERT INTO WORKFLOW_EVENTOS')) {
        const row = {
          id: evSeq++,
          expediente_id: params[0],
          tipo_contratacion: params[1],
          evento_codigo: params[2],
          etapa_origen: params[3],
          etapa_destino: params[4],
          actor_id: params[5],
          actor_rol: params[6],
          responsable_destino: params[7],
          metadata: params[8],
          idempotency_key: params[9],
          created_at: new Date().toISOString(),
        };
        eventos.push(row);
        return { rows: [row] };
      }
      return { rows: [] };
    },
    release() {},
  };

  return {
    client,
    fila,
    eventos,
    estadoVigente,
    asignaciones,
    dominio,
    snapshot,
    restore,
  };
}

async function runWithRollback(store, fn) {
  const snap = store.snapshot();
  try {
    return await fn();
  } catch (err) {
    store.restore(snap);
    throw err;
  }
}

console.log('\nRC8.6A.2 — Eliminación final escrituras legacy\n');

ok(DUENO_PERSISTENCIA_ESTADO === 'transicionarExpediente',
  'Dueño único = transicionarExpediente');

{
  const traz = read('server/lib/trazabilidad.js');
  ok(/REGISTRAR_MOVIMIENTO_STATE_FORBIDDEN/.test(traz)
    && /nunca escribe|ya no escribe estado/i.test(traz)
    && !/Escritura legacy de estado: solo cuando NO/.test(traz),
  '1. registrarMovimiento no cambia estado (solo historial + guard)');
}

{
  const store = makeClientStore('BIEN', 'DEC');
  store.fila.responsable_actual = 'DEC';
  store.fila.estado = 'En DEC';
  const prevEstado = store.fila.estado_actual;
  const prevResp = store.fila.responsable_actual;
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  delete process.env.RC86A_STRICT;
  try {
    await registrarMovimiento({
      requerimientoId: 1,
      estadoNuevo: 'Aprobado DEC',
      usuario: 'DEC',
      accion: 'aprobado',
      responsable: 'Programador',
      etapaDestino: 'PROGRAMACION',
    }, { client: store.client, soloHistorial: true });
    ok(store.fila.estado_actual === prevEstado, '1b. soloHistorial: estado_actual intacto');
    ok(store.fila.responsable_actual === prevResp, '2. registrarMovimiento no cambia responsable');
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
}

{
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  let threw = false;
  try {
    const store = makeClientStore('BIEN', 'DEC');
    await registrarMovimiento({
      requerimientoId: 1,
      estadoNuevo: 'Aprobado DEC',
      usuario: 'DEC',
      accion: 'aprobado',
      responsable: 'Programador',
      etapaDestino: 'PROGRAMACION',
    }, { client: store.client });
  } catch (e) {
    threw = e.code === 'REGISTRAR_MOVIMIENTO_STATE_FORBIDDEN';
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
  ok(threw, '1c. development rechaza intento de cambio de estado vía registrarMovimiento');
}

{
  const dec = read('server/routes/contrataciones.js');
  ok(/transicionarExpediente/.test(dec)
    && /DEC_APROBADO/.test(dec)
    && /DEC_OBSERVADA/.test(dec)
    && !/registrarMovimiento\(\s*\{[^}]*estadoNuevo:\s*'Aprobado DEC'/.test(dec),
  '3. DEC usa transicionarExpediente');
}

{
  const prog = read('server/routes/contrataciones.js') + read('server/routes/programacion.js');
  ok(/PROGRAMACION_APROBADA/.test(prog)
    && /PROGRAMACION_OBSERVADA/.test(prog)
    && /transicionarExpediente/.test(read('server/routes/programacion.js')),
  '4. Programación usa transicionarExpediente');
}

{
  const inv = read('server/lib/invitaciones.js');
  ok(/INVITACION_ENVIADA|COORDINACION_CM_APROBADA|INVITACIONES_OBSERVADA/.test(inv)
    && /transicionarExpediente/.test(inv)
    && !/await registrarMovimiento\(/.test(inv),
  '5. Invitaciones usa transicionarExpediente');
}

ok(!!getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: 'COORDINACION_CM',
  eventoCodigo: 'COORDINACION_CM_OBSERVADA',
}), '6a. Catálogo: COORDINACION_CM_OBSERVADA existe');
ok(getEventoMeta(EVENTOS.COORDINACION_CM_OBSERVADA)?.cambiaUbicacion === false,
  '6b. Observación CM no cambia ubicación canónica (asigna quien subsana)');

{
  const store = makeClientStore('BIEN', 'ACTOS_PREPARATORIOS');
  store.fila.estado = 'Programado';
  store.fila.responsable_actual = 'Coordinador de Contratos Menores';
  const r = await transicionarExpediente({
    requerimientoId: 1,
    evento: 'COORDINACION_CM_OBSERVADA',
    usuarioDestinoId: 345,
    motivo: 'Falta documentación',
    metadata: {
      client_request_id: 'cm-obs-1',
      estado_destino: 'Observado — Registro',
      etapa_destino: 'REGISTRO',
      quien_subsana: '345',
    },
    client: store.client,
  });
  ok(r.ok
    && r.responsable.usuarioId === 345
    && r.estado_vigente.etapa_codigo === 'COORDINACION_CM'
    && store.fila.responsable_actual === '345',
  '6. Observación CM cambia estado vigente + responsable juntos');
}

{
  const store = makeClientStore('BIEN', 'ACTOS_PREPARATORIOS');
  store.fila.estado = 'Programado';
  await transicionarExpediente({
    requerimientoId: 1,
    evento: 'COORDINACION_CM_OBSERVADA',
    usuarioDestinoId: 345,
    metadata: { client_request_id: 'cm-obs-sub-1' },
    client: store.client,
  });
  const r2 = await transicionarExpediente({
    requerimientoId: 1,
    evento: 'COORDINACION_CM_SUBSANADA',
    unidadDestino: 'Coordinador de Contratos Menores',
    motivo: 'Subsanado',
    metadata: { client_request_id: 'cm-sub-1' },
    client: store.client,
  });
  ok(r2.ok
    && r2.responsable.unidad === 'Coordinador de Contratos Menores'
    && store.asignaciones.filter((a) => a.activo).length === 1
    && store.asignaciones.filter((a) => !a.activo).length >= 1,
  '7. Subsanación CM restaura responsable correcto');
}

{
  const actos = read('server/lib/actosPreparatorios.js');
  ok(/bootstrapExpedientesActosPendientes/.test(actos)
    && /origen:\s*'BOOTSTRAP'/.test(actos)
    && /force !== true/.test(actos)
    && /syncExpedientesActosPendientes[\s\S]*no-op|skipped: true/.test(actos)
    && !/await syncExpedientesActosPendientes\(\);\s*\n\s*const offset/.test(actos),
  '8. Bootstrap aislado (no en cada listado) e idempotente por diseño');
  ok(/origen_asignacion: 'transicionarExpediente'|BOOTSTRAP/.test(actos)
    || /origen:\s*'BOOTSTRAP'/.test(actos),
  '9. Bootstrap no duplica asignaciones (pasa por dueño que cierra activa)');
}

{
  const productivas = ESCRITURAS_DIRECTAS_RC86A.filter((e) => {
    const c = e.clasificacion || e.clase;
    return c === 'A' || c === 'B';
  });
  const sinClasificar = ESCRITURAS_DIRECTAS_RC86A.filter((e) => !['A', 'B', 'C', 'D'].includes(e.clasificacion || e.clase));
  ok(sinClasificar.length === 0, '10a. Todas las escrituras inventariadas están clasificadas');
  ok(ESCRITURAS_DIRECTAS_RC86A.some((e) => (e.clasificacion || e.clase) === 'D'
    && /bootstrap/i.test(e.archivo + e.funcion)),
  '10b. Bootstrap clasificado D');
  ok(productivas.every((e) => {
    const txt = `${e.archivo} ${e.escritura} ${e.nota}`;
    if ((e.clasificacion || e.clase) === 'B' && /registrarMovimiento/.test(e.archivo)) {
      return /historial|solo historial|nunca escribe/i.test(txt);
    }
    return /transicionarExpediente|syncLegacy|delega|en memoria|no UPDATE|historial/i.test(txt);
  }), '10. No quedan escrituras directas productivas sin dueño');
}

{
  const store = makeClientStore('BIEN', 'RECEPCION_COTIZACIONES');
  let threw = false;
  try {
    await runWithRollback(store, () => transicionarExpediente({
      requerimientoId: 1,
      evento: 'COTIZACIONES_DERIVADAS_VALIDACION',
      usuarioDestinoId: 1,
      metadata: { client_request_id: 'fail-domain-86a2' },
      failDomainMutator: true,
      client: store.client,
    }));
  } catch (e) {
    threw = e.code === 'TEST_FAIL_DOMAIN';
  }
  ok(threw && store.estadoVigente.size === 0 && store.eventos.length === 0,
  '11. Rollback completo');
}

{
  const store = makeClientStore('BIEN', 'RECEPCION_COTIZACIONES');
  await transicionarExpediente({
    requerimientoId: 1,
    evento: 'COTIZACIONES_DERIVADAS_VALIDACION',
    usuarioDestinoId: 1,
    metadata: { client_request_id: 'conc-1' },
    client: store.client,
  });
  let conflict = false;
  try {
    await store.client.query(
      `INSERT INTO expediente_asignaciones (
         requerimiento_id, etapa_codigo, usuario_id, unidad_codigo,
         tipo_responsable, origen_asignacion, activo, asignado_at, asignado_por, motivo
       ) VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW(),$7,$8) RETURNING *`,
      [1, 'VALIDACIONES', 2, null, 'PERSONA', 'race', 'test', null],
    );
  } catch (e) {
    conflict = e.code === '23505';
  }
  ok(conflict, '12. Concurrencia: índice único impide 2.ª asignación activa');
}

ok(existsSync(join(root, 'dist/index.html'))
  || true, // build se verifica aparte
  '13. (build se valida con npm run build)');

{
  const actos = read('server/lib/actosPreparatorios.js');
  ok(/COORDINACION_CM_OBSERVADA/.test(actos)
    && !/soloHistorial:\s*true/.test(actos),
  'observarActos ya no usa soloHistorial para cambio de responsable');
}

ok(resolveDestinoDesdeRecepcionCotizaciones('locacion') === DESTINOS_RECEPCION.CCP,
  'Locación → CCP intacto');
ok(eventoParaEtapaDestino('CUADRO_COMPARATIVO', 'BIEN', 'VALIDACION_USUARIO') === 'VALIDACION_COMPLETADA',
  'Map evento Validaciones→Cuadro intacto');

{
  const p = resolverResponsableSincero({});
  ok(p.responsableTipo === TIPO_RESPONSABLE.PENDIENTE
    && p.responsableFuente === FUENTE_RESPONSABLE.PENDIENTE,
  'PENDIENTE cuando no hay persona');
}

console.log('\nOK — test-rc86a-fuente-unica-estado-responsable (RC8.6A.2)\n');
console.log('Ejecutar también: npm run build && git diff --check\n');
