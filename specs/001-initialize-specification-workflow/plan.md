# Plan de Implementación - Sistema de Gestión de Contrataciones (SGC)

**Versión**: 1.0  
**Fecha**: 2026-05-13  
**Estado**: Ready for Implementation  
**Estimación**: 860-1,090 horas (1-2 FTE, 25 semanas)

---

## 📋 TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Estructura de Carpetas](#estructura-de-carpetas)
4. [Modelos de Datos](#modelos-de-datos)
5. [API/Service Layer](#apiservice-layer)
6. [Componentes UI Reutilizables](#componentes-ui-reutilizables)
7. [Estrategia de Estados](#estrategia-de-estados)
8. [Rutas y Navegación por Rol](#rutas-y-navegación-por-rol)
9. [Integraciones Externas](#integraciones-externas)
10. [Persistencia de Datos](#persistencia-de-datos)
11. [Consideraciones Técnicas](#consideraciones-técnicas)
12. [Quick Start Guide](#quick-start-guide)

---

## Resumen Ejecutivo

### Visión General
Sistema web SPA (Single Page Application) para gestionar contrataciones públicas según Ley N° 32069, implementado con:
- **Frontend**: HTML5 + Bootstrap 5 + Vanilla JavaScript
- **Persistencia**: localStorage (prototype sin backend)
- **Base de Datos**: Esquemas JSON en memoria + localStorage
- **Librerías Externas**: jsPDF (PDFs), SheetJS (Excel), Chart.js (KPIs)

### Flujo Completo (11 Pasos)
```
1. Autenticación (DNI + contraseña)
   ↓
2. AU: Registra Requerimiento (Bienes/Servicios/Locación)
   ↓
3. AU: Solicita aprobación al Coordinador/Director
   ↓
4. AU: Recibe observaciones o aprobación
   ↓
5. DEC: Recibe Requerimiento Aprobado
   ↓
6. DEC: Crea Contratación + invita proveedores (Abierta/Cerrada)
   ↓
7. Proveedores: Reciben consultas, cotizar
   ↓
8. DEC: Abre y evalúa cotizaciones (por paquete o por ítem)
   ↓
9. DEC: Registra CCP, firma Cuadro Comparativo
   ↓
10. Contratos: Registra contrato, CCP y ejecución
   ↓
11. Ejecución: Conformidad, penalidades, ampliación, nulidad, resolución
```

### Números Clave
- **64 Tasks** en 20 Fases
- **16 Semanas de Desarrollo** (Fases 1-16)
- **11 Modelos de Datos**
- **27 Componentes UI**
- **50+ Rutas Protegidas**
- **4 Roles**: Admin, Operador DEC, Operador AU, Proveedor
- **WCAG 2.1 AA** desde el inicio
- **<3 segundos** tiempo respuesta

### Timeline
```
Semana 1-2    → Phase 1-2: Foundation + Authentication
Semana 3-4    → Phase 3: Masters & Configuration
Semana 5-8    → Phase 4-5: Requerimientos + Evaluación (AU workflow)
Semana 9-12   → Phase 6-8: Difusión + Invitaciones + Consultas (DEC setup)
Semana 13-16  → Phase 9-11: Cotizaciones + CCP + Cuadro Comparativo
Semana 17-20  → Phase 12-14: Contratos + Ejecución
Semana 21-22  → Phase 15-16: Configuration + Maintenance
Semana 23-25  → Phase 18-20: Reporting, QA, Deployment
```

---

## Arquitectura del Sistema

### Capas Arquitectónicas

```
┌─────────────────────────────────────┐
│   PRESENTATION LAYER                │
│   (Bootstrap 5 Components)          │
│   UI Components, Forms, Tables      │
├─────────────────────────────────────┤
│   APPLICATION LAYER                 │
│   (Vanilla JavaScript)              │
│   Page Controllers, Routers, State  │
├─────────────────────────────────────┤
│   BUSINESS LOGIC LAYER              │
│   (Services & Utilities)            │
│   Validations, Processing, Exports  │
├─────────────────────────────────────┤
│   DATA ACCESS LAYER                 │
│   (Storage Services)                │
│   localStorage CRUD, Search, Filter │
├─────────────────────────────────────┤
│   DATA LAYER                        │
│   (localStorage)                    │
│   JSON Objects, Collections         │
└─────────────────────────────────────┘
```

### Componentes Principales

**1. Authentication Module**
- Login form with DNI + password
- Session management
- Role-based access control (RBAC)
- Logout

**2. Requerimientos Module (AU)**
- CRUD for Bienes, Servicios, Locación types
- Multi-delivery table management
- PDF generation (Anexo 01-A)
- Approval workflow

**3. Evaluación Module (AU)**
- Requirement evaluation by section
- Status bandejas (No recibido, Recibido, Observado, Aprobado)
- Feedback capture
- Subsanación workflow

**4. Contratación Module (DEC)**
- Contratación creation (with/without requerimiento)
- Cronograma management
- Provider invitation (open/closed)
- Item table with CUBSO, quantity, UM, currency

**5. Cotizaciones Module (DEC)**
- Quotation opening/evaluation
- Per-package vs per-item evaluation
- Technical evaluation requests
- Subsanación handling
- Electronic draw for ties

**6. CCP & Presupuesto Module**
- CCP registration (multiple)
- Budget tracking
- Publication workflow

**7. Cuadro Comparativo & Firma**
- Comparative table generation
- PDF creation
- Digital signature (simulated)
- Manual signature workflow

**8. Contratos & Ejecución Module**
- Contract registration
- Nulidad (Total/Partial)
- Resolución
- Conformidad, Penalidad, Ampliación
- Audit trail

**9. Dashboard & Reporting**
- KPI visualization (Chart.js)
- List exports (SheetJS)
- Audit logs
- Performance metrics

### Technology Stack

| Capa | Tecnología | Versión | Propósito |
|------|-----------|---------|----------|
| **Frontend** | HTML5 | Latest | Structure |
| **Styling** | Bootstrap | 5.3+ | Responsive UI |
| **Scripting** | JavaScript (Vanilla/ES6+) | ES2020+ | Logic |
| **UI Framework** | None (vanilla) | - | Lightweight |
| **PDF Generation** | jsPDF | 2.5+ | Annexes, Cuadro |
| **Excel Export** | SheetJS | 0.18+ | Data export |
| **Charts** | Chart.js | 3.9+ | KPIs, Analytics |
| **Date Handling** | Flatpickr | 4.6+ | Date pickers |
| **Persistence** | localStorage API | Browser native | Data storage |
| **Build Tool** | Webpack/Vite | 5+/4+ | Module bundling |
| **Package Manager** | npm | 8+ | Dependencies |

---

## Estructura de Carpetas

```
sgc/
├── public/
│   ├── index.html                    # Main entry point
│   ├── favicon.ico
│   └── manifest.json                 # PWA metadata
├── src/
│   ├── index.js                      # App bootstrap
│   ├── app.js                        # Main app controller
│   ├── router.js                     # Route definitions + guards
│   ├── config.js                     # Global configuration
│   ├── constants.js                  # Enums, constants
│   │
│   ├── components/
│   │   ├── base/
│   │   │   ├── FormControl.js        # Input, Select, Textarea, DatePicker
│   │   │   ├── Button.js
│   │   │   ├── Card.js
│   │   │   ├── Badge.js
│   │   │   └── Button.js
│   │   │
│   │   ├── common/
│   │   │   ├── Header.js             # Navigation, user info
│   │   │   ├── Sidebar.js            # Role-based menu
│   │   │   ├── Footer.js
│   │   │   ├── Toast.js              # Notifications
│   │   │   ├── Modal.js              # Dialog system
│   │   │   ├── Loading.js            # Spinner
│   │   │   └── ConfirmDialog.js
│   │   │
│   │   ├── data-display/
│   │   │   ├── Table.js              # Sorting, filtering, pagination
│   │   │   ├── DetailView.js
│   │   │   ├── List.js
│   │   │   ├── Pagination.js
│   │   │   └── SearchFilter.js
│   │   │
│   │   ├── forms/
│   │   │   ├── FormBuilder.js
│   │   │   ├── ValidationHelper.js
│   │   │   ├── DeliveryTable.js      # Multi-delivery editor
│   │   │   └── ItemsTable.js         # Line items editor
│   │   │
│   │   └── layout/
│   │       ├── PageLayout.js
│   │       ├── FormLayout.js
│   │       └── DashboardLayout.js
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── pages/
│   │   │   │   ├── LoginPage.js
│   │   │   │   ├── ForgotPasswordPage.js
│   │   │   │   └── ResetPasswordPage.js
│   │   │   ├── services/
│   │   │   │   ├── AuthService.js
│   │   │   │   └── SessionService.js
│   │   │   └── guards/
│   │   │       └── AuthGuard.js
│   │   │
│   │   ├── requerimientos/
│   │   │   ├── pages/
│   │   │   │   ├── RequerimientoListPage.js
│   │   │   │   ├── RequerimientoBienesPage.js
│   │   │   │   ├── RequerimientoServiciosPage.js
│   │   │   │   ├── RequerimientoLocacionPage.js
│   │   │   │   ├── RequerimientoDetailPage.js
│   │   │   │   └── RequerimientoApprovalPage.js
│   │   │   ├── services/
│   │   │   │   ├── RequerimientoService.js
│   │   │   │   ├── PDFService.js (Anexo generation)
│   │   │   │   └── ApprovalService.js
│   │   │   ├── templates/
│   │   │   │   ├── BienesTemplate.js
│   │   │   │   ├── ServiciosTemplate.js
│   │   │   │   └── LocacionTemplate.js
│   │   │   └── validators/
│   │   │       └── RequerimientoValidator.js
│   │   │
│   │   ├── evaluacion/
│   │   │   ├── pages/
│   │   │   │   ├── EvaluacionListPage.js
│   │   │   │   ├── EvaluacionDetailPage.js
│   │   │   │   └── SubsanacionPage.js
│   │   │   ├── services/
│   │   │   │   └── EvaluacionService.js
│   │   │   └── components/
│   │   │       ├── SectionEvaluator.js
│   │   │       └── FeedbackForm.js
│   │   │
│   │   ├── contrataciones/
│   │   │   ├── pages/
│   │   │   │   ├── ContratacionListPage.js
│   │   │   │   ├── ContratacionNewPage.js
│   │   │   │   ├── ContratacionDetailPage.js
│   │   │   │   └── ContratacionEvaluationPage.js
│   │   │   ├── services/
│   │   │   │   ├── ContratacionService.js
│   │   │   │   ├── CronogramaService.js
│   │   │   │   └── InvitacionService.js
│   │   │   └── components/
│   │   │       ├── CronogramaEditor.js
│   │   │       └── ItemsEditor.js
│   │   │
│   │   ├── cotizaciones/
│   │   │   ├── pages/
│   │   │   │   ├── CotizacionListPage.js
│   │   │   │   ├── CotizacionAperturaPage.js
│   │   │   │   ├── CotizacionEvaluacionPage.js
│   │   │   │   └── SorteoPage.js
│   │   │   ├── services/
│   │   │   │   ├── CotizacionService.js
│   │   │   │   └── SorteoService.js
│   │   │   └── components/
│   │   │       └── CotizacionTable.js
│   │   │
│   │   ├── ccp/
│   │   │   ├── pages/
│   │   │   │   └── CCPRegistrationPage.js
│   │   │   ├── services/
│   │   │   │   └── CCPService.js
│   │   │   └── components/
│   │   │       └── CCPForm.js
│   │   │
│   │   ├── cuadro-comparativo/
│   │   │   ├── pages/
│   │   │   │   └── CuadroComparativoPage.js
│   │   │   ├── services/
│   │   │   │   ├── CuadroService.js
│   │   │   │   ├── FirmaService.js (Signature)
│   │   │   │   └── PDFExportService.js
│   │   │   └── components/
│   │   │       ├── CuadroTable.js
│   │   │       ├── FirmaDigitalModal.js
│   │   │       └── FirmaManualModal.js
│   │   │
│   │   ├── contratos/
│   │   │   ├── pages/
│   │   │   │   ├── ContratoListPage.js
│   │   │   │   ├── ContratoNewPage.js
│   │   │   │   ├── ContratoDetailPage.js
│   │   │   │   ├── NulidadPage.js
│   │   │   │   ├── ResolucionPage.js
│   │   │   │   ├── ConformidadPage.js
│   │   │   │   ├── PenalidadPage.js
│   │   │   │   └── AmplacionPage.js
│   │   │   ├── services/
│   │   │   │   └── ContratoService.js
│   │   │   └── components/
│   │   │       └── ContratoForm.js
│   │   │
│   │   ├── dashboard/
│   │   │   ├── pages/
│   │   │   │   ├── DashboardPage.js
│   │   │   │   ├── ReportsPage.js
│   │   │   │   └── AuditLogPage.js
│   │   │   ├── services/
│   │   │   │   ├── KPIService.js
│   │   │   │   ├── ReportService.js
│   │   │   │   └── AnalyticsService.js
│   │   │   └── components/
│   │   │       ├── KPICard.js
│   │   │       ├── Chart.js (Chart.js integration)
│   │   │       └── MetricsPanel.js
│   │   │
│   │   ├── mantenimiento/
│   │   │   ├── pages/
│   │   │   │   ├── AreasUsuariasPage.js
│   │   │   │   ├── SiglasPage.js
│   │   │   │   ├── SIGAMEFPage.js
│   │   │   │   ├── FichasTecnicasPage.js
│   │   │   │   ├── UsuariosPage.js
│   │   │   │   ├── ProveedoresPage.js
│   │   │   │   ├── CentrosCostoPage.js
│   │   │   │   ├── DocumentosPage.js
│   │   │   │   └── ConfiguracionPage.js
│   │   │   ├── services/
│   │   │   │   ├── MasterDataService.js
│   │   │   │   └── ConfigService.js
│   │   │   └── forms/
│   │   │       ├── AreaForm.js
│   │   │       ├── SiglaForm.js
│   │   │       └── DocumentoForm.js
│   │   │
│   │   └── consultas/
│   │       ├── pages/
│   │       │   ├── ConsultasListPage.js
│   │       │   └── ConsultaDetailPage.js
│   │       ├── services/
│   │       │   └── ConsultaService.js
│   │       └── components/
│   │           └── ConsultaForm.js
│   │
│   ├── services/
│   │   ├── storage/
│   │   │   ├── StorageService.js    # localStorage wrapper
│   │   │   ├── DataMigration.js     # Version control
│   │   │   └── BackupRestore.js     # Backup utilities
│   │   │
│   │   ├── api/
│   │   │   ├── ApiClient.js         # API adapter (localStorage-based)
│   │   │   ├── SearchService.js     # Global search
│   │   │   └── FilterService.js     # Global filtering
│   │   │
│   │   ├── export/
│   │   │   ├── ExcelExporter.js     # SheetJS wrapper
│   │   │   ├── PDFExporter.js       # jsPDF wrapper
│   │   │   └── CSVExporter.js
│   │   │
│   │   ├── integration/
│   │   │   ├── SIGAMEFClient.js     # Mock SIGAMEF API
│   │   │   ├── SUNATClient.js       # Mock SUNAT RUC lookup
│   │   │   ├── SIAFClient.js        # Mock SIAF connection
│   │   │   └── CUIClient.js         # Mock CUI lookup
│   │   │
│   │   └── utils/
│   │       ├── DateUtils.js
│   │       ├── ValidationUtils.js
│   │       ├── StringUtils.js
│   │       ├── CurrencyUtils.js
│   │       └── NumberUtils.js
│   │
│   ├── utils/
│   │   ├── logger.js                # Audit logging
│   │   ├── notificationManager.js
│   │   ├── errorHandler.js
│   │   ├── stateManager.js          # Global state
│   │   └── helpers.js               # Common helpers
│   │
│   ├── styles/
│   │   ├── main.css                 # Main stylesheet
│   │   ├── variables.css            # CSS custom properties
│   │   ├── utilities.css            # Helper classes
│   │   ├── components.css
│   │   ├── responsive.css           # Media queries
│   │   ├── accessibility.css        # WCAG AA
│   │   └── animations.css
│   │
│   └── assets/
│       ├── images/
│       ├── icons/
│       ├── fonts/
│       ├── templates/               # PDF templates
│       └── mock-data/               # Demo data
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── COMPONENTS.md
│   ├── DATA_MODELS.md
│   └── USER_GUIDE.md
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── deploy.yml
│   └── copilot-instructions.md
│
├── package.json
├── webpack.config.js
├── .env.example
├── .gitignore
├── README.md
└── DEPLOYMENT.md
```

---

## Modelos de Datos

### 1. Usuario (User)

```json
{
  "id": "USR001",
  "dni": "12345678",
  "nombres": "Juan",
  "apellidos": "Pérez López",
  "email": "juan.perez@entity.pe",
  "telefono": "+51987654321",
  "rol": "OPERADOR_AU",
  "estado": "ACTIVO",
  "areaUsuaria": "AREAID001",
  "centroCosto": "CC001",
  "permisosEspeciales": ["APPROVE_REQUERIMIENTOS"],
  "fechaCreacion": "2026-05-01T10:00:00Z",
  "ultimoAcceso": "2026-05-13T14:30:00Z",
  "intentosFallidos": 0
}
```

**Roles válidos**: `ADMIN`, `OPERADOR_DEC`, `OPERADOR_AU`, `PROVEEDOR`

**Campos requeridos**: dni, rol, estado, areaUsuaria (excepto ADMIN, PROVEEDOR)

---

### 2. Requerimiento (Requirement)

```json
{
  "id": "REQ001",
  "numero": "REQ-2026-001",
  "tipo": "BIENES",
  "estado": "BORRADOR",
  "auId": "AREAID001",
  "creador": "USR001",
  "fechaCreacion": "2026-05-10T10:00:00Z",
  "datosGenerales": {
    "areaUsuaria": "AREAID001",
    "denominacion": "Adquisición de computadoras portátiles",
    "objetivo": "Equipar laboratorios de tecnología",
    "finalidad": "Formación técnica de estudiantes",
    "clasificacion": "GASTOS_DE_FUNCIONAMIENTO"
  },
  "ítems": [
    {
      "id": "ITEM001",
      "sigamefCode": "21110102",
      "descripcion": "Computadora portátil 15 pulgadas",
      "cantidadSolicitada": 20,
      "unidadMedida": "UND",
      "precioUnitarioRef": 2500.00,
      "precioTotalRef": 50000.00,
      "vigencia": "12 meses"
    }
  ],
  "anexo": {
    "reglamentacion": "Reglamento vigente desde 2024",
    "acondicionamiento": "Instalación incluida",
    "entregas": [
      {
        "id": 1,
        "numero": 1,
        "diasDesdeOrden": 30,
        "descripcion": "Primera entrega 50%"
      },
      {
        "id": 2,
        "numero": 2,
        "diasDesdeOrden": 60,
        "descripcion": "Segunda entrega 50%"
      }
    ],
    "garantia": "12 meses manufactura",
    "lugarEntrega": "Laboratorio Piso 3",
    "condicionesEntrega": "Lunes a Viernes 8:00-17:00",
    "responsabilidadViciosOcultos": "Proveedor responsable por 12 meses",
    "plazoEntrega": 60,
    "modalidadPago": "CONTRA_ENTREGA",
    "condicionesPago": "100% a la recepción",
    "penalidad": 0.05
  },
  "aprobaciones": [
    {
      "nivel": "COORDINADOR",
      "estado": "APROBADO",
      "usuario": "USR002",
      "fecha": "2026-05-11T10:00:00Z",
      "observaciones": null
    },
    {
      "nivel": "DIRECTOR",
      "estado": "APROBADO",
      "usuario": "USR003",
      "fecha": "2026-05-12T10:00:00Z",
      "observaciones": null
    }
  ],
  "historialCambios": [],
  "documentosAdjuntos": [],
  "estadoActual": "APROBADO"
}
```

---

### 3. Contratación (Contratación)

```json
{
  "id": "CONT001",
  "numero": "CONT-2026-DEC-001",
  "anio": 2026,
  "sigla": "DEC",
  "estado": "VIGENTE",
  "requerimientoId": "REQ001",
  "operadorDEC": "USR004",
  "objetoContratacion": "Adquisición de computadoras portátiles para laboratorios",
  "areaUsuaria": "AREAID001",
  "cui": "1234567",
  "tipoInvitacion": "ABIERTA",
  "tipoEvaluacion": "POR_PAQUETE",
  "cronograma": {
    "consultasInicio": "2026-05-20T09:00:00Z",
    "consultasFin": "2026-05-22T17:00:00Z",
    "cotizacionesInicio": "2026-05-23T09:00:00Z",
    "cotizacionesFin": "2026-05-30T17:00:00Z",
    "aperturaFecha": null,
    "aperturaMotivo": null
  },
  "ítems": [
    {
      "id": "ITEM001",
      "cubso": "30210101",
      "cantidad": 20,
      "unidadMedida": "UND",
      "moneda": "PEN",
      "montoUnitario": 2500.00,
      "montoTotal": 50000.00,
      "ubicacion": "Laboratorio Piso 3"
    }
  ],
  "proveedoresInvitados": ["PROV001", "PROV002", "PROV003"],
  "documentosSolicitados": ["RFC", "RUC_VIGENTE", "EXPERIENCIA"],
  "cuadroMultianual": null,
  "archivoRequerimiento": "/files/req001.pdf",
  "fechaCreacion": "2026-05-13T10:00:00Z",
  "montoEstimado": 50000.00,
  "moneda": "PEN"
}
```

---

### 4. Cotización (Quotation)

```json
{
  "id": "COT001",
  "numero": "COT-2026-001",
  "contratacionId": "CONT001",
  "proveedorId": "PROV001",
  "estado": "CALIFICADO",
  "fechaSubmision": "2026-05-25T10:00:00Z",
  "montoTotal": 48000.00,
  "moneda": "PEN",
  "evaluacionTecnica": true,
  "evaluacionTecnicaAsignada": "USR005",
  "detalles": [
    {
      "itemId": "ITEM001",
      "itemCubso": "30210101",
      "cantidad": 20,
      "montoUnitario": 2400.00,
      "montoTotal": 48000.00,
      "descripcion": "Laptop Dell 15 pulgadas i7"
    }
  ],
  "documentosAdjuntos": [
    {
      "id": "DOC001",
      "nombre": "RFC",
      "archivo": "/files/rfc001.pdf",
      "fechaUpload": "2026-05-25T10:00:00Z"
    }
  ],
  "evaluacionTecnicaResultado": {
    "estado": "CUMPLE",
    "motivo": null,
    "fecha": "2026-05-27T14:00:00Z",
    "evaluador": "USR005"
  },
  "subsanacion": null,
  "calificacionComercial": "ADJUDICADO",
  "observaciones": ""
}
```

---

### 5. CCP (Certificado de Crédito Presupuestario)

```json
{
  "id": "CCP001",
  "numero": "CCP-2026-001",
  "anoFiscal": 2026,
  "meta": "META001",
  "clasificadorGasto": "2.1.1.1.1",
  "ffRubro": "0200",
  "moneda": "PEN",
  "montoUtilizar": 50000.00,
  "archivoAdjunto": "/files/ccp001.pdf",
  "estado": "ACTIVO",
  "contratacionId": "CONT001",
  "fechaCreacion": "2026-05-28T10:00:00Z"
}
```

---

### 6. Cuadro Comparativo (Comparative Table)

```json
{
  "id": "CUA001",
  "contratacionId": "CONT001",
  "estado": "PUBLICADO",
  "tipo": "POR_PAQUETE",
  "proveedoresCalificados": [
    {
      "proveedorId": "PROV001",
      "razonSocial": "Tech Company S.A.C.",
      "ruc": "20123456789",
      "montoTotal": 48000.00,
      "moneda": "PEN",
      "estado": "ADJUDICADO"
    }
  ],
  "ganador": {
    "proveedorId": "PROV001",
    "razonSocial": "Tech Company S.A.C.",
    "monto": 48000.00
  },
  "sorteoRealizado": false,
  "fechaGeneracion": "2026-05-30T10:00:00Z",
  "pdfGenerado": "/files/cuadro001.pdf",
  "firma": {
    "tipo": "MANUAL",
    "archivoPDF": "/files/cuadro001_firmado.pdf",
    "fechaFirma": "2026-05-30T11:00:00Z",
    "usuario": "USR004"
  }
}
```

---

### 7. Contrato (Contract)

```json
{
  "id": "CTR001",
  "numero": "CTR-2026-001",
  "contratacionId": "CONT001",
  "contratista": {
    "tipo": "JURIDICA",
    "razonSocial": "Tech Company S.A.C.",
    "ruc": "20123456789",
    "dni": null,
    "domicilio": "Av. Principal 123, Lima"
  },
  "montoContrato": 48000.00,
  "moneda": "PEN",
  "tipoContrato": "ORDEN_COMPRA",
  "numeroContrato": "OC-2026-001",
  "fechaSuscripcion": "2026-06-01T10:00:00Z",
  "vigencia": {
    "inicio": "2026-06-01T00:00:00Z",
    "fin": "2026-07-30T23:59:59Z"
  },
  "archivoContrato": "/files/contrato001.pdf",
  "archivoConsorcio": null,
  "ítems": [
    {
      "id": "ITEM001",
      "cubso": "30210101",
      "descripcion": "Laptop Dell 15 pulgadas i7",
      "cantidad": 20,
      "montoUnitario": 2400.00,
      "montoTotal": 48000.00
    }
  ],
  "programacionEntregas": [
    {
      "numero": 1,
      "fechaProgramada": "2026-06-15T00:00:00Z",
      "cantidad": 10,
      "montoEntrega": 24000.00,
      "estado": "PENDIENTE"
    },
    {
      "numero": 2,
      "fechaProgramada": "2026-07-01T00:00:00Z",
      "cantidad": 10,
      "montoEntrega": 24000.00,
      "estado": "PENDIENTE"
    }
  ],
  "garantias": {
    "aplica": false,
    "razon": "Contratación menor no requiere garantía"
  },
  "estado": "PUBLICADO",
  "fechaCreacion": "2026-06-01T10:00:00Z"
}
```

---

### 8. Evaluación (Evaluation)

```json
{
  "id": "EVA001",
  "requerimientoId": "REQ001",
  "usuarioEvaluador": "USR002",
  "tipo": "EVALUACION_AU",
  "estado": "COMPLETADA",
  "evaluaciones": [
    {
      "seccion": "DATOS_GENERALES",
      "resultado": "APROBADO",
      "fecha": "2026-05-11T10:00:00Z"
    },
    {
      "seccion": "ANEXO",
      "resultado": "APROBADO",
      "fecha": "2026-05-11T10:00:00Z"
    }
  ],
  "observaciones": [],
  "estadoFinal": "APROBADO",
  "fechaEvaluacion": "2026-05-11T10:00:00Z"
}
```

---

### 9. Ejecución Contractual (Contract Execution)

```json
{
  "id": "EJE001",
  "contratoId": "CTR001",
  "estado": "EN_EJECUCION",
  "conformidades": [
    {
      "id": "CONF001",
      "entregaNumero": 1,
      "estado": "CONFORME",
      "documentoConformidad": "/files/conformidad001.pdf",
      "fechaConformidad": "2026-06-16T10:00:00Z"
    }
  ],
  "penalidades": [
    {
      "id": "PEN001",
      "monto": 500.00,
      "motivo": "Retraso en entrega",
      "resolucion": "RES-2026-001",
      "sustento": "/files/sustento_penalidad.pdf",
      "estado": "APLICADA"
    }
  ],
  "ampliaciones": [
    {
      "id": "AMP001",
      "estado": "APROBADA",
      "diasAmpliacion": 10,
      "nuevaFechaFin": "2026-08-09T23:59:59Z",
      "resolucion": "RES-2026-002",
      "fecha": "2026-07-20T10:00:00Z"
    }
  ],
  "nulidades": [],
  "resoluciones": [],
  "historialModificaciones": []
}
```

---

### 10. Consulta (Query/Question)

```json
{
  "id": "CON001",
  "numero": "CON-2026-001",
  "contratacionId": "CONT001",
  "proveedorId": "PROV001",
  "estado": "RESPONDIDA",
  "pregunta": "¿Cuáles son las especificaciones técnicas mínimas requeridas?",
  "fechaSubmision": "2026-05-24T10:00:00Z",
  "respuesta": "Las especificaciones están en el anexo técnico...",
  "estadoRespuesta": "RESPONDIDA_POR_DEC",
  "derivadoA": null,
  "fechaRespuesta": "2026-05-25T14:00:00Z",
  "respondidoPor": "USR004"
}
```

---

### 11. Proveedor (Provider)

```json
{
  "id": "PROV001",
  "ruc": "20123456789",
  "razonSocial": "Tech Company S.A.C.",
  "representanteLegal": "José García López",
  "email": "contacto@techcompany.pe",
  "telefono": "+51987654321",
  "domicilio": "Av. Principal 123, Lima",
  "estado": "ACTIVO",
  "enRNP": true,
  "estadoRNP": "VIGENTE",
  "objetosContratacion": ["BIENES", "SERVICIOS"],
  "certificacionesVigentes": [
    {
      "nombre": "ISO 9001",
      "vigenciaHasta": "2027-12-31T23:59:59Z"
    }
  ],
  "fechaRegistro": "2025-01-01T10:00:00Z",
  "cotizacionesRealizadas": 5,
  "contratosEjecutados": 3
}
```

---

## API/Service Layer

### Patrón de Servicios

Todos los servicios siguen el patrón CRUD + búsqueda:

```javascript
class RequerimientoService {
  // CREATE
  static crear(datos) {
    // Validar
    // Generar ID único
    // Guardar en localStorage
    // Retornar objeto creado
  }

  // READ
  static obtener(id) {
    // Buscar por ID
    // Retornar objeto o null
  }

  static obtenerTodos(filtros = {}) {
    // Buscar con filtros
    // Ordenar
    // Paginar
    // Retornar array
  }

  // UPDATE
  static actualizar(id, datosAActualizar) {
    // Obtener objeto actual
    // Validar cambios
    // Actualizar en localStorage
    // Registrar en audit log
    // Retornar objeto actualizado
  }

  // DELETE
  static eliminar(id) {
    // Validar que sea seguro eliminar
    // Eliminar de localStorage
    // Registrar en audit log
    // Retornar confirmación
  }

  // SEARCH
  static buscar(termino, filtros = {}) {
    // Búsqueda full-text en campos seleccionados
    // Aplicar filtros
    // Retornar resultados
  }

  // FILTERING
  static filtrar(criterios = {}) {
    // Aplicar múltiples filtros
    // Soportar operadores (>, <, =, IN, LIKE)
    // Retornar resultados paginados
  }
}
```

### Servicios Principales

| Servicio | Responsabilidad | Métodos Clave |
|----------|-----------------|---------------|
| **StorageService** | localStorage CRUD | save(), get(), getAll(), delete(), clear() |
| **AuthService** | Autenticación y roles | login(), logout(), isAuthenticated(), getRol() |
| **RequerimientoService** | Gestión de requerimientos | crear(), obtener(), actualizar(), cambiarEstado() |
| **ContratacionService** | Gestión de contrataciones | crear(), publicar(), recibirRequerimiento() |
| **CotizacionService** | Gestión de cotizaciones | registrar(), evaluar(), adjudicar() |
| **ContratosService** | Gestión de contratos | crear(), registrarEjecucion() |
| **PDFService** | Generación de PDFs | generarAnexoBienes(), generarCuadroComparativo() |
| **ExcelService** | Exportación a Excel | exportarLista(), exportarReporte() |
| **SIGAMEFService** | Integración SIGAMEF | buscar(), obtenerFicha() |
| **AuditService** | Registro de auditoría | registrar(), obtenerHistorial() |

---

## Componentes UI Reutilizables

### Componentes Base (Base)

1. **FormControl.js** - Campos de formulario
   - Input (text, email, number, password)
   - Select/Dropdown
   - Textarea
   - Checkbox
   - Radio
   - DatePicker (Flatpickr)
   - TimePicker

2. **Button.js** - Botones variados
   - Primary, Secondary, Danger, Success
   - Loading states
   - Disabled states
   - Icons

3. **Card.js** - Contenedor de contenido
4. **Badge.js** - Etiquetas de estado
5. **Alert.js** - Mensajes de alerta

### Componentes Comunes (Common)

1. **Header.js** - Barra de navegación superior
   - Logo
   - Usuario actual
   - Menú de opciones
   - Notificaciones

2. **Sidebar.js** - Menú lateral según rol
   - Navegación por módulo
   - Links activos/inactivos
   - Collapsible sections

3. **Modal.js** - Diálogos modales
   - Confirmación
   - Formularios
   - Mensajes

4. **Toast.js** - Notificaciones
   - Success
   - Error
   - Warning
   - Info

5. **Table.js** - Tablas de datos
   - Sorting
   - Filtering
   - Pagination
   - Row selection

### Componentes de Formularios (Forms)

1. **FormBuilder.js** - Constructor dinámico de formularios
2. **ValidationHelper.js** - Validación de campos
3. **DeliveryTable.js** - Editor de entregas múltiples
4. **ItemsTable.js** - Editor de ítems con cantidades

### Componentes de Layout (Layout)

1. **PageLayout.js** - Layout estándar de página
2. **FormLayout.js** - Layout para formularios
3. **DashboardLayout.js** - Layout para dashboard

---

## Estrategia de Estados

### State Management Architecture

```
┌─────────────────────┐
│   GlobalState       │
├─────────────────────┤
│ • User              │
│ • Auth Token        │
│ • Notification      │
│ • LoadingState      │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────────┐ ┌────────────┐
│ Page State │ │Module State│
├────────────┤ ├────────────┤
│ • Form     │ │ • Context  │
│ • Modal    │ │ • Cache    │
│ • Data     │ │ • Filters  │
└────────────┘ └────────────┘
```

### State Management Implementation

```javascript
// Global state object
window.APP_STATE = {
  user: null,
  authenticated: false,
  token: null,
  rol: null,
  notifications: [],
  loading: false,
  
  // Setters
  setUser(user) {
    this.user = user;
    this.authenticated = !!user;
    this.rol = user?.rol;
  },
  
  // Getters
  getUser() {
    return this.user;
  },
  
  // Listeners
  listeners: [],
  subscribe(callback) {
    this.listeners.push(callback);
  },
  
  // Notify changes
  notifyListeners() {
    this.listeners.forEach(cb => cb(this));
  }
};
```

### State Machines por Entidad

**Requerimiento States:**
```
BORRADOR → (solicitar aprobación) → NO_RECIBIDO
NO_RECIBIDO → (DEC recibe) → RECIBIDO
RECIBIDO → (observación) → OBSERVADO
OBSERVADO → (subsanación) → NO_RECIBIDO
RECIBIDO → (aprobación) → APROBADO
APROBADO → (crear contratación) → EN_CONTRATACION
```

**Contratación States:**
```
BORRADOR → (publicar) → VIGENTE
VIGENTE → (fin cotizaciones) → EN_EVALUACION
EN_EVALUACION → (cuadro firmado) → CULMINADO
```

**Cotización States:**
```
PRESENTADA → (evaluación técnica) → CALIFICADA
CALIFICADA → (comercial) → ADJUDICADA | DESCALIFICADA
```

---

## Rutas y Navegación por Rol

### Matriz de Rutas por Rol

```
/login                                PUBLIC
  
/dashboard                           ALL (después auth)
/profile                             ALL
/audit-logs                          ADMIN

ADMIN (/admin)
  /admin/usuarios                    Gestión usuarios
  /admin/areas-usuarias              Gestión áreas
  /admin/siglas                      Gestión siglas
  /admin/sigamef                     Gestión SIGAMEF
  /admin/fichas-tecnicas             Gestión fichas
  /admin/centros-costo               Gestión centros
  /admin/documentos                  Gestión documentos
  /admin/configuracion               Configuración sistema

OPERADOR_AU (/au)
  /au/requerimientos                 Listado requerimientos
  /au/requerimientos/nuevo           Crear requerimiento
  /au/requerimientos/:id             Detalle requerimiento
  /au/requerimientos/:id/editar      Editar requerimiento
  /au/requerimientos/:id/pdf         Ver PDF
  /au/evaluacion                     Evaluar requerimientos
  /au/evaluacion/:id                 Detalle evaluación
  /au/subsanacion/:id                Subsanar observaciones

OPERADOR_DEC (/dec)
  /dec/contrataciones                Listado contrataciones
  /dec/contrataciones/nueva          Crear contratación
  /dec/contrataciones/:id            Detalle contratación
  /dec/contrataciones/:id/editar     Editar contratación
  /dec/invitaciones/:id              Gestionar invitaciones
  /dec/invitaciones/:id/enviar       Enviar invitaciones
  /dec/consultas                     Bandeja consultas
  /dec/consultas/:id                 Detalle consulta
  /dec/cotizaciones                  Listado cotizaciones
  /dec/cotizaciones/:id/abrir        Abrir cotizaciones
  /dec/cotizaciones/:id/evaluar      Evaluar cotizaciones
  /dec/ccp                           Registrar CCP
  /dec/cuadro-comparativo/:id        Cuadro comparativo
  /dec/cuadro-comparativo/:id/firma  Firmar cuadro
  /dec/contratos                     Listado contratos
  /dec/contratos/nuevo               Crear contrato
  /dec/contratos/:id                 Detalle contrato
  /dec/contratos/:id/nulidad         Registrar nulidad
  /dec/contratos/:id/resolucion      Registrar resolución
  /dec/contratos/:id/conformidad     Registrar conformidad
  /dec/contratos/:id/penalidad       Registrar penalidad
  /dec/contratos/:id/ampliacion      Registrar ampliación

PROVEEDOR (/proveedor)
  /proveedor/invitaciones            Mis invitaciones
  /proveedor/invitaciones/:id        Detalle invitación
  /proveedor/cotizaciones            Mis cotizaciones
  /proveedor/cotizaciones/nueva      Presentar cotización
  /proveedor/consultas               Mis consultas
  /proveedor/consultas/nueva         Realizar consulta
```

### Route Guards Implementation

```javascript
const routeGuards = {
  requireAuth: (user) => !!user,
  requireRole: (user, role) => user?.rol === role,
  requireAnyRole: (user, roles) => roles.includes(user?.rol),
  requireAdmin: (user) => user?.rol === 'ADMIN',
};

function checkRoute(path, user) {
  const routes = {
    '/admin/usuarios': ['ADMIN'],
    '/au/requerimientos': ['OPERADOR_AU'],
    '/dec/contrataciones': ['OPERADOR_DEC'],
  };
  
  const requiredRoles = routes[path];
  if (!requiredRoles) return true; // ruta pública
  return requiredRoles.includes(user?.rol);
}
```

---

## Integraciones Externas

### 1. jsPDF (PDF Generation)

```javascript
// Generación de Anexo 01-A (Bienes)
class PDFService {
  static generarAnexoBienes(requerimiento) {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(14);
    doc.text('ANEXO 01-A: ESPECIFICACIONES TÉCNICAS - BIENES', 10, 10);
    
    // Datos generales
    doc.setFontSize(10);
    doc.text(`Denominación: ${requerimiento.datosGenerales.denominacion}`, 10, 25);
    doc.text(`Objetivo: ${requerimiento.datosGenerales.objetivo}`, 10, 32);
    
    // Items table
    const itemsData = requerimiento.ítems.map(item => [
      item.sigamefCode,
      item.descripcion,
      item.cantidadSolicitada,
      item.unidadMedida,
      item.precioUnitarioRef?.toFixed(2),
      item.precioTotalRef?.toFixed(2)
    ]);
    
    doc.autoTable({
      head: [['Código', 'Descripción', 'Cantidad', 'UM', 'P.U.', 'Total']],
      body: itemsData,
      startY: 45
    });
    
    // Footer
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-PE')}`, 10, doc.internal.pageSize.height - 10);
    
    return doc;
  }
}
```

### 2. SheetJS (Excel Export)

```javascript
class ExcelService {
  static exportarContrataciones(contrataciones) {
    const data = contrataciones.map(c => ({
      'Nº Contratación': c.numero,
      'Año': c.anio,
      'Objeto': c.objetoContratacion,
      'Área Usuaria': c.areaUsuaria,
      'Estado': c.estado,
      'Monto': c.montoEstimado,
      'Moneda': c.moneda,
      'Fecha Creación': new Date(c.fechaCreacion).toLocaleDateString('es-PE')
    }));
    
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contrataciones');
    XLSX.writeFile(workbook, `Contrataciones_${new Date().toISOString().slice(0,10)}.xlsx`);
  }
}
```

### 3. Chart.js (KPIs & Dashboard)

```javascript
class DashboardService {
  static renderKPIChart(containerId, data, type = 'bar') {
    const ctx = document.getElementById(containerId).getContext('2d');
    
    new Chart(ctx, {
      type: type,
      data: {
        labels: data.labels,
        datasets: [{
          label: data.label,
          data: data.values,
          backgroundColor: data.colors || 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }
}
```

### 4. SIGAMEF Integration (Mock)

```javascript
class SIGAMEFService {
  static async buscar(termino, tipo = 'codigo') {
    // Mock de respuesta SIGAMEF
    const mockData = [
      { codigo: '21110102', descripcion: 'Computadora portátil', unidadMedida: 'UND' },
      { codigo: '30210101', descripcion: 'Software aplicativo', unidadMedida: 'LIC' },
    ];
    
    return mockData.filter(item =>
      item[tipo === 'codigo' ? 'codigo' : 'descripcion']
        .toLowerCase()
        .includes(termino.toLowerCase())
    );
  }
}
```

### 5. SUNAT Integration (Mock - RUC Validation)

```javascript
class SUNATService {
  static async validarRUC(ruc) {
    // Mock validation
    if (ruc.length === 11 && /^\d+$/.test(ruc)) {
      return {
        valido: true,
        razonSocial: 'Empresa Simulada S.A.C.',
        estado: 'ACTIVO'
      };
    }
    return { valido: false };
  }
}
```

---

## Persistencia de Datos

### Estrategia localStorage

**Estructura de Almacenamiento:**
```
localStorage['sgc_users'] = JSON.stringify([...])
localStorage['sgc_requerimientos'] = JSON.stringify([...])
localStorage['sgc_contrataciones'] = JSON.stringify([...])
localStorage['sgc_cotizaciones'] = JSON.stringify([...])
localStorage['sgc_contratos'] = JSON.stringify([...])
localStorage['sgc_audit_logs'] = JSON.stringify([...])
```

**Data Migration & Versioning:**
```javascript
class StorageService {
  static SCHEMA_VERSION = 2;
  
  static init() {
    const currentVersion = localStorage.getItem('sgc_schema_version') || 0;
    if (currentVersion < this.SCHEMA_VERSION) {
      this.migrate(currentVersion);
    }
  }
  
  static migrate(fromVersion) {
    // Lógica de migración por versión
  }
  
  static backup() {
    const backup = {};
    for (let key of Object.keys(localStorage)) {
      if (key.startsWith('sgc_')) {
        backup[key] = localStorage[key];
      }
    }
    return JSON.stringify(backup);
  }
  
  static restore(backupData) {
    const backup = JSON.parse(backupData);
    for (let key in backup) {
      localStorage.setItem(key, backup[key]);
    }
  }
}
```

### Resolución de Conflictos

```javascript
// Last-write-wins strategy
function mergeData(local, remote, timestamp) {
  if (remote.lastModified > local.lastModified) {
    return remote;
  }
  return local;
}
```

---

## Consideraciones Técnicas

### Naming Conventions

- **Files**: camelCase (userService.js, loginPage.js)
- **Classes**: PascalCase (AuthService, FormControl)
- **Methods**: camelCase (getUserById, createRequerimiento)
- **Constants**: UPPER_CASE (API_TIMEOUT, MAX_FILE_SIZE)
- **CSS Classes**: kebab-case (.btn-primary, .form-control)

### Performance Optimization

- Lazy loading de componentes
- Pagination en listas (50 items por página)
- Caching de búsquedas SIGAMEF
- Debouncing de searches (300ms)
- Throttling de eventos (scroll, resize)

### Security

- **RBAC**: Role-based access control en todas las rutas
- **Input Validation**: Sanitizar inputs en formularios
- **XSS Prevention**: No usar innerHTML, usar textContent
- **CSRF**: Tokens en formularios (simular)
- **Audit Logging**: Registrar todas las acciones de usuario

### Accessibility (WCAG 2.1 AA)

- ARIA labels en todos los form controls
- Keyboard navigation (Tab, Enter, Escape)
- Color contrast ratios (4.5:1 para texto normal)
- Alt text en imágenes
- Focus indicators visibles
- Semantic HTML (buttons, links, forms)

### Error Handling

```javascript
try {
  const data = StorageService.get('sgc_users');
} catch (error) {
  console.error('Storage error:', error);
  notificationManager.showError('Error al cargar datos');
  // Fallback a datos por defecto
}
```

### Testing Strategy

- **Unit Tests**: Servicios y utilidades (80% coverage)
- **Integration Tests**: Workflows completos (requerimiento → contratación)
- **E2E Tests**: Flujos críticos de usuario
- **Accessibility Tests**: axe-core automation

### Deployment

```bash
# Build
npm run build

# Deploy to static hosting (GitHub Pages, Netlify, etc.)
# Environment: Production localStorage persistence
```

---

## Quick Start Guide

### Setup (Día 1 - 4-5 horas)

**1. Inicializar proyecto (30 min)**
```bash
mkdir sgc
cd sgc
npm init -y
npm install webpack webpack-cli jspdf sheetjs chart.js flatpickr
```

**2. Crear estructura base (1 hora)**
- public/index.html
- src/index.js
- src/app.js
- src/router.js
- src/styles/main.css

**3. Implementar componentes básicos (1.5 horas)**
- Components/base/FormControl.js
- Components/common/Header.js
- Services/storage/StorageService.js
- Services/auth/AuthService.js

**4. Login funcional (1 hora)**
- Página de login
- Autenticación con localStorage
- Redirección según rol

**Resultado**: SPA corriendo localmente con login 👍

### Prioridad de Tasks

**Priority 1** (Sem 1-2):
1. Project setup
2. Authentication module
3. Dashboard/Home

**Priority 2** (Sem 3-4):
4. Master data (Áreas, Siglas, SIGAMEF)
5. Basic components (Table, Form, Modal)

**Priority 3** (Sem 5-8):
6. Requerimientos module (full CRUD por tipo)
7. Evaluación workflow

**Priority 4** (Sem 9-12):
8. Contratación + Invitaciones
9. Cotizaciones + Evaluación

**Priority 5** (Sem 13-16):
10. Cuadro Comparativo + Firma
11. Contratos + Ejecución

### Development Environment

**Recomendado:**
- Node.js 16+
- npm 8+
- VS Code + Extensions:
  - Live Server
  - Prettier
  - ESLint
  - Bootstrap Intellisense

**Local development:**
```bash
npm run dev    # Webpack dev server
npm run build  # Production build
npm test       # Run tests
```

---

## Documentación de Referencia

### Archivos por Consultar
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - Referencia técnica completa
- [COMPONENTS.md](./COMPONENTS.md) - Catálogo de componentes UI
- [DATA_MODELS.md](./DATA_MODELS.md) - Especificación de modelos
- [API.md](./API.md) - Referencia de servicios
- [USER_GUIDE.md](./USER_GUIDE.md) - Manual de usuario

---

**Plan listo para implementación inmediata. ¡Adelante! 🚀**
