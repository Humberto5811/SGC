# ✅ IMPLEMENTATION CHECKLIST - SGC Project

**Status**: 🟢 Ready to Start  
**Last Updated**: 2026-05-13  
**Tracking Format**: Mark ✓ when done, ❌ if blocked, ⏳ if in progress

---

## PHASE 1: FOUNDATION & INFRASTRUCTURE (Weeks 1-2)

### T001 — Project Setup and Technology Stack
- [ ] Initialize git repository
- [ ] Create folder structure (20+ directories)
- [ ] Create package.json with dependencies
- [ ] Configure webpack/vite (optional)
- [ ] Install Bootstrap 5
- [ ] Setup localStorage persistence layer
- [ ] Create .gitignore and README

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 20  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T002 — Database Schema Design
- [ ] Design User schema + validation rules
- [ ] Design Área Usuaria schema
- [ ] Design Requerimiento schema (Bienes, Servicios, Locación)
- [ ] Design Contratación schema
- [ ] Design Cotización schema
- [ ] Design Contrato schema
- [ ] Design CCP/Meta schema
- [ ] Design Proveedor schema
- [ ] Design Evaluación schema
- [ ] Design Ejecución schema
- [ ] Document all relationships

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 15  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T003 — Base Architecture & Common Components
- [ ] Create main application shell (Header, Nav, Footer)
- [ ] Implement Bootstrap 5 responsive grid
- [ ] Create Button component
- [ ] Create Input component
- [ ] Create Select component
- [ ] Create Textarea component
- [ ] Create Modal component
- [ ] Create Toast/notification system
- [ ] Create Table component with sorting/pagination
- [ ] Create Card component
- [ ] Create Badge component
- [ ] Create Spinner/loading component

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 25  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 2: AUTHENTICATION & ACCESS CONTROL (Week 3)

### T004 — User Authentication System
- [ ] Create LoginPage form (DNI + password)
- [ ] Implement AuthService with role-based access
- [ ] Add session management (login/logout)
- [ ] Create privacy policy modal
- [ ] Implement role-based navigation menu
- [ ] Create route guards (authorization middleware)
- [ ] Add WCAG 2.1 AA accessibility to login
- [ ] Create password reset flow
- [ ] Add audit logging for auth events

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 20  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T005 — User Management Module
- [ ] Create users list view (Admin only)
- [ ] Implement user create/edit/delete
- [ ] Create user search and filtering
- [ ] Add role assignment interface
- [ ] Implement user status management (Active/Inactive)
- [ ] Create bulk user operations

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 15  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 3: DATA MASTERS & CONFIGURATION (Week 4)

### T006-T014 — Maintenance Modules (All Masters)
- [ ] T006: Áreas Usuarias CRUD + autocompletar
- [ ] T007: Siglas CRUD + dynamic generation
- [ ] T008: SIGAMEF items search + mock data
- [ ] T009: Fichas Técnicas CRUD
- [ ] T010: Advanced user management
- [ ] T011: SIAF integration (placeholder)
- [ ] T012: Purchase orders view
- [ ] T013: Budget metas CRUD
- [ ] T014: CUI lookup (optional)

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 60  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 4: REQUERIMIENTOS MODULE (Weeks 5-7)

### T015 — Common Requerimiento Structure
- [ ] Create requerimiento list view (all types)
- [ ] Implement status workflow (BORRADOR → APROBADO)
- [ ] Create detail view with edit capability
- [ ] Implement PDF generation (Anexo 01-A)
- [ ] Add state machine logic

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 20  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T016 — Requerimientos - BIENES Type
- [ ] Create Bienes form with 18 fields
- [ ] SIGAMEF item selection with auto-population
- [ ] Multi-delivery table (add/edit/delete)
- [ ] All clauses and requirements sections
- [ ] Generate PDF Anexo 01-A
- [ ] Implement approval request workflow
- [ ] Add edit/discard functionality

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 30  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T017 — Requerimientos - SERVICIOS Type
- [ ] Create Servicios form with 13 fields
- [ ] Service description with SIGAMEF selection
- [ ] Provider experience requirements
- [ ] Multi-delivery table for servicios
- [ ] Generate PDF Anexo 01-A
- [ ] Create approval request workflow

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 25  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T018 — Requerimientos - LOCACIÓN Type
- [ ] Create Locación form with 12 fields
- [ ] Provider profile requirements
- [ ] Multi-delivery table
- [ ] Generate PDF Anexo 01-A
- [ ] Create approval request workflow

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 20  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T019 — Requerimientos - Approval Workflow
- [ ] Create approval request form
- [ ] Implement approval/rejection buttons
- [ ] Add notification system
- [ ] Transition to Contrataciones module

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 15  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 5: EVALUACIÓN & SUBSANACIÓN (Week 8)

