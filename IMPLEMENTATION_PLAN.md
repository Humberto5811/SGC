# PLAN DE IMPLEMENTACIÓN DETALLADO - Sistema de Gestión de Contrataciones (SGC)

**Versión**: 1.0  
**Fecha**: 2026-05-13  
**Estado**: Listo para Implementación  
**Rama Feature**: `001-initialize-specification-workflow`

---

## ÍNDICE

1. [Arquitectura del Sistema](#1-arquitectura-del-sistema)
2. [Estructura de Carpetas](#2-estructura-de-carpetas)
3. [Modelos de Datos](#3-modelos-de-datos)
4. [API/Service Layer](#4-apiservice-layer)
5. [Componentes UI Reutilizables](#5-componentes-ui-reutilizables)
6. [Estrategia de Estados](#6-estrategia-de-estados)
7. [Rutas y Navegación por Rol](#7-rutas-y-navegación-por-rol)
8. [Integraciones Externas](#8-integraciones-externas)
9. [Persistencia y Datos](#9-persistencia-y-datos)
10. [Consideraciones Técnicas](#10-consideraciones-técnicas)

---

## 1. ARQUITECTURA DEL SISTEMA

### 1.1 Descripción General

El SGC es una **Single Page Application (SPA) sin backend real** basada en tecnologías frontend modernas, con persistencia local mediante localStorage. La arquitectura sigue un patrón de **componentes reutilizables** con una **capa de servicios simulada** que replica operaciones CRUD y búsqueda.

```
┌─────────────────────────────────────────────────────────────┐
│                      USER INTERFACE LAYER                    │
│            (Bootstrap 5 + Vanilla JS/Vue.js)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │  Autentif│ │Requerimientos│Contratación│Cotizaciones│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Contratos│ │Ejecución │ │Reportes  │ │Admin     │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              SERVICE/BUSINESS LOGIC LAYER                    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐            │
│  │ AuthService│ │ RequServices│ │ ContServices│           │
│  └────────────┘ └────────────┘ └────────────┘            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐            │
│  │CotizService│ │ContratoServ│ │ReportService│           │
│  └────────────┘ └────────────┘ └────────────┘            │
│              State Management & Validation                 │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│           DATA PERSISTENCE LAYER (localStorage)             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐            │
│  │Users       │ │Requerimientos│Contrataciones│           │
│  │Áreas       │ │Cotizaciones │Contratos    │           │
│  │Proveedores │ │Evaluaciones │Ejecución    │           │
│  │CCP/Metas   │ │Invitaciones │Auditoría    │           │
│  └────────────┘ └────────────┘ └────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Stack Tecnológico

| Capa | Tecnología | Propósito |
|------|-----------|----------|
| **Frontend Framework** | HTML5 + Bootstrap 5 | UI responsiva y moderna |
| **Scripting** | Vanilla JavaScript (ES6+) o Vue 3 Lite | Lógica frontend |
| **Estilos** | CSS3 + Bootstrap 5 | Diseño visual |
| **Persistencia** | localStorage API | Almacenamiento local |
| **PDF** | jsPDF + html2canvas | Generación de Anexos |
| **Excel** | SheetJS (XLSX) | Exportación de reportes |
| **Gráficos** | Chart.js | KPIs y dashboards |
| **Validación** | Moment.js + custom validators | Validación de fechas/datos |
| **Build Tool** | Webpack/Vite (opcional) | Bundling y minification |

### 1.3 Características Clave

- ✅ **SPA**: Carga inicial única, navegación sin recarga
- ✅ **Offline-first**: Funciona sin conexión a internet
- ✅ **localStorage**: Sincronización de datos automatizada
- ✅ **Responsive**: Adaptable a móvil, tablet, desktop
- ✅ **Accesible**: WCAG 2.1 AA compliance
- ✅ **Secure**: Validación frontend + manejo seguro de datos

---

## 2. ESTRUCTURA DE CARPETAS

```
SGC/
├── public/                          # Archivos estáticos
│   ├── index.html                  # Punto de entrada
│   ├── favicon.ico
│   └── manifest.json               # PWA manifest (opcional)
│
├── src/                            # Código fuente
│   ├── index.js                    # App entry point
│   ├── app.html                    # App shell template
│   │
│   ├── assets/                     # Recursos estáticos
│   │   ├── images/
│   │   │   ├── logo.png
│   │   │   ├── icons/
│   │   │   └── illustrations/
│   │   ├── documents/              # Plantillas documento
│   │   │   ├── anexo-01-a-bienes.html
│   │   │   ├── anexo-01-a-servicios.html
│   │   │   ├── anexo-04-multianual.html
│   │   │   └── cuadro-comparativo.html
│   │   └── data/
│   │       ├── sigamef-items.json  # SIGAMEF mock data
│   │       └── default-config.json # Configuración por defecto
│   │
│   ├── styles/                     # Estilos globales
│   │   ├── variables.css           # CSS variables (colores, espacios)
│   │   ├── typography.css          # Tipografía
│   │   ├── forms.css               # Estilos de formularios
│   │   ├── tables.css              # Estilos de tablas
│   │   ├── modals.css              # Estilos de modales
│   │   ├── utilities.css           # Clases utilitarias
│   │   └── main.css                # Consolidado (imports)
│   │
│   ├── components/                 # Componentes reutilizables
│   │   ├── base/                   # Componentes base
│   │   │   ├── Button.js
│   │   │   ├── Input.js
│   │   │   ├── Select.js
│   │   │   ├── Textarea.js
│   │   │   ├── Checkbox.js
│   │   │   ├── Radio.js
│   │   │   ├── DatePicker.js
│   │   │   └── TimePicker.js
│   │   │
│   │   ├── common/                 # Componentes comunes
│   │   │   ├── Header.js
│   │   │   ├── Navbar.js
│   │   │   ├── Sidebar.js
│   │   │   ├── Footer.js
│   │   │   ├── Toast.js
│   │   │   ├── Modal.js
│   │   │   ├── Card.js
│   │   │   ├── Badge.js
│   │   │   └── Spinner.js
│   │   │
│   │   ├── data-display/           # Componentes de datos
│   │   │   ├── Table.js
│   │   │   ├── List.js
│   │   │   ├── Pagination.js
│   │   │   ├── SearchFilter.js
│   │   │   ├── Tabs.js
│   │   │   └── Accordion.js
│   │   │
│   │   ├── forms/                  # Componentes de formularios
│   │   │   ├── FormGroup.js
│   │   │   ├── Form.js
│   │   │   ├── FileUpload.js
│   │   │   └── FormValidation.js
│   │   │
│   │   └── layout/                 # Componentes de layout
│   │       ├── Container.js
│   │       ├── Row.js
│   │       └── Col.js
│   │
│   ├── services/                   # Servicios (CRUD, búsqueda, etc.)
│   │   ├── auth/
│   │   │   └── AuthService.js      # Autenticación y sesión
│   │   │
│   │   ├── storage/
│   │   │   ├── StorageService.js   # Abstracción localStorage
│   │   │   └── SyncService.js      # Sincronización de datos
│   │   │
│   │   ├── entities/               # Servicios por entidad
│   │   │   ├── UserService.js
│   │   │   ├── AreaService.js
│   │   │   ├── RequService.js      # Requerimientos
│   │   │   ├── ContService.js      # Contrataciones
│   │   │   ├── CotizService.js     # Cotizaciones
│   │   │   ├── ContratoService.js  # Contratos
│   │   │   ├── ProveedorService.js # Proveedores
│   │   │   ├── InvitacionService.js
│   │   │   ├── EvaluacionService.js
│   │   │   └── CCPService.js
│   │   │
│   │   ├── export/
│   │   │   ├── PDFExportService.js # Generación PDF (jsPDF)
│   │   │   ├── ExcelExportService.js # Exportación XLSX (SheetJS)
│   │   │   └── ReportService.js
│   │   │
│   │   └── external/
│   │       ├── SIGAMEFService.js   # SIGAMEF mock API
│   │       ├── EmailService.js     # Simulación de email
│   │       └── SUNATService.js     # Simulación SUNAT
│   │
│   ├── utils/                      # Utilidades
│   │   ├── validators.js           # Validadores (DNI, RUC, email, etc.)
│   │   ├── formatters.js           # Formateadores (moneda, fecha, etc.)
│   │   ├── date-helpers.js         # Helpers de fechas
│   │   ├── state-machine.js        # Máquina de estados
│   │   ├── constants.js            # Constantes globales
│   │   ├── enums.js                # Enumeraciones
│   │   ├── error-handler.js        # Manejo centralizado de errores
│   │   ├── logger.js               # Sistema de logging
│   │   └── helpers.js              # Funciones auxiliares generales
│   │
│   ├── modules/                    # Módulos por dominio
│   │   ├── auth/                   # Módulo de autenticación
│   │   │   ├── LoginPage.js
│   │   │   ├── PasswordResetPage.js
│   │   │   └── AuthGuard.js
│   │   │
│   │   ├── admin/                  # Módulo administrativo
│   │   │   ├── DashboardAdmin.js
│   │   │   ├── UsersManagement.js
│   │   │   ├── DocumentManagement.js
│   │   │   └── SystemConfig.js
│   │   │
│   │   ├── requerimientos/         # Módulo de requerimientos
│   │   │   ├── RequList.js
│   │   │   ├── RequDetail.js
│   │   │   ├── RequFormBienes.js
│   │   │   ├── RequFormServicios.js
│   │   │   ├── RequFormLocacion.js
│   │   │   ├── RequEvaluation.js
│   │   │   ├── RequSubsanacion.js
│   │   │   └── RequPDFExport.js
│   │   │
│   │   ├── contrataciones/        # Módulo de contrataciones
│   │   │   ├── ContList.js
│   │   │   ├── ContDetail.js
│   │   │   ├── ContForm.js
│   │   │   ├── ContSearch.js
│   │   │   └── ContStatus.js
│   │   │
│   │   ├── invitaciones/          # Módulo de invitaciones
│   │   │   ├── InvList.js
│   │   │   ├── InvAbierta.js
│   │   │   ├── InvCerrada.js
│   │   │   ├── ProviderSearch.js
│   │   │   └── InvTracking.js
│   │   │
│   │   ├── cotizaciones/          # Módulo de cotizaciones
│   │   │   ├── CotizList.js
│   │   │   ├── CotizApertura.js
│   │   │   ├── CotizEvalPaquete.js
│   │   │   ├── CotizEvalItem.js
│   │   │   ├── CotizSubsanacion.js
│   │   │   └── Sorteo.js
│   │   │
│   │   ├── contratos/             # Módulo de contratos
│   │   │   ├── ContratoList.js
│   │   │   ├── ContratoForm.js
│   │   │   ├── ContratoSearch.js
│   │   │   ├── ContratoModifications.js
│   │   │   └── ContratoEjecucion.js
│   │   │
│   │   ├── ejecucion/             # Módulo de ejecución contractual
│   │   │   ├── ConformidadForm.js
│   │   │   ├── PenalidadForm.js
│   │   │   ├── AmpliacinPlazoForm.js
│   │   │   └── EjecucionList.js
│   │   │
│   │   ├── maestros/              # Módulo de maestros
│   │   │   ├── AreasManagement.js
│   │   │   ├── SiglasManagement.js
│   │   │   ├── SIGAMEFSearch.js
│   │   │   ├── CCPManagement.js
│   │   │   └── DocumentosConfig.js
│   │   │
│   │   ├── reportes/              # Módulo de reportes
│   │   │   ├── KPIDashboard.js
│   │   │   ├── ReportGenerator.js
│   │   │   ├── AuditLog.js
│   │   │   └── ExportOptions.js
│   │   │
│   │   └── shared/                # Elementos compartidos
│   │       ├── NotFound.js
│   │       ├── Unauthorized.js
│   │       └── Loading.js
│   │
│   ├── middleware/                 # Middleware
│   │   ├── AuthMiddleware.js       # Validación de sesión
│   │   ├── RoleMiddleware.js       # Validación de roles
│   │   ├── ErrorMiddleware.js      # Manejo de errores
│   │   └── LoggingMiddleware.js    # Logging de acciones
│   │
│   ├── hooks/                      # Custom hooks (si usa framework)
│   │   ├── useAuth.js
│   │   ├── useStorage.js
│   │   ├── useForm.js
│   │   └── useFetch.js
│   │
│   └── router/                     # Enrutamiento
│       ├── Router.js               # Configuración de rutas
│       ├── routes.js               # Definición de rutas
│       └── guards.js               # Route guards
│
├── tests/                          # Tests
│   ├── unit/
│   │   ├── services/
│   │   ├── utils/
│   │   └── validators/
│   ├── integration/
│   │   ├── workflows/
│   │   └── api/
│   └── e2e/
│       └── scenarios/
│
├── docs/                           # Documentación
│   ├── ARCHITECTURE.md
│   ├── API_SPEC.md
│   ├── USER_MANUAL.md
│   ├── ADMIN_GUIDE.md
│   ├── DEVELOPER_GUIDE.md
│   └── TROUBLESHOOTING.md
│
├── .github/
│   ├── copilot-instructions.md
│   └── copilot-prompts/
│
├── .gitignore
├── package.json
├── webpack.config.js (o vite.config.js)
├── README.md
└── IMPLEMENTATION_PLAN.md
```

### 2.1 Descripción de Directorios

| Directorio | Descripción |
|-----------|------------|
| `public/` | Archivos HTML estáticos, favicon, manifest PWA |
| `src/assets/` | Imágenes, plantillas documento, datos SIGAMEF mock |
| `src/styles/` | CSS global, variables, utilidades |
| `src/components/` | Componentes UI reutilizables por categoría |
| `src/services/` | Lógica de negocio, CRUD, validación, integración |
| `src/utils/` | Funciones auxiliares, validadores, formateadores |
| `src/modules/` | Páginas/vistas agrupadas por dominio funcional |
| `src/middleware/` | Autenticación, autorización, logging |
| `src/router/` | Configuración de rutas y guards |
| `tests/` | Tests unitarios, integración, E2E |
| `docs/` | Documentación completa del proyecto |

---

## 3. MODELOS DE DATOS

### 3.1 Usuario

```javascript
// User Model
{
  id: "USR-001",                    // UUID o ID incremental
  dni: "12345678",                  // Único
  email: "user@institution.gov.pe", // Único
  password: "hashed_password",      // Hash (nunca plaintext)
  nombreCompleto: "Juan Pérez García",
  rol: "OPERADOR_DEC",              // ADMIN, OPERADOR_DEC, OPERADOR_AU, PROVEEDOR
  areaUsuria: "ÁREA-001",           // Referencia a AreaUsuaria
  estado: "ACTIVO",                 // ACTIVO, INACTIVO, SUSPENDIDO
  telefonoContacto: "+51987654321",
  createdAt: "2026-05-13T10:30:00Z",
  updatedAt: "2026-05-13T10:30:00Z",
  lastLogin: "2026-05-13T10:25:00Z",
  permisos: ["READ_REQUERIMIENTOS", "CREATE_CONTRATACIONES"] // Array de permisos
}
```

### 3.2 Área Usuaria / Centro de Costo

```javascript
{
  id: "AREA-001",
  codigo: "AU-001",                 // Código único
  nombre: "Dirección de Operaciones",
  descripcion: "Área responsable...",
  sigla: "DIR-OP",
  responsable: "USR-001",           // Referencia a Usuario
  estado: "ACTIVO",
  presupuestoAnual: 1000000,        // En soles
  moneda: "PEN",
  contacto: {
    email: "area@institution.gov.pe",
    telefono: "+51987654321"
  },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-05-13T10:30:00Z"
}
```

### 3.3 Requerimiento (Bienes)

```javascript
{
  id: "REQ-2026-001",
  tipo: "BIENES",                   // BIENES, SERVICIOS, LOCACION
  estado: "BORRADOR",               // BORRADOR, NO_RECIBIDO, RECIBIDO, OBSERVADO, APROBADO
  areaUsuaria: "AREA-001",
  denominacion: "Computadora de escritorio",
  objetivo: "Adquisición de equipos informáticos",
  finalidad: "Para soporte técnico",
  
  // Campo SIGAMEF
  sigamefItem: {
    codigo: "3310-4010-0000",
    descripcion: "Computadora de escritorio",
    unidadMedida: "UNIDAD"
  },
  cantidad: 5,
  
  // Documentación técnica
  documentacionTecnica: [
    {
      id: "DOC-001",
      nombre: "Especificaciones técnicas",
      requisito: "Procesador Intel i7 o equivalente",
      tipo: "ESPECIFICACION"
    }
  ],
  
  // Vigencia
  vigenciaProducto: {
    inicio: "2026-06-01",
    fin: "2026-12-31"
  },
  
  // Entregas (tabla editable)
  entregas: [
    {
      id: 1,
      numero: 1,
      dias: 30,
      descripcion: "Primera entrega - 3 unidades",
      cantidad: 3
    },
    {
      id: 2,
      numero: 2,
      dias: 60,
      descripcion: "Segunda entrega - 2 unidades",
      cantidad: 2
    }
  ],
  
  // Garantía
  garantiaComercial: "12 meses contra defectos de fabricación",
  
  // Prestaciones accesorias
  prestacionesAccesorias: "Instalación incluida",
  
  // Requisitos del proveedor
  requisitosProveedor: ["Experiencia mínima 3 años", "RNP vigente"],
  
  // Lugar y condiciones entrega
  lugarEntrega: "Oficinas principales - Av. Principal 123",
  condicionesEntrega: "Horario 8:00 a 17:00, lunes a viernes",
  
  // Vicios ocultos
  viciosOcultos: {
    responsabilidad: "Proveedor responsable por 1 año",
    solucionConflictos: "Arbitraje según UNCITRAL",
    resolucionIncumplimiento: "Multa de 10% del monto",
    gestionRiesgos: "Aseguramiento del bien",
    confidencialidad: "Aplica normativa de protección datos",
    causalesResolucion: ["Incumplimiento mayor 10 días", "Problemas de calidad"]
  },
  
  // Modalidad de pago
  modalidadPago: "30% adelanto, 70% contra entrega",
  condicionesPago: "Factura electrónica requerida",
  
  // Conformidad de recepción
  conformidadRecepcion: "Por unidad verificada",
  
  // Penalidades
  penalidad: "5% del monto por día de retraso",
  otrasPenalidades: "Multa por no conformidad: 2% del monto",
  
  // Otros
  otros: "Campo libre para aclaraciones",
  
  // Aprobación
  aprobacion: {
    solicitadoEn: "2026-05-13T10:30:00Z",
    aprobadoEn: null,
    rechazadoEn: null,
    observaciones: null,
    aprobadoPor: null,
    estado: "PENDIENTE"
  },
  
  // PDF generado
  pdfAnexoUrl: "/pdfs/REQ-2026-001-anexo-01-a.pdf",
  
  createdAt: "2026-05-13T10:00:00Z",
  updatedAt: "2026-05-13T10:30:00Z"
}
```

### 3.4 Contratación

```javascript
{
  id: "CONT-2026-001",
  numeroContratacion: "CONT-2026-001",  // Auto-generado (sigla + año + número)
  estado: "VIGENTE",                    // VIGENTE, EN_EVALUACION, CULMINADO, ANULADA
  
  // Origen
  origen: "CON_REQUERIMIENTO",         // CON_REQUERIMIENTO, SIN_REQUERIMIENTO
  requerimiento: "REQ-2026-001",        // Si aplica
  
  // Datos generales
  areaUsuaria: "AREA-001",
  descripcionObjeto: "Adquisición de computadoras",
  cui: "CUI-123456",                   // Opcional
  
  // Cronograma
  cronograma: {
    consultasInicio: "2026-06-01T08:00:00Z",
    consultasFinalizacion: "2026-06-10T17:00:00Z",
    cotizacionesInicio: "2026-06-11T08:00:00Z",
    cotizacionesFinalizacion: "2026-06-25T17:00:00Z"
  },
  
  // Tipo invitación y evaluación
  tipoInvitacion: "ABIERTA",            // ABIERTA, CERRADA
  tipoEvaluacion: "POR_PAQUETE",        // POR_PAQUETE, POR_RELACION_ITEM
  
  // Ítem de la contratación
  items: [
    {
      id: "ITEM-001",
      cubsoCode: "3310-4010-0000",
      cantidad: 5,
      unidadMedida: "UNIDAD",
      moneda: "PEN",
      lugarEntrega: "Lima"
    }
  ],
  
  // Documentos requeridos
  documentosRequeridos: [
    "DOC-001",    // Referencias a documentos configurados
    "DOC-002"
  ],
  
  // Cuadro multianual (Anexo 04/06)
  cuadroMultianual: {
    anio1: 250000,
    anio2: 250000,
    anio3: 250000,
    anio4: 250000
  },
  
  // Archivo requerimiento (si aplica)
  requerimientoFile: "/files/REQ-2026-001.pdf",
  
  // Presupuesto/CCP
  ccp: "CCP-2026-001",                // Referencia a CCP
  presupuestoAsignado: 1000000,
  
  // Publicación
  publicado: true,
  publicadoEn: "2026-06-01T08:00:00Z",
  
  createdAt: "2026-05-13T10:00:00Z",
  updatedAt: "2026-05-13T10:30:00Z"
}
```

### 3.5 Invitación

```javascript
{
  id: "INV-2026-001",
  contratacion: "CONT-2026-001",
  tipo: "ABIERTA",                    // ABIERTA, CERRADA
  
  // Proveedores
  proveedores: [
    {
      ruc: "20123456789",
      razonSocial: "Empresa A S.A.",
      email: "contacto@empresaa.com",
      estado: "ENVIADO",              // ENVIADO, LEIDO, NO_LEIDO, COTIZO
      enviadoEn: "2026-06-01T10:00:00Z",
      leidoEn: null
    }
  ],
  
  // Email enviado
  emailTemplate: "invitacion-standard",
  
  estado: "VIGENTE",                  // VIGENTE, CERRADA, CANCELADA
  
  createdAt: "2026-06-01T08:00:00Z",
  updatedAt: "2026-06-01T10:30:00Z"
}
```

### 3.6 Cotización

```javascript
{
  id: "COTIZ-2026-001",
  contratacion: "CONT-2026-001",
  invitacion: "INV-2026-001",
  
  // Proveedor
  ruc: "20123456789",
  razonSocial: "Empresa A S.A.",
  contacto: "Juan García",
  email: "juan@empresaa.com",
  telefono: "+51987654321",
  
  // Ítems cotizados
  items: [
    {
      id: "ITEM-001",
      cubsoCode: "3310-4010-0000",
      descripcion: "Computadora de escritorio",
      cantidad: 5,
      precioUnitario: 3000,
      moneda: "PEN",
      total: 15000
    }
  ],
  
  montoTotal: 15000,
  moneda: "PEN",
  
  // Documentos adjuntos
  documentosAdjuntos: [
    {
      id: "FILE-001",
      nombre: "Cotización formal.pdf",
      tipo: "application/pdf",
      url: "/files/COTIZ-2026-001-doc1.pdf"
    }
  ],
  
  // Evaluación
  evaluacion: {
    tecnica: {
      solicitada: true,
      areaUsuaria: "AREA-001",
      estado: "PENDIENTE",        // PENDIENTE, CUMPLE, NO_CUMPLE
      resultado: null,
      motivo: null,
      evaluadaPor: null,
      evaluadaEn: null
    },
    estado: "ADJUDICADA",           // ADJUDICADA, CALIFICADA, DESCALIFICADA, SIN_EVALUACION
    evaluadaPor: "USR-001",
    evaluadaEn: "2026-06-26T14:00:00Z",
    motivo: null                    // Si descalificada
  },
  
  // Subsanación (si aplica)
  subsanacion: {
    solicitada: false,
    fechaSolicitud: null,
    plazo: 0,                       // Días
    estado: "NO_INICIADA",          // NO_INICIADA, PENDIENTE, COMPLETADA
    documentosSubsanacion: []
  },
  
  estado: "EVALUADA",               // REGISTRADA, EVALUADA, ADJUDICADA, DESCALIFICADA
  
  createdAt: "2026-06-11T10:00:00Z",
  updatedAt: "2026-06-26T14:30:00Z"
}
```

### 3.7 Contrato

```javascript
{
  id: "CONTR-2026-001",
  numeroContrato: "CONTR-2026-001",
  contratacion: "CONT-2026-001",
  cotizacionAdjudicada: "COTIZ-2026-001",
  
  estado: "PUBLICADO",              // BORRADOR, PUBLICADO, EN_EJECUCION, CULMINADO, NULO, RESUELTO
  
  // Datos del contratista
  contratista: {
    tipo: "PERSONA_JURIDICA",       // PERSONA_NATURAL, PERSONA_JURIDICA, CONSORCIO
    ruc: "20123456789",
    razonSocial: "Empresa A S.A.",
    nombreContacto: "Juan García",
    email: "juan@empresaa.com",
    telefonoContacto: "+51987654321",
    direccion: "Av. Principal 123, Lima"
  },
  
  // Datos contractuales
  moneda: "PEN",
  montoContrato: 15000,
  tipoContrato: "CONTRATO",         // CONTRATO, ORDEN_COMPRA, ORDEN_SERVICIO
  descriptionObjeto: "Suministro de computadoras",
  
  // Plazos
  fechaFirma: "2026-06-27",
  fechaVigenciaInicio: "2026-07-01",
  fechaVigenciaFin: "2026-12-31",
  plazoEjecucion: 180,              // Días
  
  // Ítems (del contrato)
  items: [
    {
      id: "ITEM-001",
      descripcion: "Computadora de escritorio",
      cantidad: 5,
      precioUnitario: 3000,
      moneda: "PEN",
      total: 15000,
      lugarEntrega: "Lima",
      plazoEntrega: 30
    }
  ],
  
  // Cronograma de entrega y pago
  cronograma: [
    {
      id: 1,
      tipo: "ENTREGA",
      numero: 1,
      descripcion: "Primera entrega - 3 unidades",
      cantidad: 3,
      fechaPlaneada: "2026-07-30",
      montoAsociado: 9000,
      estado: "PENDIENTE"
    },
    {
      id: 2,
      tipo: "PAGO",
      numero: 1,
      descripcion: "Pago segunda cuota",
      cantidad: null,
      fechaPlaneada: "2026-08-15",
      montoAsociado: 6000,
      estado: "PENDIENTE"
    }
  ],
  
  // Garantía
  garantia: {
    requerida: false,
    motivo: "Contrato menor según Ley 32069",
    monto: 0
  },
  
  // Documentos
  documentoContrato: "/files/CONTR-2026-001.pdf",
  documentoConsorcio: null,
  
  createdAt: "2026-06-27T10:00:00Z",
  updatedAt: "2026-06-27T10:30:00Z"
}
```

### 3.8 CCP (Código de Clasificador Presupuestario)

```javascript
{
  id: "CCP-2026-001",
  anioFiscal: 2026,                 // No editable, año actual
  meta: "META-001",                 // Referencia a Meta
  clasificadorGasto: "3310",        // Código clasificador
  ffRubro: "1000",                  // Rubro presupuestario
  moneda: "PEN",
  numeroCCP: 1,                     // Número del CCP
  montoUtilizar: 250000,
  
  // Archivo CCP
  archivoCCP: "/files/CCP-2026-001.pdf",
  
  // Validación
  validado: true,
  validadoPor: "USR-001",
  validadoEn: "2026-05-20T10:00:00Z",
  
  estado: "ACTIVO",                 // ACTIVO, INACTIVO, UTILIZADO
  
  createdAt: "2026-05-20T10:00:00Z",
  updatedAt: "2026-05-20T10:30:00Z"
}
```

### 3.9 Proveedor

```javascript
{
  id: "PROV-001",
  ruc: "20123456789",               // Único
  razonSocial: "Empresa A S.A.",
  tipo: "PERSONA_JURIDICA",         // PERSONA_NATURAL, PERSONA_JURIDICA, CONSORCIO
  
  // Contacto
  nombreContacto: "Juan García",
  email: "contacto@empresaa.com",   // Único
  telefonoContacto: "+51987654321",
  direccion: "Av. Principal 123, Lima",
  
  // RNP
  rnpVigente: true,
  rnpFechaVencimiento: "2026-12-31",
  
  // Clasificación
  clasificacion: "PROVEEDOR_GENERAL",
  rubros: ["BIENES", "SERVICIOS"],
  
  // Historial
  totalCotizaciones: 5,
  totalAdjudicaciones: 2,
  totalContrataciones: 2,
  
  // Evaluación
  calificacionPromedio: 4.5,        // 0-5
  evaluaciones: [
    {
      id: "EVAL-001",
      criterio: "Calidad",
      puntuacion: 5
    }
  ],
  
  estado: "ACTIVO",
  
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-05-13T10:30:00Z"
}
```

### 3.10 Evaluación (Requerimiento o Contratación)

```javascript
{
  id: "EVAL-2026-001",
  tipoEntidad: "REQUERIMIENTO",     // REQUERIMIENTO, CONTRATACION
  entidadId: "REQ-2026-001",
  
  // Evaluador
  evaluador: "USR-001",
  rol: "OPERADOR_DEC",
  
  // Secciones evaluadas
  secciones: [
    {
      id: "SEC-DATOS",
      nombre: "Datos Generales",
      estado: "APROBADA",           // APROBADA, OBSERVADA, RECHAZADA
      observaciones: null
    },
    {
      id: "SEC-ANEXO",
      nombre: "Anexo 01-A",
      estado: "OBSERVADA",
      observaciones: "Falta especificación técnica de garantía"
    }
  ],
  
  // Decisión final
  estadoGeneral: "OBSERVADA",       // APROBADA, OBSERVADA, RECHAZADA
  observacionesFinales: "Requerimiento solicitado para subsanación",
  
  evaluadaEn: "2026-05-15T14:30:00Z",
  
  // Subsanación (si aplica)
  subsanacionRequerida: true,
  subsanacionRealizada: false,
  
  createdAt: "2026-05-15T14:30:00Z",
  updatedAt: "2026-05-15T14:30:00Z"
}
```

### 3.11 Ejecución Contractual

```javascript
{
  id: "EXEC-2026-001",
  contrato: "CONTR-2026-001",
  
  // Conformidad de recepción
  conformidades: [
    {
      id: "CONF-001",
      numeroEntrega: 1,
      descripcion: "Entrega 1 - 3 computadoras",
      cantidad: 3,
      documentoAdjunto: "/files/conformidad-001.pdf",
      publicada: true,
      publicadaEn: "2026-07-31T10:00:00Z",
      conformeAcumulada: 3
    }
  ],
  
  // Penalidades
  penalidades: [
    {
      id: "PEN-001",
      descripcion: "Retraso de 5 días en entrega",
      monto: 1500,
      estado: "APLICADA",
      documentoAdjunto: "/files/penalidad-001.pdf",
      aplicadaEn: "2026-08-05T10:00:00Z"
    }
  ],
  
  // Ampliación de plazo
  ampliacionesPlazo: [
    {
      id: "AMP-001",
      descripcion: "Ampliación por casos fortuitos",
      diasAprobados: 15,
      estado: "APROBADA",
      nuevaFechaFin: "2027-01-15",
      aprobadaEn: "2026-08-01T10:00:00Z"
    }
  ],
  
  // Modificaciones (nulidad, resolución, otros)
  modificaciones: [
    {
      id: "MOD-001",
      tipo: "NULIDAD",               // NULIDAD, RESOLUCION, ADENDA, ACUERDO
      alcance: "PARCIAL",            // TOTAL, PARCIAL
      itemsAfectados: ["ITEM-001"],
      montoEjecutado: 6000,
      documentoAdjunto: "/files/nulidad-001.pdf",
      aplicadaEn: "2026-08-10T10:00:00Z"
    }
  ],
  
  estado: "EN_EJECUCION",           // EN_EJECUCION, CULMINADA, NULA, RESUELTA
  
  createdAt: "2026-07-01T10:00:00Z",
  updatedAt: "2026-08-10T10:30:00Z"
}
```

---

## 4. API/SERVICE LAYER

### 4.1 Estructura de Servicios

Cada servicio sigue el patrón de una clase con métodos CRUD + búsqueda/filtrado:

```javascript
// Ejemplo: RequService.js
class RequService {
  constructor() {
    this.store = StorageService;
    this.logger = Logger;
  }

  // CREATE
  async createReq(data) {
    // Validar datos
    // Generar ID único
    // Guardar en localStorage
    // Registrar en audit log
    // Retornar datos guardados
  }

  // READ
  async getReq(id) {
    // Validar existencia
    // Recuperar de localStorage
    // Enriquecer con datos relacionados
    // Retornar
  }

  // READ ALL
  async getAllReqs(filters = {}) {
    // Recuperar todos de localStorage
    // Aplicar filtros (estado, área, tipo)
    // Aplicar paginación
    // Retornar lista
  }

  // UPDATE
  async updateReq(id, data) {
    // Validar existencia
    // Validar cambios permitidos según estado
    // Actualizar en localStorage
    // Registrar cambios en audit
    // Retornar datos actualizados
  }

  // DELETE
  async deleteReq(id) {
    // Validar existencia
    // Validar permiso de borrado
    // Marcar como INACTIVO (soft delete) o borrar
    // Registrar en audit
  }

  // SEARCH
  async searchReqs(query) {
    // Buscar por denominación, descripción, etc.
    // Retornar resultados
  }

  // FILTER
  async filterReqs(filters) {
    // Filtrar por múltiples criterios
    // Retornar resultados
  }

  // STATE TRANSITIONS
  async solicitarAprobacion(reqId) {
    // Validar estado actual
    // Cambiar estado a "NO_RECIBIDO"
    // Notificar evaluadores
  }

  async aprobarReq(reqId, data) {
    // Validar rol (DEC evaluator)
    // Cambiar estado a "APROBADO"
    // Generar contratación asociada
  }

  async observarReq(reqId, observaciones) {
    // Cambiar estado a "OBSERVADO"
    // Guardar observaciones
    // Notificar a AU para subsanación
  }

  // EXPORT
  async exportReqToPDF(reqId) {
    // Obtener datos del requerimiento
    // Generar PDF Anexo 01-A
    // Retornar URL descargable
  }

  async exportReqToExcel(filterIds = []) {
    // Obtener listado de reqs
    // Exportar a XLSX
    // Retornar URL descargable
  }
}
```

### 4.2 Patrón de Servicios Principales

```
AuthService
├── login(dni, password)
├── logout()
├── getCurrentUser()
├── hasRole(role)
├── canAccess(resource)
└── refreshSession()

UserService (CRUD)
├── createUser(data)
├── getUser(id)
├── getAllUsers(filters)
├── updateUser(id, data)
├── deleteUser(id)
├── searchUsers(query)
└── changePassword(userId, oldPwd, newPwd)

RequService (CRUD + Workflow)
├── createReq(data)
├── getReq(id)
├── getAllReqs(filters)
├── updateReq(id, data)
├── deleteReq(id)
├── searchReqs(query)
├── solicitarAprobacion(reqId)
├── aprobarReq(reqId, data)
├── observarReq(reqId, observaciones)
├── subsanarReq(reqId, data)
├── exportReqToPDF(reqId)
└── exportReqToExcel(filterIds)

ContService (CRUD + Workflow)
├── createCont(data)
├── getCont(id)
├── getAllCont(filters)
├── updateCont(id, data)
├── deleteCont(id)
├── searchCont(query)
├── generarNumeroCont()
├── publishCont(contId)
├── recibirReq(reqId) // Transición a contratación
└── exportContToExcel()

CotizService (CRUD + Evaluation)
├── createCotiz(contId, providerRuc, data)
├── getCotiz(id)
├── getAllCotiz(contId, filters)
├── updateCotiz(id, data)
├── evaluarCotizacionTecnica(cotizId, resultado)
├── evaluarCotizacionPrecio(cotizId)
├── adjudicarCotiz(cotizId)
├── solicitarSubsanacion(cotizId, dias)
├── procesarSorteo(contratacionId) // Para empates
└── generarCuadroComparativo(contId)

ContratoService (CRUD + Execution)
├── createContrato(cotizId)
├── getContrato(id)
├── getAllContratos(filters)
├── updateContrato(id, data)
├── publishContrato(contratoId)
├── generarConformidad(contratoId, entregaNum)
├── registrarPenalidad(contratoId, data)
├── ampliarPlazo(contratoId, dias)
├── registrarNulidad(contratoId, data)
├── registrarResolucion(contratoId, data)
└── exportContratoToPDF(contratoId)

InvitacionService
├── createInvitacion(contId, tipo)
├── generarProveedor(tipoInvitacion) // Random 20 o manual
├── enviarInvitaciones(invId)
├── registrarLectura(invId, provRuc)
└── trackingInvitacion(invId)

ProveedorService
├── searchProveedores(query)
├── getProveedor(ruc)
├── createProveedor(data)
├── updateProveedor(ruc, data)
├── validarRUC(ruc) // Simula SUNAT
└── consultarRNP(ruc)

PDFExportService
├── generarAnexo01A(reqData)
├── generarAnexo04(contData)
├── generarCuadroComparativo(cotizaciones)
├── generarContrato(contratoData)
└── firmarDocumento(pdfUrl) // Simulada

ExcelExportService
├── exportarListado(datos, nombre)
├── exportarReporte(datos, nombre)
└── formatearExcel(datos, template)

StorageService (localStorage wrapper)
├── set(key, value)
├── get(key)
├── remove(key)
├── clear()
├── getAllKeys()
└── sync() // Simulada

ReportService
├── getKPIDashboard(dateRange)
├── getRequerimentosReport(filters)
├── getContratacionesReport(filters)
├── getCotizacionesReport(filters)
├── getContratosReport(filters)
├── getAuditTrail(filters)
└── generateScheduledReport()
```

### 4.3 Ejemplo Implementación de Servicio

```javascript
// src/services/entities/RequService.js

class RequService {
  constructor() {
    this.storageKey = 'requerimientos';
    this.storage = StorageService;
    this.logger = Logger;
  }

  async createReq(data) {
    try {
      // 1. Validar datos
      this._validateRequData(data);

      // 2. Generar ID único
      const id = `REQ-${new Date().getFullYear()}-${this._generateSequential()}`;

      // 3. Estructura completa
      const req = {
        id,
        ...data,
        estado: 'BORRADOR',
        aprobacion: {
          solicitadoEn: null,
          aprobadoEn: null,
          rechazadoEn: null,
          observaciones: null,
          aprobadoPor: null,
          estado: 'NO_SOLICITADA'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 4. Guardar en localStorage
      const reqs = this.storage.get(this.storageKey) || [];
      reqs.push(req);
      this.storage.set(this.storageKey, reqs);

      // 5. Registrar en audit
      this.logger.log('CREAR_REQUERIMIENTO', {
        id,
        usuario: AuthService.getCurrentUser().id,
        tipo: data.tipo
      });

      // 6. Retornar
      return req;
    } catch (error) {
      this.logger.error('createReq', error);
      throw error;
    }
  }

  async getReq(id) {
    const reqs = this.storage.get(this.storageKey) || [];
    const req = reqs.find(r => r.id === id);
    if (!req) throw new Error(`Requerimiento ${id} no encontrado`);
    return req;
  }

  async getAllReqs(filters = {}) {
    let reqs = this.storage.get(this.storageKey) || [];

    // Aplicar filtros
    if (filters.estado) {
      reqs = reqs.filter(r => r.estado === filters.estado);
    }
    if (filters.tipo) {
      reqs = reqs.filter(r => r.tipo === filters.tipo);
    }
    if (filters.areaUsuaria) {
      reqs = reqs.filter(r => r.areaUsuaria === filters.areaUsuaria);
    }

    // Aplicar paginación
    if (filters.page && filters.pageSize) {
      const start = (filters.page - 1) * filters.pageSize;
      return reqs.slice(start, start + filters.pageSize);
    }

    return reqs;
  }

  async updateReq(id, data) {
    const reqs = this.storage.get(this.storageKey) || [];
    const index = reqs.findIndex(r => r.id === id);
    if (index === -1) throw new Error(`Requerimiento ${id} no encontrado`);

    // Validar que se puede editar según estado
    if (reqs[index].estado !== 'BORRADOR' && reqs[index].estado !== 'OBSERVADO') {
      throw new Error(`No se puede editar requerimiento en estado ${reqs[index].estado}`);
    }

    reqs[index] = {
      ...reqs[index],
      ...data,
      updatedAt: new Date().toISOString()
    };

    this.storage.set(this.storageKey, reqs);
    return reqs[index];
  }

  async solicitarAprobacion(id) {
    const req = await this.getReq(id);
    
    if (req.estado !== 'BORRADOR') {
      throw new Error('Solo se puede solicitar aprobación de requerimientos en BORRADOR');
    }

    req.estado = 'NO_RECIBIDO';
    req.aprobacion.solicitadoEn = new Date().toISOString();
    req.aprobacion.estado = 'PENDIENTE';

    await this.updateReq(id, req);
    
    // Notificar a evaluadores (simulado)
    this.logger.log('SOLICITAR_APROBACION_REQUERIMIENTO', {
      reqId: id,
      usuario: AuthService.getCurrentUser().id
    });

    return req;
  }

  async exportReqToPDF(id) {
    const req = await this.getReq(id);
    
    // Generar PDF con jsPDF
    const pdf = PDFExportService.generarAnexo01A(req);
    
    // Guardar referencia
    req.pdfAnexoUrl = `/pdfs/${id}-anexo-01-a.pdf`;
    await this.updateReq(id, req);

    return pdf;
  }

  _validateRequData(data) {
    if (!data.tipo || !['BIENES', 'SERVICIOS', 'LOCACION'].includes(data.tipo)) {
      throw new Error('Tipo de requerimiento inválido');
    }
    if (!data.areaUsuaria) throw new Error('Área usuaria requerida');
    if (!data.denominacion) throw new Error('Denominación requerida');
    // ... más validaciones
  }

  _generateSequential() {
    const count = (this.storage.get(this.storageKey) || []).length + 1;
    return String(count).padStart(4, '0');
  }
}

export default new RequService();
```

---

## 5. COMPONENTES UI REUTILIZABLES

### 5.1 Matriz de Componentes

| Categoría | Componente | Props | Eventos |
|-----------|-----------|-------|---------|
| **Base** | Button | type, size, disabled, onClick | click |
| | Input | type, placeholder, value, onChange, error | input, change, blur |
| | Select | options, value, onChange, multiple | change |
| | Textarea | rows, cols, value, onChange | input, change |
| | Checkbox | checked, onChange, label | change |
| | Radio | options, value, onChange, name | change |
| | DatePicker | value, onChange, min, max, format | change |
| | TimePicker | value, onChange, format | change |
| **Common** | Header | title, user, onLogout | logout |
| | Navbar | items, activeItem, onSelect | select |
| | Sidebar | items, activeItem, onSelect, collapsed | select |
| | Footer | text, links | - |
| | Toast | message, type, duration, onClose | close |
| | Modal | title, content, buttons, onClose | close, action |
| | Card | title, content, footer, onClick | click |
| | Badge | text, variant, icon | - |
| | Spinner | size, color | - |
| **Data Display** | Table | columns, rows, sorting, pagination, actions | sort, paginate, action |
| | List | items, itemTemplate, onSelect | select |
| | Pagination | page, total, pageSize, onChange | change |
| | SearchFilter | placeholder, onSearch, filters | search, filter |
| | Tabs | tabs, activeTab, onChange | change |
| | Accordion | items, activeItem, onChange | change |
| **Forms** | FormGroup | label, error, required, children | - |
| | Form | onSubmit, onCancel, fields | submit, cancel |
| | FileUpload | accept, maxSize, onUpload | upload |
| | FormValidation | rules, messages, onValidate | validate |

### 5.2 Ejemplo Componente: Input

```javascript
// src/components/base/Input.js

class Input {
  constructor(options = {}) {
    this.type = options.type || 'text';
    this.name = options.name || '';
    this.placeholder = options.placeholder || '';
    this.value = options.value || '';
    this.required = options.required || false;
    this.disabled = options.disabled || false;
    this.error = options.error || null;
    this.onChange = options.onChange || (() => {});
    this.onBlur = options.onBlur || (() => {});
    this.pattern = options.pattern || null;
    this.min = options.min || null;
    this.max = options.max || null;
    this.maxLength = options.maxLength || null;
    this.id = options.id || `input-${Math.random().toString(36).substr(2, 9)}`;
    
    this.element = null;
  }

  render() {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = this.id;
    label.textContent = this.name;
    if (this.required) label.innerHTML += '<span class="required">*</span>';

    const input = document.createElement('input');
    input.id = this.id;
    input.type = this.type;
    input.name = this.name;
    input.className = 'form-control';
    input.placeholder = this.placeholder;
    input.value = this.value;
    input.required = this.required;
    input.disabled = this.disabled;
    
    if (this.pattern) input.pattern = this.pattern;
    if (this.min) input.min = this.min;
    if (this.max) input.max = this.max;
    if (this.maxLength) input.maxLength = this.maxLength;

    if (this.error) {
      wrapper.classList.add('has-error');
    }

    input.addEventListener('change', (e) => {
      this.value = e.target.value;
      this.onChange(this.value);
    });

    input.addEventListener('blur', (e) => {
      this.onBlur(e.target.value);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);

    if (this.error) {
      const errorMsg = document.createElement('small');
      errorMsg.className = 'text-danger';
      errorMsg.textContent = this.error;
      wrapper.appendChild(errorMsg);
    }

    this.element = wrapper;
    return wrapper;
  }

  getValue() {
    return this.value;
  }

  setValue(value) {
    this.value = value;
    if (this.element) {
      this.element.querySelector('input').value = value;
    }
  }

  setError(error) {
    this.error = error;
    if (this.element) {
      const wrapper = this.element;
      if (error) {
        wrapper.classList.add('has-error');
        let errorMsg = wrapper.querySelector('.text-danger');
        if (!errorMsg) {
          errorMsg = document.createElement('small');
          errorMsg.className = 'text-danger';
          wrapper.appendChild(errorMsg);
        }
        errorMsg.textContent = error;
      } else {
        wrapper.classList.remove('has-error');
        const errorMsg = wrapper.querySelector('.text-danger');
        if (errorMsg) errorMsg.remove();
      }
    }
  }
}

export default Input;
```

### 5.3 Ejemplo Componente: Table

```javascript
// src/components/data-display/Table.js

class Table {
  constructor(options = {}) {
    this.columns = options.columns || [];  // { key, label, sortable, format }
    this.rows = options.rows || [];
    this.sortable = options.sortable !== false;
    this.paginated = options.paginated !== false;
    this.pageSize = options.pageSize || 10;
    this.currentPage = 1;
    this.sortBy = null;
    this.sortOrder = 'asc';
    this.onRowClick = options.onRowClick || (() => {});
    this.onSort = options.onSort || (() => {});
    this.rowActions = options.rowActions || [];  // [{ label, action }]
  }

  render(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    // Tabla
    const table = document.createElement('table');
    table.className = 'table table-striped table-hover';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    this.columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      if (col.sortable && this.sortable) {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => this._handleSort(col.key));
      }
      headerRow.appendChild(th);
    });

    if (this.rowActions.length > 0) {
      const th = document.createElement('th');
      th.textContent = 'Acciones';
      headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    const paginatedRows = this._getPaginatedRows();

    paginatedRows.forEach(row => {
      const tr = document.createElement('tr');
      
      this.columns.forEach(col => {
        const td = document.createElement('td');
        const value = row[col.key];
        if (col.format) {
          td.innerHTML = col.format(value, row);
        } else {
          td.textContent = value || '-';
        }
        tr.appendChild(td);
      });

      // Acciones
      if (this.rowActions.length > 0) {
        const td = document.createElement('td');
        this.rowActions.forEach(action => {
          const btn = document.createElement('button');
          btn.className = 'btn btn-sm btn-primary';
          btn.textContent = action.label;
          btn.addEventListener('click', () => action.action(row));
          td.appendChild(btn);
        });
        tr.appendChild(td);
      }

      tr.addEventListener('click', () => this.onRowClick(row));
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    // Paginación
    if (this.paginated) {
      this._renderPagination(container);
    }
  }

  _handleSort(key) {
    if (this.sortBy === key) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = key;
      this.sortOrder = 'asc';
    }
    this.onSort(this.sortBy, this.sortOrder);
    this.currentPage = 1; // Reset página
  }

  _getPaginatedRows() {
    let sorted = [...this.rows];
    
    if (this.sortBy) {
      sorted.sort((a, b) => {
        const aVal = a[this.sortBy];
        const bVal = b[this.sortBy];
        return this.sortOrder === 'asc' ? 
          (aVal > bVal ? 1 : -1) : 
          (aVal < bVal ? 1 : -1);
      });
    }

    if (this.paginated) {
      const start = (this.currentPage - 1) * this.pageSize;
      return sorted.slice(start, start + this.pageSize);
    }

    return sorted;
  }

  _renderPagination(container) {
    const totalPages = Math.ceil(this.rows.length / this.pageSize);
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination justify-content-center mt-3';

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.className = `btn btn-sm ${i === this.currentPage ? 'btn-primary' : 'btn-outline-primary'}`;
      btn.textContent = i;
      btn.addEventListener('click', () => {
        this.currentPage = i;
        // Re-render tabla
      });
      paginationDiv.appendChild(btn);
    }

    container.appendChild(paginationDiv);
  }

  setRows(rows) {
    this.rows = rows;
    this.currentPage = 1;
  }

  addRow(row) {
    this.rows.push(row);
  }

  removeRow(key, value) {
    this.rows = this.rows.filter(r => r[key] !== value);
  }
}

export default Table;
```

---

## 6. ESTRATEGIA DE ESTADOS

### 6.1 Máquinas de Estados por Entidad

#### Requerimiento

```
┌────────┐
│ INICIO │
└───┬────┘
    ↓
┌─────────────┐
│ BORRADOR    │ ← Usuario editing
└─────┬───────┘
      │ solicitarAprobacion()
      ↓
┌─────────────┐
│ NO_RECIBIDO │ ← Esperando evaluación DEC
└─────┬───────┘
      │ (DEC recibe)
      ↓
┌──────────┐
│ RECIBIDO │
└─┬──────┬─┘
  │      │
  │      └─ observar()
  │         ↓
  │      ┌──────────┐
  │      │OBSERVADO │ ← AU subsana
  │      └─┬────────┘
  │        │ solicitarAprobacion()
  │        └────────────┐
  │                     ↓
  └──> ┌─────────┐ <────┘
       │APROBADO │ → Genera CONTRATACION
       └─────────┘
```

#### Contratación

```
┌────────────┐
│ VIGENTE    │ ← Abierta a cotizaciones
└─┬──────┬───┘
  │      └─ abrir_cotizaciones() (post end-date)
  │         ↓
  │      ┌────────────┐
  │      │EN_EVALUACION│ ← DEC evalúa cotizaciones
  │      └─┬──────────┘
  │        │ evaluar_cotizaciones() + generar_cuadro_comparativo()
  │        ↓
  │     ┌──────────┐
  │     │CULMINADO │ ← Genera CONTRATO
  │     └──────────┘
  │
  └──> ┌────────┐
       │ANULADA │
       └────────┘
```

#### Cotización

```
┌─────────────┐
│ REGISTRADA  │ ← Proveedor cotiza
└─────┬───────┘
      │ evaluar()
      ├─────────────────┐
      │                 │
      ↓                 ↓
  ┌──────────┐    ┌─────────────┐
  │ADJUDICADA│    │DESCALIFICADA│
  └──────────┘    └─────────────┘
      │
      ├─ subsanacion_solicitada?
      │  ├─ SI → ┌──────────────┐
      │  │       │EN_SUBSANACION│
      │  │       └──┬───────────┘
      │  │          │ completar_subsanacion()
      │  │          ↓
      │  │       ┌──────────┐
      │  └──────>│CALIFICADA│
      │          └──────────┘
      │
      └──> ┌──────────┐
           │ADJUDICADA│ (Final)
           └──────────┘
```

#### Contrato

```
┌──────────┐
│ BORRADOR │ ← Registrado, sin publicar
└────┬─────┘
     │ publish()
     ↓
┌───────────┐
│ PUBLICADO │
└────┬──────┘
     │ iniciar_ejecucion()
     ↓
┌───────────────┐
│ EN_EJECUCION  │ ← Entregas, pagos, conformidades
└────┬──────┬───┘
     │      │
     │      ├─ registrar_nulidad()  → NULO
     │      │
     │      └─ registrar_resolucion() → RESUELTO
     │
     └──> ┌───────────┐
          │ CULMINADO │ ← Completado exitosamente
          └───────────┘
```

### 6.2 Implementación State Machine

```javascript
// src/utils/state-machine.js

class StateMachine {
  constructor(entity, initialState, transitions) {
    this.entity = entity;
    this.currentState = initialState;
    this.transitions = transitions;  // { FROM_STATE: [ { to: TO_STATE, condition: () => bool } ] }
    this.listeners = [];
  }

  canTransitionTo(targetState) {
    const validTransitions = this.transitions[this.currentState] || [];
    return validTransitions.some(t => t.to === targetState && (!t.condition || t.condition()));
  }

  transitionTo(targetState, data = {}) {
    if (!this.canTransitionTo(targetState)) {
      throw new Error(`Cannot transition from ${this.currentState} to ${targetState}`);
    }

    const oldState = this.currentState;
    this.currentState = targetState;

    // Notify listeners
    this.listeners.forEach(listener => {
      listener(oldState, targetState, data);
    });

    return { from: oldState, to: targetState, timestamp: new Date().toISOString() };
  }

  on(listener) {
    this.listeners.push(listener);
  }

  getCurrentState() {
    return this.currentState;
  }
}

// Uso:
const reqMachine = new StateMachine(
  'REQUERIMIENTO',
  'BORRADOR',
  {
    'BORRADOR': [
      { to: 'NO_RECIBIDO', condition: () => true }
    ],
    'NO_RECIBIDO': [
      { to: 'RECIBIDO', condition: () => true },
      { to: 'OBSERVADO', condition: () => true }
    ],
    'RECIBIDO': [
      { to: 'APROBADO', condition: () => true }
    ],
    'OBSERVADO': [
      { to: 'NO_RECIBIDO', condition: () => true }
    ]
  }
);

reqMachine.on((from, to, data) => {
  Logger.log(`ESTADO_CAMBIO: ${from} → ${to}`, data);
});
```

---

## 7. RUTAS Y NAVEGACIÓN POR ROL

### 7.1 Matriz de Rutas por Rol

| Ruta | Descripción | Admin | Oper. DEC | Oper. AU | Proveedor |
|------|-------------|:-----:|:---------:|:--------:|:---------:|
| `/login` | Login | ✓ | ✓ | ✓ | ✓ |
| `/dashboard` | Dashboard rol | ✓ | ✓ | ✓ | ✓ |
| **Admin** |  |
| `/admin/users` | Gestión usuarios | ✓ | ✗ | ✗ | ✗ |
| `/admin/documentos` | Config documentos | ✓ | ✗ | ✗ | ✗ |
| `/admin/areas` | Gestión áreas | ✓ | ✗ | ✗ | ✗ |
| `/admin/siglas` | Gestión siglas | ✓ | ✗ | ✗ | ✗ |
| `/admin/reportes` | Reportes admin | ✓ | ✗ | ✗ | ✗ |
| **Requerimientos** |  |
| `/requerimientos` | Listado req | ✓ | ✓ | ✓ | ✗ |
| `/requerimientos/new` | Crear req | ✗ | ✗ | ✓ | ✗ |
| `/requerimientos/:id` | Detalle req | ✓ | ✓ | ✓ | ✗ |
| `/requerimientos/:id/edit` | Editar req | ✗ | ✗ | ✓ | ✗ |
| `/requerimientos/:id/evaluacion` | Evaluar req | ✗ | ✓ | ✗ | ✗ |
| **Contrataciones** |  |
| `/contrataciones` | Listado cont | ✓ | ✓ | ✓ | ✗ |
| `/contrataciones/new` | Crear cont | ✗ | ✓ | ✗ | ✗ |
| `/contrataciones/:id` | Detalle cont | ✓ | ✓ | ✓ | ✓ (lectura) |
| `/contrataciones/:id/edit` | Editar cont | ✗ | ✓ | ✗ | ✗ |
| **Invitaciones** |  |
| `/invitaciones` | Listado inv | ✗ | ✓ | ✗ | ✗ |
| `/invitaciones/:id` | Detalle inv | ✗ | ✓ | ✗ | ✗ |
| **Cotizaciones** |  |
| `/cotizaciones` | Listado cotiz | ✓ | ✓ | ✓ | ✓ (propias) |
| `/cotizaciones/new/:contId` | Cotizar | ✗ | ✗ | ✗ | ✓ |
| `/cotizaciones/:id/evaluar` | Evaluar | ✗ | ✓ | ✓ (técnica) | ✗ |
| **Contratos** |  |
| `/contratos` | Listado contratos | ✓ | ✓ | ✓ | ✓ (propios) |
| `/contratos/new/:cotizId` | Crear contrato | ✗ | ✓ | ✗ | ✗ |
| `/contratos/:id` | Detalle contrato | ✓ | ✓ | ✓ | ✓ (propio) |
| `/contratos/:id/ejecucion` | Ejecución | ✗ | ✓ | ✓ | ✗ |
| **Reportes** |  |
| `/reportes/dashboard` | KPI Dashboard | ✓ | ✓ | ✓ | ✗ |
| `/reportes/auditoria` | Audit Log | ✓ | ✗ | ✗ | ✗ |

### 7.2 Configuración de Rutas

```javascript
// src/router/routes.js

const routes = [
  // PUBLIC
  {
    path: '/login',
    component: 'modules/auth/LoginPage',
    public: true,
    title: 'Iniciar Sesión'
  },
  {
    path: '/forgot-password',
    component: 'modules/auth/PasswordResetPage',
    public: true,
    title: 'Recuperar Contraseña'
  },

  // AUTH PROTECTED
  {
    path: '/dashboard',
    component: 'modules/shared/Dashboard',
    requiresAuth: true,
    title: 'Dashboard'
  },

  // ADMIN
  {
    path: '/admin/users',
    component: 'modules/admin/UsersManagement',
    requiresAuth: true,
    requiredRoles: ['ADMIN'],
    title: 'Gestión de Usuarios'
  },
  {
    path: '/admin/documentos',
    component: 'modules/admin/DocumentManagement',
    requiresAuth: true,
    requiredRoles: ['ADMIN'],
    title: 'Configuración de Documentos'
  },
  {
    path: '/admin/areas',
    component: 'modules/maestros/AreasManagement',
    requiresAuth: true,
    requiredRoles: ['ADMIN'],
    title: 'Gestión de Áreas Usuarias'
  },
  {
    path: '/admin/siglas',
    component: 'modules/maestros/SiglasManagement',
    requiresAuth: true,
    requiredRoles: ['ADMIN'],
    title: 'Gestión de Siglas'
  },
  {
    path: '/admin/reportes',
    component: 'modules/reportes/AdminReports',
    requiresAuth: true,
    requiredRoles: ['ADMIN'],
    title: 'Reportes Administrativos'
  },

  // REQUERIMIENTOS
  {
    path: '/requerimientos',
    component: 'modules/requerimientos/RequList',
    requiresAuth: true,
    title: 'Requerimientos'
  },
  {
    path: '/requerimientos/new',
    component: 'modules/requerimientos/RequForm',
    requiresAuth: true,
    requiredRoles: ['OPERADOR_AU'],
    title: 'Crear Requerimiento'
  },
  {
    path: '/requerimientos/:id',
    component: 'modules/requerimientos/RequDetail',
    requiresAuth: true,
    title: 'Detalle Requerimiento'
  },
  {
    path: '/requerimientos/:id/evaluacion',
    component: 'modules/requerimientos/RequEvaluation',
    requiresAuth: true,
    requiredRoles: ['OPERADOR_DEC'],
    title: 'Evaluar Requerimiento'
  },

  // CONTRATACIONES
  {
    path: '/contrataciones',
    component: 'modules/contrataciones/ContList',
    requiresAuth: true,
    title: 'Contrataciones'
  },
  {
    path: '/contrataciones/new',
    component: 'modules/contrataciones/ContForm',
    requiresAuth: true,
    requiredRoles: ['OPERADOR_DEC'],
    title: 'Nueva Contratación'
  },
  {
    path: '/contrataciones/:id',
    component: 'modules/contrataciones/ContDetail',
    requiresAuth: true,
    title: 'Detalle Contratación'
  },

  // COTIZACIONES
  {
    path: '/cotizaciones',
    component: 'modules/cotizaciones/CotizList',
    requiresAuth: true,
    title: 'Cotizaciones'
  },
  {
    path: '/cotizaciones/new/:contId',
    component: 'modules/cotizaciones/CotizForm',
    requiresAuth: true,
    requiredRoles: ['PROVEEDOR'],
    title: 'Nueva Cotización'
  },

  // CONTRATOS
  {
    path: '/contratos',
    component: 'modules/contratos/ContratoList',
    requiresAuth: true,
    title: 'Contratos'
  },
  {
    path: '/contratos/:id/ejecucion',
    component: 'modules/contratos/ContratoEjecucion',
    requiresAuth: true,
    title: 'Ejecución Contractual'
  },

  // 404
  {
    path: '*',
    component: 'modules/shared/NotFound',
    title: 'Página no encontrada'
  }
];

export default routes;
```

### 7.3 Route Guard Implementation

```javascript
// src/router/guards.js

class RouteGuard {
  static canActivate(route, user) {
    // 1. Verificar si requiere autenticación
    if (route.requiresAuth && !user) {
      return { allowed: false, reason: 'NOT_AUTHENTICATED' };
    }

    // 2. Verificar si es pública
    if (route.public) {
      return { allowed: true };
    }

    // 3. Verificar roles requeridos
    if (route.requiredRoles && !route.requiredRoles.includes(user.rol)) {
      return { allowed: false, reason: 'INSUFFICIENT_PERMISSIONS' };
    }

    // 4. Permitir acceso
    return { allowed: true };
  }

  static async beforeNavigate(fromRoute, toRoute) {
    const user = AuthService.getCurrentUser();
    const canActivate = this.canActivate(toRoute, user);

    if (!canActivate.allowed) {
      if (canActivate.reason === 'NOT_AUTHENTICATED') {
        window.location.href = '/login';
      } else if (canActivate.reason === 'INSUFFICIENT_PERMISSIONS') {
        Toast.error('No tiene permisos para acceder a este recurso');
      }
      return false;
    }

    // Log navigation
    Logger.log('NAVIGATE', {
      from: fromRoute?.path,
      to: toRoute.path,
      user: user?.id
    });

    return true;
  }
}

export default RouteGuard;
```

---

## 8. INTEGRACIONES EXTERNAS

### 8.1 jsPDF para Generación de Anexos

```javascript
// src/services/export/PDFExportService.js

class PDFExportService {
  static generarAnexo01A_Bienes(reqData) {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    let y = 20;

    // Header
    pdf.setFontSize(14);
    pdf.text('ANEXO 01-A', margin, y);
    pdf.setFontSize(10);
    y += 10;
    pdf.text(`ESPECIFICACIONES TÉCNICAS - BIENES`, margin, y);
    y += 10;

    // Sección 1: Datos Generales
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'bold');
    pdf.text('1. DATOS GENERALES', margin, y);
    y += 7;

    pdf.setFont(undefined, 'normal');
    const tableData1 = [
      ['Área Usuaria:', reqData.areaUsuaria],
      ['Denominación:', reqData.denominacion],
      ['Objetivo:', reqData.objetivo],
      ['Finalidad:', reqData.finalidad]
    ];

    pdf.autoTable({
      startY: y,
      head: [],
      body: tableData1,
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 100 } }
    });

    y = pdf.lastAutoTable.finalY + 10;

    // Sección 2: SIGAMEF Item
    pdf.setFont(undefined, 'bold');
    pdf.text('2. ITEM SIGAMEF', margin, y);
    y += 7;

    pdf.setFont(undefined, 'normal');
    const tableData2 = [
      ['Código:', reqData.sigamefItem.codigo],
      ['Descripción:', reqData.sigamefItem.descripcion],
      ['Cantidad:', reqData.cantidad],
      ['Unidad de Medida:', reqData.sigamefItem.unidadMedida]
    ];

    pdf.autoTable({
      startY: y,
      head: [],
      body: tableData2,
      margin: { left: margin, right: margin }
    });

    y = pdf.lastAutoTable.finalY + 10;

    // Sección 3: Entregas
    pdf.setFont(undefined, 'bold');
    pdf.text('3. CRONOGRAMA DE ENTREGAS', margin, y);
    y += 7;

    const entregasData = reqData.entregas.map(e => [
      e.numero,
      e.dias,
      e.descripcion,
      e.cantidad
    ]);

    pdf.autoTable({
      startY: y,
      head: ['N°', 'Días', 'Descripción', 'Cantidad'],
      body: entregasData,
      margin: { left: margin, right: margin }
    });

    y = pdf.lastAutoTable.finalY + 10;

    // Sección 4: Garantía y Otras cláusulas
    pdf.setFont(undefined, 'bold');
    pdf.text('4. GARANTÍA Y CLÁUSULAS', margin, y);
    y += 7;

    pdf.setFont(undefined, 'normal');
    const tableData4 = [
      ['Garantía Comercial:', reqData.garantiaComercial],
      ['Responsabilidad Vicios Ocultos:', reqData.viciosOcultos.responsabilidad],
      ['Resolución Incumplimiento:', reqData.viciosOcultos.resolucionIncumplimiento]
    ];

    pdf.autoTable({
      startY: y,
      head: [],
      body: tableData4,
      margin: { left: margin, right: margin }
    });

    y = pdf.lastAutoTable.finalY + 10;

    // Footer
    pdf.setFontSize(8);
    pdf.text(`Generado el: ${new Date().toLocaleString()}`, margin, pageHeight - 10);

    return pdf;
  }

  static generarCuadroComparativo(cotizaciones) {
    const pdf = new jsPDF('l', 'mm', 'a4');  // Landscape
    const margin = 10;
    let y = 20;

    pdf.setFontSize(14);
    pdf.text('CUADRO COMPARATIVO', margin, y);
    y += 10;

    // Preparar datos para tabla
    const tableData = cotizaciones.map(cot => [
      cot.razonSocial,
      `S/. ${cot.montoTotal.toLocaleString()}`,
      cot.evaluacion.estado,
      cot.evaluacion.tecnica?.estado || 'N/A'
    ]);

    pdf.autoTable({
      startY: y,
      head: [['Proveedor', 'Monto', 'Estado Evaluación', 'Evaluación Técnica']],
      body: tableData,
      margin: { left: margin, right: margin }
    });

    return pdf;
  }
}

export default PDFExportService;
```

### 8.2 SheetJS para Exportación a Excel

```javascript
// src/services/export/ExcelExportService.js

class ExcelExportService {
  static exportarListadoRequerimientos(reqs, nombreArchivo = 'Requerimientos') {
    const datos = reqs.map(req => ({
      'ID': req.id,
      'Tipo': req.tipo,
      'Área Usuaria': req.areaUsuaria,
      'Denominación': req.denominacion,
      'Estado': req.estado,
      'Creado': req.createdAt,
      'Actualizado': req.updatedAt
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(datos);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Requerimientos');
    XLSX.writeFile(workbook, `${nombreArchivo}.xlsx`);
  }

  static exportarListadoContrataciones(conts) {
    const datos = conts.map(cont => ({
      'N° Contratación': cont.numeroContratacion,
      'Objeto': cont.descripcionObjeto,
      'Área': cont.areaUsuaria,
      'Tipo Invitación': cont.tipoInvitacion,
      'Tipo Evaluación': cont.tipoEvaluacion,
      'Estado': cont.estado,
      'Presupuesto': cont.presupuestoAsignado,
      'Creado': cont.createdAt
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(datos);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contrataciones');
    XLSX.writeFile(workbook, `Contrataciones_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  static exportarReporte(titulo, datos, nombreArchivo) {
    const workbook = XLSX.utils.book_new();
    
    // Hoja 1: Datos
    const worksheet = XLSX.utils.json_to_sheet(datos);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');

    // Aplicar estilos básicos
    const colWidths = Object.keys(datos[0] || {}).map(() => ({ wch: 20 }));
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, `${nombreArchivo}_${new Date().toISOString().split('T')[0]}.xlsx`);
  }
}

export default ExcelExportService;
```

### 8.3 Chart.js para Gráficos KPI

```javascript
// src/services/export/ChartService.js

class ChartService {
  static crearGraficoRequerimientosEstado(datos) {
    const ctx = document.getElementById('chartRequerimientosEstado').getContext('2d');
    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Borrador', 'Recibido', 'Observado', 'Aprobado'],
        datasets: [{
          data: datos,
          backgroundColor: [
            '#FFC107',
            '#17A2B8',
            '#FD7E14',
            '#28A745'
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom'
          },
          title: {
            display: true,
            text: 'Requerimientos por Estado'
          }
        }
      }
    });
  }

  static crearGraficoTiempoEjecucion(datos) {
    const ctx = document.getElementById('chartTiempoEjecucion').getContext('2d');
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: datos.map(d => d.mes),
        datasets: [{
          label: 'Días Promedio',
          data: datos.map(d => d.dias),
          backgroundColor: '#007BFF'
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }
}

export default ChartService;
```

### 8.4 Integraciones Simuladas (SIGAMEF, SUNAT, Email)

```javascript
// src/services/external/SIGAMEFService.js

class SIGAMEFService {
  // Mock data de SIGAMEF items
  static mockData = [
    {
      codigo: '3310-4010-0000',
      descripcion: 'Computadora de escritorio',
      unidadMedida: 'UNIDAD',
      categoria: 'EQUIPOS INFORMÁTICOS',
      caracteristicas: 'Procesador i7, 16GB RAM, 512GB SSD'
    },
    {
      codigo: '3310-4020-0000',
      descripcion: 'Monitor LED 24"',
      unidadMedida: 'UNIDAD',
      categoria: 'ACCESORIOS INFORMÁTICOS',
      caracteristicas: 'Full HD 1920x1080, Panel IPS'
    }
    // ... más items
  ];

  static searchItems(query) {
    // Buscar por código o descripción
    return this.mockData.filter(item =>
      item.codigo.includes(query) || 
      item.descripcion.toLowerCase().includes(query.toLowerCase())
    );
  }

  static getItemByCode(codigo) {
    return this.mockData.find(item => item.codigo === codigo);
  }

  static async getItemDetails(codigo) {
    // Simular delay de API
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(this.getItemByCode(codigo));
      }, 500);
    });
  }
}

export default SIGAMEFService;

// src/services/external/SUNATService.js

class SUNATService {
  static async validarRUC(ruc) {
    // Validar formato: 11 dígitos
    if (!/^\d{11}$/.test(ruc)) {
      return { valido: false, razon: 'Formato inválido' };
    }

    // Simular búsqueda en RNP
    await this.sleep(1000);

    // Mock data
    const proveedores = {
      '20123456789': {
        razonSocial: 'Empresa A S.A.',
        tipo: 'PERSONA_JURIDICA',
        estado: 'ACTIVO'
      },
      '20987654321': {
        razonSocial: 'Empresa B S.A.C.',
        tipo: 'PERSONA_JURIDICA',
        estado: 'ACTIVO'
      }
    };

    return {
      valido: true,
      ...proveedores[ruc]
    };
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default SUNATService;

// src/services/external/EmailService.js

class EmailService {
  static async enviarInvitacion(emailProveedor, datos) {
    // Simular envío de email
    console.log(`[EMAIL SIMULADO] Invitación enviada a ${emailProveedor}`);
    console.log('Datos:', datos);

    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          exitoso: true,
          messageId: `MSG-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString()
        });
      }, 500);
    });
  }

  static async enviarNotificacion(usuario, mensaje) {
    console.log(`[NOTIFICACION] Para ${usuario.email}: ${mensaje}`);
    return { exitoso: true };
  }
}

export default EmailService;
```

---

## 9. PERSISTENCIA Y DATOS

### 9.1 Estrategia localStorage

```javascript
// src/services/storage/StorageService.js

class StorageService {
  static set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      Logger.error('StorageService.set', error);
      if (error.name === 'QuotaExceededError') {
        Toast.error('Espacio de almacenamiento agotado');
      }
      return false;
    }
  }

  static get(key) {
    try {
      const serialized = localStorage.getItem(key);
      return serialized ? JSON.parse(serialized) : null;
    } catch (error) {
      Logger.error('StorageService.get', error);
      return null;
    }
  }

  static remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      Logger.error('StorageService.remove', error);
      return false;
    }
  }

  static clear() {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      Logger.error('StorageService.clear', error);
      return false;
    }
  }

  static getAllKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      keys.push(localStorage.key(i));
    }
    return keys;
  }

  static getStorageStats() {
    let totalSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length + key.length;
      }
    }
    const maxSize = 5 * 1024 * 1024;  // 5MB típico
    const percentageUsed = (totalSize / maxSize) * 100;

    return {
      usedBytes: totalSize,
      maxBytes: maxSize,
      percentageUsed: percentageUsed.toFixed(2)
    };
  }

  // Export/Backup
  static exportAllData() {
    const data = {};
    this.getAllKeys().forEach(key => {
      data[key] = this.get(key);
    });
    return data;
  }

  // Import/Restore
  static importData(data) {
    try {
      Object.keys(data).forEach(key => {
        this.set(key, data[key]);
      });
      return true;
    } catch (error) {
      Logger.error('StorageService.importData', error);
      return false;
    }
  }
}

