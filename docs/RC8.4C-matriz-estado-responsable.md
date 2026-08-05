# RC8.4C — MATRIZ FUNCIONAL ESTADO → RESPONSABLE (WORKFLOW COMPLETO SGC)

> **Fecha:** 2026-04-08
> **Propósito:** Inventario funcional de consumidores estado–responsable antes de integración.
> **Alcance:** 18 etapas del workflow SGC.
> **Estado:** Para aprobación. No implementar todavía.

---

## LEYENDA

| Columna | Significado |
|---------|------------|
| **R. Esperado** | Responsable principal que DEBE atender en ese estado |
| **R. Alterno** | Quién atiende si el principal no está disponible o no asignado |
| **Unidad Resp.** | Unidad organizacional responsable |
| **Cambia cuando** | Condición que dispara el cambio de responsable |
| **Evento** | Acción concreta que produce el cambio |

---

## 1. REGISTRO DE REQUERIMIENTOS

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `Registrado` (creación) | **Usuario creador** (`usuario_modificacion` / `req.user.username`) | Área Usuaria (responsable del área) | Área Usuaria solicitante | — (estado inicial) | `REQUERIMIENTO_REGISTRADO` (Fase 1A) |
| `Registrado` (edición) | **Usuario creador** | Usuario con permiso sobre el área | Área Usuaria solicitante | Cada vez que se edita | `REQUERIMIENTO_EDITADO` |
| `Observado` | **Usuario creador** (debe subsanar) | Responsable del área | Área Usuaria solicitante | Al recibir observación de etapa superior | `REQUERIMIENTO_OBSERVADO` desde submódulo superior |
| `En trámite de aprobación` | **Evaluador** (Gerente / rol evaluación) | Área Usuaria (origen) | Evaluación de Requerimientos | Al enviar a evaluación | `REQUERIMIENTO_ENVIADO_EVALUACION` |
| `Subsanado` | **Evaluador** (quien observó) | Gerente | Evaluación de Requerimientos | Al subsanar y reenviar | `REQUERIMIENTO_SUBSANADO` |

## 2. EVALUACIÓN DE REQUERIMIENTOS

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `En trámite de aprobación` | **Gerente / Evaluador** | Director / Jefe de Unidad | Evaluación de Requerimientos | Al recibir requerimiento desde Registro | `REQUERIMIENTO_ENVIADO_EVALUACION` |
| `Aprobado` | **Responsable DEC** | Director General | DEC | Al aprobar en Evaluación | `EVALUACION_APROBADA` → transición a DEC |
| `Observado` | **Usuario creador** (Registro) | Responsable del área | Área Usuaria (origen) | Al observar y devolver | `EVALUACION_OBSERVADA` → retorno a Registro |

## 3. DEC

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `Aprobado` (ingreso a DEC) | **Responsable DEC** | Director DEC / Especialista | DEC | Al recibir desde Evaluación | `EVALUACION_APROBADA` |
| `Aprobado DEC` (salida) | **Responsable Programación** | Programador | Programación | Al aprobar en DEC | `DEC_APROBADO` → transición a Programación |
| `Observado DEC` | **Usuario creador** (Registro) o **Evaluador** | Responsable del área | Destino según `destino_submodulo` | Al observar | `DEC_OBSERVADO` → retorno al submódulo destino |

## 4. PROGRAMACIÓN

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `Aprobado DEC` / `En Programación` | **Responsable Programación** | Programador / Especialista | Programación | Al recibir desde DEC | `DEC_APROBADO` |
| `Programado` (salida) | **Coordinador de Contratos Menores** | Especialista en Contrataciones | Coordinación CM | Al aprobar en Programación | `PROGRAMACION_APROBADA` → transición a Coordinación CM |
| `Observado Programación` | **Responsable DEC** o destino | Según `destino_submodulo` | DEC / Registro | Al observar | `PROGRAMACION_OBSERVADA` |

