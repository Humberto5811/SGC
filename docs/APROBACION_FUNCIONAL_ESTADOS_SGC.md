# Paquete de aprobación funcional — Arquitectura de estados SGC

| Campo | Valor |
|-------|--------|
| Rama | `deploy/rc8-vps-20260725` |
| Fecha | 2026-07-28 |
| Propósito | Que el **propietario funcional** apruebe o corrija el modelo de estados antes de implementar |
| Fuentes | `DETALLED ESTADOS.docx` · `docs/ARQUITECTURA_FUNCIONAL_ESTADOS_SGC.md` · `docs/MATRIZ_ESTADOS_SGC.md` |
| Fase | **Solo documentación** — sin cambios de código |

### Cómo responder

Para cada bloque use una de estas marcas:

| Marca | Significado |
|-------|-------------|
| **APROBADO** | Se implementará tal como está |
| **MODIFICAR** | Indique el cambio en la sección final |
| **ELIMINAR** | No debe existir en el catálogo |
| **AGREGAR** | Falta un elemento; descríbalo al final |
| **PENDIENTE** | Aún no decide |

---

## 1. ¿Qué se está pidiendo aprobar?

Se pide fijar de una sola vez:

1. Los **16 submódulos** del flujo.
2. Qué se muestra como **estado global** en todas las bandejas.
3. Qué queda como **estado interno**, **situación**, **evento** o **documento**.
4. Las **etiquetas** visibles (texto que ve el usuario).
5. La **prioridad** (qué estado “gana” cuando hay varios).
6. Los flujos de **bienes**, **servicios** y el vacío de **locadores**.
7. **Ampliaciones**, **Orden resuelta** y **Derivación a pago**.
8. Las **20 decisiones** que aún requiere el propietario.

Sin esta aprobación, cualquier corrección de bandejas seguirá siendo un parche aislado.

---

## 2. Mapa oficial de los 16 submódulos

> Penalidades **no** son un submódulo aparte: son una **capacidad** de Derivación a pago.