export default StorageService;
```

### 9.2 Manejo de Conflictos

```javascript
// src/services/storage/SyncService.js

class SyncService {
  // Resolver conflictos cuando hay cambios simultáneos
  static resolveConflict(localVersion, remoteVersion) {
    // Estrategia: Last-Write-Wins (timestamp más reciente)
    if (new Date(localVersion.updatedAt) > new Date(remoteVersion.updatedAt)) {
      return localVersion;
    } else {
      return remoteVersion;
    }
  }

  // Validar integridad de datos después de carga
  static validateData(data, schema) {
    for (let key of Object.keys(schema)) {
      if (!(key in data)) {
        throw new Error(`Campo requerido faltante: ${key}`);
      }
      if (typeof data[key] !== schema[key]) {
        throw new Error(`Tipo de dato incorrecto en ${key}`);
      }
    }
    return true;
  }

  // Backup automático
  static createBackup() {
    const backup = {
      timestamp: new Date().toISOString(),
      data: StorageService.exportAllData()
    };
    const key = `backup_${backup.timestamp}`;
    StorageService.set(key, backup);
    return key;
  }

  // Restaurar desde backup
  static restoreBackup(backupKey) {
    const backup = StorageService.get(backupKey);
    if (!backup) throw new Error('Backup no encontrado');
    StorageService.importData(backup.data);
    Logger.log('BACKUP_RESTORED', { backupKey });
  }
}