## 5. COORDINACIÓN CM (ACTOS PREPARATORIOS)

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `Programado` (ingreso) | **Coordinador de Contratos Menores** | Especialista en Contrataciones | Coordinación CM | Al recibir desde Programación | `PROGRAMACION_APROBADA` |
| `Programado` (asignado) | **Analista asignado** (`analista_asignado`) | Coordinador CM | Coordinación CM | Cuando el Coordinador asigna un analista | `ASIGNAR_ANALISTA_ACTOS` |
| `Programado` (reasignado) | **Nuevo analista asignado** | Coordinador CM | Coordinación CM | Cuando se reasigna a otro analista | `REASIGNAR_ANALISTA_ACTOS` |
| `Observado Actos` | **Usuario creador** o destino | Según `destino_submodulo` | Registro / Programación | Al observar desde Coordinación CM | `ACTOS_OBSERVADO` |
| `Aprobado` (salida) | **Responsable Invitaciones** (persona designada) | Analista asignado | Invitaciones | Al aprobar en Coordinación CM | `COORDINACION_CM_APROBADA` → transición a Invitaciones |

## 6. INVITACIONES

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `En Invitaciones` (ingreso) | **Analista asignado** (hereda de Coordinación CM) | Responsable designado en `responsable_destino` | Invitaciones | Al recibir desde Coordinación CM | `COORDINACION_CM_APROBADA` |
| `En Invitaciones` (solicitud creada) | **Analista asignado** | Creador de la Solicitud de Cotización | Invitaciones | Al crear Solicitud de Cotización | `SOLICITUD_COTIZACION_CREADA` |
| `En Invitaciones` (enviada) | **Analista asignado** | Creador de la solicitud | Invitaciones | Al enviar invitaciones a proveedores | `INVITACION_ENVIADA` (motor) / `enviarInvitaciones` (legacy) |
| `En Invitaciones` (reenvío) | **Analista asignado** | Creador de la solicitud | Invitaciones | Al reenviar a nuevos/otros proveedores | `REINVITACION_ENVIADA` |
| `Observado Invitaciones` | **Coordinador CM** o destino | Según `destino_submodulo` | Coordinación CM / Programación | Al observar desde Invitaciones | `INVITACIONES_OBSERVADA` |

## 7. CONSULTAS Y OBSERVACIONES (PORTAL)

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `PENDIENTE` (consulta sin responder) | **Analista asignado** (Invitaciones) | Coordinador CM | Invitaciones | Al recibir consulta del proveedor | `CONSULTA_REGISTRADA` (portal proveedor) |
| `RESPONDIDA` (absolución) | **Analista asignado** (`respondido_por`) | Coordinador CM | Invitaciones | Al responder la consulta | `CONSULTA_RESPONDIDA` |
| `PENDIENTE` (observación de proveedor) | **Analista asignado** | Coordinador CM | Invitaciones | Al recibir observación del proveedor | `OBSERVACION_REGISTRADA` (portal) |

## 8. RECEPCIÓN DE COTIZACIONES

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `PRESENTADA` (cotización recibida) | **Analista asignado** (Invitaciones) | Propietario de la Solicitud | Invitaciones | Al recibir cotización del proveedor | `COTIZACION_PRESENTADA` (portal proveedor) |
| `EVALUADA` (cotización procesada) | **Validador asignado** | Coordinador CM | Validaciones | Al derivar cotización a validación | `COTIZACION_DERIVADA_VALIDACION` |
| Plazo vencido (sin cotización) | **Analista asignado** | Coordinador CM | Invitaciones | Al vencer el plazo sin respuesta | `PLAZO_COTIZACION_VENCIDO` |

