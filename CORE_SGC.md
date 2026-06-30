# SGC Core — Núcleo de Trazabilidad y Workflow

Documentación del directorio `/core`. **Fase 2A:** reestructuración arquitectónica — el **Requerimiento** es la entidad principal; el **Expediente** es contenedor documental.

> Este núcleo **no reemplaza** la lógica operativa actual (rutas, pantallas, APIs, BD). Prepara la migración module-by-module en fases posteriores.

## Modelo conceptual

```
REQUERIMIENTO  (entidad principal — identidad constante durante todo el flujo)
        │
        ├────────────── Workflow        (estados del requerimiento)
        │
        ├────────────── Timeline        (trazabilidad por requerimientoId)
        │
        ├────────────── Historial       (Registro → DEC → … → Ejecución)
        │
        ├────────────── Observaciones   (asociadas al requerimientoId)
        │
        ├────────────── Auditoría       (requerimientoId como entidad principal)
        │
        └────────────── Expediente      (contenedor documental)
                            │
                            ├── Adjuntos
                            ├── Pedidos
                            ├── Informes
                            ├── Cotizaciones
                            ├── Contratos
                            ├── CCP
                            ├── Órdenes
                            └── Documentos versionados
```

### Jerarquía futura (interfaces preparadas, sin implementación)

```
REQUERIMIENTO → PAQUETE → SOLICITUD DE COTIZACIÓN → PROCESO DE CONTRATACIÓN → CCP → ORDEN DE COMPRA
```

Campos multientidad reservados: `entidad`, `sede`, `area`, `dependencia`, `programaPresupuestal`.

## Arquitectura de directorios

```
core/
├── common/
│   ├── CatalogoEventos.js        Catálogo único EVENTOS_FUNCIONALES
│   ├── ConstantesEstados.js      Estados del requerimiento + ciclo observación + módulo
│   ├── ConstantesEventos.js      Entidades, módulos del flujo, tipos documentales
│   ├── ConstantesJerarquia.js    Interfaces futuras (paquete, SC, CCP, OC)
│   └── Utils.js                  Store, resolvers requerimientoId / compat legacy
├── requerimiento/
│   └── RequerimientoManager.js   Centro del Core
├── expediente/
│   └── ExpedienteManager.js      Solo documentación + adaptador legacy
├── trazabilidad/
│   ├── TimelineManager.js        Eventos funcionales cronológicos
│   ├── HistorialManager.js       Bitácora completa (fecha, usuario, módulo, evento…)
│   ├── ObservacionManager.js     Ciclo Emitida → … → Cerrada
│   ├── TrazabilidadOrchestrator.js  Secuencias derivación/recepción y ramas observación
│   ├── AdjuntoManager.js
│   └── AuditoriaManager.js
├── workflow/
│   ├── EstadoManager.js
│   ├── WorkflowManager.js
│   └── DerivacionManager.js
├── workflowEngine/               ← Fase 1 — única autoridad del flujo
│   ├── WorkflowEngine.js
│   ├── WorkflowState.js
│   ├── WorkflowTransitions.js
│   ├── WorkflowPermissions.js
│   ├── WorkflowContext.js
│   ├── MigrationFacade.js        ← Fase 3A.1
│   ├── adapters/
│   │   └── RegistroWorkflowAdapter.js
│   └── index.js
├── eventEngine/                  ← Fase 2 — distribución de eventos
│   ├── EventCatalog.js
│   ├── EventContext.js
│   ├── EventEngine.js
│   ├── EventDispatcher.js
│   ├── EventSubscribers.js
│   ├── adapters/
│   │   └── RegistroEventAdapter.js
│   └── index.js
├── interfaces/
│   └── WorkflowContracts.js      ← Contratos comunes (Fase 3A.1)
└── index.js                      crearCoreSGC()
```

## Entidades

| Concepto | Rol | Identificadores |
|----------|-----|-----------------|
| **Requerimiento** | Entidad principal del flujo | `requerimientoId`, `codigoRequerimiento` |
| **Expediente** | Carpeta documental del requerimiento | `expedienteId` (vinculado a `requerimientoId`) |

## Estados del workflow (Requerimiento)

`BORRADOR` → `REGISTRADO` → `DEC` → `PROGRAMACIÓN` → `COORDINACIÓN CM` → `INVITACIONES` → `CONSULTAS` → `VALIDACIÓN` → `CUADRO COMPARATIVO` → `CCP` → `EJECUCIÓN` → `FINALIZADO`