export default SyncService;
```

---

## 10. CONSIDERACIONES TÉCNICAS

### 10.1 Naming Conventions

```javascript
// Archivos y directorios
src/
  components/
    base/               // PascalCase
    UserAvatar.js       // PascalCase.js
  services/
    auth/
      AuthService.js    // PascalCase + Service suffix
  utils/
    validators.js       // camelCase
    formatters.js
    constants.js        // UPPER_SNAKE_CASE para constantes
    helpers.js

// Variables y constantes
const MAX_FILE_SIZE = 5242880;  // 5MB - CONSTANT
const defaultPageSize = 10;     // Config - camelCase
let currentUser = null;         // Variable - camelCase

// Funciones
function validateEmail(email) { }  // verb + Noun
const formatCurrency = (amount) => { };

// CSS Classes
.btn-primary              // Component
.btn-primary--disabled    // Variant (BEM)
.btn-primary__icon        // Element
.is-active                // State
.has-error                // State

// IDs
id="form-login"           // container-item
id="input-email"
id="btn-submit"

// Data attributes
data-id="REQ-2026-001"
data-type="BIENES"
data-state="APROBADO"
```

### 10.2 Testing Strategy

```javascript
// src/tests/unit/services/__tests__/RequService.test.js

describe('RequService', () => {
  beforeEach(() => {
    StorageService.clear();
  });

  describe('createReq', () => {
    it('debe crear un requerimiento válido', async () => {
      const reqData = {
        tipo: 'BIENES',
        areaUsuaria: 'AREA-001',
        denominacion: 'Computadora',
        objetivo: 'Equipamiento TI',
        finalidad: 'Soporte técnico'
      };

      const req = await RequService.createReq(reqData);
      
      expect(req.id).toBeDefined();
      expect(req.estado).toBe('BORRADOR');
      expect(req.tipo).toBe('BIENES');
    });

    it('debe lanzar error con datos inválidos', async () => {
      const invalidData = {
        tipo: 'INVALID'
      };

      expect(() => RequService.createReq(invalidData)).toThrow();
    });
  });

  describe('getAllReqs', () => {
    it('debe retornar lista filtrada por estado', async () => {
      // Setup
      await RequService.createReq({ ... });
      await RequService.createReq({ ... });

      // Execute
      const reqs = await RequService.getAllReqs({ estado: 'BORRADOR' });

      // Assert
      expect(reqs.length).toBe(2);
    });
  });
});

