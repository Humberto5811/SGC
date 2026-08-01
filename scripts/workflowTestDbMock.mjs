// Cliente PostgreSQL simulado para probar executeTransition sin BD real.
// Emula el aislamiento READ COMMITTED + bloqueo FOR UPDATE de PostgreSQL.
// Soporta: BEGIN/COMMIT/ROLLBACK, lock por expediente, buffer invisible hasta
// COMMIT, workflow_eventos, workflow_observaciones, historial_movimientos,
// UPDATE de payload compat, UPDATE de responsable sin cambio de etapa,
// y modos de fallo para probar rollback (observaciones, payload, eventos).

export function createDbMock({
  tipo = 'BIEN',
  estadoInicial = 'REGISTRO',
  failInsertObservaciones = false,
  failUpdatePayload = false,
  failInsertEventos = false,
  payloadInicial = '{"campos_ajenos":{"a":1,"b":"x"},"historial_evaluacion":[],"observaciones":[]}',
} = {}) {
  // Estado COMMITEADO (visible para todas las transacciones).
  let fila = {
    id: 1,
    tipo,
    estado: 'Registrado',
    estado_actual: estadoInicial,
    sub_modulo_actual: 'Registro de Requerimiento',
    responsable_actual: 'Usuario AU',
    fecha_estado_actual: new Date().toISOString(),
    payload: payloadInicial,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const eventos = [];       // workflow_eventos commiteados
  const observaciones = []; // workflow_observaciones commiteadas
  let movimientos = 0;      // contador de appendMovimiento (historial_movimientos)
  let payloadUpdates = 0;   // contador de UPDATE payload (diagnóstico)

  let lockHolder = null;
  const waiters = [];
  let seqTxn = 1;
  let seqEv = 1;
  let seqObs = 1;

  function adquirirLock(txnId) {
    if (lockHolder === null) { lockHolder = txnId; return Promise.resolve(); }
    if (lockHolder === txnId) return Promise.resolve();
    return new Promise((resolve) => waiters.push({ txnId, resolve }));
  }

  function liberarLock(txnId) {
    if (lockHolder !== txnId) return;
    lockHolder = null;
    const next = waiters.shift();
    if (next) { lockHolder = next.txnId; next.resolve(); }
  }

  function connect() {
    const txnId = `txn-${seqTxn++}`;
    let begun = false;
    let filaLocal = null;      // snapshot al adquirir lock (vector de cambio)
    let eventosLocales = [];
    let obsLocales = [];

    const client = {
      async query(text, params) {
        const q = String(text);
        const upper = q.trim().toUpperCase();

        if (upper === 'BEGIN') { begun = true; return { rows: [] }; }

        if (upper === 'COMMIT') {
          if (!begun) return { rows: [] };
          // Publicar buffer commiteado.
          if (filaLocal) fila = { ...filaLocal };
          for (const ev of eventosLocales) eventos.push(ev);
          for (const ob of obsLocales) observaciones.push(ob);
          filaLocal = null; eventosLocales = []; obsLocales = [];
          begun = false;
          liberarLock(txnId);
          return { rows: [] };
        }

        if (upper === 'ROLLBACK') {
          filaLocal = null; eventosLocales = []; obsLocales = [];
          begun = false;
          liberarLock(txnId);
          return { rows: [] };
        }

        if (!begun) throw new Error('mock: query fuera de transacción (falta BEGIN)');

        // SELECT ... FOR UPDATE: espera lock; lee el estado commiteado.
        if (q.includes('FOR UPDATE') && q.includes('FROM requerimientos')) {
          await adquirirLock(txnId);
          filaLocal = { ...fila };
          return { rows: [filaLocal] };
        }

        // SELECT por idempotency_key: ve eventos commiteados + locales de esta txn.
        if (q.includes('FROM workflow_eventos') && q.includes('idempotency_key')) {
          const found = [...eventosLocales, ...eventos].filter((e) => e.idempotency_key === params[0]);
          return { rows: found.slice(0, 1) };
        }

        // INSERT workflow_eventos → buffer local.
        if (q.includes('INSERT INTO workflow_eventos')) {
          if (failInsertEventos) {
            const err = new Error('mock: fallo forzado al insertar workflow_eventos');
            err.code = '23505';
            throw err;
          }
          const ev = {
            id: seqEv++, expediente_id: params[0], tipo_contratacion: params[1],
            evento_codigo: params[2], etapa_origen: params[3], etapa_destino: params[4],
            actor_id: params[5], actor_rol: params[6], responsable_destino: params[7],
            metadata: params[8], idempotency_key: params[9],
            created_at: new Date().toISOString(),
          };
          eventosLocales.push(ev);
          return { rows: [ev] };
        }

        // UPDATE requerimientos SET payload = $2, updated_at = NOW() (compat domainMutator)
        if (q.includes('UPDATE requerimientos') && q.includes('payload = $2')) {
          if (failUpdatePayload) {
            const err = new Error('mock: fallo forzado al actualizar payload');
            err.code = '23503';
            throw err;
          }
          payloadUpdates += 1;
          filaLocal = { ...filaLocal, payload: params[1], updated_at: new Date().toISOString() };
          return { rows: [] };
        }

        // UPDATE requerimientos SET updated_at = NOW() WHERE id = $1 (con historial_movimientos)
        if (q.includes('UPDATE requerimientos') && q.includes('SET updated_at = NOW()') && q.includes('historial_movimientos')) {
          if (filaLocal) filaLocal = { ...filaLocal, updated_at: new Date().toISOString() };
          return { rows: [] };
        }

        // INSERT workflow_observaciones → buffer local (o error forzado → ROLLBACK)
        if (q.includes('INSERT INTO workflow_observaciones')) {
          if (failInsertObservaciones) {
            const err = new Error('mock: fallo forzado al insertar workflow_observaciones');
            err.code = '23505'; // unique violation tipo real
            throw err;
          }
          const ob = {
            id: seqObs++, expediente_id: params[0], origen: params[1], estado: params[2],
            emitida_por: params[3], responsable_subsanacion: params[4],
            motivo: params[5], documentos: params[6], dias_plazo: params[7],
            emitida_at: params[8],
          };
          obsLocales.push(ob);
          return { rows: [{ id: ob.id }] };
        }

        // UPDATE requerimientos con estado_actual (cambia ubicación)
        if (q.includes('UPDATE requerimientos') && q.includes('estado_actual = $2')) {
          filaLocal = {
            ...filaLocal,
            estado_actual: params[1], sub_modulo_actual: params[2],
            responsable_actual: params[3], fecha_estado_actual: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          return { rows: [] };
        }

        // UPDATE requerimientos SOLO responsable (sin cambio de etapa, ej. EVALUACION_OBSERVADA)
        if (q.includes('UPDATE requerimientos') && q.includes('responsable_actual = $2')) {
          filaLocal = {
            ...filaLocal,
            responsable_actual: params[1],
            fecha_estado_actual: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          return { rows: [] };
        }

        // UPDATE historial_movimientos / updated_at → contar appendMovimiento
        if (q.includes('historial_movimientos')) {
          movimientos += 1;
          if (filaLocal) filaLocal = { ...filaLocal, updated_at: new Date().toISOString() };
          return { rows: [] };
        }
        if (q.includes('SET updated_at')) {
          if (filaLocal) filaLocal = { ...filaLocal, updated_at: new Date().toISOString() };
          return { rows: [] };
        }

        // SELECT fila por id (reread tras UPDATE)
        if (q.includes('FROM requerimientos') && q.includes('WHERE id = $1')) {
          return { rows: [filaLocal] };
        }

        return { rows: [] };
      },
      release() {
        if (begun) {
          filaLocal = null; eventosLocales = []; obsLocales = [];
          begun = false;
          liberarLock(txnId);
        }
      },
    };

    return client;
  }

  return {
    connect,
    get row() { return fila; },
    get eventos() { return eventos; },
    get observaciones() { return observaciones; },
    get movimientos() { return movimientos; },
    get payloadUpdates() { return payloadUpdates; },
  };
}