Usar siempre `ESTADOS` / `ESTADOS_REQUERIMIENTO` de `ConstantesEstados.js`. **Nunca** estados del expediente.

Estados de observación (ciclo completo, separados del estado del requerimiento):

`EMITIDA` → `RECIBIDA` → `EN ATENCIÓN` → `SUBSANADA` → `RECIBIDA POR EL EMISOR` → `CERRADA`

Usar `CICLO_OBSERVACION` / `ESTADOS_OBSERVACION` en `ConstantesEstados.js`. No confundir con el binario legacy `OBSERVADO` / `RESPONDIDO` / `CERRADO` (`ESTADOS_OBSERVACION_LEGACY`).

Estados operativos por módulo (`ESTADOS_MODULO`): `RECIBIDO`, `EN PROCESO`, `OBSERVADO`, `SUBSANADO`, `APROBADO`, `DERIVADO`, etc.

## Catálogo de eventos funcionales

Archivo: `core/common/CatalogoEventos.js` — catálogo único reutilizable (`EVENTOS_FUNCIONALES`).

| Categoría | Ejemplos |
|-----------|----------|
| Recepción | `REQUERIMIENTO_RECIBIDO`, `EXPEDIENTE_RECIBIDO`, `OBSERVACION_RECIBIDA`, `SUBSANACION_RECIBIDA` |
| Derivación | `DERIVADO_A_DEC`, `DERIVADO_A_PROGRAMACION`, … `DERIVADO_A_EJECUCION` |
| Observaciones | `OBSERVACION_REGISTRADA`, `OBSERVACION_ENVIADA`, `OBSERVACION_ATENDIDA`, `OBSERVACION_CERRADA` |
| Subsanaciones | `SUBSANACION_INICIADA`, `SUBSANACION_REGISTRADA`, `SUBSANACION_ENVIADA`, `SUBSANACION_ACEPTADA` |
| Aprobaciones | `APROBADO`, `RECHAZADO`, `DEVUELTO`, `ARCHIVADO` |
| Documentos | `DOCUMENTO_AGREGADO`, `DOCUMENTO_ELIMINADO`, `DOCUMENTO_ACTUALIZADO` |
| Invitaciones | `SOLICITUD_COTIZACION_CREADA`, `INVITACION_ENVIADA`, `COTIZACION_RECIBIDA` |
| Validación (futuro) | `VALIDACION_REGISTRADA`, `VALIDACION_APROBADA`, `VALIDACION_OBSERVADA` |

Helpers: `obtenerEvento(codigo)`, `obtenerEventoDerivacion(moduloDestino)`, `listarEventosPorCategoria(categoria)`.

El Timeline registra **eventos funcionales**, no solo cambios de estado global del requerimiento.

## Managers

### RequerimientoManager (centro del Core)

| Método | Descripción |
|--------|-------------|
| `registrarRequerimiento(payload)` | Alta del requerimiento en store del Core |
| `obtenerRequerimiento(requerimientoId)` | Vista consolidada: timeline, historial, obs, adjuntos, expediente |
| `obtenerEstadoActual / Responsable / Modulo` | Vigencia del requerimiento |
| `actualizarEstado(requerimientoId, estado, opts)` | Workflow + historial + timeline |
| `vincularExpediente(requerimientoId, expedienteId)` | Asocia contenedor documental |
| `obtenerContextoMultientidad(requerimientoId)` | Plantilla futura (sin lógica operativa) |

### ExpedienteManager (documental + compatibilidad)

| Método documental | Descripción |
|-------------------|-------------|
| `crearExpediente(requerimientoId, opts)` | Crea contenedor y lo vincula al requerimiento |
| `agregarDocumento(expedienteId, doc)` | Registra documento en el expediente |
| `consultarDocumentos(expedienteId, filtros)` | Lista documentos |
| `versionarDocumento(expedienteId, docId, opts)` | Nueva versión |
| `organizarCarpetas(expedienteId, estructura)` | Árbol de carpetas |
| `adjuntarArchivo(expedienteId, archivo)` | Delega en AdjuntoManager (nivel expediente) |
| `obtenerExpedienteDocumental(expedienteId)` | Solo documentos y adjuntos |

| Métodos `@deprecated` (compat fase 1) | Comportamiento |
|---------------------------------------|----------------|
| `obtenerExpediente(expedienteId)` | Delega en `RequerimientoManager` si está configurado |
| `obtenerTimeline / Historial / Observaciones / Estado` | Alias → requerimiento (expedienteId = requerimientoId legacy) |