### T020 — Evaluación de Requerimientos
- [ ] Create evaluator view
- [ ] Implement status bandejas (No recibidos, Recibidos, Observado, Aprobado)
- [ ] Section-level evaluation
- [ ] Evaluation buttons (Aprobar/Observar/Volver a evaluar)
- [ ] Textual feedback capture
- [ ] Evaluation history view

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 15  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T021 — Subsanación de Requerimientos
- [ ] Edit interface for observed sections
- [ ] PDF regeneration after edits
- [ ] New approval request submission
- [ ] Subsanación PDF with signature
- [ ] Auto-remit to DEC
- [ ] Track subsanación count

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 12  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 6: DIFUSIÓN & CONTRATACIÓN (Weeks 9-10)

### T022 — Contratación - Creation without Requerimiento
- [ ] Create new contratación form
- [ ] Auto-generate N° contratación
- [ ] Add cronograma section (dates/times)
- [ ] Object description field
- [ ] Cuadro Multianual section
- [ ] Invitación type selection (Abierta/Cerrada)
- [ ] Evaluación type selection (Por paquete/Por item)
- [ ] File upload for requerimiento
- [ ] Configurable document request system
- [ ] Items table
- [ ] Publish button → VIGENTE state
- [ ] Save as draft

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 25  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T023 — Contratación - Creation with Requerimiento
- [ ] DEC receive requerimiento workflow
- [ ] "Recibir" button
- [ ] DEC evaluator interface
- [ ] Approval/observation logic
- [ ] Observation feedback to AU
- [ ] Subsanación loop
- [ ] Auto-populate form from requerimiento
- [ ] Pre-fill object, area, items, cost

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 15  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T024 — Contratación - List and Search
- [ ] Create list view
- [ ] Implement search (N°, Año, Sigla, Object, Estado, Area)
- [ ] Add advanced filtering
- [ ] Implement pagination
- [ ] Create Excel export

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 10  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 7: INVITACIONES & CONSULTAS (Weeks 11-12)

### T025-T027 — Invitaciones & Tracking
- [ ] T025: Abierta invitations (20 random RNP)
- [ ] T026: Cerrada invitations (manual selection)
- [ ] T027: Email sending + tracking
- [ ] Invitation status (Enviado/Leído/No leído)
- [ ] Resend functionality
- [ ] Provider list management

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 25  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T028-T029 — Consultas (Queries)
- [ ] T028: Query submission form
- [ ] Character counter
- [ ] Query status tracking
- [ ] Query history view
- [ ] T029: DEC/AU response workflow
- [ ] Query inbox
- [ ] Derivation to AU
- [ ] Response templates

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 15  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 8: COTIZACIONES & EVALUACIÓN (Weeks 13-15)

### T030 — Apertura de Cotizaciones
- [ ] "Abrir cotizaciones" button (after deadline)
- [ ] User/reason capture for after-deadline
- [ ] State change to EN_EVALUACION
- [ ] Quotation count display
- [ ] Opening history audit log

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 10  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T031 — Evaluación por Paquete de Ítem
- [ ] Provider quotation list view
- [ ] Technical evaluation option (SI/NO)
- [ ] AU evaluation interface
- [ ] Quotation status tracking
- [ ] Subsanación feature

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 20  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T032 — Evaluación por Relación de Ítem
- [ ] Item selection from quotations
- [ ] Per-item quotation view
- [ ] Per-item evaluation
- [ ] Per-item ranking

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 12  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T033 — Sorteo Electrónico por Empate
- [ ] Detect tied quotations
- [ ] Electronic draw algorithm
- [ ] Draw result display
- [ ] Auto-adjudication
- [ ] Audit trail logging

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 10  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 9: PRESUPUESTO & CCP (Weeks 16-17)

### T034 — Registro de CCP Manual
- [ ] CCP registration form
- [ ] Add/edit/remove CCP in list
- [ ] CCP validation (unique N°)
- [ ] Display total presupuesto
- [ ] CCP persistence

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 12  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T035 — CCP Linking to Contratación
- [ ] Link CCP to cotización process
- [ ] Presupuesto confirmation workflow
- [ ] Publish button → CULMINADO
- [ ] Presupuesto validation

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 10  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 10: CUADRO COMPARATIVO & FIRMA (Week 18)