// src/tests/integration/__tests__/workflows.test.js

describe('Workflow: Requerimiento → Contratación', () => {
  it('debe transicionar correctamente desde BORRADOR a APROBADO', async () => {
    // 1. Crear requerimiento
    const req = await RequService.createReq({ ... });
    expect(req.estado).toBe('BORRADOR');

    // 2. Solicitar aprobación
    await RequService.solicitarAprobacion(req.id);
    let updated = await RequService.getReq(req.id);
    expect(updated.estado).toBe('NO_RECIBIDO');

    // 3. Evaluar y aprobar (DEC)
    await RequService.aprobarReq(req.id, {});
    updated = await RequService.getReq(req.id);
    expect(updated.estado).toBe('APROBADO');

    // 4. Verificar que se generó contratación
    const conts = await ContService.getAllCont({ origen: 'CON_REQUERIMIENTO' });
    expect(conts.length).toBeGreaterThan(0);
  });
});
```

### 10.3 Performance Optimization

```javascript
// Lazy loading de componentes
const RequList = () => import('./modules/requerimientos/RequList');
const ContDetail = () => import('./modules/contrataciones/ContDetail');

// Memoización de funciones costosas
const memoize = (fn) => {
  const cache = {};
  return (...args) => {
    const key = JSON.stringify(args);
    if (key in cache) return cache[key];
    const result = fn(...args);
    cache[key] = result;
    return result;
  };
};