### TimelineManager

Trabaja con `requerimientoId` y `codigoRequerimiento`. Registra **eventos funcionales** del catálogo, no solo cambios de estado.

| Método | Descripción |
|--------|-------------|
| `registrarEvento(payload)` | Registro genérico (compat fase 1) |
| `registrarEventoFuncional(codigoEvento, payload)` | Desde `EVENTOS_FUNCIONALES` |
| `obtenerTimelineCronologico(requerimientoId)` | Vista cronológica para render |
| `filtrarEventos(requerimientoId, criterios)` | Filtro por módulo, tipo, rango de fechas |

### HistorialManager

Bitácora del **requerimiento** con esquema: fecha, hora, usuario, módulo, evento, descripción, estado anterior/nuevo, observación, adjuntos.

| Método | Descripción |
|--------|-------------|
| `registrarAccion(payload)` | Registro completo estabilizado |
| `registrarCambio(payload)` | Alias legacy → `registrarAccion` |

Sigue `MODULOS_FLUJO`: Registro, DEC, Programación, Coordinación CM, Invitaciones, Portal Proveedores, Validación, Cuadro Comparativo, CCP, Ejecución.

### ObservacionManager

Ciclo completo por observación (`CICLO_OBSERVACION`). Integrado con Timeline e Historial vía factory.

| Método | Descripción |
|--------|-------------|
| `crearObservacion(payload)` | Estado inicial EMITIDA + eventos registrada/enviada |
| `marcarRecibida(requerimientoId, obsId)` | RECIBIDA |
| `marcarEnAtencion(requerimientoId, obsId)` | EN ATENCIÓN |
| `registrarSubsanacion(requerimientoId, obsId, respuesta)` | SUBSANADA + eventos subsanación |
| `marcarRecibidaPorEmisor(requerimientoId, obsId)` | RECIBIDA POR EL EMISOR |
| `cerrarObservacion(requerimientoId, obsId)` | CERRADA |

### TrazabilidadOrchestrator

Coordina secuencias compuestas sin tocar APIs ni pantallas.

| Método | Descripción |
|--------|-------------|
| `registrarDerivacionConRecepcion(payload)` | Derivación + recepción en módulo destino |
| `registrarObservacionConRecepcion(payload)` | Observación emitida → recibida en destino |
| `registrarSubsanacionConRecepcion(...)` | Subsanación → recepción por emisor |
| `obtenerRecorridoModulos(requerimientoId)` | Línea base + ramas por observación |

### AdjuntoManager — dos niveles

1. **Nivel requerimiento:** `listarAdjuntosPorRequerimiento(requerimientoId)` — índice global.
2. **Nivel expediente:** `listarAdjuntos(EXPEDIENTE, expedienteId)` — archivo dentro del contenedor.

Todo adjunto registra `requerimientoId`, `codigoRequerimiento` y opcionalmente `expedienteId`.

### WorkflowManager

Administra estados del requerimiento y **registro automático por módulo** en Timeline + Historial.

| Método | Descripción |
|--------|-------------|
| `registrarRecibido(payload)` | Módulo recibe requerimiento |
| `registrarEnProceso(payload)` | En proceso |
| `registrarObservado(payload)` | Observación emitida (si aplica) |
| `registrarSubsanado(payload)` | Subsanación (si aplica) |
| `registrarAprobado(payload)` | Aprobación |
| `registrarDerivado(payload)` | Derivación + recepción opcional en destino |
| `registrarCambioEstado(payload)` | Cambio de estado global (compat) |

Transiciones lineales según `FLUJO_REQUERIMIENTO`.

> **Nota Fase 1:** `WorkflowManager` sigue disponible para compatibilidad con el Core documental. La autoridad del flujo operativo migra progresivamente a `WorkflowEngine` (ver capítulo siguiente).

## Workflow Engine (Fase 1 — arquitectura)

Directorio: `core/workflowEngine/`

Única autoridad del **flujo del requerimiento**. No conoce UI, componentes, botones ni CSS. **No persiste cambios** en esta fase: los métodos de acción (`aprobar`, `derivar`, `observar`, etc.) devuelven planes (`persistir: false`) para integración futura con el Event Engine.

### Responsabilidades