### T036 — Cuadro Comparativo Generation
- [ ] Generate cuadro comparativo button
- [ ] PDF generation (por paquete/por item)
- [ ] Detailed comparison data
- [ ] Professional formatting

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 10  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T037-T039 — Firma (Digital & Manual)
- [ ] T037: Digital signature modal (simulated)
- [ ] DNI/Token question
- [ ] Signature simulation flow
- [ ] T038: Manual signature workflow
- [ ] Download PDF + re-upload
- [ ] T039: Cuadro publication

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 12  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 11: CONTRATOS & EJECUCIÓN (Weeks 19-20)

### T040-T041 — Contrato Registration
- [ ] Create contract form
- [ ] Contractor selection
- [ ] Contract type selection
- [ ] Item editing interface
- [ ] Payment scheduling
- [ ] Guarantees section
- [ ] Save as draft / Publish
- [ ] Contract search interface

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 25  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

### T042-T044 — Modificaciones & Seguimiento
- [ ] T042: Nulidad registration
- [ ] T043: Resolución registration
- [ ] T044: Other modifications (addendums, agreements)
- [ ] T045: Conformidad de recepción
- [ ] T046: Penalidad registration
- [ ] T047: Ampliación de plazo

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 30  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 12: DOCUMENTO CONFIGURATION (Week 21)

### T048 — Documento CRUD
- [ ] Create document list view
- [ ] Document search
- [ ] Document registration form
- [ ] Edit/delete functionality
- [ ] Detail view

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 12  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 13: REPORTING & ANALYTICS (Week 22)

### T052-T053 — Reportes
- [ ] Dashboard KPIs
- [ ] Chart visualizations
- [ ] Filters (date range, area, type)
- [ ] Drill-down functionality
- [ ] Listado exports to Excel
- [ ] Report templates
- [ ] Audit trail report

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 20  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 14: QUALITY ASSURANCE (Week 23)

### T054-T057 — QA & Optimization
- [ ] T054: WCAG 2.1 AA accessibility audit
- [ ] ARIA labels and keyboard navigation
- [ ] Color contrast testing
- [ ] T055: Performance optimization
- [ ] Lazy loading
- [ ] Caching strategy
- [ ] T056: Audit logging system
- [ ] T057: Error handling & validation

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 30  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 15: TESTING & DOCUMENTATION (Week 24)

### T058-T061 — Testing & Docs
- [ ] T058: Unit tests (80% coverage)
- [ ] T059: Integration tests
- [ ] T060: User Acceptance Testing (UAT)
- [ ] T061: Documentation
  - [ ] User manual
  - [ ] Administrator guide
  - [ ] API endpoints
  - [ ] Troubleshooting guide
  - [ ] Deployment guide

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 40  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## PHASE 16: DEPLOYMENT & LAUNCH (Week 25)

### T062-T064 — Deployment
- [ ] T062: Pre-launch checklist
- [ ] Regression testing
- [ ] Security audit
- [ ] Production environment setup
- [ ] Monitoring/alerting setup
- [ ] T063: Production deployment
- [ ] Verify all features
- [ ] Create launch communication
- [ ] T064: Post-launch support
- [ ] Monitor system performance
- [ ] Respond to user issues

**Status**: ☐ Not Started | ⏳ In Progress | ✓ Complete  
**Estimated Hours**: 25  
**Actual Hours**: ___  
**Owner**: _______________  
**Notes**: _______________

---

## 📊 OVERALL PROJECT STATUS

| Phase | Status | Completion % | Owner | Notes |
|-------|--------|-------------|-------|-------|
| 1. Foundation | ☐ | __% | ___ | ___ |
| 2. Authentication | ☐ | __% | ___ | ___ |
| 3. Masters | ☐ | __% | ___ | ___ |
| 4. Requerimientos | ☐ | __% | ___ | ___ |
| 5. Evaluación | ☐ | __% | ___ | ___ |
| 6. Difusión | ☐ | __% | ___ | ___ |
| 7. Invitaciones | ☐ | __% | ___ | ___ |
| 8. Cotizaciones | ☐ | __% | ___ | ___ |
| 9. CCP | ☐ | __% | ___ | ___ |
| 10. Cuadro | ☐ | __% | ___ | ___ |
| 11. Contratos | ☐ | __% | ___ | ___ |
| 12. Documentos | ☐ | __% | ___ | ___ |
| 13. Reportes | ☐ | __% | ___ | ___ |
| 14. QA | ☐ | __% | ___ | ___ |
| 15. Testing | ☐ | __% | ___ | ___ |
| 16. Deployment | ☐ | __% | ___ | ___ |
| **TOTAL PROJECT** | ☐ | __% | ___ | ___ |

---

## 📝 NOTES & BLOCKERS

```
Phase: ___________
Date: ____________

Completed Tasks:
- 

In Progress:
- 

Blocked Tasks:
- Reason: 

Next Steps:
-
```

---

**Remember**: Update this checklist weekly! 🚀
