# QUICK START GUIDE - SGC Implementation

## 🚀 Inicio Rápido (Primeras 48 Horas)

### Día 1: Setup del Proyecto

#### 1. Crear estructura de directorios
```bash
mkdir -p SGC/{public,src/{assets,styles,components,services,utils,modules,middleware,hooks,router},tests,docs}
cd SGC
```

#### 2. Inicializar proyecto
```bash
npm init -y
npm install bootstrap@5 jspdf html2canvas xlsx moment chart.js
```

#### 3. Estructura HTML básica
```html
<!-- public/index.html -->
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SGC - Sistema de Gestión de Contrataciones</title>
    <link href="node_modules/bootstrap/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="src/styles/main.css" rel="stylesheet">
</head>
<body>
    <div id="app"></div>
    <script src="src/index.js"></script>
</body>
</html>
```

#### 4. App shell básico
```javascript
// src/index.js
import Router from './router/Router';
import AuthService from './services/auth/AuthService';
import Logger from './utils/logger';

class SGCApplication {
    constructor() {
        this.router = new Router();
        this.auth = AuthService;
        this.logger = Logger;
    }

    async init() {
        Logger.log('APP_INIT', { timestamp: new Date().toISOString() });
        
        // Cargar datos iniciales
        this.loadInitialData();
        
        // Inicializar router
        this.router.init();
        
        // Verificar autenticación
        if (!this.auth.isAuthenticated()) {
            this.router.navigate('/login');
        } else {
            this.router.navigate('/dashboard');
        }
    }

    loadInitialData() {
        // Cargar maestros, configuración, etc.
        const users = StorageService.get('users') || [];
        if (users.length === 0) {
            this.initializeDefaultData();
        }
    }

    initializeDefaultData() {
        // Crear usuario admin por defecto
        const adminUser = {
            id: 'USR-001',
            dni: '12345678',
            email: 'admin@institution.gov.pe',
            password: 'admin123',
            nombreCompleto: 'Administrador Sistema',
            rol: 'ADMIN',
            estado: 'ACTIVO'
        };
        StorageService.set('users', [adminUser]);
    }
}

const app = new SGCApplication();
app.init();
```

### Día 2: Módulos Base

#### 1. Autenticación (Prioridad 1)
```javascript
// src/services/auth/AuthService.js
class AuthService {
    static login(dni, password) {
        const users = StorageService.get('users') || [];
        const user = users.find(u => u.dni === dni && u.password === password);
        
        if (!user) throw new Error('Credenciales inválidas');
        
        SessionStorage.set('currentUser', user);
        Logger.log('LOGIN_SUCCESS', { userId: user.id });
        return user;
    }

    static logout() {
        const user = this.getCurrentUser();
        SessionStorage.clear();
        Logger.log('LOGOUT', { userId: user?.id });
    }

    static getCurrentUser() {
        return SessionStorage.get('currentUser');
    }

    static isAuthenticated() {
        return !!this.getCurrentUser();
    }

    static hasRole(...roles) {
        const user = this.getCurrentUser();
        return user && roles.includes(user.rol);
    }
}
```

#### 2. Componente Login
```javascript
// src/modules/auth/LoginPage.js
class LoginPage {
    render(containerId) {
        const container = document.getElementById(containerId);
        
        const form = `
            <div class="container mt-5">
                <div class="row justify-content-center">
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body">
                                <h3 class="text-center mb-4">SGC</h3>
                                <form id="loginForm">
                                    <div class="form-group mb-3">
                                        <label for="dni">DNI</label>
                                        <input type="text" id="dni" class="form-control" maxlength="8">
                                    </div>
                                    <div class="form-group mb-3">
                                        <label for="password">Contraseña</label>
                                        <input type="password" id="password" class="form-control">
                                    </div>
                                    <button type="submit" class="btn btn-primary w-100">Ingresar</button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = form;
        
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const dni = document.getElementById('dni').value;
            const password = document.getElementById('password').value;
            
            try {
                AuthService.login(dni, password);
                window.location.href = '/dashboard';
            } catch (error) {
                Toast.error(error.message);
            }
        });
    }
}
```

#### 3. Router básico
```javascript
// src/router/Router.js
class Router {
    constructor() {
        this.routes = {};
        this.currentRoute = null;
    }