| Componente | Rol |
|------------|-----|
| `WorkflowState.js` | Catálogo de etapas (`estado_actual`), estados Core y adaptadores desde fila BD |
| `WorkflowTransitions.js` | Transiciones oficiales (lineales + por acción). **Sin observaciones** |
| `WorkflowPermissions.js` | Matriz de permisos por módulo + reglas dinámicas vía Motor de Observaciones |
| `WorkflowContext.js` | Contexto de decisión (`estado_actual`, `sub_modulo_actual`, historial RO) |
| `WorkflowEngine.js` | API unificada: estado, permisos, snapshot y validación |

### Arquitectura objetivo

```
Requerimiento
      │
      ▼
Workflow Engine        ← Fase 1 (implementado)
      │
      ▼
Event Engine           ← Fase 2 (implementado)
      │
      ├── Timeline
      ├── Historial
      └── Motor Observaciones (paralelo, no transiciones)
      │
      ▼
UI / Módulos
```

### Métodos principales (`WorkflowEngine`)

| Método | Descripción |
|--------|-------------|
| `obtenerEstado()` | Estado de negocio + etapa operativa |
| `obtenerModuloActual()` / `obtenerModuloAnterior()` / `obtenerModuloDestino()` | Ubicación en el flujo |
| `obtenerResponsable()` | Responsable vigente (adaptador `responsable_actual`) |
| `puedeAprobar()` / `puedeObservar()` / `puedeSubsanar()` / `puedeCerrar()` / `puedeDerivar()` | Permisos centralizados |
| `obtenerAccionesPermitidas()` | Lista de acciones habilitadas |
| `obtenerWorkflowSnapshot()` | Objeto único para UI futura |
| `validarTransicion(destino)` | Valida contra catálogo oficial |
| `aprobar()` / `derivar()` / `observar()` / `subsanar()` / `cerrar()` | Plan de acción (sin persistir en Fase 1) |

### Workflow Snapshot

```javascript
{
  requerimientoId,
  codigo,
  estado,
  etapaActual,
  moduloActual,
  subModuloActual,
  moduloAnterior,
  moduloDestino,
  responsable,
  accionesPermitidas,
  workflowValido,
  siguientePaso,
  pasoAnterior,
  transicionDefaultValida,
  historialEstadosCount,
  fase: 1,
}
```

### Flujo oficial de etapas

`Registro` → `Evaluación` → `DEC` → `Programación` → `Coordinación CM` → `Invitaciones` → `Portal Proveedores` → `Validación` → `Cuadro Comparativo` → `CCP` → `Orden de Compra` → `Ejecución` → `Liquidación` → `Archivo` → `Finalizado`

Las **observaciones no son transiciones** de este catálogo; se resuelven en `shared/observacionesMotor.js`.

### Uso (Fase 1 — sin cambiar rutas ni pantallas)

```javascript
import { crearWorkflowEngine } from './core/workflowEngine/index.js';

const engine = crearWorkflowEngine(filaRequerimiento, {
  moduloConsulta: 'DEC',
  moduloLabel: 'DEC',
});

const snap = engine.obtenerWorkflowSnapshot();
console.log(snap.accionesPermitidas, snap.moduloDestino);

if (engine.puedeAprobar()) {
  const plan = engine.aprobar({ usuario: 'dec' });
  // plan.persistir === false en Fase 1
}
```

### Compatibilidad

- Adaptadores internos para `estado_actual`, `sub_modulo_actual`, `responsable_actual` e `historial_estados`.
- `WorkflowManager` y rutas Express **no se eliminan** en esta fase.
- Los módulos (Registro, Evaluación, DEC, …) **no se migran aún**; continúan con su lógica actual.

### Transición hacia Event Engine (Fase 2)

En Fase 2, cada acción del `WorkflowEngine` puede emitir eventos canónicos vía `EventEngine.emitDesdePlanWorkflow()` **sin persistir** Timeline/Historial/Observaciones. El snapshot y los catálogos de la Fase 1 son la base sin rediseño.

## Event Engine (Fase 2 — distribución)

Directorio: `core/eventEngine/`

Segunda capa del Core. El **Workflow Engine emite**; el **Event Engine distribuye** hacia los motores suscriptores. **No escribe** directamente en Timeline, Historial, Observaciones, Auditoría, Dashboard ni KPIs en esta fase.

### Arquitectura de capas

```
Requerimiento
      │
      ▼
Workflow Engine        ← autoridad del flujo (Fase 1)
      │ emit / plan
      ▼
Event Engine           ← distribución (Fase 2)
      │
      ├── Timeline       (migración Fase 3+)
      ├── Historial
      ├── Observaciones
      ├── Auditoría
      ├── Dashboard
      └── KPIs
      │
      ▼
UI / Módulos           (sin migrar en Fase 2)
```