| # | Nombre oficial | Objetivo | Actor principal | Aplica a | Al ingresar (global) | Al finalizar (global) | Internos clave | Acciones | Destino siguiente | Observación | Decisión |
|---|----------------|----------|-----------------|----------|----------------------|------------------------|----------------|----------|-------------------|-------------|----------|
| 1 | Registro de Requerimiento | Crear el expediente | Área Usuaria | Todos | — | Requerimiento registrado | Borrador | Registrar | Evaluación | Implementado | [ ] APROBADO [ ] MODIFICAR |
| 2 | Evaluación de Requerimientos | Revisar y dar pase | Área Usuaria | Todos | Requerimiento registrado | Aprobado / Observado | En evaluación | Observar, Aprobar | DEC | | [ ] |
| 3 | DEC (requerimiento) | Aprobar ingreso al circuito | DEC | Todos | En DEC | Aprobado DEC / Observado DEC | — | Observar, Aprobar | Programación | DEC aparece otra vez en el Cuadro | [ ] |
| 4 | Programación | Programar la compra | Programación | Todos | En programación | Programación aprobada | — | Observar, Aprobar | Coordinación CM | | [ ] |
| 5 | Coordinación CM (previa) | Visto bueno antes de invitar | Coordinador CM | Todos | En Coordinación CM | Coord. CM aprobada | — | Observar, Aprobar | Invitaciones | ¿Es módulo propio o parte de Programación? | [ ] (#17) |
| 6 | Invitaciones | Elaborar y enviar convocatoria | Analista | Todos | Invitación en elaboración | Invitación enviada | Borrador SC | Observar, Elaborar, Enviar | Consultas / Cotizaciones | Varios códigos hoy | [ ] |
| 7 | Consultas y Observaciones | Absolver consultas del proveedor | AU / Analista | Todos | Consultas recibidas | Consultas absueltas | Por consulta | Absolver | Cotizaciones | ¿Estado global o solo interno? | [ ] (#19) |
| 8 | Recepción de Cotizaciones | Recibir ofertas | Proveedor / Analista | Todos | Cotización recibida | Cotizaciones recibidas (¿?) | Por proveedor | Presentar | Validaciones | ¿Por proveedor o del expediente? | [ ] (#20) |
| 9 | Validaciones | Validar con Área Usuaria | Analista / AU | Todos | Validación enviada | Validado por AU | Revisada / Observada | Enviar, Observar, Validar | Cuadro Comparativo | | [ ] |
| 10 | Cuadro Comparativo | Adjudicar y firmar | Analista / Coord. CM / DEC | Todos | C.C. generado | C.C. aprobado | En Coord. CM / En DEC | Generar, Observar, Aprobar, Derivar | CCP | Coord. CM y DEC del **cuadro** | [ ] |
| 11 | CCP | Registrar certificación | Analista CCP / OPPM | Todos | CCP registrada | CCP registrada | Enviada a OPPM | Registrar, Enviar OPPM | Registro de Órdenes | Etiqueta: registrada vs registrado | [ ] |
| 12 | Registro de Órdenes | Emitir y notificar orden | Analista | Todos | Orden registrada | Orden notificada | Lista para notificación; cronograma | Registrar, Notificar | Bienes / Servicios / Locadores | “Enviada” = alias de notificada (recomendado) | [ ] |
| 13 | Recepción de Bienes | Recibir y conformar bienes | Almacén / AU / Coord. CM | **Bienes** | Orden notificada | Conformidad a analista | Acta, conformidad AU | Recibir, Enviar acta, Conformar, Derivar | Derivación a pago | **No implementado** | [ ] |
| 14 | Presentación de Entregable | Recibir y conformar servicios | AU / Coord. CM | **Servicios** | Orden notificada | Conformidad a analista | Entregable, acta | Registrar recepción, Conformar, Derivar | Derivación a pago | **No implementado** | [ ] |
| 15 | Ampliaciones / Resolución | Ampliar plazo o resolver orden | Según decisión | Todos | (transversal) | Orden resuelta (si aplica) | Ampliación registrada/aprobada | Registrar ampliación; Registrar resolución | Sigue flujo o cierra | **No implementado** contractual | [ ] |
| 16 | Derivación a Pago | Revisar, facturar, penalizar, derivar | Analista de pago | Todos | Pendiente revisión pago | Expediente derivado a pago | Factura, penalidad, observado | Revisar, Observar, Facturar, Calcular, Descargar | Fuera SGC / fin operativo | Penalidades aquí, no submódulo aparte | [ ] |

---

## 3. Diferenciar los conceptos (tabla de categorías)

| Categoría | Qué es | Qué ve el usuario | Ejemplo | Qué **no** es |
|-----------|--------|-------------------|---------|---------------|
| **A. Estado global del expediente** | Avance único visible en **todas** las bandejas | Una etiqueta principal | Orden notificada; CCP registrada; C.C. aprobado | Un clic aislado |
| **B. Estado interno del submódulo** | Detalle solo útil dentro del módulo | En pantallas del módulo | Orden lista para notificación; Validación enviada | El único badge de toda la bandeja |
| **C. Situación del expediente** | Condición transversal (no cambia sola la etapa) | Suele ir junto al global | Observado; Normal; Anulado | “Observar” como verbo |
| **D. Evento o acción** | Hecho que dispara un cambio | Botón / historial | Observar; Aprobar; Derivar; Notificar | Estado permanente |
| **E. Estado documental** | Vida de un archivo | En el documento | Acta generada; Factura registrada; CCP activo | Estado del expediente completo |
| **F. Estado de una cotización** | Por proveedor / oferta | En recepción de cotizaciones | Cotización recibida | Estado de todo el expediente (salvo que se apruebe agregado) |
| **G. Estado de una orden** | De la orden de contratación | Registro de órdenes y bandejas | Orden registrada; Orden notificada | Menú “Registro de Órdenes” |
| **H. Estado de recepción / entrega / entregable** | De una línea o entrega | Módulo de bienes o servicios | Bien recibido; Entregable presentado | Sustituir el estado de toda la orden si hay varias entregas |

### Clasificación rápida de elementos frecuentes

| Elemento | Clasificación recomendada | Decisión |
|----------|---------------------------|----------|
| Observar | **D** Evento/acción | [ ] APROBADO |
| Aprobar | **D** Evento/acción | [ ] |
| Devolver | **D** Evento (+ situación Observado) | [ ] |
| CCP registrada | **A** Global (+ **E** documental) | [ ] |
| Orden notificada | **A** Global y **G** Orden | [ ] |
| Orden registrada | **A** / **G** | [ ] |
| Factura registrada | **E** Documental / **B** Interno de pago | [ ] |
| Penalidad calculada | **B** Interno de pago (no global) | [ ] |
| Consultas recibidas | **B** Interno (¿o A?) | [ ] (#19) |
| Cotización recibida | **F** Cotización | [ ] (#20) |
| Bien recibido por almacén | **H** (+ ¿A?) | [ ] (§8) |
| C.C. en Coord. CM — Observado | **A** + **C** Situación | [ ] |

---

## 4. Catálogo global propuesto (solo lo que se muestra en todas las bandejas)

Principio: **no** convertir cada clic o documento en estado global.

| N° | Código | Etiqueta visible | Submódulo | Se activa cuando… | Anterior | Siguiente | Prioridad | Bienes/Serv/Loc | Hoy | Decisión |
|----|--------|------------------|-----------|-------------------|----------|-----------|-----------|-----------------|-----|----------|
| 1 | `REQUERIMIENTO_REGISTRADO` | Requerimiento registrado | Registro | Se registra el req. | — | Evaluación | 100 | Todos | Parcial | [ ] |
| 2 | `REQUERIMIENTO_EN_EVALUACION` | En evaluación | Evaluación | Ingresa a evaluación | Registrado | Observado / Aprobado | 110 | Todos | Parcial | [ ] |
| 3 | `REQUERIMIENTO_APROBADO` | Requerimiento aprobado | Evaluación | AU aprueba | En evaluación | En DEC | 120 | Todos | Parcial | [ ] |
| 4 | `REQUERIMIENTO_EN_DEC` | En DEC | DEC req. | Deriva a DEC | Aprobado | Aprobado DEC | 200 | Todos | Parcial | [ ] |
| 5 | `REQUERIMIENTO_APROBADO_DEC` | Aprobado por DEC | DEC req. | DEC aprueba | En DEC | En programación | 210 | Todos | Parcial | [ ] |
| 6 | `EN_PROGRAMACION` | En programación | Programación | Ingresa a prog. | Aprobado DEC | Prog. aprobada | 220 | Todos | Parcial | [ ] |
| 7 | `PROGRAMACION_APROBADA` | Programación aprobada | Programación | Prog. aprueba | En prog. | Coord. CM | 230 | Todos | Parcial | [ ] |
| 8 | `EN_COORDINACION_CM` | En Coordinación CM | Coord. CM previa | Ingresa a CM | Prog. aprobada | CM aprobada | 300 | Todos | Parcial | [ ] (#17) |
| 9 | `COORDINACION_CM_APROBADA` | Coordinación CM aprobada | Coord. CM | CM aprueba | En CM | Invitación | 310 | Todos | Parcial | [ ] |
| 10 | `INVITACION_EN_ELABORACION` | Invitación en elaboración | Invitaciones | Crea SC | CM aprobada | Invitación enviada | 400 | Todos | Parcial | [ ] |
| 11 | `INVITACION_ENVIADA` | Invitación enviada | Invitaciones | Envía convocatoria | En elaboración | Consultas/Cotiz. | 410 | Todos | Parcial | [ ] |
| 12 | `COTIZACIONES_RECIBIDAS` | Cotizaciones recibidas | Recepción cotiz. | Cierre recepción (si se aprueba) | Cotiz. por proveedor | Validaciones | 510 | Todos | No | [ ] (#20) |
| 13 | `VALIDADO_POR_AU` | Validado por Área Usuaria | Validaciones | AU valida | Validación enviada | C.C. generado | 530 | Todos | Parcial | [ ] |
| 14 | `CUADRO_COMPARATIVO_GENERADO` | C.C. generado | Cuadro | Genera cuadro | Validado | En Coord. CM | 600 | Todos | Parcial | [ ] |
| 15 | `CUADRO_EN_COORDINACION_CM` | C.C. en Coordinación CM | Cuadro | Envía a CM | Generado | En DEC / Observado | 610 | Todos | Parcial | [ ] |
| 16 | `CUADRO_EN_DEC` | C.C. en DEC | Cuadro | Envía a DEC | Coord. CM | Aprobado / Observado | 620 | Todos | Parcial | [ ] |
| 17 | `CUADRO_COMPARATIVO_APROBADO` | C.C. aprobado | Cuadro | DEC aprueba | En DEC | CCP registrada | 630 | Todos | Parcial | [ ] |
| 18 | `CCP_REGISTRADA` | CCP registrada | CCP | Registra CCP | C.C. aprobado | Orden registrada | 700 | Todos | Sí* | [ ] |
| 19 | `ORDEN_REGISTRADA` | Orden registrada | Órdenes | Registra OC/OS | CCP | Orden notificada | 800 | Todos | Sí | [ ] |
| 20 | `ORDEN_NOTIFICADA` | Orden notificada | Órdenes | Notifica al proveedor | Orden registrada (vía lista) | Bienes/Servicios | 840 | Todos | Sí | [ ] |
| 21 | `BIEN_RECIBIDO_ALMACEN` | Bien recibido por almacén | Recepción bienes | Almacén recibe | Orden notificada | Conformidad… | 910 | Bienes | No | [ ] (§8) |
| 22 | `ENTREGABLE_RECIBIDO_AREA_USUARIA` | Entregable recibido | Entregable | AU recibe | Orden notificada | Conformidad… | 920 | Servicios | No | [ ] |
| 23 | `CONFORMIDAD_DERIVADA_COORDINACION_CM` | Conformidad en Coordinación CM | Conformidad | Deriva a CM | Conformidad AU | A analista | 1000 | Bienes/Serv. | No | [ ] |
| 24 | `CONFORMIDAD_DERIVADA_ANALISTA` | Conformidad asignada a analista | Pago | CM asigna analista | Conformidad CM | Trámite pago | 1010 | Bienes/Serv. | No | [ ] |
| 25 | `EXPEDIENTE_DERIVADO_PAGO` | Expediente derivado a pago | Pago | Deriva / descarga para pago | Revisión completa | Fin operativo SGC | 1100 | Todos | No | [ ] (#15) |
| 26 | `ORDEN_RESUELTA` | Orden resuelta | Resolución | Registra resolución | Cualquiera post-orden | Terminal / transversal | 1200 | Todos | No | [ ] |

\*Hoy el código usa `CCP_REGISTRADO` (masculino); se recomienda alinear a **CCP registrada**.

**Situaciones** (no son filas globales aparte): `NORMAL`, `OBSERVADO` (siempre con etapa), `ANULADO`.  
**Total estados globales recomendados en esta tabla:** **26** (ajustable si elimina #12, #21 o cambia parciales).

Recomendación técnica: las filas “Observado” se muestran como **estado global + situación Observado**, no como 10 estados globales extras.

---

## 5. Catálogo interno por submódulo (separación)

### 5.1 Registro de Requerimiento
- **Global:** Requerimiento registrado  
- **Internos:** Borrador  
- **Situaciones:** —  
- **Documentales:** Formulario / adjuntos  
- **Eventos:** Registrar  
- Decisión: [ ] APROBADO [ ] MODIFICAR

### 5.2 Evaluación de Requerimientos
- **Global:** En evaluación; Requerimiento aprobado  
- **Situaciones:** Observado  
- **Eventos:** Observar, Aprobar  
- Decisión: [ ]

### 5.3 DEC (requerimiento)
- **Global:** En DEC; Aprobado por DEC  
- **Situaciones:** Observado por DEC  
- **Eventos:** Observar, Aprobar  
- Decisión: [ ]

### 5.4 Programación
- **Global:** En programación; Programación aprobada  
- **Situaciones:** Observado  
- **Eventos:** Observar, Aprobar  
- Decisión: [ ]

### 5.5 Coordinación CM (previa a invitaciones)
- **Global:** En Coordinación CM; Coordinación CM aprobada  
- **Situaciones:** Observado  
- **Eventos:** Observar, Aprobar  
- Decisión: [ ] (#17)

### 5.6 Invitaciones
- **Global:** Invitación en elaboración; Invitación enviada  
- **Internos:** Borrador de solicitud  
- **Situaciones:** Observado  
- **Eventos:** Elaborar, Observar, Enviar  
- Decisión: [ ]

### 5.7 Consultas y Observaciones
- **Global visible (opcional):** según decisión #19  
- **Internos:** Consultas recibidas; Consultas absueltas  
- **Eventos:** Recibir consulta, Absolver  
- Decisión: [ ]

### 5.8 Recepción de Cotizaciones
- **Por cotización (F):** Cotización recibida  
- **Global (opcional):** Cotizaciones recibidas  
- **Eventos:** Presentar cotización  
- Decisión: [ ] (#20)

### 5.9 Validaciones
- **Global posible:** Validado por AU  
- **Internos:** Validación enviada; Validación revisada por AU  
- **Situaciones:** Observado  
- **Eventos:** Enviar a AU, Observar, Validar  
- Decisión: [ ]

### 5.10 Cuadro Comparativo
- **Global visible:**  
  - C.C. generado  
  - C.C. en Coordinación CM  
  - C.C. en DEC  
  - C.C. aprobado  
- **Situaciones:** Observado por Coordinación CM; Observado por DEC  
- **Documentales:** Borrador; Generado; Firmado Coordinador; Firmado DEC  
- **Eventos:** Generar, Observar, Devolver, Aprobar, Derivar a CCP  
- Decisión: [ ]

### 5.11 CCP
- **Global:** CCP registrada  
- **Internos / documentales:** Solicitud preparada; Enviada a OPPM; Código CCP activo  
- **Eventos:** Preparar, Enviar a OPPM, Registrar CCP  
- Decisión: [ ]

### 5.12 Registro de Órdenes
- **Global:** Orden registrada; Orden notificada  
- **Internos:** Orden lista para notificación; Cronograma definido; Inicio de actividad  
- **Documentales:** Orden firmada; Docs de notificación  
- **Eventos:** Registrar, Adjuntar firma, Guardar cronograma, Notificar  
- **Estado de orden adicional (¿global?):** Recepción de orden confirmada por proveedor — decisión #2  
- Decisión: [ ]

### 5.13 Recepción de Bienes
- **Global recomendado (mínimo):** Bien recibido por almacén; Conformidad en Coord. CM; Conformidad a analista  
- **Internos:** Acta enviada a AU; Conformidad pendiente AU; Acta en almacén  
- **Documentales:** Acta de recepción; Acta de conformidad  
- **Eventos:** Recibir, Enviar acta, Devolver conformidad, Derivar  
- Decisión: [ ]

### 5.14 Presentación de Entregable (Servicios)
- **Global recomendado (mínimo):** Entregable recibido; Conformidad en Coord. CM; Conformidad a analista  
- **Internos:** Entregable pendiente / presentado; Conformidad pendiente  
- **Documentales:** Acta de conformidad de servicio  
- **Eventos:** Presentar, Recibir, Conformar, Derivar  
- **Multi-entregable:** una línea no cierra la orden — decisión #5–6  
- Decisión: [ ]

### 5.15 Ampliaciones / Resolución
- **Ampliación:** preferible **no** cambiar el global; registrar evento + historial de plazos (ver §11)  
- **Resolución — Global:** Orden resuelta  
- **Documentales:** Sustento de resolución  
- **Eventos:** Registrar ampliación; Registrar resolución  
- Decisión: [ ]

### 5.16 Derivación a Pago
- **Global:** Pendiente revisión pago *(opcional)*; Expediente derivado a pago  
- **Internos:** En revisión; Documentación observada/subsanada; Expediente completo  
- **Documentales:** Factura registrada  
- **Resultados internos:** Penalidad en cálculo; Penalidad calculada  
- **Eventos:** Revisar, Observar (almacén/AU), Registrar factura, Calcular penalidad, Descargar expediente, Derivar  
- **No incluir aún:** Devengado, Girado, Pagado  
- Decisión: [ ]

---

## 6. Etiquetas oficiales recomendadas

| Código canónico | Etiqueta encontrada hoy | Etiqueta oficial recomendada | Históricos / sinónimos a conservar en normalizador | Observación | Decisión |
|-----------------|-------------------------|------------------------------|-----------------------------------------------------|-------------|----------|
| `ORDEN_NOTIFICADA` | Orden notificada / Orden enviada | **Orden notificada** | `ORDEN_ENVIADA`, `ORDEN_ENVIADA_PENDIENTE_CONFIRMACION`, `PENDIENTE_CONFIRMACION` | El documento funcional dice “Orden notificada”. Un solo código visible. | [ ] |
| `CCP_REGISTRADA` | CCP registrado | **CCP registrada** | `CCP_REGISTRADO`, `REGISTRADO_CCP` | Concordancia con el documento (“CCP registrada”). | [ ] |
| `ORDEN_REGISTRADA` | Orden registrada | **Orden registrada** | `ORDEN_BORRADOR`, `CRONOGRAMA_DEFINIDO` | Aliases internos → misma etiqueta | [ ] |
| `CUADRO_EN_COORDINACION_CM` | C.C. en revisión Coordinador CM | **C.C. en Coordinación CM** | `PENDIENTE_COORDINADOR`, `FIRMADO_COORDINADOR` | | [ ] |
| `CUADRO_COMPARATIVO_APROBADO` | C.C. aprobado | **C.C. aprobado** | `APROBADO_DEC`, (ojo con `DERIVADO_CCP`) | “Derivado a CCP” puede ser evento/transición, no la etiqueta de aprobado | [ ] |
| `ORDEN_RESUELTA` | — | **Orden resuelta** | — | Exigido por el documento | [ ] |
| `EXPEDIENTE_DERIVADO_PAGO` | — | **Expediente derivado a pago** | — | Estado final operativo recomendado | [ ] |

**Recomendación Cursor — enviada vs notificada:**  
Código único `ORDEN_NOTIFICADA` · Etiqueta **Orden notificada** · Mantener `ORDEN_ENVIADA*` solo como historial compatible.

---

## 7. Flujo común propuesto (texto)

```text
Requerimiento registrado
  → [AU aprueba evaluación] → En DEC
  → [DEC aprueba] → En programación
  → [Programación aprueba] → En Coordinación CM          ← 1ª vez Coord. CM (visto bueno a invitar)
  → [Coord. CM aprueba] → Invitación en elaboración
  → [Analista envía] → Invitación enviada
  → [Consultas / Absueltas] → (interno o global según #19)
  → [Proveedor presenta] → Cotización recibida (por proveedor)
  → [Analista / AU] → Validado por AU
  → [Analista genera] → C.C. generado
  → [Coord. CM revisa] → C.C. en Coordinación CM         ← 2ª vez Coord. CM (sobre el cuadro)
  → [DEC revisa] → C.C. en DEC                             ← 2ª vez DEC (sobre el cuadro)
  → [DEC aprueba] → C.C. aprobado
  → [Registra CCP] → CCP registrada
  → [Registra orden] → Orden registrada
  → [Notifica proveedor] → Orden notificada
```

**DEC dos veces:** (1) aprobación del requerimiento · (2) aprobación del cuadro.  
**Coordinación CM dos veces:** (1) previa a invitaciones · (2) revisión del cuadro.

Decisión del flujo común: [ ] APROBADO [ ] MODIFICAR

---

## 8. Flujo de bienes

```text
Orden notificada
  → Recepción pendiente                         [interno recomendado]
  → Bien recibido por almacén                   [¿GLOBAL? — ver abajo]
  → Acta enviada al Área Usuaria                [evento / interno]
  → Conformidad pendiente AU                    [interno]
  → Conformidad recibida por almacén            [interno / documental]
  → Conformidad derivada a Coordinación CM      [global recomendado]
  → Conformidad asignada al analista            [global recomendado]
  → Trámite de pago                             [global: pendiente revisión / derivado]
```

### ¿“Bien recibido por almacén” en todas las bandejas?

| Opción | Efecto | Recomendación Cursor |
|--------|--------|----------------------|
| **A.** Sí, estado global | Todas las bandejas muestran el avance físico | **Recomendada** si la gestión necesita visibilidad institucional |
| **B.** Solo en Recepción de Bienes | Otras bandejas siguen en “Orden notificada” hasta conformidad | Más simple, menos ruido |

**Recomendación:** Opción **A** para el primer avance físico significativo; los pasos de acta pueden ser internos.

Multi-ítem / recepción parcial: **PENDIENTE** (#4).  
Decisión flujo bienes: [ ] APROBADO [ ] MODIFICAR · Opción A/B: [ ]

---

## 9. Flujo de servicios

```text
Orden notificada
  → Entregable pendiente                        [interno / por entrega]
  → Entregable presentado / recibido por AU     [¿global? recomendado al primer avance]
  → Conformidad del Área Usuaria                [interno / documental]
  → Conformidad derivada a Coordinación CM      [global]
  → Conformidad asignada al analista            [global]
  → Trámite de pago
```

**Casos no asumidos (marcar decisión):**

| Caso | Estado |
|------|--------|
| Varios entregables en una orden | Pendiente (#5) |
| Recepción / presentación parcial | Pendiente (#5) |
| Conformidad parcial | Pendiente (#6) |
| Observación y subsanación de entregable | Pendiente (modelo observación) |

**Regla propuesta:** el estado de **una** entrega no reemplaza el de la orden mientras existan entregas pendientes.  
Decisión flujo servicios: [ ] APROBADO [ ] MODIFICAR

---

## 10. Flujo de locadores — lo encontrado

| Tipo | Contenido |
|------|-----------|
| **Implementado** | Tipificación “locador” en contratación / sugerencia OC-OS; portal y órdenes genéricos |
| **Inferido** | Podría parecerse a servicios (entregable + conformidad) |
| **No definido** | Flujo propio de presentación, conformidad, factura/recibo, penalidades específicas |

**Preguntas mínimas al propietario:**

1. ¿El locador usa el mismo flujo de **servicios**?  
2. ¿Quién recibe el entregable / informe?  
3. ¿Quién emite conformidad?  
4. ¿Factura, recibo por honorarios u otro documento?  
5. ¿Las penalidades de locadores tienen regla distinta a bienes/servicios?  
6. ¿Deriva a pago igual que servicios?

Decisión: [ ] Igual a servicios [ ] Flujo propio (describir) [ ] PENDIENTE

---

## 11. Ampliaciones — propuesta sencilla

| Pregunta | Opción A | Opción B (recomendada) |
|----------|----------|-------------------------|
| ¿Cambia el estado global? | Pasa a “En ampliación” | **Mantiene** el global (ej. Orden notificada / En ejecución) |
| ¿Qué se registra? | Nuevo estado | **Situación** opcional + **evento** `AMPLIACION_APROBADA` + datos |

**Datos que siempre se conservan:**

- Plazo original y fecha máxima original  
- Plazo ampliado y fecha máxima recalculada  
- Sustento / documento  
- Responsable y fecha de aprobación  
- Historial completo (no borrar)

**Recomendación Cursor:** **Opción B** (no cambiar el global).  
Decisión: [ ] A [ ] B [ ] MODIFICAR

---

## 12. ORDEN RESUELTA

| Campo | Propuesta | Estado |
|-------|-----------|--------|
| Código | `ORDEN_RESUELTA` | Para aprobar |
| Etiqueta | **Orden resuelta** | Exigida por el documento |
| Quién registra | Analista / área competente | **PENDIENTE** definir |
| Quién aprueba | ¿DEC / Coord. CM / otro? | **PENDIENTE** |
| Documentos | Sustento + anexos de la resolución | Sí (documento) |
| ¿Terminal? | Recomendado: **sí** (bloquea avance normal) | **PENDIENTE** (#12) |
| ¿Parcial? | No definido | **PENDIENTE** (#11) |
| Efecto en entregas pendientes | No definido | **PENDIENTE** (#13) |
| Efecto en conformidad / pago / penalidades | No definido | **PENDIENTE** |
| Reversión | No definida | **PENDIENTE** |

Decisión bloque: [ ] APROBADO código/etiqueta [ ] MODIFICAR · Resto: completar decisiones #11–13

---

## 13. Derivación a pago

### Globales recomendados
1. Pendiente de revisión de pago *(opcional, al asignar analista)*  
2. **Expediente derivado a pago** (cierre operativo del SGC)

### Internos recomendados
- En revisión de pago  
- Documentación observada / subsanada  
- Expediente de pago completo  

### Documentales / resultados
- Factura registrada (**documental**)  
- Penalidad calculada (**interno**, no global)  

### Eventos
Revisar · Observar a almacén · Observar a AU · Registrar factura · Calcular penalidad · Descargar expediente · Derivar  

### No agregar ahora
Devengado · Girado · Pagado  

Decisión: [ ] APROBADO [ ] MODIFICAR · Estado final SGC = “Derivado a pago” (#15): [ ] Sí [ ] No, usar “Pagado” [ ] PENDIENTE

---

## 14. Veinte decisiones funcionales (fichas)

Ordenadas por impacto.

### Bloqueantes para corregir estados actuales (implementar resolvedor)

---

**Decisión 1 — Orden enviada vs Orden notificada**  
- **Pregunta:** ¿Son el mismo estado?  
- **Contexto:** El documento dice “Orden notificada”; el código aún tiene `ORDEN_ENVIADA*`.  
- **Opciones:** (A) Un solo estado `ORDEN_NOTIFICADA` (B) Dos estados distintos  
- **Recomendación Cursor:** **A**  
- **Consecuencia A:** Etiqueta única en todas las bandejas; aliases históricos se normalizan.  
- **Consecuencia B:** Hay que definir cuándo pasa de enviada a notificada.  
- **Respuesta del propietario:** [PENDIENTE]

---

**Decisión 2 — Recepción del proveedor**  
- **Pregunta:** ¿La confirmación de recepción de la orden por el proveedor es estado global independiente?  
- **Contexto:** Existe `ORDEN_RECEPCION_CONFIRMADA` en código.  
- **Opciones:** (A) Global (B) Solo interno de órdenes/portal (C) No mostrar  
- **Recomendación:** **B** (no saturar bandejas)  
- **Respuesta:** [PENDIENTE]

---

**Decisión 18 — DEC dos veces**  
- **Pregunta:** ¿DEC del requerimiento y DEC del cuadro se distinguen siempre en la etiqueta?  
- **Opciones:** (A) Sí (“En DEC” vs “C.C. en DEC”) (B) Misma etiqueta  
- **Recomendación:** **A**  
- **Respuesta:** [PENDIENTE]

---

**Decisión (etiquetas) — CCP registrada vs registrado**  
- **Pregunta:** ¿Código y etiqueta oficiales?  
- **Opciones:** (A) `CCP_REGISTRADA` / “CCP registrada” (B) Mantener `CCP_REGISTRADO`  
- **Recomendación:** **A** (alineado al documento)  
- **Respuesta:** [PENDIENTE]

---

**Decisión (modelo) — Observado como situación**  
- **Pregunta:** ¿“Observado” va como situación junto al estado de etapa, o como estado global compuesto?  
- **Opciones:** (A) Situación + etapa (B) Estados monolíticos `…_OBSERVADO`  
- **Recomendación:** **A**  
- **Respuesta:** [PENDIENTE]

---

### Necesarias para bienes y servicios

---

**Decisión 3 — Inicio del plazo**  
- **Pregunta:** ¿El inicio de actividad / plazo debe verse como estado global?  
- **Opciones:** (A) Global (B) Interno de la orden/cronograma  
- **Recomendación:** **B**  
- **Respuesta:** [PENDIENTE]

---

**Decisión 4 — Recepción parcial de bienes**  
- **Pregunta:** ¿Genera estado global?  
- **Opciones:** (A) Sí (B) Solo interno por ítem (C) Global solo al completar  
- **Recomendación:** **B** o **C**  
- **Respuesta:** [PENDIENTE]

---

**Decisión 5 — Entrega parcial de servicios**  
- **Pregunta:** ¿Una entrega parcial cambia el estado global de la orden?  
- **Opciones:** (A) Sí siempre (B) No, hasta completar (C) Global “En ejecución parcial”  
- **Recomendación:** **B** con detalle interno por entregable  
- **Respuesta:** [PENDIENTE]

---

**Decisión 6 — Conformidad parcial**  
- **Pregunta:** ¿Puede haber conformidad parcial?  
- **Opciones:** (A) Sí (B) No  
- **Recomendación:** Alinear con #4–5; si multi-entrega, **A** a nivel línea  
- **Respuesta:** [PENDIENTE]

---

**Decisión 16 — Locadores**  
- **Pregunta:** ¿Cómo se maneja el flujo de locadores?  
- **Opciones:** (A) Igual a servicios (B) Flujo propio (C) Diferir  
- **Recomendación:** **A** hasta que exista normativa distinta  
- **Respuesta:** [PENDIENTE]

---

**Decisión 17 — Coordinación CM previa**  
- **Pregunta:** ¿Es módulo independiente o revisión dentro de Programación?  
- **Opciones:** (A) Independiente (B) Dentro de Programación  
- **Recomendación:** **A** si el documento lo lista aparte  
- **Respuesta:** [PENDIENTE]

---

### Necesarias para ampliaciones y resolución

---

**Decisión 9 — Quién aprueba ampliación**  
- **Respuesta:** [PENDIENTE]

---

**Decisión 10 — Ampliación observada bloquea**  
- **Pregunta:** ¿Bloquea el expediente?  
- **Opciones:** (A) Sí (B) No  
- **Recomendación:** **A** mientras no se resuelva  
- **Respuesta:** [PENDIENTE]

---

**Decisión 11 — Resolución parcial**  
- **Respuesta:** [PENDIENTE]

---

**Decisión 12 — ORDEN_RESUELTA siempre terminal**  
- **Recomendación:** **Sí**  
- **Respuesta:** [PENDIENTE]

---

**Decisión 13 — Entregas ya recibidas tras resolución**  
- **Respuesta:** [PENDIENTE]

---

### Necesarias para pago

---

**Decisión 7 — Más de una factura por orden**  
- **Respuesta:** [PENDIENTE]

---

**Decisión 8 — Pago parcial**  
- **Respuesta:** [PENDIENTE]

---

**Decisión 14 — ¿Deriva por el SGC o solo descarga?**  
- **Opciones:** (A) Solo descarga expediente (B) Cambio de estado en SGC (C) Ambos  
- **Recomendación:** **C** — descarga + estado `EXPEDIENTE_DERIVADO_PAGO`  
- **Respuesta:** [PENDIENTE]

---

**Decisión 15 — Estado final del SGC**  
- **Opciones:** (A) Derivado a pago (B) Pagado (C) Ambos en el futuro  
- **Recomendación:** **A** ahora; Pagado solo si hay integración tesorería  
- **Respuesta:** [PENDIENTE]

---

### Futuras / de diseño de consultas-cotizaciones

---

**Decisión 19 — Consultas: ¿global o interno?**  
- **Recomendación:** **Interno** del proceso de convocatoria, con badge secundario si hace falta  
- **Respuesta:** [PENDIENTE]

---

**Decisión 20 — Cotización recibida: ¿por proveedor o global?**  
- **Recomendación:** **Por proveedor**; global “Cotizaciones recibidas” solo al cierre  
- **Respuesta:** [PENDIENTE]

---

## 15. Decisiones que bloquean la implementación

No iniciar el **resolvedor global** ni el **presentador único** mientras estén sin respuesta:

| # | Tema | Por qué bloquea |
|---|------|-----------------|
| 1 | Enviada vs Notificada | Código y etiqueta únicos en todas las bandejas |
| CCP | Registrada vs Registrado | Catálogo canónico |
| Modelo | Observado = situación vs estado compuesto | Diseño del catálogo |
| 15 | Estado final SGC | Prioridad y terminales |
| 12 | ORDEN_RESUELTA terminal | Cierres y validaciones |
| 17 | Coord. CM previa | Mapa de submódulos y prioridades 300 |
| 16 | Locadores (si se implementa post-orden ya) | Bifurcación de flujo |

Pueden esperar a fases posteriores (bienes/pago): #4–8, #9–11, #13–14, #19–20, #2–3.

---

## 16. Causa del error actual (lenguaje claro)

Un mismo expediente puede mostrar:

- en **Registro de Órdenes:** “Orden notificada”
- en **otras bandejas:** “CCP registrado”

**Por qué ocurre**

1. Registro de Órdenes **sí** conoce la orden (`estado` de la orden + fecha de envío al proveedor).  
2. Las demás bandejas, al armar la fila, suelen traer solo **indicadores de CCP** (código CCP activo).  
3. El presentador visual, si ve CCP activo, **fuerza** el texto “CCP registrado”, aunque la orden ya haya avanzado.  
4. Resultado: dos “verdades” distintas para el mismo expediente.

**Piezas técnicas involucradas (sin corregir aún)**

- `shared/estadoExpedienteVigente.js` — prioridades y resolvedor  
- `server/lib/ccpEstadoFlags.js` — adjunta flags CCP **sin** datos de orden  
- `src/utils/estadoVisualPresenter.js` — fuerza etiqueta CCP cuando `ccpRegistrado`  
- `src/views/contratacion/registroOrdenesView.js` — camino correcto con evidencia de orden  

---

## 17. Propuesta de solución (para aprobar el enfoque)

```text
Datos y evidencias (CCP, orden, cuadro, validación, …)
    → Normalización de códigos antiguos
    → Resolvedor central (una sola prioridad)
    → Estado global uniforme + situación
    → Estado interno separado por módulo
    → Presentador común
    → Todas las bandejas muestran lo mismo
```

| Se centraliza | No se centraliza |
|---------------|------------------|
| Catálogo, normalizador, resolvedor, presentador, prioridad | Detalle operativo de cada módulo (cronograma línea a línea, textos de observación) |
| Historial de transiciones globales | UI específica de cada bandeja |

**Historial:** cada cambio deja evento (quién, cuándo, de→a, motivo).  
**Códigos antiguos:** se mapean; no se borran de inmediato.  
**Evitar retrocesos:** un estado interno o documental **nunca** baja el global si hay evidencia más avanzada (regla: Orden notificada > CCP registrada).

Decisión del enfoque: [ ] APROBADO [ ] MODIFICAR

---

## 18. Formato de respuesta para el propietario

### APROBACIONES GENERALES

- [ ] Apruebo el mapa de submódulos.  
- [ ] Apruebo los estados globales.  
- [ ] Apruebo los estados internos.  
- [ ] Apruebo las etiquetas.  
- [ ] Apruebo la prioridad.  
- [ ] Apruebo el flujo de bienes.  
- [ ] Apruebo el flujo de servicios.  
- [ ] Apruebo el tratamiento de ampliaciones.  
- [ ] Apruebo ORDEN RESUELTA.  
- [ ] Apruebo el flujo de derivación a pago.  

Nombre del propietario: ________________  
Fecha: ________________  
Firma / conformidad: ________________  

### MODIFICACIONES SOLICITADAS

1.  
2.  
3.  

### ESTADOS QUE DEBEN AGREGARSE

1.  
2.  
3.  

### ESTADOS QUE DEBEN ELIMINARSE

1.  
2.  
3.  

### DECISIONES PENDIENTES (completar aquí las respuestas)

1. Enviada vs Notificada:  
2. CCP registrada vs registrado:  
3. Observado como situación:  
4. Bien recibido ¿global?:  
5. Estado final SGC:  
6. ORDEN RESUELTA terminal:  
7. Locadores:  
8. Coordinación CM previa:  
9. Otras:  

---

## 19. Resumen para Cursor / seguimiento

| Indicador | Valor |
|-----------|--------|
| Documento creado | `docs/APROBACION_FUNCIONAL_ESTADOS_SGC.md` |
| Estados globales recomendados (tabla §4) | **26** |
| Bloques de estados internos (§5) | **16** submódulos |
| Eventos separados (acciones tipo) | **≈25+** (Observar, Aprobar, Derivar, Notificar, …) |
| Equivalencias históricas destacadas | **≥10** (enviada→notificada, CCP_REGISTRADO, aliases orden, cuadro) |
| Decisiones bloqueantes | §15 (≈7 temas) |
| Decisiones no bloqueantes / diferibles | Resto de las 20 |
| Recomendación ORDEN_NOTIFICADA | Código único + etiqueta “Orden notificada” |
| Recomendación ORDEN_RESUELTA | Código `ORDEN_RESUELTA`, etiqueta “Orden resuelta”, terminal recomendado |
| Recomendación ampliaciones | No cambiar global; historial de plazos obligatorio |
| Recomendación estado final SGC | “Expediente derivado a pago” (no “Pagado” aún) |
| Código funcional modificado | **No** |
| Commit / push | **No** |

---

*Fin del paquete de aprobación. Tras la respuesta del propietario se elaborará el prompt de implementación definitiva.*
