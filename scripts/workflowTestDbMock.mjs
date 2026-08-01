// Cliente PostgreSQL simulado para probar executeTransition sin BD real.
// Emula fielmente el comportamiento de PostgreSQL en concurrencia:
//
// 1. Cada `connect()` devuelve una conexión/transacción independiente.
// 2. `SELECT ... FOR UPDATE` adquiere un lock por expediente: si otra
//    transacción ya tiene el lock, la query se encola y espera hasta que
//    esa transacción haga COMMIT/ROLLBACK (exclusión mutua real de PG).
// 3. Las escrituras de una transacción NO commiteada viven en un buffer local;
//    no son visibles para otras transacciones (aislamiento READ COMMITTED).
// 4. El COMMIT publica el buffer (fila + workflow_eventos) y libera el lock.
//    A partir de ese momento las demás transacciones ven el resultado.
// 5. El ROLLBACK descarta el buffer y libera el lock sin publicar nada.
//
// Con esto, la 2ª transacción concurrente con la misma idempotency_key:
//   - se bloquea en SELECT FOR UPDATE hasta el COMMIT de la 1ª;
//   - lee la fila ya actualizada y el workflow_eventos ya visible;
//   - devuelve idempotente=true; NO crea un segundo evento.
export function createDbMock({ tipo = 'BIEN', estadoInicial = 'REGISTRO' } = {}) {
  // Estado COMMITEADO (visible para todas las transacciones).
  let fila = {
    id: 1,
    tipo,
    estado: 'Registrado',
    estado_actual: estadoInicial,
    sub_modulo_actual: 'Registro de Requerimiento',
    responsable_actual: 'Usuario AU',
    fecha_estado_actual: new Date().toISOString(),
    payload: '{}',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const eventos = [];

  // Control del lock por expediente.
  let lockHolder = null; // id de transacción con el lock
  const waiters = [];    // { txnId, resolve } esperando el lock
  let seqId = 1;
  let seqTxn = 1;

  function adquirirLock(txnId) {
    if (lockHolder === null) {
      lockHolder = txnId;
      return Promise.resolve();
    }
    if (lockHolder === txnId) return Promise.resolve();
    // Se encola; la query espera hasta que la transacción con el lock COMMIT/ROLLBACK.
    return new Promise((resolve) => waiters.push({ txnId, resolve }));
  }

  function liberarLock(txnId) {
    if (lockHolder !== txnId) return;
    lockHolder = null;
    const next = waiters.shift();
    if (next) {
      lockHolder = next.txnId;
      next.resolve();
    }
  }

  /**
   * Abre una nueva conexión/transacción. El caller gestiona BEGIN/COMMIT/ROLLBACK
   * (igual que con un client real de pg cuando se pasa `client` a executeTransition).
   */
  function connect() {
    const txnId = `txn-${seqTxn++}`;
    let begun = false;
    let filaLocal = null;      // snapshot de la fila al adquirir el lock
    let eventosLocales = [];   // escrituras pendientes (no visibles hasta COMMIT)

    const client = {
      async query(text, params) {
        const q = String(text);
        const upper = q.trim().toUpperCase();

        if (upper === 'BEGIN') {
          begun = true;
          return { rows: [] };
        }

        if (upper === 'COMMIT') {
          if (!begun) return { rows: [] };
          // Publicar buffer: fila + eventos.
          if (filaLocal) fila = { ...filaLocal };
          for (const ev of eventosLocales) eventos.push(ev);
          filaLocal = null;
          eventosLocales = [];
          begun = false;
          liberarLock(txnId);
          return { rows: [] };
        }

        if (upper === 'ROLLBACK') {
          filaLocal = null;
          eventosLocales = [];
          begun = false;
          liberarLock(txnId);
          return { rows: [] };
        }

        if (!begun) {
          throw new Error('mock: query ejecutada fuera de transacción (falta BEGIN)');
        }

        // SELECT ... FOR UPDATE: espera el lock y lee estado COMMITEADO.
        if (q.includes('FOR UPDATE') && q.includes('FROM requerimientos')) {
          await adquirirLock(txnId);
          filaLocal = { ...fila }; // lectura de la fila ya confirmada
          return { rows: [filaLocal] };
        }

        // SELECT por idempotency_key: solo ve eventos COMMITEADOS + los de esta txn.
        if (q.includes('FROM workflow_eventos') && q.includes('idempotency_key')) {
          const encontrados = [
            ...eventosLocales,
            ...eventos,
          ].filter((e) => e.idempotency_key === params[0]);
          return { rows: encontrados.slice(0, 1) };
        }

        // INSERT workflow_eventos → buffer local (no visible hasta COMMIT).
        if (q.includes('INSERT INTO workflow_eventos')) {
          const ev = {
            id: seqId++,
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
          eventosLocales.push(ev);
          return { rows: [ev] };
        }

        // UPDATE requerimientos con estado_actual → buffer local.
        if (q.includes('UPDATE requerimientos') && q.includes('estado_actual = $2')) {
          filaLocal = {
            ...filaLocal,
            estado_actual: params[1],
            sub_modulo_actual: params[2],
            responsable_actual: params[3],
            fecha_estado_actual: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          return { rows: [] };
        }

        // UPDATE historial_movimientos / updated_at → buffer local (solo updated_at).
        if (q.includes('historial_movimientos') || q.includes('SET updated_at')) {
          if (filaLocal) {
            filaLocal = { ...filaLocal, updated_at: new Date().toISOString() };
          }
          return { rows: [] };
        }

        // SELECT fila por id (reread tras UPDATE).
        if (q.includes('FROM requerimientos') && q.includes('WHERE id = $1')) {
          return { rows: [filaLocal] };
        }

        return { rows: [] };
      },
      release() {
        // Si se libera sin COMMIT/ROLLBACK, descartar (equivalente a rollback implícito).
        if (begun) {
          filaLocal = null;
          eventosLocales = [];
          begun = false;
          liberarLock(txnId);
        }
      },
    };

    return client;
  }

  return {
    connect,
    get row() {
      return fila;
    },
    get eventos() {
      return eventos;
    },
  };
}