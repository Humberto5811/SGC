# SGC Core — Núcleo de Trazabilidad y Workflow

Documentación del directorio `/core` (fase 1). Este núcleo **no reemplaza** la lógica operativa actual; prepara la arquitectura para migrar todos los módulos en la fase 2.

## Arquitectura

```
core/
├── common/              Constantes y utilidades compartidas
│   ├── ConstantesEstados.js
│   ├── ConstantesEventos.js
│   └── Utils.js
├── trazabilidad/        Timeline, historial, observaciones, adjuntos, auditoría
│   ├── TimelineManager.js
│   ├── HistorialManager.js
│   ├── ObservacionManager.js
│   ├── AdjuntoManager.js
│   └── AuditoriaManager.js
├── workflow/            Estados, transiciones y derivaciones
│   ├── EstadoManager.js
│   ├── WorkflowManager.js
│   └── DerivacionManager.js
├── expediente/          Fachada unificada del expediente
│   └── ExpedienteManager.js
└── index.js             Exportaciones y factory `crearCoreSGC()`
```

### Principios de diseño

| Principio | Descripción |
|-----------|-------------|
| **Sin acoplamiento** | Ningún manager importa Registro, DEC, Programación ni rutas Express. |
| **Inyección de dependencias** | Todos reciben un `contexto` con `store`, `obtenerUsuario`, `obtenerIp`, `obtenerNavegador`. |
| **Store intercambiable** | Por defecto usa memoria (`crearStoreEnMemoria`). En fase 2 se inyectará adaptador PostgreSQL. |
| **Constantes centralizadas** | Estados, acciones y tipos provienen de `common/` — no usar strings sueltos. |

## Managers y responsabilidades

### TimelineManager

Administra el timeline único del expediente.

| Método | Descripción |
|--------|-------------|
| `registrarEvento(payload)` | Registra evento con expediente, usuario, fecha/hora, módulo, acción, estados, observación, IP y adjuntos. |
| `obtenerTimeline(expedienteId)` | Devuelve `{ eventos, total }`. |
| `listarEventos(expedienteId)` | Lista ordenada cronológicamente. |
| `obtenerUltimoEvento(expedienteId)` | Último evento o `null`. |
| `filtrarEventos(expedienteId, criterios)` | Filtra por módulo, acción, estado, rango de fechas, etc. |

### HistorialManager

Registro detallado de cambios de valores.

| Método | Descripción |
|--------|-------------|
| `registrarCambio(payload)` | Usuario, cambio, fecha/hora, módulo, valor anterior/nuevo. |
| `obtenerHistorial(expedienteId)` | Devuelve `{ cambios, total }`. |
| `listarCambios(expedienteId)` | Lista completa. |

### ObservacionManager

Implementación única de observaciones.

| Método | Descripción |
|--------|-------------|
| `crearObservacion(payload)` | Origen/destino, módulos, estado, fechas. |
| `responderObservacion(expedienteId, id, respuesta)` | Registra respuesta y fecha. |
| `cerrarObservacion(expedienteId, id)` | Marca observación cerrada. |
| `obtenerPendientes(expedienteId)` | Sin respuesta y no cerradas. |
| `listarObservaciones(expedienteId)` | Todas las observaciones. |
| `contarPendientes(expedienteId)` | Contador de pendientes. |

### AdjuntoManager

Administración centralizada de archivos.

| Método | Descripción |
|--------|-------------|
| `agregarAdjunto(payload)` | Asocia a expediente, observación, SC, proveedor, validación o contrato. |
| `eliminarAdjunto(tipoEntidad, entidadId, adjuntoId)` | Elimina del store. |
| `listarAdjuntos(tipoEntidad, entidadId)` | Lista adjuntos de la entidad. |
| `descargarAdjunto(...)` | Retorna metadatos y contenido (base64 o referencia). |
| `contarAdjuntos(...)` | Total de adjuntos. |

Tipos soportados: `DOCUMENTO`, `PDF`, `EXCEL`, `IMAGEN`, `WORD`, `OTROS`.

### EstadoManager

Catálogo único: `BORRADOR`, `PENDIENTE`, `EN PROCESO`, `DERIVADO`, `OBSERVADO`, `RESPONDIDO`, `APROBADO`, `RECHAZADO`, `FINALIZADO`, `CERRADO`, `ANULADO`.

| Método | Descripción |
|--------|-------------|
| `obtenerCatalogo()` | Lista de estados válidos. |
| `esValido(estado)` | Valida contra catálogo. |
| `normalizar(estado)` | Normaliza texto a constante. |
| `esTerminal(estado)` | Indica si es estado final. |

### WorkflowManager

Estructura de flujo (transiciones provisionales; se ampliará en migración).

| Método | Descripción |
|--------|-------------|
| `obtenerSiguienteEstado(estadoActual)` | Estados destino permitidos. |
| `obtenerEstadoAnterior(estadoActual)` | Estado origen típico. |
| `validarTransicion(actual, nuevo)` | `{ valido, motivo }`. |
| `registrarMovimiento(payload)` | Delega en TimelineManager si está configurado. |
| `registrarCambioEstado(payload)` | Valida, registra en historial y timeline. |