### Responsabilidades por capa

| Capa | Responsabilidad | NO hace |
|------|-----------------|---------|
| **Workflow Engine** | Estado, permisos, transiciones, planes de acción | Registrar Timeline/Historial directamente |
| **Event Engine** | Validar catálogo, construir contexto, despachar eventos | Persistir en motores legacy |
| **Motores legacy** | TimelineManager, HistorialManager, etc. | Decidir flujo (permanece hasta migración) |

### Componentes

| Archivo | Rol |
|---------|-----|
| `EventCatalog.js` | Catálogo único `EVENTOS.*` — prohibido usar strings sueltos |
| `EventContext.js` | Contexto compartido: requerimientoId, módulos, snapshots, payload |
| `EventSubscribers.js` | `subscribe()` / `unsubscribe()` por evento y canal |
| `EventDispatcher.js` | Enruta a canales: TIMELINE, HISTORIAL, OBSERVACIONES, AUDITORIA, DASHBOARD, KPIS |
| `EventEngine.js` | API: `emit()`, `emitSync()`, `emitAsync()`, `registrarEvento()` |

### Event Snapshot

```javascript
{
  evento,
  eventoLabel,
  categoria,
  origen,
  destino,
  requerimientoId,
  codigoRequerimiento,
  workflow,
  observaciones,
  usuario,
  fecha,
  hora,
  timestamp,
  payload,
}
```

### Uso (Fase 2 — sin alterar rutas ni pantallas)

```javascript
import { crearCoreSGC, EVENTOS_ENGINE } from './core/index.js';

const core = crearCoreSGC();
const eventEngine = core.crearEventEngine();

eventEngine.subscribe(EVENTOS_ENGINE.REQUERIMIENTO_APROBADO, (ctx) => {
  // Futuro: core.timeline.registrarEventoFuncional(...)
  console.log('evento recibido', ctx.obtenerEventSnapshot());
}, { canal: 'TIMELINE' });

eventEngine.emitSync(EVENTOS_ENGINE.OBSERVACION_EMITIDA, {
  requerimientoId: 42,
  codigoRequerimiento: 'REQ-001',
  moduloOrigen: 'DEC',
  moduloDestino: 'Evaluación de Requerimiento',
  usuario: 'dec',
  payload: { motivo: '...' },
});

// Integración preparada Workflow → Event (solo emisión)
const wf = core.crearWorkflowEngine(
  { id: 42, estado: 'En tramite de aprobación', estado_actual: 'EVALUACION' },
  { moduloLabel: 'Evaluación de Requerimiento' },
);
const plan = wf.aprobar({ usuario: 'gerente' });
// plan.eventEmission.persistido === false
```

### Integración Workflow Engine

Cuando `crearCoreSGC()` instancia el core, inyecta `eventEngine` en `crearWorkflowEngine()`. Los métodos `aprobar()`, `derivar()`, `observar()`, `subsanar()` y `cerrar()` llaman internamente a `eventEngine.emitDesdePlanWorkflow()` **solo para emitir** — no reemplazan las rutas operativas actuales.

### Migración Fase 3+ (subscriptores → managers legacy)

Los subscriptores por canal conectarán TimelineManager, HistorialManager, ObservacionManager y AuditoriaManager. Hasta entonces, el sistema operativo (Express + Vite + BD) **permanece igual**.

## Proceso de Migración (Fase 3A.1 — preparación)

Inventario completo: `docs/MIGRATION_INVENTORY_3A1.md`

### Arquitectura de migración

```
Módulo (Registro, Evaluación, …)
        │
        ▼
MigrationFacade            ← punto único futuro para módulos
        │
        ▼
Workflow Adapter           ← RegistroWorkflowAdapter (3A.1)
        │
        ▼
Workflow Engine            ← planes + permisos (Fase 1)
        │
        ▼
Event Adapter              ← RegistroEventAdapter (3A.1)
        │
        ▼
Event Engine               ← emit / dispatch (Fase 2)
        │
        ▼
Managers Legacy            ← Timeline, Historial, Observaciones… (sin conectar aún)
```

### Componentes 3A.1