## 9. VALIDACIONES

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `PENDIENTE_DERIVACION` (sin asignar) | **Coordinador de Validaciones** | Administrador | Validaciones | Al llegar cotizaciones sin validador | `COTIZACIONES_RECIBIDAS` |
| `ASIGNADA` | **Usuario validador** (`usuario_asignado`) | Coordinador de Validaciones | Validaciones | Al asignar un validador | `VALIDACION_ASIGNADA` |
| `EN_PROCESO` | **Usuario validador** | Coordinador de Validaciones | Validaciones | Al comenzar la validación | `VALIDACION_INICIADA` |
| `COMPLETADA` (APTO / NO_APTO) | **Usuario validador** (ejecutó) | Coordinador de Validaciones | Validaciones | Al completar y enviar resultado | `VALIDACION_ENVIADA` |
| `DEVUELTA` (individual) | **Analista asignado** (Invitaciones) | Coordinador CM | Invitaciones | Al devolver por inválida | `COTIZACION_DEVUELTA` |
| Devuelta AGREGADA (todas no aptas) | **Analista asignado** (Invitaciones) | Coordinador CM | Invitaciones | Al devolver todas las cotizaciones como no aptas | `COTIZACIONES_INVALIDAS_DEVUELTAS` |

## 10. CUADRO COMPARATIVO

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `BORRADOR` (creación) | **Especialista / Analista** (creador) | Coordinador CM | Cuadro Comparativo | Al crear borrador del cuadro | `CUADRO_BORRADOR_CREADO` |
| `ADJUDICADO` (adjudicación) | **Especialista / Analista** | Coordinador CM | Cuadro Comparativo | Al guardar adjudicación | `CUADRO_ADJUDICADO` |
| `REVISION` — Revisión Coordinador | **Coordinador CM** | Especialista | Coordinación CM | Al enviar a revisión | `CUADRO_ENVIADO_REVISION` |
| `REVISION` — Revisión DEC | **Responsable DEC** | Director DEC | DEC | Al derivar de Coordinador a DEC | `CUADRO_REVISION_DEC` |
| `REVISION` — Generación CCP | **Responsable CCP** | Administrador | CCP | Al derivar de DEC a CCP | `CUADRO_DERIVADO_CCP` |
| PDF firmado (aprobado) | **Responsable DEC** (firmante) | Director DEC | DEC | Al adjuntar PDF firmado del DEC | `CUADRO_PDF_FIRMADO_DEC` |

## 11. CCP (CERTIFICACIÓN PRESUPUESTAL)

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `PENDIENTE` (ingreso) | **Responsable CCP** | Administrador DEC | CCP | Al recibir desde Cuadro Comparativo | `CUADRO_DERIVADO_CCP` |
| `CODIGO_ASIGNADO` | **Responsable CCP** (`actualizado_por`) | Administrador DEC | CCP | Al registrar código CCP | `CCP_CODIGO_REGISTRADO` |
| `ENVIADA_OPPM` (consolidación enviada) | **Responsable CCP** (`enviado_por`) | Administrador DEC | CCP | Al enviar a O PPM | `CCP_SOLICITUD_ENVIADA` |
| Código anulado | **Responsable CCP** | Administrador DEC | CCP | Al anular código | `CCP_CODIGO_ANULADO` |
| Req. retirado de consolidación | **Responsable CCP** | Administrador DEC | CCP | Al retirar requerimiento | `CCP_REQUERIMIENTO_RETIRADO` |

## 12. REGISTRO DE ÓRDENES

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `PENDIENTE` (creación) | **Responsable DEC** (`creado_por`) | Administrador | Registro de Órdenes | Al crear la orden | `ORDEN_CREADA` |
| `NOTIFICADA` (enviada al proveedor) | **Responsable DEC** (`notificado_por`) | Administrador | Registro de Órdenes | Al enviar al proveedor | `ORDEN_ENVIADA_PROVEEDOR` |
| `CONFIRMADA` (proveedor confirmó) | **Proveedor** (confirmó recepción) | Responsable DEC | Proveedor / DEC | Al confirmar el proveedor | `ORDEN_CONFIRMADA_PROVEEDOR` |
| `DERIVADA_EJECUCION` | **Responsable de Almacén** (Ejecución) | Responsable del centro | Ejecución / Almacén | Al derivar a ejecución | `ORDEN_DERIVADA_EJECUCION` |
| `ANULADA` | **Responsable DEC** (quien anuló) | Administrador | Registro de Órdenes | Al anular la orden | `ORDEN_ANULADA` |

