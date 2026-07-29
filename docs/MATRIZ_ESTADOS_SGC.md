# Matriz de estados SGC (catálogo operativo)

Fuente funcional: `DETALLED ESTADOS.docx`  
Arquitectura: `docs/ARQUITECTURA_FUNCIONAL_ESTADOS_SGC.md`  
Rama: `deploy/rc8-vps-20260725`  
Fase: solo documentación (sin implementación)

**Leyenda implementación:** `I` implementado · `P` parcial · `N` no implementado · `O` obsoleto/legacy · `D` duplicado  
**Leyenda tipo:** `G` global · `IN` interno · `DOC` documento · `SIT` situación · `EV` evento · `COT` cotización · `PROV` proveedor · `ORD` orden · `REC` recepción bien · `ENT` entregable · `CONF` conformidad · `AMP` ampliación · `RES` resolución · `PEN` penalidad · `PAG` pago

---

## A. Flujo común (candidatos funcionales + equivalencia código)

| # | Código canónico propuesto | Etiqueta visible | Tipo | Submódulo | Tipo contrat. | Evento entrada | Anterior | Siguiente | Actor | Prioridad guia | Encontrado en código | Impl. | Inconsistencia | Decisión pendiente |
|---|---------------------------|------------------|------|-----------|---------------|----------------|----------|-----------|-------|----------------|----------------------|-------|----------------|---------------------|
| 1 | `REQUERIMIENTO_REGISTRADO` | Requerimiento registrado | G | Registro | todos | REGISTRAR | — | EN_EVALUACION | AU | 100 | `REGISTRADO` / `estado_actual` | P | Dual label/etapa | Unificar código |
| 2 | `REQUERIMIENTO_EN_EVALUACION` | En evaluación | G | Evaluación | todos | DERIVAR_EVAL | REGISTRADO | OBSERVADO / APROBADO | AU | 110 | `EVALUACION` | P | | |
| 3 | `REQUERIMIENTO_OBSERVADO` | Requerimiento observado | G+SIT | Evaluación | todos | OBSERVAR | EN_EVALUACION | EN_EVALUACION | AU/DEC | 115 | `Observado` humano / motor obs | P | OBSERVADO genérico | Etapa+situación |
| 4 | `REQUERIMIENTO_APROBADO` | Requerimiento aprobado | G | Evaluación | todos | APROBAR | EN_EVALUACION | EN_DEC | AU | 120 | parcial | P | | |
| 5 | `REQUERIMIENTO_EN_DEC` | En DEC | G | DEC | todos | DERIVAR_DEC | APROBADO | OBS_DEC / APROB_DEC | DEC | 200 | `DEC` etapa | P | DEC=módulo y estado | |
| 6 | `REQUERIMIENTO_OBSERVADO_DEC` | Observado por DEC | G+SIT | DEC | todos | OBSERVAR_DEC | EN_DEC | EN_EVAL / EN_DEC | DEC | 205 | `Observado DEC` | P | | |
| 7 | `REQUERIMIENTO_APROBADO_DEC` | Aprobado DEC | G | DEC | todos | APROBAR_DEC | EN_DEC | EN_PROGRAMACION | DEC | 210 | `Aprobado DEC` | P | | |
| 8 | `EN_PROGRAMACION` | En programación | G | Programación | todos | DERIVAR_PROG | APROB_DEC | OBS / APROB | Prog. | 220 | `PROGRAMACION` / “En Programación” | P | | |
| 9 | `PROGRAMACION_OBSERVADA` | Programación observada | G+SIT | Programación | todos | OBSERVAR | EN_PROG | EN_PROG/DEC | Prog. | 225 | texto humano | P | | |
| 10 | `PROGRAMACION_APROBADA` | Programación aprobada | G | Programación | todos | APROBAR | EN_PROG | EN_COORD_CM | Prog. | 230 | “Aprobado Programación” / Programado | P | | |
| 11 | `EN_COORDINACION_CM` | En Coordinación CM | G | Coord. CM previa | todos | DERIVAR_CM | PROG_APROB | OBS/APROB | Coord. CM | 300 | `COORDINACIÓN CM` core | P | ¿módulo indep.? | #17 |
| 12 | `COORDINACION_CM_OBSERVADA` | Coord. CM observada | G+SIT | Coord. CM | todos | OBSERVAR | EN_CM | EN_CM/PROG | Coord. CM | 305 | parcial | P | | |
| 13 | `COORDINACION_CM_APROBADA` | Coord. CM aprobada | G | Coord. CM | todos | APROBAR | EN_CM | INVITACION | Coord. CM | 310 | parcial | P | | |
| 14 | `INVITACION_EN_ELABORACION` | Invitación en elaboración | G/IN | Invitaciones | todos | CREAR_SC | CM_APROB | ENVIADA / OBS | Analista | 400 | `BORRADOR` solicitud | P | | |
| 15 | `INVITACION_OBSERVADA` | Invitación observada | SIT | Invitaciones | todos | OBSERVAR | ELABORACION | ELABORACION | Analista | 405 | motor obs | P | | |
| 16 | `INVITACION_ENVIADA` | Invitación enviada | G | Invitaciones | todos | ENVIAR | ELABORACION | CONSULTAS/COTIZ | Analista | 410 | `ENVIADA`/`PUBLICADA`/`ENVIADO` | P | Códigos múltiples | Unificar |
| 17 | `CONSULTAS_RECIBIDAS` | Consultas recibidas | IN/?G | Consultas | todos | RECIBIR_CONSULTA | INV_ENVIADA | ABSUELTAS | Proveedor/AU | 420 | `consultas_proveedor.estado` | P | ¿global? | #19 |
| 18 | `CONSULTAS_ABSUELTAS` | Consultas absueltas | IN/?G | Consultas | todos | ABSOLVER | RECIBIDAS | COTIZ | AU | 430 | parcial | P | | #19 |
| 19 | `COTIZACION_RECIBIDA` | Cotización recibida | COT | Recepción cotiz. | todos | PRESENTAR | INV/CONS | VALIDACION | Proveedor | 500 | `COTIZACION_PRESENTADA` | P | por proveedor | #20 |
| 20 | `COTIZACIONES_RECIBIDAS` | Cotizaciones recibidas | G? | Recepción cotiz. | todos | CIERRE_RECEPCION | ≥1 COT | VALIDACION | Analista | 510 | implícito bandeja | N | | #20 |
| 21 | `VALIDACION_ENVIADA` | Validación enviada | IN/G | Validaciones | todos | DERIVAR_AU | COTIZ | VALIDADO/OBS | Analista | 520 | `DERIVADA`/`EN_PROCESO` | P | | |
| 22 | `VALIDADO_POR_AU` | Validado por AU | IN/G | Validaciones | todos | VALIDAR_APTO | ENVIADA | CUADRO | AU | 530 | `APTO` | P | | |
| 23 | `VALIDACION_OBSERVADA` | Validación observada | SIT | Validaciones | todos | OBSERVAR | ENVIADA | ENVIADA | AU | 525 | `OBSERVADO`/`NO_APTO` | P | | |
| 24 | `VALIDACION_REVISADA_POR_AU` | Validación revisada por AU | IN | Validaciones | todos | REVISAR | OBS/VALIDADO | CUADRO | AU | 535 | parcial | P | | |
| 25 | `CUADRO_COMPARATIVO_GENERADO` | C.C. generado | G | Cuadro | todos | GENERAR_CC | VALIDADO | EN_COORD_CM | Analista | 600 | `GENERADO`/`ADJUDICADO`/… | P | muchos sinónimos | |
| 26 | `CUADRO_EN_COORDINACION_CM` | C.C. en Coordinación CM | G | Cuadro | todos | ENVIAR_COORD | GENERADO | OBS_CM / EN_DEC | Coord. CM | 610 | `PENDIENTE_COORDINADOR` | P | | |
| 27 | `CUADRO_OBSERVADO_COORDINACION_CM` | C.C. en Coord. CM — Observado | G+SIT | Cuadro | todos | OBSERVAR_CM | EN_CM | EN_CM | Coord. CM | 615 | `OBSERVADO_COORDINADOR` | P | | Modelo situacion |
| 28 | `CUADRO_EN_DEC` | C.C. en DEC | G | Cuadro | todos | ENVIAR_DEC | FIRMADO_CM | OBS_DEC / APROB | DEC | 620 | `PENDIENTE_DEC` | P | | |
| 29 | `CUADRO_OBSERVADO_DEC` | C.C. en DEC — Observado | G+SIT | Cuadro | todos | OBSERVAR_DEC | EN_DEC | EN_DEC | DEC | 625 | `OBSERVADO_DEC` | P | | |
| 30 | `CUADRO_COMPARATIVO_APROBADO` | C.C. aprobado | G | Cuadro | todos | APROBAR_DEC | EN_DEC | CCP | DEC | 630 | `APROBADO_DEC`/`DERIVADO_CCP` | P | aprobado≠derivado | |
| 31 | `CCP_REGISTRADA` | CCP registrada | G | CCP | todos | REGISTRAR_CCP | APROB_CC | ORDENES | Analista CCP | 700 | `CCP_REGISTRADO` | I | género etiqueta | Alinear label |
| 32 | `ORDEN_REGISTRADA` | Orden registrada | G/ORD | Registro órdenes | todos | REGISTRAR_ORDEN | CCP | NOTIFICADA | Analista | 800 | `ORDEN_REGISTRADA`+aliases | I | aliases DB | |
| 33 | `ORDEN_LISTA_NOTIFICACION` | Orden lista para notificación | IN/G | Registro órdenes | todos | CRONOGRAMA+FIRMA | REGISTRADA | NOTIFICADA | Analista | 820 | `ORDEN_LISTA_NOTIFICACION` | I | no en doc | Mantener interno |
| 34 | `ORDEN_NOTIFICADA` | Orden notificada | G/ORD | Registro órdenes | todos | NOTIFICAR | LISTA/REG | RECEPCION_ORD / BIEN/SERV | Analista | 840 | `ORDEN_NOTIFICADA`←`ORDEN_ENVIADA*` | I | enviada vs notificada | #1 |
| 35 | `ORDEN_RECEPCION_CONFIRMADA` | Recepción de orden confirmada | G/ORD | Portal/órdenes | todos | CONFIRMAR_RECEPCION_ORDEN | NOTIFICADA | EJECUCION/? | Proveedor | 860 | `ORDEN_RECEPCION_CONFIRMADA` | I | ¿visible global? | #2 |