| Artefacto | Ubicación | Rol |
|-----------|-----------|-----|
| `MigrationFacade` | `core/workflowEngine/MigrationFacade.js` | Orquesta adapter → engine → event → legacy |
| `RegistroWorkflowAdapter` | `core/workflowEngine/adapters/` | Delega acciones Registro al Workflow Engine |
| `RegistroEventAdapter` | `core/eventEngine/adapters/` | Emite eventos desde planes (sin Timeline/Historial) |
| `WorkflowContracts` | `core/interfaces/WorkflowContracts.js` | `WorkflowAction`, `WorkflowPlan`, `WorkflowResult`, etc. |

### Roadmap de migración

```
3A.1  Inventario + adapters + facade + contratos     ← actual (0 cambios funcionales)
  ↓
3A.2  Registro usa MigrationFacade (dual-write opcional)
  ↓
3A.3  Evaluación
  ↓
3B    Subscriptores Event Engine → Timeline / Historial
  ↓
3C    DEC, Programación, CM, Invitaciones, Portal
```

### Uso preparatorio (sin afectar rutas)

```javascript
import { crearCoreSGC } from './core/index.js';

const core = crearCoreSGC();
const facade = core.crearMigrationFacade();

const row = { id: 42, codigo: 'REQ-001', estado: 'Registrado', estado_actual: 'REGISTRADO' };
const result = facade.derivar(row, 'Evaluación de Requerimiento', { usuario: 'au' });
// result.plan.persistir === false
// result.evento.persistido === false
// result.legacy === null (ejecutarLegacy: false)
```

**Restricción 3A.1:** ningún módulo operativo importa aún `MigrationFacade`. Rutas Express y pantallas siguen usando `registrarMovimiento()` directamente.

### AuditoriaManager

Entidad principal: `requerimientoId`. El `expedienteId` aparece solo como dato relacionado.

## Compatibilidad legacy

En fase 1 varios consumidores usaban `expedienteId` como identificador principal. El Core mantiene:

- `resolverRequerimientoId(payload)` — acepta `requerimientoId` o `expedienteId`.
- `ExpedienteManager.obtenerExpediente()` — adaptador hacia `RequerimientoManager`.
- `ESTADOS_LEGACY` — catálogo fase 1 exportado sin eliminar.

**No se modificaron** rutas Express, pantallas Vite, ni tablas PostgreSQL.

## Uso recomendado

```javascript
import { crearCoreSGC, ESTADOS, ACCIONES } from './core/index.js';

const core = crearCoreSGC({
  obtenerUsuario: () => ({ id: 1, nombre: 'jperez' }),
});

const requerimientoId = '42';
const codigoRequerimiento = 'REQ-2026-001';

await core.requerimiento.registrarRequerimiento({
  requerimientoId,
  codigoRequerimiento,
  estadoActual: ESTADOS.BORRADOR,
});

const exp = await core.expediente.crearExpediente(requerimientoId, {
  codigoRequerimiento,
});

await core.timeline.registrarEvento({
  requerimientoId,
  codigoRequerimiento,
  modulo: 'Registro',
  accion: ACCIONES.CREADO,
  estadoAnterior: ESTADOS.BORRADOR,
  estadoNuevo: ESTADOS.REGISTRADO,
});

await core.adjuntos.agregarAdjunto({
  requerimientoId,
  codigoRequerimiento,
  expedienteId: exp.id,
  nombre: 'sustento.pdf',
  mimeType: 'application/pdf',
});

const req = await core.requerimiento.obtenerRequerimiento(requerimientoId);
```

### Compatibilidad con código que aún usa expedienteId

```javascript
// Sigue funcionando — expedienteId se interpreta como requerimientoId
await core.expediente.obtenerExpediente('42');
await core.timeline.registrarEvento({ expedienteId: '42', modulo: 'DEC', accion: ACCIONES.DERIVADO });
```

## Verificación

```powershell
npm run check
Get-ChildItem core/workflowEngine,core/eventEngine,core/interfaces -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
node --input-type=module -e "import { crearCoreSGC } from './core/index.js'; const c = crearCoreSGC(); const f = c.crearMigrationFacade(); const r = f.derivar({id:1,codigo:'REQ-1',estado:'Registrado',estado_actual:'REGISTRADO'},'Evaluación de Requerimiento',{usuario:'au'}); console.log('OK', r.ok, r.plan.tipo, r.evento.evento, !!c.migrationFacade);"
```

## Próxima fase

**3A.2** — Conectar Registro a `MigrationFacade` en paralelo con legacy (sin retirar `registrarMovimiento` todavía).