## 13. RECEPCIÓN DE BIENES

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `RECEPCION_BIENES_PENDIENTE` | **Responsable de Almacén** (centro) | Responsable del centro de costo | Almacén | Al derivar desde Registro de Órdenes | `ORDEN_DERIVADA_EJECUCION` |
| `BIEN_RECIBIDO_ALMACEN` | **Responsable de Almacén** (quien registró recepción) | Responsable del centro | Almacén | Al registrar la recepción | `RECEPCION_REGISTRADA` |
| `RECEPCION_BIENES_OBSERVADA` | **Responsable de Almacén** (debe corregir) | Responsable del centro | Almacén | Al observar el acta | `ACTA_OBSERVADA` |
| `ACTA_GENERADA` (pendiente visado) | **Responsable de Almacén** | Jefe de Almacén | Almacén | Al generar acta de recepción | `ACTA_GENERADA` |
| `ACTA_VISADA` (visado almacén) | **Área Usuaria** (destinatario AU) | Responsable del área usuaria | Área Usuaria | Al visar acta y derivar a AU | `ACTA_VISADA_DERIVADA_AU` |
| `CONFORMIDAD_PENDIENTE_AU` | **Responsable del Área Usuaria** (destinatario) | Jefe del área usuaria | Área Usuaria | Al derivar a área usuaria | `DERIVADA_AREA_USUARIA` |
| `CONFORMIDAD_RECIBIDA_AU` | **Coordinador CM** (revisa acta firmada) | Especialista | Coordinación CM | Al cargar acta firmada por AU | `ACTA_FIRMADA_CARGADA` |
| `CONFORMIDAD_EN_COORDINACION_CM` | **Coordinador CM** | Especialista | Coordinación CM | Al derivar a Coordinación CM | `DERIVADA_COORDINACION_CM` |
| `EXPEDIENTE_DERIVADO_PAGO` | **Tesorería** / **Analista de Pago** | Responsable de Tesorería | Tesorería | Al derivar a pago | `DERIVADA_PAGO` |

## 14. RECEPCIÓN DE SERVICIOS

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `PENDIENTE_RECEPCION` | **Responsable del centro** / **Área Usuaria** | Coordinador de Ejecución | Área Usuaria / Centro | Al finalizar prestación del servicio | `SERVICIO_PENDIENTE_RECEPCION` |
| `CONFORMIDAD_SERVICIO` | **Área Usuaria** (responsable del área) | Jefe del área | Área Usuaria | Al dar conformidad al servicio | `CONFORMIDAD_SERVICIO_EMITIDA` |
| `DERIVADO_COORDINACION_CM` | **Coordinador CM** | Especialista | Coordinación CM | Al derivar a Coordinación CM | `SERVICIO_DERIVADO_CM` |
| `DERIVADO_PAGO` | **Tesorería** | Analista de Pago | Tesorería | Al derivar a pago | `SERVICIO_DERIVADO_PAGO` |

## 15. CONFORMIDAD ÁREA USUARIA (etapa dentro de Recepción)

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `PENDIENTE_CONFORMIDAD` | **Responsable del Área Usuaria** (destinatario designado) | Jefe del área / Usuario AU | Área Usuaria | Al recibir expediente desde Almacén | `EXPEDIENTE_DERIVADO_AU` |
| `CONFORMIDAD_EMITIDA` | **Coordinador CM** | Especialista | Coordinación CM | Al firmar y devolver conformidad | `CONFORMIDAD_AU_FIRMADA` |
| `CONFORMIDAD_OBSERVADA` | **Responsable del Área Usuaria** (debe subsanar) | Jefe del área | Área Usuaria | Al observar la conformidad desde CM | `CONFORMIDAD_OBSERVADA` |