// Caché de resultados
class Cache {
  constructor(ttl = 300000) {  // 5 minutos
    this.store = {};
    this.ttl = ttl;
  }

  set(key, value) {
    this.store[key] = {
      value,
      expires: Date.now() + this.ttl
    };
  }

  get(key) {
    if (!(key in this.store)) return null;
    if (Date.now() > this.store[key].expires) {
      delete this.store[key];
      return null;
    }
    return this.store[key].value;
  }
}

// Debounce para búsquedas
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// Batch processing para operaciones masivas
const batchProcess = (items, batchSize, processor) => {
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return Promise.all(batches.map(batch => processor(batch)));
};
```

### 10.4 Accessibility (WCAG 2.1 AA)

```javascript
// Input con ARIA labels
<input
  id="input-dni"
  aria-label="Número de DNI"
  aria-required="true"
  aria-describedby="dni-help"
  type="text"
  maxlength="8"
  placeholder="DNI"
/>
<small id="dni-help">Ingrese 8 dígitos</small>

// Botones con accessible text
<button aria-label="Descargar PDF" class="btn btn-icon">
  <i class="icon-download"></i>
</button>

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') handleModalClose();
  if (e.key === 'Enter' && isFormValid()) handleSubmit();
  if (e.key === 'Tab') handleTabNavigation(e);
});

