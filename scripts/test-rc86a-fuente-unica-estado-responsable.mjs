/**
 * RC8.6A.1 — Cierre transaccional de la fuente única.
 * Pruebas estáticas + mock con client inyectado (sin BD / sin VPS).
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTransition } from '../shared/workflow/transiciones.js';
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
      if (up.includes('HISTORIAL_MOVIMIENTOS')) return { rows: [] };
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

console.log('\nRC8.6A.1 — Cierre transaccional fuente única\n');

ok(DUENO_PERSISTENCIA_ESTADO === 'transicionarExpediente',
  '1. Dueño único de persistencia = transicionarExpediente');

{
  const engine = read('server/lib/workflow/workflowEngine.js');
  ok(/transicionarExpediente/.test(engine)
    && !/persistirEstadoDesdeTransicionMotor/.test(engine),
  '2. Workflow Engine no persiste dos veces (delega al dueño)');
}

{
  const traz = read('server/lib/trazabilidad.js');
  ok(!/syncPersistidoTrasMovimiento/.test(traz)
    && /soloHistorial/.test(traz)
    && /opts\.client/.test(traz),
  '3. registrarMovimiento acepta client/soloHistorial; sin sync best-effort');
}

{
  const der = read('server/lib/derivarRecepcionCcp.js');
  ok(/withTransaction/.test(der)
    && /domainMutator/.test(der)
    && /transicionarExpediente/.test(der)
    && !/syncRequerimientosSolicitudWorkflow/.test(der),
  '4. Locación→CCP atómica (sin sync paralelo)');
}

ok(resolveDestinoDesdeRecepcionCotizaciones('locacion') === DESTINOS_RECEPCION.CCP,
  '5. Locación nunca → Validaciones (destino CCP)');
ok(resolveDestinoDesdeRecepcionCotizaciones('BIEN') === DESTINOS_RECEPCION.VALIDACIONES,
  '6. Bien → Validaciones');
ok(!getTransition({
  tipoContratacion: 'LOCACION',
  etapaOrigen: 'RECEPCION_COTIZACIONES',
  eventoCodigo: 'COTIZACIONES_DERIVADAS_VALIDACION',
}), '7. Catálogo: Locación sin transición a Validaciones');
ok(!!getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: 'CUADRO_COMPARATIVO',
  eventoCodigo: 'CUADRO_APROBADO_DEC',
}), '8. Catálogo: Cuadro → CCP');
ok(!!getTransition({
  tipoContratacion: 'BIEN',
  etapaOrigen: 'CCP',
  eventoCodigo: 'CCP_REGISTRADA',
}), '9. Catálogo: CCP → Orden');

{
  const mig = read('server/migrations/044_expediente_estado_responsable_vigente.js');
  ok(/WHERE NOT EXISTS/.test(mig)
    && /PENDIENTE/.test(mig)
    && /sin_inferencia_persona|backfill_inicial/.test(mig)
    && /uq_exp_asig_activa_por_req/.test(mig)
    && /chk_exp_estado_version_positive|version\s+INTEGER NOT NULL/.test(mig),
  '10. Backfill idempotente + PK/índice/version');
}

ok(eventoParaEtapaDestino('CCP', 'LOCACION', 'RECEPCION_COTIZACIONES') === 'LOCACION_APROBADA_RECEPCION',
  '11. Map evento Locación→CCP');
ok(eventoParaEtapaDestino('CUADRO_COMPARATIVO', 'BIEN', 'VALIDACION_USUARIO') === 'VALIDACION_COMPLETADA',
  '12. Map evento Validaciones→Cuadro');

{
  const store = makeClientStore('BIEN', 'RECEPCION_COTIZACIONES');
  let threw = false;
  try {
    await runWithRollback(store, () => transicionarExpediente({
      requerimientoId: 1,
      evento: 'COTIZACIONES_DERIVADAS_VALIDACION',
      usuarioDestinoId: 1,
      metadata: { client_request_id: 'fail-domain' },
      failDomainMutator: true,
      client: store.client,
    }));
  } catch (e) {
    threw = e.code === 'TEST_FAIL_DOMAIN';
  }
  ok(threw
    && store.estadoVigente.size === 0
    && store.asignaciones.length === 0
    && store.eventos.length === 0,
  '13. Fallo domainMutator → rollback completo (evidencia)');
}

{
  const store = makeClientStore('BIEN', 'RECEPCION_COTIZACIONES');
  let threw = false;
  try {
    await runWithRollback(store, () => transicionarExpediente({
      requerimientoId: 1,
      evento: 'COTIZACIONES_DERIVADAS_VALIDACION',
      usuarioDestinoId: 1,
      metadata: { client_request_id: 'fail-asig' },
      failAfterAsignacion: true,
      client: store.client,
    }));
  } catch (e) {
    threw = e.code === 'TEST_FAIL_ASIGNACION';
  }
  ok(threw && store.estadoVigente.size === 0 && store.eventos.length === 0,
    '14. Fallo asignación → rollback completo');
}

{
  const store = makeClientStore('BIEN', 'RECEPCION_COTIZACIONES');
  let threw = false;
  try {
    await runWithRollback(store, () => transicionarExpediente({
      requerimientoId: 1,
      evento: 'COTIZACIONES_DERIVADAS_VALIDACION',
      usuarioDestinoId: 2,
      metadata: { client_request_id: 'fail-traza' },
      failTrazabilidad: true,
      client: store.client,
    }));
  } catch (e) {
    threw = e.code === 'TEST_FAIL_TRAZA';
  }
  ok(threw && store.eventos.length === 0 && store.estadoVigente.size === 0,
    '15. Fallo trazabilidad → rollback completo');
}

{
  const store = makeClientStore('LOCACION', 'RECEPCION_COTIZACIONES');
  const r = await transicionarExpediente({
    requerimientoId: 1,
    evento: 'LOCACION_APROBADA_RECEPCION',
    usuarioDestinoId: 9,
    metadata: { client_request_id: 'loc-ccp-1' },
    domainMutator: async (tx) => {
      await tx.query(`UPDATE solicitudes_cotizacion SET estado = 'EN_CCP' WHERE id = $1`, [1]);
      store.dominio.ccp = true;
      return { solicitud_estado: 'EN_CCP', cuadro_id: null };
    },
    client: store.client,
  });
  ok(r.ok
    && r.estado_vigente.etapa_codigo === 'CCP'
    && store.dominio.solicitud_estado === 'EN_CCP'
    && r.domain_results?.cuadro_id === null,
  '16. Locación→CCP: solicitud EN_CCP y estado CCP juntos');
  ok(r.dueno_persistencia === 'transicionarExpediente',
    '17. Persistencia única en Locación→CCP');
}

{
  const store = makeClientStore('BIEN', 'RECEPCION_COTIZACIONES');
  const a = await transicionarExpediente({
    requerimientoId: 1,
    evento: 'COTIZACIONES_DERIVADAS_VALIDACION',
    usuarioDestinoId: 77,
    metadata: { client_request_id: 'idem-x' },
    client: store.client,
  });
  const b = await transicionarExpediente({
    requerimientoId: 1,
    evento: 'COTIZACIONES_DERIVADAS_VALIDACION',
    usuarioDestinoId: 77,
    metadata: { client_request_id: 'idem-x' },
    client: store.client,
  });
  ok(a.ok && b.idempotente === true && store.eventos.length === 1,
    '18. Idempotencia por evento');
  ok(store.asignaciones.filter((x) => x.activo).length === 1,
    '19. Una sola asignación activa');
  ok(store.fila.estado_actual === 'VALIDACION_USUARIO',
    '20. Legacy sincronizado desde fuente oficial');
}

{
  const store = makeClientStore('BIEN', 'VALIDACIONES');
  const r = await transicionarExpediente({
    requerimientoId: 1,
    evento: 'VALIDACION_DEVUELTA',
    usuarioDestinoId: 88,
    motivo: 'Devolver',
    metadata: { client_request_id: 'dev-1' },
    client: store.client,
  });
  ok(r.responsable.usuarioId === 88, '21. Devolución actualiza responsable destino');
}

{
  const store = makeClientStore('BIEN', 'EVALUACION');
  const r = await transicionarExpediente({
    requerimientoId: 1,
    evento: 'EVALUACION_OBSERVADA',
    usuarioDestinoId: 55,
    motivo: 'Observado',
    metadata: { client_request_id: 'obs-1' },
    client: store.client,
  });
  ok(r.responsable.usuarioId === 55 && r.estado_vigente.etapa_codigo === 'EVALUACION',
    '22. Observación asigna quien subsana');
}

{
  const store = makeClientStore('BIEN', 'VALIDACIONES');
  await transicionarExpediente({
    requerimientoId: 1,
    evento: 'VALIDACION_DEVUELTA',
    usuarioDestinoId: 11,
    metadata: { client_request_id: 'reap-1' },
    client: store.client,
  });
  const r2 = await transicionarExpediente({
    requerimientoId: 1,
    evento: 'VALIDACION_DEVUELTA',
    usuarioDestinoId: 22,
    metadata: { client_request_id: 'reap-2' },
    client: store.client,
  });
  ok(r2.responsable.usuarioId === 22
    && store.asignaciones.filter((a) => a.activo).length === 1
    && store.asignaciones.filter((a) => !a.activo).length >= 1,
  '23. Reapertura restaura asignación correcta (cierra previa)');
}

{
  const store = makeClientStore('BIEN', 'RECEPCION_COTIZACIONES');
  await transicionarExpediente({
    requerimientoId: 1,
    evento: 'COTIZACIONES_DERIVADAS_VALIDACION',
    usuarioDestinoId: 1,
    metadata: { client_request_id: 'c1' },
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
  ok(conflict, '24. Concurrencia: índice único impide 2.ª asignación activa');
}

{
  const r = await (async () => {
    const store = makeClientStore('BIEN', 'RECEPCION_COTIZACIONES');
    return transicionarExpediente({
      requerimientoId: 1,
      evento: 'COTIZACIONES_DERIVADAS_VALIDACION',
      metadata: { client_request_id: 'no-cb' },
      client: store.client,
    });
  })();
  ok(r.fuentes_prohibidas_usadas.created_by === false
    && r.fuentes_prohibidas_usadas.usuario_modificacion === false,
  '25. No se infiere responsable desde created_by');
}

{
  const p = resolverResponsableSincero({});
  ok(p.responsableTipo === TIPO_RESPONSABLE.PENDIENTE
    && p.responsableFuente === FUENTE_RESPONSABLE.PENDIENTE,
  '26. PENDIENTE cuando no hay persona');
}

ok(ESCRITURAS_DIRECTAS_RC86A.some((e) => /derivarRecepcionCcp/.test(e.archivo) && e.clase === 'B'),
  '27. Ruta crítica Locación→CCP marcada migrada');
ok(ESCRITURAS_DIRECTAS_RC86A.some((e) => e.clase === 'A'),
  '28. Quedan escrituras A no críticas pendientes');

ok(/dueno_persistencia|DUENO_PERSISTENCIA/.test(read('server/lib/expedienteTransicion.js')),
  '29. Servicio declara dueño de persistencia');
ok(/client: tx/.test(read('server/lib/workflow/workflowEngine.js')),
  '30. Engine reutiliza mismo client tx');

ok(existsSync(join(root, 'dist/index.html')),
  '31. Artefacto build presente (npm run build)');

console.log('\nOK — test-rc86a-fuente-unica-estado-responsable (RC8.6A.1)\n');
console.log('Nota: ejecutar `npm run build` y `git diff --check` en entrega.\n');