---

## B. Bienes (funcional — mayormente N)

| # | Código canónico propuesto | Etiqueta | Tipo | Submódulo | Prioridad | Código actual | Impl. | Decisión |
|---|---------------------------|----------|------|-----------|-----------|---------------|-------|----------|
| 40 | `BIEN_PENDIENTE_RECEPCION` | Bien pendiente de recepción | REC/G? | Recepción bienes | 900 | — | N | #4 |
| 41 | `BIEN_RECIBIDO_ALMACEN` | Bien recibido en almacén | REC | Recepción bienes | 910 | — | N | |
| 42 | `ACTA_RECEPCION_GENERADA` | Acta de recepción generada | DOC | Recepción bienes | 915 | — | N | |
| 43 | `ACTA_ENVIADA_AREA_USUARIA` | Acta enviada a AU | EV/IN | Recepción bienes | 920 | — | N | |
| 44 | `CONFORMIDAD_PENDIENTE_AREA_USUARIA` | Conformidad pendiente AU | CONF | Recepción bienes | 930 | — | N | #6 |
| 45 | `ACTA_CONFORMIDAD_RECIBIDA_ALMACEN` | Acta conformidad en almacén | CONF/DOC | Recepción bienes | 940 | — | N | |
| 46 | `CONFORMIDAD_DERIVADA_COORDINACION_CM` | Conformidad derivada a Coord. CM | CONF/G | Recepción bienes | 1000 | — | N | |
| 47 | `CONFORMIDAD_DERIVADA_ANALISTA` | Conformidad derivada a analista | CONF/G | Pago | 1010 | — | N | |