// Focus management
const focusFirstElement = (container) => {
  const focusable = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length > 0) focusable[0].focus();
};

// Color contrast validation
const checkContrast = (foreground, background) => {
  // WCAG 2.1 AA: 4.5:1 para texto normal, 3:1 para texto grande
  const lum1 = calculateLuminance(foreground);
  const lum2 = calculateLuminance(background);
  const contrast = (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
  return contrast >= 4.5;  // AA compliant
};
```

### 10.5 Error Handling

```javascript
// src/utils/error-handler.js

class ErrorHandler {
  static async handle(error, context = {}) {
    // Log del error
    Logger.error(context.action || 'UNKNOWN_ACTION', {
      message: error.message,
      stack: error.stack,
      context
    });

    // Clasificar tipo de error
    let userMessage = 'Error desconocido';
    let errorCode = 'UNKNOWN_ERROR';

    if (error.message.includes('no encontrado')) {
      userMessage = 'El registro no existe';
      errorCode = 'NOT_FOUND';
    } else if (error.message.includes('permiso')) {
      userMessage = 'No tiene permiso para realizar esta acción';
      errorCode = 'PERMISSION_DENIED';
    } else if (error.message.includes('validación')) {
      userMessage = error.message;
      errorCode = 'VALIDATION_ERROR';
    } else if (error.message.includes('cuota')) {
      userMessage = 'Espacio de almacenamiento agotado';
      errorCode = 'QUOTA_EXCEEDED';
    }

    // Mostrar al usuario
    Toast.error(userMessage);

    // Retornar para procesamiento
    return { errorCode, userMessage, originalError: error };
  }

  static createErrorBoundary() {
    window.addEventListener('error', (event) => {
      this.handle(event.error, { type: 'uncaught' });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.handle(event.reason, { type: 'unhandled_promise' });
    });
  }
}

export default ErrorHandler;
```

### 10.6 Logging Centralizado

```javascript
// src/utils/logger.js

class Logger {
  static LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
  };

  static currentLevel = this.LOG_LEVELS.INFO;

  static log(action, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      data,
      userId: AuthService.getCurrentUser()?.id,
      level: 'INFO'
    };

    console.log(`[${entry.action}]`, data);
    this.storeInAuditLog(entry);
  }

  static error(action, error) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      error: {
        message: error.message,
        stack: error.stack
      },
      userId: AuthService.getCurrentUser()?.id,
      level: 'ERROR'
    };

    console.error(`[${entry.action}]`, error);
    this.storeInAuditLog(entry);
  }

  static warn(action, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      data,
      level: 'WARN'
    };
    console.warn(`[${entry.action}]`, data);
  }

  static storeInAuditLog(entry) {
    const logs = StorageService.get('audit_logs') || [];
    logs.push(entry);
    
    // Limitar a últimos 10000 registros
    if (logs.length > 10000) {
      logs.shift();
    }

    StorageService.set('audit_logs', logs);
  }

  static getAuditLog(filters = {}) {
    let logs = StorageService.get('audit_logs') || [];

    if (filters.userId) {
      logs = logs.filter(l => l.userId === filters.userId);
    }
    if (filters.action) {
      logs = logs.filter(l => l.action.includes(filters.action));
    }
    if (filters.startDate) {
      logs = logs.filter(l => new Date(l.timestamp) >= new Date(filters.startDate));
    }

    return logs;
  }
}

