# RC8.6B — Estándar visual institucional Estado / Responsable

Documento de presentación **exclusiva**. No modifica lógica de negocio, Workflow, asignaciones, permisos, migraciones, endpoints ni base de datos.

## Contrato de entrada

Fuente primaria visual:

```js
row.estado_responsable_vigente = {
  estadoCodigo,
  estadoLabel,
  etapaCodigo,
  etapaLabel,
  responsableTipo,       // PERSONA | UNIDAD | PENDIENTE
  responsableUsuarioId,
  responsableUsername,
  responsableNombre,
  responsableUnidad,
  responsableFuente,
  actualizadoAt,
}
```

**No usar como fuente visual vigente:** `created_by`, `usuario_modificacion`, `responsable` / `responsable_actual` legacy (salvo vía adapter), `sub_modulo_actual`, `centro`, `centro_costo`, `workflowSnapshot`, nombre de módulo, último modificador.

## Adapter

`src/ui/workflow/adaptEstadoResponsable.js` → `adaptEstadoResponsable(row)`

1. Prioriza `estado_responsable_vigente`.
2. Fallback legacy **solo** en este archivo.
3. Nunca infiere persona desde `created_by`, `usuario_modificacion`, centro o submódulo.
4. Sin persona válida → unidad válida o **"Pendiente de asignación"**.

## Catálogo oficial

`src/ui/workflow/estadoCatalogo.js`

Cada entrada: `{ codigo, label, categoria, icono, prioridad, tooltip }`.

Sin hex/RGB/CSS en JS. Categorías:

| Categoría   | Clase CSS                         |
|-------------|-----------------------------------|
| PENDIENTE   | `sgc-estado-badge--pending`       |
| EN_PROCESO  | `sgc-estado-badge--progress`      |
| DERIVADO    | `sgc-estado-badge--derived`       |
| OBSERVADO   | `sgc-estado-badge--observed`      |
| DEVUELTO    | `sgc-estado-badge--returned`      |
| APROBADO    | `sgc-estado-badge--approved`      |
| COMPLETADO  | `sgc-estado-badge--completed`     |
| ANULADO     | `sgc-estado-badge--cancelled`     |
| FINALIZADO  | `sgc-estado-badge--finalized`     |
| DESCONOCIDO | `sgc-estado-badge--unknown`       |

Estado no registrado → `DESCONOCIDO` + label recibido o **"Estado no catalogado"**.

## Tokens CSS

`src/styles/workflow-status.css` (importado desde `src/styles.css`).

Tipografía / dimensiones: `--sgc-workflow-*`.

Colores por categoría: `--sgc-status-{pending|progress|derived|observed|returned|approved|completed|cancelled|finalized|unknown}-{bg|text|border}`.

## Iconos (Bootstrap Icons)

| Categoría   | Icono                    |
|-------------|--------------------------|
| PENDIENTE   | `bi-hourglass-split`     |
| EN_PROCESO  | `bi-arrow-repeat`        |
| DERIVADO    | `bi-box-arrow-right`     |
| OBSERVADO   | `bi-exclamation-triangle`|
| DEVUELTO    | `bi-arrow-return-left`   |
| APROBADO    | `bi-check-circle`        |
| COMPLETADO  | `bi-check2-all`          |
| ANULADO     | `bi-x-circle`            |
| FINALIZADO  | `bi-flag`                |
| DESCONOCIDO | `bi-question-circle`     |

Responsable: `bi-person` / `bi-building` / `bi-person-dash`.

## Componentes

| Archivo | Uso |
|---------|-----|
| `EstadoBadge.js` | Badge de estado (catálogo + tokens) |
| `ResponsableBadge.js` | PERSONA / UNIDAD / PENDIENTE |
| `EstadoResponsableCell.js` | Celda combinada |

API: `src/ui/workflow/index.js` (incluye `renderBadgeEstadoVigenteHtml` FE).

### Variantes de celda

- **compact:** estado + responsable
- **standard:** + etapa
- **detailed:** + `actualizadoAt` (formato `es-PE`; sin `Invalid Date`)

## Módulos migrados

Bandejas y presentadores que consumen adapter / componentes centrales:

- Registro / Evaluación / DEC / Programación / Coordinación CM / Invitaciones (`estadoModernBadge` → `renderEstadoVisualHtml`)
- Consultas y Observaciones, Recepción Cotizaciones, Validaciones, Cuadro Comparativo, CCP
- Registro de Órdenes, Recepción de Bienes
- Detalle / trazabilidad (`reqShared`, presenters)
- Dashboard (etiquetas vía `getEstadoVigenteLabel` / `getResponsableVigenteLabel` → adapter)

## Módulos NO IMPLEMENTADOS (stubs)

| Vista | Estado |
|-------|--------|
| `presentacionEntregableView.js` (Conformidad Servicios) | Stub — sin lógica ficticia |
| `ampliacionResolucionView.js` | Stub — sin estados inventados |
| `derivacionPagoView.js` (Pagos / TESORERIA) | Stub — solo etiqueta visible |

Al desarrollarse: usar `adaptEstadoResponsable` + `EstadoResponsableCell` / badges centrales.

## Pagos / TESORERIA

- Etiqueta visible: **Pagos** (menú, catálogo de permisos label, textos UI).
- Código interno, permisos id, ruta `ejecucion/pago`: **TESORERIA** (sin renombrar).

## Prohibiciones

- Fallbacks locales de responsable/estado fuera del adapter.
- Inferir persona desde `created_by` / `usuario_modificacion` / centro / submódulo.
- Colores hex inline para estado en vistas migradas.
- Badges locales de workflow que dupliquen el catálogo.
- Inventar estados o responsables en stubs.
- Cambiar lógica de negocio o Workflow.

## Instrucciones para desarrolladores

1. En bandejas nuevas: `adaptEstadoResponsable(row)` + `renderEstadoResponsableCellHtml(row, 'standard')` (o badges sueltos).
2. Importar badges de expediente desde `src/ui/workflow/index.js`, no desde `shared/estadoExpedienteVigente.js` en FE.
3. Badges de **otro dominio** (cotización portal, validación técnica APTO, prioridad, proveedor) se mantienen locales.
4. Nuevos códigos de estado: registrar categoría en `estadoCatalogo.js` (sin inventar códigos de Workflow).
5. Prueba: `node scripts/test-rc86b-estandar-visual.mjs`.