---

## C. Servicios (funcional — mayormente N)

| # | Código canónico propuesto | Etiqueta | Tipo | Submódulo | Prioridad | Código actual | Impl. | Decisión |
|---|---------------------------|----------|------|-----------|-----------|---------------|-------|----------|
| 50 | `ENTREGABLE_PENDIENTE` | Entregable pendiente | ENT | Presentación entregable | 900 | cronograma ENTREGABLE (parcial) | P | #5 |
| 51 | `ENTREGABLE_PRESENTADO` | Entregable presentado | ENT | Presentación entregable | 910 | — | N | |
| 52 | `ENTREGABLE_RECIBIDO_AREA_USUARIA` | Entregable recibido por AU | ENT | Presentación entregable | | — | N | |
| 53 | `ACTA_CONFORMIDAD_SERVICIO_GENERADA` | Acta conformidad servicio | DOC/CONF | Presentación entregable | 940 | — | N | |
| 54 | `CONFORMIDAD_DERIVADA_COORDINACION_CM` | Conformidad a Coord. CM | CONF | (compartido) | 1000 | — | N | Reutilizar #46 |
| 55 | `CONFORMIDAD_DERIVADA_ANALISTA` | Conformidad a analista | CONF | (compartido) | 1010 | — | N | Reutilizar #47 |