### DerivacionManager

| Método | Descripción |
|--------|-------------|
| `derivar(payload)` | Origen, destino, usuario, fecha/hora, estado, comentario. |
| `obtenerDerivaciones(expedienteId)` | Todas las derivaciones. |
| `listarPendientes(expedienteId)` | Sin recepción confirmada. |
| `registrarRecepcion(expedienteId, derivacionId)` | Marca recibida. |

### AuditoriaManager

Registro automático de operaciones del sistema.

| Método | Descripción |
|--------|-------------|
| `registrar(payload)` | Usuario, IP, navegador, fecha/hora, acción, módulo, submódulo, tipo (`INSERT`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`). |
| `listar(filtros)` | Consulta con filtros opcionales. |

### ExpedienteManager

Fachada que agrega la vista completa del expediente.

| Método | Descripción |
|--------|-------------|
| `obtenerExpediente(expedienteId)` | Snapshot + timeline + historial + observaciones + adjuntos. |
| `obtenerEstadoActual(expedienteId)` | Estado vigente. |
| `obtenerResponsableActual(expedienteId)` | Responsable vigente. |
| `obtenerModuloActual(expedienteId)` | Módulo vigente. |
| `obtenerTimeline / obtenerHistorial / listarObservaciones / listarAdjuntos` | Delegación a managers especializados. |
| `actualizarVigencia(expedienteId, datos)` | Actualiza snapshot (uso interno en fase 2). |

## Cómo reutilizar el Core

### Instanciación recomendada

```javascript
import { crearCoreSGC, ESTADOS, ACCIONES, ENTIDADES_ADJUNTABLES } from './core/index.js';

const core = crearCoreSGC({
  obtenerUsuario: () => ({ id: 1, nombre: 'jperez' }),
  obtenerIp: () => '192.168.1.10',
  obtenerNavegador: () => 'Mozilla/5.0',
});

const expedienteId = 'REQ-2026-001';
```

### Ejemplo: registrar evento en timeline

```javascript
await core.timeline.registrarEvento({
  expedienteId,
  modulo: 'Registro',
  submodulo: 'Requerimiento',
  accion: ACCIONES.CREADO,
  estadoAnterior: ESTADOS.BORRADOR,
  estadoNuevo: ESTADOS.PENDIENTE,
  observacion: 'Requerimiento registrado',
  adjuntosRelacionados: [],
});
```

### Ejemplo: observación y respuesta

```javascript
const obs = await core.observaciones.crearObservacion({
  expedienteId,
  usuarioOrigen: 'evaluador1',
  usuarioDestino: 'registrador1',
  moduloOrigen: 'Evaluación',
  moduloDestino: 'Registro',
  motivo: 'Falta documento de sustento',
});

await core.observaciones.responderObservacion(
  expedienteId,
  obs.id,
  'Documento adjuntado en subsanación',
);
```

### Ejemplo: adjunto asociado a expediente

```javascript
await core.adjuntos.agregarAdjunto({
  tipoEntidad: ENTIDADES_ADJUNTABLES.EXPEDIENTE,
  entidadId: expedienteId,
  nombre: 'sustento.pdf',
  mimeType: 'application/pdf',
  referencia: '/storage/expedientes/sustento.pdf',
});
```

### Ejemplo: validar transición de workflow

```javascript
const { valido, motivo } = core.workflow.validarTransicion(
  ESTADOS.PENDIENTE,
  ESTADOS.EN_PROCESO,
);

if (valido) {
  await core.workflow.registrarCambioEstado({
    expedienteId,
    estadoAnterior: ESTADOS.PENDIENTE,
    estadoNuevo: ESTADOS.EN_PROCESO,
    modulo: 'Evaluación',
  });
}
```

### Ejemplo: vista consolidada del expediente

```javascript
const expediente = await core.expediente.obtenerExpediente(expedienteId);
console.log(expediente.timeline.total, expediente.observaciones.length);
```

### Adaptador PostgreSQL (fase 2)

Implementar un objeto con la misma interfaz que `crearStoreEnMemoria()`:

```javascript
const storePg = {
  async get(coleccion, id) { /* SELECT ... */ },
  async set(coleccion, id, valor) { /* UPSERT ... */ },
  async append(coleccion, claveLista, item) { /* INSERT en lista JSONB ... */ },
  async getLista(coleccion, claveLista) { /* ... */ },
};

const core = crearCoreSGC({ store: storePg });
```

Los managers no requieren cambios.

## Compatibilidad con el sistema actual

- **No se modificaron** rutas, pantallas ni flujos existentes en esta fase.
- El código legacy en `server/lib/trazabilidad.js`, `server/lib/movimientos.js` y `src/utils/trazabilidad.js` sigue operativo.
- La migración module-by-module usará `crearCoreSGC()` con store PostgreSQL y reemplazará llamadas legacy de forma incremental.

## Verificación

```bash
node --check core/index.js
node --check core/**/*.js   # PowerShell: Get-ChildItem core -Recurse -Filter *.js | % { node --check $_.FullName }
```

Todos los archivos deben pasar `node --check` sin errores de sintaxis.