    register(path, component) {
        this.routes[path] = component;
    }

    navigate(path) {
        if (this.routes[path]) {
            this.currentRoute = path;
            window.history.pushState({}, '', path);
            this.render();
        }
    }

    render() {
        const component = this.routes[this.currentRoute];
        if (component) {
            const app = document.getElementById('app');
            app.innerHTML = '';
            new component().render('app');
        }
    }

    init() {
        // Registrar rutas principales
        this.register('/login', LoginPage);
        this.register('/dashboard', Dashboard);
        this.register('/requerimientos', RequList);
        this.register('/contrataciones', ContList);
        
        // Handle browser back button
        window.addEventListener('popstate', () => this.render());
    }
}
```

---

## 📋 Checklist Primera Semana

- [ ] **Día 1-2**: Setup + Auth + Login
  - [ ] Estructura de directorios
  - [ ] package.json + dependencias
  - [ ] AuthService completo
  - [ ] LoginPage funcional
  - [ ] Router básico

- [ ] **Día 3-4**: Componentes Base
  - [ ] Input, Button, Select, Textarea
  - [ ] Modal, Toast, Card
  - [ ] Table con paginación

- [ ] **Día 5**: Servicios Base
  - [ ] StorageService
  - [ ] UserService (CRUD)
  - [ ] Logger completo

- [ ] **Día 6-7**: Dashboard & Navigation
  - [ ] Header + Navbar por rol
  - [ ] Dashboard inicial
  - [ ] Sidebar con menú por rol

---

## 🎯 Fases Recomendadas

### FASE 1 (Semanas 1-2): Fundación
**Horas**: ~80-100h
- ✅ Setup + scaffolding
- ✅ Componentes base UI
- ✅ Servicios base (Auth, Storage, User)
- ✅ Login + Dashboard shell
- ✅ Rutas + Guards

**Entregable**: SPA funcional con login y navegación por roles

---

### FASE 2 (Semana 3): Maestros de Datos
**Horas**: ~60-80h
- ✅ Áreas Usuarias CRUD
- ✅ Siglas CRUD
- ✅ SIGAMEF búsqueda (mock)
- ✅ Usuarios CRUD (Admin)
- ✅ Documentos configurables

**Entregable**: Todos los maestros operacionales

---

### FASE 3 (Semanas 4-6): Requerimientos (AU)
**Horas**: ~120-150h
- ✅ RequList view
- ✅ Formularios: Bienes, Servicios, Locación
- ✅ Multi-delivery table
- ✅ PDF generation (Anexo 01-A)
- ✅ Approval workflow

**Entregable**: AU puede crear y submitir requerimientos

---

### FASE 4 (Semanas 7-9): Contrataciones (DEC)
**Horas**: ~120-150h
- ✅ Contratación form (con/sin requerimiento)
- ✅ Invitaciones (Abierta/Cerrada)
- ✅ Provider search
- ✅ Invitations tracking
- ✅ Queries/Consultas module

**Entregable**: DEC puede crear contrataciones e invitar proveedores

---

### FASE 5 (Semanas 10-12): Cotizaciones & Evaluación
**Horas**: ~120-150h
- ✅ Cotización submission
- ✅ Apertura cotizaciones
- ✅ Evaluación por paquete
- ✅ Evaluación por ítem
- ✅ Subsanación
- ✅ Electronic draw (empates)

**Entregable**: Flujo completo de cotizaciones

---

### FASE 6 (Semanas 13-14): CCP & Cuadro Comparativo
**Horas**: ~80-100h
- ✅ CCP registration
- ✅ CCP linking
- ✅ Presupuesto validation
- ✅ Cuadro Comparativo generation
- ✅ Firma digital (simulada)
- ✅ Firma manual

**Entregable**: Adjudicación y comparativo listos

---

### FASE 7 (Semanas 15-16): Contratos & Ejecución
**Horas**: ~100-120h
- ✅ Contrato registration
- ✅ Cronograma entrega/pago
- ✅ Conformidad de recepción
- ✅ Penalidades
- ✅ Ampliación de plazo
- ✅ Nulidad/Resolución

**Entregable**: Gestión contractual completa

---

### FASE 8 (Semanas 17-18): Reportes & KPIs
**Horas**: ~60-80h
- ✅ KPI Dashboard
- ✅ Reports por módulo
- ✅ Excel export
- ✅ Audit log view
- ✅ Charts (Chart.js)

**Entregable**: Analytics operativo

---

### FASE 9 (Semana 19): QA & Optimización
**Horas**: ~80-100h
- ✅ Unit tests (80% coverage)
- ✅ Integration tests
- ✅ Performance optimization
- ✅ Accessibility audit
- ✅ Error handling

**Entregable**: Sistema robusto y optimizado

---

### FASE 10 (Semana 20): Documentación & Deployment
**Horas**: ~60-80h
- ✅ User manual
- ✅ Admin guide
- ✅ Developer documentation
- ✅ Deployment guide
- ✅ Production deployment

**Entregable**: Sistema en producción

---

## 📊 Esfuerzo Total Estimado

| Fase | Semanas | Horas | Desarrolladores |
|------|---------|-------|-----------------|
| 1. Fundación | 2 | 80-100 | 1-2 |
| 2. Maestros | 1 | 60-80 | 1 |
| 3. Requerimientos | 3 | 120-150 | 2 |
| 4. Contrataciones | 3 | 120-150 | 2 |
| 5. Cotizaciones | 3 | 120-150 | 2 |
| 6. CCP & Cuadro | 2 | 80-100 | 1 |
| 7. Contratos | 2 | 100-120 | 2 |
| 8. Reportes | 2 | 60-80 | 1 |
| 9. QA | 1 | 80-100 | 1-2 |
| 10. Deploy | 1 | 60-80 | 1 |
| **TOTAL** | **20** | **860-1090** | **1-2 FTE** |

---

## 🛠️ Stack Recomendado

```json
{
  "dependencies": {
    "bootstrap": "^5.3.0",
    "jspdf": "^2.5.1",
    "html2canvas": "^1.4.1",
    "xlsx": "^0.18.5",
    "moment": "^2.29.4",
    "chart.js": "^3.9.1"
  },
  "devDependencies": {
    "webpack": "^5.88.0",
    "babel": "^7.22.0",
    "jest": "^29.7.0",
    "prettier": "^3.0.0",
    "eslint": "^8.49.0"
  }
}
```

---

## 📁 Archivos a Crear Primero (Orden de Prioridad)

1. `public/index.html` - HTML base
2. `src/index.js` - App entry point
3. `src/styles/main.css` - Estilos globales
4. `src/services/storage/StorageService.js` - Persistencia
5. `src/services/auth/AuthService.js` - Autenticación
6. `src/modules/auth/LoginPage.js` - Login
7. `src/router/Router.js` - Enrutamiento
8. `src/components/base/Input.js` - Componente base
9. `src/components/common/Toast.js` - Notificaciones
10. `src/services/entities/UserService.js` - CRUD usuarios

---

## 🎬 Comando de Inicio

```bash
# Setup proyecto
npm init -y
npm install

# Dev server (si usas webpack)
npm run dev

# Build
npm run build

# Tests
npm test

# Deploy
npm run deploy
```

---

## 📞 Contactos & Recursos

- **Ley N° 32069**: Marco legal base
- **SIGAMEF**: Catálogo de items (mock data)
- **SUNAT**: Validación RUC (simulada)
- **Bootstrap 5**: https://getbootstrap.com/
- **jsPDF**: https://github.com/parallax/jsPDF
- **SheetJS**: https://sheetjs.com/

---

**¡Listo para empezar! Comienza con el IMPLEMENTATION_PLAN.md completo.**