## 16. AMPLIACIONES

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `SOLICITADA` | **Solicitante** (quien crea la ampliación) | Responsable del centro | Área Usuaria / Centro | Al solicitar ampliación | `AMPLIACION_SOLICITADA` |
| `EN_REVISION` | **Revisor** (rol según flujo) | Coordinador CM / DEC | Coordinación CM / DEC | Al enviar a revisión | `AMPLIACION_ENVIADA_REVISION` |
| `OBSERVADA` | **Solicitante** (debe subsanar) | Responsable del centro | Área Usuaria (origen) | Al observar la solicitud | `AMPLIACION_OBSERVADA` |
| `SUBSANADA` | **Revisor** (quien observó) | Coordinador CM / DEC | Coordinación CM / DEC | Al subsanar y reenviar | `AMPLIACION_SUBSANADA` |
| `APROBADA` | **Solicitante** (ejecuta ampliación) | Responsable del centro | Área Usuaria / Centro | Al aprobar la ampliación | `AMPLIACION_APROBADA` |
| `DEVUELTA` | **Solicitante** (recibe devolución) | Responsable del centro | Área Usuaria | Al devolver sin aprobar | `AMPLIACION_DEVUELTA` |
| `CERRADA` | **Ninguno** (expediente cerrado) | — | — | Al cerrar definitivamente | `AMPLIACION_CERRADA` |

## 17. REDUCCIONES

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `SOLICITADA` | **Solicitante** | Responsable del centro | Área Usuaria / Centro | Al solicitar reducción | `REDUCCION_SOLICITADA` |
| `EN_REVISION` | **Revisor** | Coordinador CM / DEC | Coordinación CM / DEC | Al enviar a revisión | `REDUCCION_ENVIADA_REVISION` |
| `OBSERVADA` | **Solicitante** (debe subsanar) | Responsable del centro | Área Usuaria (origen) | Al observar la solicitud | `REDUCCION_OBSERVADA` |
| `SUBSANADA` | **Revisor** (quien observó) | Coordinador CM / DEC | Coordinación CM / DEC | Al subsanar y reenviar | `REDUCCION_SUBSANADA` |
| `APROBADA` | **Solicitante** (ejecuta reducción) | Responsable del centro | Área Usuaria / Centro | Al aprobar la reducción | `REDUCCION_APROBADA` |
| `DEVUELTA` | **Solicitante** (recibe devolución) | Responsable del centro | Área Usuaria | Al devolver sin aprobar | `REDUCCION_DEVUELTA` |
| `CERRADA` | **Ninguno** (expediente cerrado) | — | — | Al cerrar definitivamente | `REDUCCION_CERRADA` |

## 18. TESORERÍA / PAGO

| Estado | R. Esperado | R. Alterno | Unidad Resp. | Cambia cuando | Evento |
|--------|-------------|------------|-------------|---------------|--------|
| `EXPEDIENTE_DERIVADO_PAGO` | **Analista de Pago** / **Tesorería** | Responsable de Tesorería | Tesorería | Al recibir desde Recepción o Coordinación CM | `EXPEDIENTE_DERIVADO_PAGO` |
| `PAGO_PROCESADO` | **Analista de Pago** (quien procesó) | Tesorería | Tesorería | Al registrar el pago | `PAGO_REGISTRADO` |
| `PAGO_OBSERVADO` | **Coordinador CM** o **Área Usuaria** (origen) | Responsable del centro | Origen del expediente | Al observar el pago | `PAGO_OBSERVADO` |
| `FINALIZADO` | **Ninguno** (cierre) | — | — | Al completar el pago y cerrar | `EXPEDIENTE_FINALIZADO` |

---

## RESUMEN DE TRANSICIONES CRÍTICAS DE RESPONSABLE

