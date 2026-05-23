# 🗺️ MAPA DE REFERENCIA RÁPIDA - SGC

**Usa este documento para encontrar lo que necesitas en 30 segundos**

---

## ⚡ BÚSQUEDAS RÁPIDAS

### "Necesito comenzar YA"
→ [QUICK_START_GUIDE.md](QUICK_START_GUIDE.md) - Día 1, Setup  
→ Los primeros 10 archivos a crear en orden  
⏱️ Tiempo: 2-3 horas

---

### "¿Cómo funciona el flujo completo?"
→ [EXECUTIVE_SUMMARY.md](EXECUTIVE_SUMMARY.md) - Sección "Flujo Principal"  
→ Diagrama de 11 pasos: Requerimiento → Ejecución  
⏱️ Tiempo: 10 minutos

---

### "Necesito entender la arquitectura"
→ [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - Sección 1  
→ Diagrama de capas, componentes, flujos  
⏱️ Tiempo: 20 minutos

---

### "¿Dónde creo componentes UI?"
→ [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - Sección 5  
→ 27 componentes listos con ejemplos  
⏱️ Tiempo: Buscar nombre componente

---

### "¿Cómo creo un servicio CRUD?"
→ [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - Sección 4  
→ Patrón de servicios + ejemplo completo  
⏱️ Tiempo: 30 minutos implementación

---

### "¿Cuál es el schema de Requerimiento?"
→ [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - Sección 3.3  
→ JSON schema completo con 25+ campos  
⏱️ Tiempo: 5 minutos

---

### "¿Cómo proteger rutas por rol?"
→ [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - Sección 7  
→ Matriz 50+ rutas + route guard code  
⏱️ Tiempo: 15 minutos

---

### "¿Cómo generar PDFs/Excel?"
→ [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - Sección 8  
→ jsPDF + SheetJS con ejemplos  
⏱️ Tiempo: 20 minutos

---

### "¿Cuántas horas por tarea?"
→ [QUICK_START_GUIDE.md](QUICK_START_GUIDE.md) - Tabla de fases  
→ Desglose por semana + FTE estimado  
⏱️ Tiempo: 5 minutos

---

### "¿Debo cumplir WCAG 2.1 AA?"
→ [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - Sección 10.4  
→ Checklist accesibilidad + código  
⏱️ Tiempo: 15 minutos

---

## 📂 DOCUMENTOS & SUS USOS

### 📋 IMPLEMENTATION_PLAN.md (13KB)
**Cuándo**: Necesitas detalles técnicos profundos  
**Para**: Arquitectos, Seniors, Implementadores  
**Contiene**: 10 secciones, 5000+ líneas de especificación

| Sección | Contenido |
|---------|----------|
| 1 | Arquitectura + Stack |
| 2 | 40+ Carpetas con descripción |
| 3 | 11 Modelos JSON completos |
| 4 | 10+ Servicios CRUD |
| 5 | 27 Componentes UI |
| 6 | Máquinas de estado |
| 7 | 50+ Rutas por rol |
| 8 | Integraciones (jsPDF, SheetJS, Chart.js) |
| 9 | localStorage + Conflictos |
| 10 | Naming, Testing, Performance, WCAG |

---

### ⚡ QUICK_START_GUIDE.md (6KB)
**Cuándo**: Necesitas empezar hoy  
**Para**: Developers, Tech Leads  
**Contiene**: 48-hour quick start + fases

| Sección | Contenido |
|---------|----------|
| Día 1 | Setup, Auth, Login |
| Día 2 | Componentes base, Servicios |
| Checklist | Primera semana |
| Fases | 16 fases en 25 semanas |
| Estimación | 860-1090 horas, 1-2 FTE |
| Stack | package.json recomendado |

---

### 📚 DOCUMENTATION_INDEX.md
**Cuándo**: No sabes dónde buscar  
**Para**: Todos  
**Contiene**: Índice completo + matriz de referencia

---

### ✅ IMPLEMENTATION_CHECKLIST.md
**Cuándo**: Necesitas trackear progreso  
**Para**: Project Managers, Developers  
**Contiene**: 64 tasks con status, horas, owner

---

### 📑 EXECUTIVE_SUMMARY.md
**Cuándo**: Necesitas resumen 1 página  
**Para**: Stakeholders, Managers  
**Contiene**: Números clave, timeline, riesgos

---

### 📌 SGC.md
**Cuándo**: Necesitas especificación funcional  
**Para**: Product Managers, Testers  
**Contiene**: User stories, campos por tipo

---

### ✏️ tasks.md
**Cuándo**: Necesitas detalles de 64 tasks  
**Para**: Developers, Testers  
**Contiene**: 64 tasks organizadas en 20 fases

---

## 🔍 POR TIPO DE PREGUNTA

### Preguntas de Arquitectura
```
¿Cómo es la arquitectura general?
→ IMPLEMENTATION_PLAN Sección 1 + EXECUTIVE_SUMMARY

¿Cuál es la estructura de carpetas?
→ IMPLEMENTATION_PLAN Sección 2

¿Cómo funciona el flujo de datos?
→ IMPLEMENTATION_PLAN Sección 4 (Services)

¿Cómo manejar estados?
→ IMPLEMENTATION_PLAN Sección 6

¿Cómo está mapeado el acceso?
→ IMPLEMENTATION_PLAN Sección 7 (Routes)
```

---

### Preguntas de Implementación
```
¿Por dónde empiezo?
→ QUICK_START_GUIDE Día 1

¿Cómo creo un componente?
→ IMPLEMENTATION_PLAN Sección 5 + ejemplos

¿Cómo creo un servicio?
→ IMPLEMENTATION_PLAN Sección 4 + ejemplos

¿Cómo genero PDF/Excel?
→ IMPLEMENTATION_PLAN Sección 8

¿Cómo aseguro WCAG 2.1 AA?
→ IMPLEMENTATION_PLAN Sección 10.4

¿Cómo test?
→ IMPLEMENTATION_PLAN Sección 10.2
```

---

### Preguntas de Datos
```
¿Cómo es el schema de Requerimiento?
→ IMPLEMENTATION_PLAN Sección 3.3

¿Cómo es el schema de Contratación?
→ IMPLEMENTATION_PLAN Sección 3.4

¿Cómo almacenar en localStorage?
→ IMPLEMENTATION_PLAN Sección 9

¿Cómo resolver conflictos?
→ IMPLEMENTATION_PLAN Sección 9.2

¿Cuáles son todos los modelos?
→ IMPLEMENTATION_PLAN Sección 3 (completo)
```

---

### Preguntas de Planificación
```
¿Cuánto tiempo total?
→ QUICK_START_GUIDE + EXECUTIVE_SUMMARY

¿En cuántas fases?
→ QUICK_START_GUIDE Fases

¿Cuántas horas por fase?
→ QUICK_START_GUIDE Tabla

¿Cuánta gente necesito?
→ EXECUTIVE_SUMMARY + QUICK_START_GUIDE

¿Cuál es el timeline?
→ QUICK_START_GUIDE Timeline

¿Qué tengo que trackear?
→ IMPLEMENTATION_CHECKLIST
```

---

### Preguntas de Rol
```
"Soy Arquitecto de Software"
→ IMPLEMENTATION_PLAN (todo) + Decisiones arquitectónicas

"Soy Tech Lead"
→ QUICK_START_GUIDE + IMPLEMENTATION_CHECKLIST + Fases

"Soy Developer Senior"
→ IMPLEMENTATION_PLAN (completo) + Implementar servicios base

"Soy Developer Junior"
→ QUICK_START_GUIDE (Día 1-2) + Componentes UI

"Soy Product Manager"
→ SGC.md + EXECUTIVE_SUMMARY + tasks.md

"Soy QA/Tester"
→ tasks.md + IMPLEMENTATION_PLAN Sección 10.2
```

---

## 🎯 FLUJO POR OBJETIVO

### Objetivo 1: "Quiero comenzar HOY"

**Paso 1** (5 min)  
→ Lee: QUICK_START_GUIDE - Día 1 Setup

**Paso 2** (30 min)  
→ Haz: Crear estructura de carpetas

**Paso 3** (1 hora)  
→ Copia: HTML base + package.json

**Paso 4** (2 horas)  
→ Implementa: AuthService + LoginPage

**Paso 5** (30 min)  
→ Test: Login funciona

✅ **Total Día 1**: 4 horas. Ya tienes app shell corriendo.

---

### Objetivo 2: "Necesito entender todo antes de empezar"

**Paso 1** (20 min)  
→ Lee: EXECUTIVE_SUMMARY (resumen)

**Paso 2** (30 min)  
→ Lee: IMPLEMENTATION_PLAN Sección 1-3 (Arquitectura + Datos)

**Paso 3** (40 min)  
→ Lee: IMPLEMENTATION_PLAN Sección 4-7 (Services + Routes)

**Paso 4** (20 min)  
→ Lee: QUICK_START_GUIDE (Fases + Timeline)

**Paso 5** (30 min)  
→ Revisa: Matriz referencia en DOCUMENTATION_INDEX

✅ **Total**: 2.5 horas. Entiendes 100% el proyecto.

---

### Objetivo 3: "Necesito implementar Requerimientos (Bienes)"

**Paso 1** (10 min)  
→ Lee: IMPLEMENTATION_PLAN Sección 3.3 (Schema Requerimiento)

**Paso 2** (20 min)  
→ Lee: IMPLEMENTATION_PLAN Sección 4 (RequService patrón)

**Paso 3** (30 min)  
→ Lee: IMPLEMENTATION_PLAN Sección 5 (Form components)

**Paso 4** (3 horas)  
→ Implementa: RequFormBienes.js

**Paso 5** (1 hora)  
→ Implementa: PDF generation (jsPDF)

**Paso 6** (30 min)  
→ Test: Requerimiento se crea y PDF genera

✅ **Total**: 5 horas. Módulo Bienes completo.

---

### Objetivo 4: "Necesito trackear el proyecto"

**Paso 1** (5 min)  
→ Abre: IMPLEMENTATION_CHECKLIST.md

**Paso 2** (5 min)  
→ Por cada task completada: Marca ✓

**Paso 3** (2 min)  
→ Calcula: (Tasks ✓ / 64) * 100 = % Completo

**Paso 4** (2 min)  
→ Compara: % vs Semana esperada

✅ **Total**: 15 min por semana. Control completo.

---

## 📊 TABLA DE CONVERSIÓN

| Necesito... | Archivo | Sección | Tiempo |
|-----------|---------|---------|--------|
| Empezar | QUICK_START | Día 1 | 5 min |
| Resumen ejecutivo | EXECUTIVE_SUMMARY | Todo | 10 min |
| Flujo general | EXECUTIVE_SUMMARY | Flujo Principal | 10 min |
| Arquitectura | IMPLEMENTATION_PLAN | 1 | 15 min |
| Estructura carpetas | IMPLEMENTATION_PLAN | 2 | 5 min |
| Schema Requerimiento | IMPLEMENTATION_PLAN | 3.3 | 5 min |
| Todos los schemas | IMPLEMENTATION_PLAN | 3 | 30 min |
| Patrón servicios | IMPLEMENTATION_PLAN | 4 | 20 min |
| Componente Input | IMPLEMENTATION_PLAN | 5.2 | 10 min |
| Máquina de estados | IMPLEMENTATION_PLAN | 6 | 10 min |
| Rutas protegidas | IMPLEMENTATION_PLAN | 7 | 15 min |
| jsPDF example | IMPLEMENTATION_PLAN | 8.1 | 10 min |
| localStorage API | IMPLEMENTATION_PLAN | 9.1 | 15 min |
| WCAG checklist | IMPLEMENTATION_PLAN | 10.4 | 10 min |
| Estimación horas | QUICK_START_GUIDE | Fases | 5 min |
| 64 tasks | tasks.md | Todo | 20 min |
| Matriz referencia | DOCUMENTATION_INDEX | Matriz | 5 min |
| Checklist progreso | IMPLEMENTATION_CHECKLIST | Todo | Ongoing |

---

## 🎓 GUÍAS POR ROL (Qué leer)

### 👨‍💼 Product Manager
1. EXECUTIVE_SUMMARY (10 min)
2. SGC.md - User Stories (15 min)
3. QUICK_START_GUIDE - Fases (10 min)
4. tasks.md - Overview (10 min)
**Total**: 45 min

---

### 👨‍✈️ Tech Lead
1. IMPLEMENTATION_PLAN - Arquitectura (20 min)
2. QUICK_START_GUIDE - Todo (15 min)
3. IMPLEMENTATION_CHECKLIST - Setup (10 min)
4. DOCUMENTATION_INDEX - Usar como referencia
**Total**: 45 min (+ reference ongoing)

---

### 👨‍💻 Senior Developer
1. IMPLEMENTATION_PLAN - Todo (60 min)
2. tasks.md - Primeras 20 tasks (15 min)
3. QUICK_START_GUIDE - Para contexto (10 min)
**Total**: 85 min

---

### 👨‍🎓 Junior Developer
1. QUICK_START_GUIDE - Día 1-2 (15 min)
2. IMPLEMENTATION_PLAN - Secciones 5, 10 (30 min)
3. Hacer Día 1 setup (3 horas)
4. IMPLEMENTATION_PLAN - Secciones 3, 4 as needed
**Total**: Ongoing learning

---

### 🧪 QA/Tester
1. SGC.md - Funcionalidades (20 min)
2. tasks.md - 64 tasks (20 min)
3. IMPLEMENTATION_PLAN - Sección 10.2 (15 min)
4. IMPLEMENTATION_CHECKLIST - Para tracking
**Total**: 55 min

---

## 💡 TIPS FINALES

1. **Bookmarkea este archivo** - Úsalo como home
2. **Imprime QUICK_START_GUIDE** - Tenlo a mano Semana 1
3. **CTRL+F en IMPLEMENTATION_PLAN** - Para búsquedas específicas
4. **Actualiza IMPLEMENTATION_CHECKLIST** - Semanalmente
5. **Consulta DOCUMENTATION_INDEX** - Si te pierdes

---

## ✅ VERIFICACIÓN FINAL

Si llegaste aquí, tienes:

- ✅ IMPLEMENTATION_PLAN.md (13KB) - Especificación técnica
- ✅ QUICK_START_GUIDE.md (6KB) - Inicio rápido
- ✅ DOCUMENTATION_INDEX.md - Índice navegación
- ✅ IMPLEMENTATION_CHECKLIST.md - Tracking 64 tasks
- ✅ EXECUTIVE_SUMMARY.md - Resumen 1 página
- ✅ MAPA_REFERENCIA_RAPIDA.md - Este archivo
- ✅ SGC.md - Especificación funcional
- ✅ tasks.md - 64 tasks desglosadas

**Tienes TODO lo necesario para implementar SGC. ¡Comienza ya!** 🚀

---

*Última actualización: 2026-05-13*  
*Versión: 1.0*  
*Status: ✅ Ready for Implementation*
