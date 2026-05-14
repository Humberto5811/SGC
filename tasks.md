# TASKS.md - Sistema de Gestión de Contrataciones (SGC)
## Basado en SGC.md (Ley N° 32069)

## FASE 1: Setup y Autenticación (2 días)
- [ ] T001 Estructura HTML/CSS/JS con Bootstrap 5
- [ ] T002 Sistema de autenticación con roles (Operador DEC, AU, Admin)
- [ ] T003 Políticas de privacidad y términos de uso
- [ ] T004 Persistencia con localStorage

## FASE 2: Módulo de Requerimientos - Área Usuaria (5 días)
- [ ] T005 Formulario BIENES (18 campos + tabla entregas)
- [ ] T006 Búsqueda SIGAMEF por código/descripción
- [ ] T007 Auto-carga de ficha técnica al seleccionar ítem
- [ ] T008 Formulario SERVICIOS (13 campos + entregables)
- [ ] T009 Formulario LOCACIÓN (12 campos + entregables)
- [ ] T010 Tabla dinámica de entregas con ID incremental
- [ ] T011 Generación PDF Anexo N° 01-A y 01-B
- [ ] T012 Flujo de aprobación (aprobado/rechazado)

## FASE 3: Evaluación y Subsanación (3 días)
- [ ] T013 Bandejas por estado (No recibidos, Recibidos, Observado, Aprobado)
- [ ] T014 Evaluación por sección con botones ✅/❌/↩️
- [ ] T015 Registro de feedback textual por observación
- [ ] T016 Sistema de subsanación con regeneración de PDF
- [ ] T017 Remisión automática a DEC

## FASE 4: Difusión de Contratación - DEC (4 días)
- [ ] T018 Nueva contratación (con/sin requerimiento previo)
- [ ] T019 Cronograma con fechas/horas (consultas y cotización)
- [ ] T020 Tipos de invitación (Abierta 20 RNP / Cerrada manual)
- [ ] T021 Tipos de evaluación (paquete/relación de ítem)
- [ ] T022 Registro de ítems con CUBSO
- [ ] T023 Adjuntar archivos (max 5 MB)

## FASE 5: Invitaciones a Proveedores (2 días)
- [ ] T024 Invitación abierta (20 proveedores RNP aleatorios)
- [ ] T025 Invitación cerrada (búsqueda RNP / sin RNP con validación SUNAT)
- [ ] T026 Envío de invitaciones (simular con console.log)

## FASE 6: Consultas de Proveedores (2 días)
- [ ] T027 Proveedor escribe consulta
- [ ] T028 DEC responde o deriva a AU
- [ ] T029 AU responde consultas derivadas
- [ ] T030 Historial de consultas/respuestas

## FASE 7: Apertura y Evaluación de Cotizaciones (4 días)
- [ ] T031 Apertura con motivo obligatorio si es fuera de plazo
- [ ] T032 Evaluación por paquete de ítem
- [ ] T033 Solicitar evaluación técnica a AU
- [ ] T034 Evaluación por relación de ítem
- [ ] T035 Sorteo electrónico por empate
- [ ] T036 Subsanación de cotizaciones

## FASE 8: Presupuesto y CCP (2 días)
- [ ] T037 Registro de CCP (múltiples)
- [ ] T038 Selección de FF-Rubro (8 opciones)
- [ ] T039 Adjuntar archivo CCP
- [ ] T040 Visualización de monto total

## FASE 9: Cuadro Comparativo y Firma (2 días)
- [ ] T041 Generación PDF Cuadro Comparativo
- [ ] T042 Firma digital (placeholder FIRMA PERÚ)
- [ ] T043 Firma manual (descargar/cargar PDF firmado)

## FASE 10: Registro de Contrato (2 días)
- [ ] T044 Registro de contrato/orden de compra o servicio
- [ ] T045 Programación de entregas y pagos
- [ ] T046 Gestión de garantías
- [ ] T047 Publicar contrato (estado PUBLICADO)

## FASE 11: Ejecución Contractual (2 días)
- [ ] T048 Nulidad (total/parcial con ítems afectados)
- [ ] T049 Resolución (total/parcial)
- [ ] T050 Conformidad por entregable
- [ ] T051 Penalidad (monto, motivo, resolución)
- [ ] T052 Ampliación de plazo

## FASE 12: Módulos de Mantenimiento (3 días)
- [ ] T053 CRUD Centros de Costo + import/export Excel
- [ ] T054 CRUD Catálogo SIGAMEF + clasificación jerárquica
- [ ] T055 CRUD Fichas Técnicas + PDF
- [ ] T056 CRUD Usuarios + permisos por módulo
- [ ] T057 CRUD SIAF + import/export
- [ ] T058 CRUD Órdenes + import/export
- [ ] T059 CRUD Metas + import/export

## FASE 13: Configuración Documentos (1 día)
- [ ] T060 CRUD documentos solicitados por objeto
- [ ] T061 Adjuntar archivo (Word/PDF, max 2 MB)
- [ ] T062 Estados: Creado/Activo/Inactivo

## FASE 14: Dashboard y Reportes (2 días)
- [ ] T063 KPIs por estado y montos
- [ ] T064 Gráficos con Chart.js
- [ ] T065 Exportación a Excel
- [ ] T066 Log de auditoría básico

## FASE 15: Testing y Edge Cases (2 días)
- [ ] T067 Validación de cronogramas
- [ ] T068 Manejo de sin cotizaciones
- [ ] T069 Validación de archivos (tamaño)
- [ ] T070 Validación CCP duplicados
- [ ] T071 Pruebas de roles y permisos
