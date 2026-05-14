# TASKS.md - Sistema de Gestión de Contrataciones (SGC)

## 📊 Resumen
- **Total de tareas**: 45
- **Días estimados**: 28 días hábiles
- **Prioridad**: Alta

---

## 🚀 FASE 1: Configuración Base (2 días)
- [ ] **T001** Crear estructura HTML base (index.html)
- [ ] **T002** Configurar Bootstrap 5, jQuery, Chart.js
- [ ] **T003** Implementar localStorage como capa de persistencia
- [ ] **T004** Crear sistema de navegación por módulos
- [ ] **T005** Implementar autenticación básica y roles

## 🗂️ FASE 2: Módulo de Mantenimiento - Centros de Costo (3 días)
- [ ] **T006** CRUD de centros de costo (crear, leer, actualizar, eliminar)
- [ ] **T007** Implementar búsqueda en tiempo real
- [ ] **T008** Importar desde Excel (SheetJS)
- [ ] **T009** Exportar a Excel
- [ ] **T010** Validar códigos únicos

## 📦 FASE 3: Catálogo SIGAMEF - Bienes (4 días)
- [ ] **T011** CRUD de bienes con clasificación jerárquica
- [ ] **T012** Implementar dashboard de estadísticas
- [ ] **T013** Importar/exportar Excel
- [ ] **T014** Búsqueda por ID, código o descripción
- [ ] **T015** Vincular indicador "tiene ficha técnica"

## 📄 FASE 4: Fichas Técnicas (3 días)
- [ ] **T016** CRUD completo de fichas técnicas con ID autoincremental
- [ ] **T017** Implementar todos los campos especificados
- [ ] **T018** Generar PDF con jsPDF y logo institucional
- [ ] **T019** Importar/exportar Excel

## 👥 FASE 5: Gestión de Usuarios y Roles (2 días)
- [ ] **T020** CRUD de usuarios con campos completos
- [ ] **T021** Implementar permisos por módulo (checks)
- [ ] **T022** Importar/exportar Excel

## 📊 FASE 6: Gestión SIAF, Órdenes y Metas (3 días)
- [ ] **T023** CRUD SIAF con import/export
- [ ] **T024** CRUD Órdenes con import/export
- [ ] **T025** CRUD Metas con import/export

## 📝 FASE 7: Requerimientos - BIENES (5 días)
- [ ] **T026** Formulario de bienes con autocompletado de centros
- [ ] **T027** Búsqueda de ítem SIGAMEF (código/descripción)
- [ ] **T028** Mostrar ficha técnica automática al seleccionar ítem
- [ ] **T029** Tabla dinámica de entregas (ID incremental)
- [ ] **T030** Generar PDF del anexo
- [ ] **T031** Flujo de aprobación (aprobado/rechazado)

## 🔧 FASE 8: Requerimientos - SERVICIOS (3 días)
- [ ] **T032** Formulario de servicios
- [ ] **T033** Búsqueda de ítem SIGAMEF
- [ ] **T034** Tabla dinámica de entregables
- [ ] **T035** Generar PDF y flujo de aprobación

## 👨‍💼 FASE 9: Requerimientos - LOCACIÓN (3 días)
- [ ] **T036** Formulario de locación
- [ ] **T037** Tabla dinámica de entregables
- [ ] **T038** Generar PDF y flujo de aprobación

## 📈 FASE 10: Dashboard y Reportes (2 días)
- [ ] **T039** Implementar KPIs (tarjetas)
- [ ] **T040** Gráficos con Chart.js
- [ ] **T041** Filtros por año, estado, centro de costo
- [ ] **T042** Exportar reportes a Excel y PDF

## ✅ FASE 11: Testing y Validación (1 día)
- [ ] **T043** Validar edge cases (duplicados, dependencias, IDs no reutilizados)
- [ ] **T044** Probar roles y permisos
- [ ] **T045** Verificar responsividad y tiempos de respuesta