export default Logger;
```

---

## RESUMEN EJECUTIVO

### Fases de Implementación (20 semanas aprox.)

```
Semana 1-2:   Fase 1  - Fundación & Infraestructura
Semana 3:     Fase 2  - Autenticación & Acceso
Semana 4-5:   Fase 3  - Maestros & Configuración
Semana 6-8:   Fases 4-5 - Requerimientos & Evaluación (AU)
Semana 9-11:  Fases 6-8 - Difusión, Invitaciones, Consultas (DEC)
Semana 12-14: Fases 9-11 - Cotizaciones, CCP, Cuadro (DEC)
Semana 15-16: Fases 12-14 - Contratos & Ejecución
Semana 17:    Fase 15-16 - Documentos & Mantenimiento
Semana 18:    Fase 17 - Reportes & KPIs
Semana 19:    Fase 18 - Accesibilidad & QA
Semana 20:    Fases 19-20 - Testing, Documentación, Deployment
```

### Entregables Clave

✅ SPA funcional sin backend real  
✅ 64 tareas completadas  
✅ localStorage persistencia  
✅ Flujo completo: Requerimiento → Contratación → Contrato  
✅ PDF Anexos + Excel reportes  
✅ 4 roles con rutas protegidas  
✅ WCAG 2.1 AA accesibilidad  
✅ Pruebas unitarias + integración  
✅ Documentación completa  
✅ Listo para producción  

---

**Este plan es práctico, detallado y listo para pasar a implementación inmediata.**

---

*Fin del IMPLEMENTATION_PLAN.md*