---

## D. Ampliación / Resolución / Pago / Penalidad

| # | Código canónico propuesto | Etiqueta | Tipo | Submódulo | Código actual | Impl. | Decisión |
|---|---------------------------|----------|------|-----------|---------------|-------|----------|
| 60 | `AMPLIACION_REGISTRADA` | Ampliación registrada | AMP/EV | Ampliaciones | stub + tabla cotización | N | #9–10 |
| 61 | `AMPLIACION_APROBADA` | Ampliación aprobada | AMP | Ampliaciones | — | N | #9 |
| 62 | `AMPLIACION_OBSERVADA` | Ampliación observada | AMP+SIT | Ampliaciones | — | N | #10 |
| 63 | `ORDEN_RESUELTA` | Orden resuelta | RES/G | Resolución | — | N | #11–13 |
| 70 | `PENDIENTE_REVISION_PAGO` | Pendiente revisión pago | PAG | Derivación pago | — | N | |
| 71 | `EN_REVISION_PAGO` | En revisión de pago | PAG | Derivación pago | — | N | |
| 72 | `DOCUMENTACION_PAGO_OBSERVADA` | Documentación de pago observada | PAG+SIT | Derivación pago | — | N | |
| 73 | `DOCUMENTACION_PAGO_SUBSANADA` | Documentación de pago subsanada | PAG | Derivación pago | — | N | |
| 74 | `FACTURA_REGISTRADA` | Factura registrada | DOC/PAG | Derivación pago | — | N | #7–8 |
| 75 | `PENALIDAD_EN_CALCULO` | Penalidad en cálculo | PEN | Derivación pago | — | N | |
| 76 | `PENALIDAD_CALCULADA` | Penalidad calculada | PEN/?G | Derivación pago | — | N | ¿interno? |
| 77 | `EXPEDIENTE_PAGO_COMPLETO` | Expediente de pago completo | PAG | Derivación pago | — | N | |
| 78 | `EXPEDIENTE_DERIVADO_PAGO` | Expediente derivado a pago | PAG/G | Derivación pago | stub checklist | N | #14–15 |
| 79 | `EXPEDIENTE_LISTO_PAGO` | Expediente listo para pago | PAG | Derivación pago | — | N | sinónimo de 77? |

---

## E. Situaciones transversales

| # | Código | Etiqueta | Tipo | Regla |
|---|--------|----------|------|-------|
| 90 | `NORMAL` | Normal | SIT | Default |
| 91 | `OBSERVADO` | Observado | SIT | **Obliga** etapa + origen/destino |
| 92 | `DEVUELTO` | Devuelto | SIT | **No usar solo**; evento `DEVUELTO_POR_X_DESDE_Y` |
| 93 | `SUSPENDIDO` | Suspendido | SIT | Pendiente definir |
| 94 | `ANULADO` | Anulado | SIT/G local | Cuadro/CCP/orden |
| 95 | `CANCELADO` | Cancelado | SIT | Pendiente definir |