| # | Transición | De | A | Responsable cambia de → a |
|---|-----------|----|----|---------------------------|
| 1 | Registro → Evaluación | `Registrado` | `En trámite` | Usuario creador → Gerente / Evaluador |
| 2 | Evaluación → DEC | `Aprobado` (Eval) | `Aprobado` (DEC) | Gerente → Responsable DEC |
| 3 | DEC → Programación | `Aprobado DEC` | `En Programación` | Responsable DEC → Responsable Programación |
| 4 | Programación → Coordinación CM | `Programado` | `Programado` (Actos) | Responsable Programación → Coordinador CM |
| 5 | Asignación en Coordinación CM | `Programado` | `Programado` | Coordinador CM → Analista asignado |
| 6 | Coordinación CM → Invitaciones | `Aprobado` (Actos) | `En Invitaciones` | Analista asignado → Mismo analista (hereda) |
| 7 | Invitaciones → Recepción Cotiz. | `En Invitaciones` | `PRESENTADA` | Analista → Mismo analista |
| 8 | Recepción → Validaciones | `PRESENTADA` | `ASIGNADA` | Analista → Validador asignado |
| 9 | Validaciones → Cuadro Comp. | `COMPLETADA` | `BORRADOR` | Validador → Especialista / Analista |
| 10 | Cuadro → CCP | `REVISION` (DEC) | `PENDIENTE` | Responsable DEC → Responsable CCP |
| 11 | CCP → Registro Órdenes | `ENVIADA_OPPM` | `PENDIENTE` | Responsable CCP → Responsable DEC |
| 12 | Reg. Órdenes → Recepción Bienes | `DERIVADA_EJECUCION` | `RECEPCION_BIENES_PENDIENTE` | Responsable DEC → Responsable Almacén |
| 13 | Recepción → Conformidad AU | `ACTA_VISADA` | `CONFORMIDAD_PENDIENTE_AU` | Responsable Almacén → Responsable Área Usuaria |
| 14 | Conformidad AU → Coordinación CM | `CONFORMIDAD_RECIBIDA_AU` | `CONFORMIDAD_EN_COORDINACION_CM` | Área Usuaria → Coordinador CM |
| 15 | Coordinación CM → Tesorería | `CONFORMIDAD_EN_COORDINACION_CM` | `EXPEDIENTE_DERIVADO_PAGO` | Coordinador CM → Tesorería |
| 16 | Observación (cualquier etapa) | `Aprobado`/`En proceso` | `Observado [XXX]` | Responsable actual → Destino de la observación |

---

## NOTAS IMPORTANTES PARA LA INTEGRACIÓN

1. **`r.responsable` en requerimientos NO es una persona**: Es el centro organizacional (CNCC, INS, etc.). El responsable real está en `usuario_modificacion`, `analista_asignado`, `usuario_asignado`, o se infiere del contexto del workflow.

2. **Estados legacy vs motor**: Las bandejas 1-6 usan `r.estado` (VARCHAR texto libre) mientras que 7-18 usan enums en tablas específicas. El contrato debe unificar ambas fuentes.

3. **Herencia de responsable**: En transiciones "hacia adelante" (aprobación), el responsable cambia al de la nueva etapa. En observaciones "hacia atrás", el responsable es el destino de la observación.

4. **Sin asignación explícita**: En Coordinación CM, si no se asigna analista, el responsable es el Coordinador CM. En Validaciones, si no se asigna validador, queda en `PENDIENTE_DERIVACION`.

5. **Múltiples actores simultáneos**: En Invitaciones, el analista asignado y el proveedor (portal) interactúan concurrentemente. La matriz refleja el responsable INTERNO (SGC), no el proveedor.

6. **Columnas fuente por bandeja**:
   - Bandejas 1-6: `r.estado` (texto), `r.responsable` (centro), `usuario_modificacion` (persona)
   - Bandeja 5 (Coord. CM): `analista_asignado` (persona real)
   - Bandeja 7: `portal_consultas.estado`, `respondido_por`
   - Bandeja 8: `cotizaciones.estado`
   - Bandeja 9: `validaciones_cotizacion.validacion_estado`, `usuario_asignado`
   - Bandeja 10: `cuadro_comparativo.estado`, `etapa_revision`, `revisor_actual`
   - Bandeja 11: `ccp_codigos.estado`/`ccp_solicitudes.estado`, `enviado_por`
   - Bandeja 12: `ordenes_contratacion.estado`, `creado_por`, `notificado_por`
   - Bandeja 13: `recepcion_bienes.estado_vigente`, responsable de almacén
   - Bandas 14-18: Tablas propias de ejecución con enums

---

> **Estado:** ✅ Matriz completa — lista para revisión y aprobación.
> **Próximo paso:** Tras aprobación, iniciar RC8.4D (integración del contrato Estado–Responsable en consumidores).
