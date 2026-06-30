# Inventario de migración — Fase 3A.1

Documento interno. **No modifica comportamiento.** Identifica todos los puntos donde el SGC altera workflow, trazabilidad u observaciones hoy.

---

## 1. Autoridad actual del estado (BD)

| Campo | Escritura principal |
|-------|---------------------|
| `estado` | `server/lib/trazabilidad.js` → `registrarMovimiento`, `registrarSubsanacionDerivacion`, `sincronizarEstadoNegocio` |
| `estado_actual` | Idem + `inicializarTrazabilidad`, `actosPreparatorios.js`, `invitaciones.js` |
| `sub_modulo_actual` | Idem |
| `responsable_actual` | Idem |
| `fecha_estado_actual` | Idem |
| `historial_estados` | Idem (JSONB append/close) |
| `historial_movimientos` | Idem + `registroEventos.js` → `appendEventosPorAccion` |

**Definición única de movimiento:** `server/lib/trazabilidad.js` → `registrarMovimiento()` (línea ~568).

---

## 2. `registrarMovimiento()` — invocaciones

| Archivo | Contexto |
|---------|----------|
| `server/lib/trazabilidad.js` | Implementación + UPDATE SQL |
| `server/index.js` | CRUD genérico `afterCreate` / `afterUpdate` requerimientos |
| `server/routes/requerimientosEspecial.js` | solicitar-aprobación, observar, aprobar-evaluación |
| `server/routes/contrataciones.js` | DEC aprobar, DEC observar, Programación observar/aprobar |
| `server/routes/programacion.js` | Derivaciones programación |
| `server/lib/actosPreparatorios.js` | asignar, derivar, observar, aprobar invitaciones |
| `server/lib/invitaciones.js` | sync etapa, observar, derivaciones |

---

## 3. Observaciones / subsanación (payload + traza)

| Función | Archivo |
|---------|---------|
| `emitirObservacion()` | `server/lib/observacionesWorkflow.js` |
| `appendObservacion()` | `server/lib/observacionesExpediente.js` |
| `registrarSubsanacionObservacion()` | `server/lib/observacionesWorkflow.js` |
| `procesarAccionObservacion()` | `server/lib/observacionesWorkflow.js` |
| `registrarSubsanacionDerivacion()` | `server/lib/trazabilidad.js` |
| Rutas PUT observar/subsanar | `requerimientosEspecial.js`, `contrataciones.js`, `actosPreparatorios.js`, `invitaciones.js` |

---

## 4. Timeline / historial (lectura y escritura)

| Capa | Archivo | Rol |
|------|---------|-----|
| Escritura movimientos | `server/lib/movimientos.js` | `buildMovimientoEntry`, `appendMovimiento` |
| Eventos por acción | `server/lib/registroEventos.js` | `appendEventosPorAccion` |
| Lectura agregada | `server/lib/trazabilidad.js` | `obtenerTrazabilidad`, `collectRawEvents`, `enrichRequerimientoRow` |
| API GET trazabilidad | `server/routes/requerimientosEspecial.js` | `/:id/trazabilidad` |
| Render UI timeline | `src/services/timelineService.js` | `renderTimeline`, `timelineHtml` |
| Cliente trazabilidad | `src/services/traceabilityService.js` | fetch API |
| Core (futuro) | `core/trazabilidad/TimelineManager.js`, `HistorialManager.js` | Store en memoria — no conectado a BD |

**Nota:** No existe `registrarTimeline()` ni `registrarHistorial()` como funciones globales en servidor; el equivalente operativo es `registrarMovimiento()` + `appendEventosPorAccion()`.

---

## 5. Core legacy (wrappers — no tocar en 3A.1)

| Manager | Archivo |
|---------|---------|
| WorkflowManager | `core/workflow/WorkflowManager.js` |
| EstadoManager | `core/workflow/EstadoManager.js` |
| DerivacionManager | `core/workflow/DerivacionManager.js` |
| TimelineManager | `core/trazabilidad/TimelineManager.js` |
| HistorialManager | `core/trazabilidad/HistorialManager.js` |
| ObservacionManager | `core/trazabilidad/ObservacionManager.js` |
| TrazabilidadOrchestrator | `core/trazabilidad/TrazabilidadOrchestrator.js` |

---

## 6. Motores nuevos (Fase 1–2 — no conectados a rutas)

| Motor | Archivo |
|-------|---------|
| WorkflowEngine | `core/workflowEngine/WorkflowEngine.js` |
| EventEngine | `core/eventEngine/EventEngine.js` |
| Motor observaciones shared | `shared/observacionesMotor.js` |

---

## 7. Puntos de entrada futuros — **Registro**

| # | Ubicación | Acción actual | Reemplazo futuro (3A.2+) |
|---|-----------|---------------|---------------------------|
| R1 | `server/index.js` → `afterCreate` | `inicializarTrazabilidad` | `MigrationFacade.crear()` |
| R2 | `server/index.js` → `afterUpdate` | `registrarMovimiento` (editado) | `MigrationFacade.editar()` |
| R3 | `requerimientosEspecial.js` → `solicitar-aprobacion` | `registrarMovimiento` derivado | `MigrationFacade.derivar()` |
| R4 | `reqShared.js` → subsanación | `subsanarConDestino` API | `MigrationFacade.subsanar()` |
| R5 | `registroRequerimientoView.js` ~2713 | `api.put solicitar-aprobacion` | Facade vía API adaptada |
| R6 | `registroRequerimientoView.js` create/update | `requerimientosService` CRUD | Facade crear/editar |
| R7 | Modal observaciones / bandeja | `handleBandejaObservaciones` | `MigrationFacade.observar()` |

---

## 8. Puntos de entrada futuros — **Evaluación**

| # | Ubicación | Acción actual | Reemplazo futuro |
|---|-----------|---------------|------------------|
| E1 | `requerimientosEspecial.js` → `observar` | `emitirObservacion` + `registrarMovimiento` | `MigrationFacade.observar()` |
| E2 | `requerimientosEspecial.js` → `subsanar` | `registrarSubsanacionObservacion` + `registrarSubsanacionDerivacion` | `MigrationFacade.subsanar()` |
| E3 | `requerimientosEspecial.js` → `aprobar-evaluacion` | `registrarMovimiento` + auto-cierre obs | `MigrationFacade.aprobar()` |
| E4 | `evaluacionRequerimientoView.js` | `observarEvaluacion`, `aprobarEvaluacion` | Facade vía servicio |
| E5 | `reqShared.js` | `addObservacionCustom`, subsanación | Facade |

---

## 9. Cliente — campos trazabilidad (solo lectura UI)

`estado_actual`, `historial_estados`, `historial_movimientos` consumidos en:

- `src/utils/bandejaUi.js`, `bandejaActions.js`, `bandejaRequerimientos.js`
- `src/utils/trazabilidad.js`
- `src/components/bandejaDetailPanel.js`
- Vistas DEC, Programación, Actos, Invitaciones, Evaluación, Registro

---

## 10. Resumen cuantitativo

| Patrón | Archivos afectados (aprox.) |
|--------|----------------------------|
| `registrarMovimiento` | 8 archivos servidor |
| Observaciones emitir/subsanar | 6 archivos servidor + 4 cliente |
| Campos trazabilidad BD | 15+ archivos (lectura/escritura) |
| Timeline render | 6 archivos cliente |

---

*Generado en Fase 3A.1 — preparación arquitectónica sin cambios funcionales.*