---

## F. Códigos encontrados relevantes (implementación / legacy) — no propuestos como canónicos nuevos

| Código encontrado | Familia | Impl. | Nota |
|-------------------|---------|-------|------|
| `REGISTRADO`,`EVALUACION`,`DEC`,`PROGRAMACION`,`INVITACIONES`,`CCP`,`EJECUCION` | Etapas ASCII | I | `WorkflowState` |
| `PROGRAMACIÓN`,`COORDINACIÓN CM`,`VALIDACIÓN`… | Core labels | O/D | `ConstantesEstados` |
| `PENDIENTE_COORDINADOR`,`OBSERVADO_DEC`,`DERIVADO_CCP`… | Cuadro | I | Duplicado FE/BE |
| `ENVIADA_OPPM`,`CCP_REGISTRADO` | CCP overlay | I | |
| `ORDEN_ENVIADA`,`ORDEN_ENVIADA_PENDIENTE_CONFIRMACION` | Orden alias | O | → `ORDEN_NOTIFICADA` |
| `ORDEN_BORRADOR`,`CRONOGRAMA_DEFINIDO` | Orden alias | O | → `ORDEN_REGISTRADA` |
| `EMITIDA`…`CERRADA` | Observaciones | I | No son estado expediente |
| `APTO`,`NO_APTO`,`DERIVADA` | Validación | I | Internos |
| `ENVIADO`,`CONFIRMADO` | Envío orden | I | Tabla envíos |
| `ACTIVO`/`ANULADO` entregas | Cronograma | I | Interno línea |

---

## G. Eventos detectados que **no** deberían ser estado global

| Evento / acción | Por qué no es estado global |
|-----------------|------------------------------|
| Observar / Aprobar (verbo) | Acción; genera transición |
| Derivar conformidad a analista | Evento + estado destino pago |
| Enviar acta a AU | Evento documental |
| Registrar factura | Evento / estado documental |
| Calcular penalidad | Resultado interno hasta decisión |
| `DERIVADO_A_CCP` (evento traza) | El global es `DERIVADO_CCP` / CCP |
| `CCP_REGISTRADO` como tipo en `ccp_eventos` | Coincide con overlay; no confundir tabla eventos con catálogo global |
| Confirmar recepción portal | Puede ser estado orden; no confundir con recepción física del bien |

---

## H. Duplicados / faltantes / obsoletos (resumen)

| Categoría | Ejemplos |
|-----------|----------|
| **Duplicados** | Etapa ASCII vs label acentuado vs `estado` humano; catálogo cuadro FE/BE; `ORDEN_ENVIADA`≈`ORDEN_NOTIFICADA` |
| **Faltantes (doc)** | Toda la familia bienes, servicios post-orden, `ORDEN_RESUELTA`, pago, penalidades, ampliación contractual |
| **Obsoletos / legacy** | `ESTADOS_LEGACY`, `ESTADOS_OBSERVACION_LEGACY`, tabla `ordenes` catálogo, aliases orden |
| **Inconsistencia crítica** | Presenter fuerza “CCP registrado” sin evidencia de orden en bandejas no-órdenes |

---

## I. Prioridad mínima obligatoria (verificación)

| Más avanzado | Debe superar a |
|--------------|----------------|
| `ORDEN_NOTIFICADA` | `CCP_REGISTRADA` / `CCP_REGISTRADO` |
| Recepción bien / entregable | `ORDEN_NOTIFICADA` |
| Conformidad derivada | Recepción / presentación |
| `EXPEDIENTE_DERIVADO_PAGO` | Conformidad |
| `ORDEN_RESUELTA` | Según decisión (terminal/transversal) |

---

*Matriz viva: actualizar solo tras aprobación del propietario funcional. No usar esta matriz aún para migrar datos.*
