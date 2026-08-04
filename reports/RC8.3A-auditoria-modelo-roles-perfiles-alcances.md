# RC8.3A — AUDITORÍA DEL MODELO DE ROLES, PERFILES Y ALCANCES DE USUARIOS

**Fecha:** 2026-08-03 | **Versión:** 1.0 | **Tipo:** Diagnóstico (solo lectura)

> ⚠️ RESTRICCIÓN: Este documento es solo diagnóstico. No se ha modificado ningún archivo, no se ha ejecutado ningún commit, push, ni migración. Todas las consultas han sido de solo lectura sobre el código fuente.

---

# 1. ESQUEMA ACTUAL

## 1.1 Tablas relacionadas con usuarios, roles, permisos, áreas, centros y alcances

### Tabla `usuarios` (principal)

Creada inicialmente con columnas base (`id`, `dni`, `username`, `password_hash`, `activo`, etc.) y extendida por migraciones 007, 008, 010, y 036. Columnas relevantes para esta auditoría:

| Columna | Tipo | Origen | Descripción |
|---|---|---|---|
| `id` | SERIAL PK | schema.sql | Identificador único |
| `dni` | VARCHAR UNIQUE | schema.sql | Documento de identidad (también usado como login) |
| `username` | VARCHAR | schema.sql | Nombre de usuario para login |
| `apellidos` | VARCHAR(150) | 007 | Apellidos del usuario |
| `nombres` | VARCHAR(150) | 007 | Nombres del usuario |
| `nombre` | VARCHAR | - | Nombre completo concatenado |
| `email` | VARCHAR | - | Correo electrónico |
| `telefono` | VARCHAR(30) | 007 | Teléfono |
| **`cargo`** | **VARCHAR(150)** | **007** | **Cargo/puesto laboral (texto libre, no catálogo)** |
| **`rol`** | **VARCHAR** | **schema.sql** | **Rol de sistema: `admin`, `au`, `dec`, `usuario`** |
| `password_hash` | VARCHAR | 010 | Hash bcrypt de la contraseña |
| `activo` | BOOLEAN | - | Si el usuario está activo |
| `area_id` | INTEGER FK→areas | 007 | Área a la que pertenece |
| `codigo_centro_costo` | VARCHAR(50) | 007 | Código de centro de costo |
| `descripcion_area` | VARCHAR(250) | 007 | Descripción textual del área |
| `centro` | VARCHAR(30) | 008 | Abreviatura del centro (GG, OCI, OA, etc.) |
| **`permisos`** | **JSONB** | **007** | **Permisos granulares: `{"modulos":[],"submodulos":[],"actividades":[],"actividadesPorSubmodulo":{}}`** |
| **`alcance_datos`** | **VARCHAR(40)** | **036** | **Tipo de alcance: `CENTRO_COSTO`, `CENTRO`, `PERSONALIZADO`, `INSTITUCIONAL`, NULL** |
| `auditoria` | JSONB | 007 | Historial de cambios del usuario |
| `usuario_creacion` | VARCHAR(100) | 007 | Quién lo creó |
| `usuario_modificacion` | VARCHAR(100) | 007 | Último modificador |
| `debe_cambiar_password` | BOOLEAN | 010 | Forzar cambio de contraseña |
| `created_at` | TIMESTAMP | - | Fecha de creación |
| `updated_at` | TIMESTAMP | - | Fecha de modificación |

**NOTA:** No existe tabla `perfiles`, `roles`, `permisos` (como entidad separada), ni `asignaciones_expediente`. El `rol` es un VARCHAR directo en la tabla `usuarios`. Los `permisos` están almacenados como JSONB en la misma fila del usuario.

### Tabla `usuarios_alcance_asignaciones` (migración 036)

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | SERIAL PK | Identificador |
| `usuario_id` | INTEGER FK→usuarios | Usuario asignado |
| `tipo` | VARCHAR(20) CHECK ('CENTRO','CENTRO_COSTO') | Tipo de alcance |
| `centro_id` | INTEGER FK→centros | Centro asignado (si tipo=CENTRO) |
| `area_id` | INTEGER FK→areas | Área asignada (si tipo=CENTRO_COSTO) |
| `codigo_centro_costo` | VARCHAR(50) | Código de CC explícito |
| `vigente` | BOOLEAN DEFAULT TRUE | Si está vigente |
| `vigente_desde` / `vigente_hasta` | DATE | Rango de vigencia |
| `created_by` | VARCHAR(150) | Quién lo asignó |
| `observacion` | TEXT | Nota explicativa |

### Tablas de soporte: `areas` y `centros`

- **`centros`**: `id`, `codigo`, `nombre` (creados en migración 003)
- **`areas`**: `id`, `codigo`, `nombre`, `responsable`, `centro_id` FK→centros

### 1.2 Valores reales de `usuarios.rol`

Según el seed de `server/migrate.js` (línea 12-16) y el código de formulario:

| Valor | Etiqueta UI | Uso observado |
|---|---|---|
| `admin` | Admin | Superusuario. Todos los permisos. Acceso institucional. Requerido para gestionar usuarios. |
| `au` | AU | Área Usuaria. Módulos REQUERIMIENTOS + EJECUCION. Alcance por centro de costo. |
| `dec` | DEC | Dirección de Contrataciones. Módulos CONTRATACIONES + EJECUCION. Alcance transversal. |
| `usuario` | Usuario | Rol mínimo. Solo actividad VER. Sin módulos asignados por defecto. |

### 1.3 Valores únicos de `cargo`

El campo `cargo` es **texto libre** (VARCHAR 150). No existe tabla catálogo de cargos. No se pudo consultar la base de datos para extraer valores reales (solo lectura de código fuente). Lo que el código revela es que los cargos se infieren por **coincidencia de texto normalizada**:

- **Coordinador CM**: Se detecta por patrones regex como `/coordinacion\s*cm/`, `/coordinador.*\bcm\b/`, etc. (`shared/cuadroComparativoRol.js` línea 60-68)
- **DEC**: Se detecta por `/\bdec\b/`, `/jefe\s+dec/`, etc. (línea 70-78)
- **CCP**: Se detecta por `/\bccp\b/`, `/comite.*compras/` (línea 81-85)
- **Director/Coordinador de centro**: Se detecta por `/director/`, `/gerente/`, `/coordinador\s*administrativ/` (`server/lib/userDataScope.js` línea 109-120)
- **Almacén**: Se detecta por `/almacen/`, `/almacenero/` (línea 102-104)
- **Analista de compras/contrataciones**: `/analista.*compra/`, `/analista.*contrat/` (línea 88-89)

**Problema crítico detectado:** El sistema infiere roles operativos (Coordinador CM, DEC, CCP, Analista) a partir del texto del campo `cargo` usando expresiones regulares. Esto es frágil y mezcla dos conceptos distintos: el rol de seguridad (admin/au/dec/usuario) y la función operativa (Coordinador CM, Analista CM, etc.).

---

# 2. FORMULARIO ACTUAL

## 2.1 Ruta del archivo del modal/componente

**Archivo principal:** `src/views/registroDatos/usuariosPermisosView.js`

- **Modal de Nuevo Usuario:** Línea 351-613 (`openForm(null)`)
- **Modal de Edición:** Misma función `openForm(id)` 
- **Tabla de listado:** `renderUsuariosPermisosView()` línea 124-160
- **Endpoint de creación:** `POST /api/usuarios` (definido en `server/routes/usuarios.js` línea 352)
- **Endpoint de edición:** `PUT /api/usuarios/:id` (línea 408)
- **Servicio cliente:** `src/services/usuariosService.js` (referenciado en vista)

## 2.2 Opciones del select de Rol sistema (línea 404-409)

```javascript
<select class="form-select form-select-sm" id="fRol">
  <option value="usuario" ${u.rol === 'usuario' ? 'selected' : ''}>Usuario</option>
  <option value="au" ${u.rol === 'au' ? 'selected' : ''}>AU</option>
  <option value="dec" ${u.rol === 'dec' ? 'selected' : ''}>DEC</option>
  <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Admin</option>
</select>
```

**Los valores están fijos y hardcodeados.** No se obtienen de un catálogo dinámico. Las etiquetas son: "Usuario", "AU", "DEC", "Admin".

## 2.3 Servicio/API y validaciones backend

### POST /api/usuarios (creación) — `server/routes/usuarios.js` líneas 352-405

Validaciones backend obligatorias:
1. `b.dni` requerido
2. `username` requerido (login)
3. `b.email` requerido
4. `b.nombres` y `b.apellidos` requeridos
5. `b.cargo` requerido
6. `b.descripcion_area` o `b.descripcionArea` o `b.idArea` requerido
7. `tempPassword` requerido (contraseña temporal)
8. `permisos`: se normalizan con `normalizePermisos(b.permisos, b.rol || 'usuario', { explicit: true })`
9. No hay validación sobre los valores permitidos de `rol` (se acepta cualquier string)

### PUT /api/usuarios/:id (edición) — líneas 408-448

Se actualizan todos los campos. `rol` usa `COALESCE($10, rol)` — si se envía el campo se reemplaza.

### Importación masiva — POST /api/usuarios/import (líneas 182-259)

También usa `row.rol || 'usuario'` como fallback.

## 2.4 Confirmación: valores fijos

**Sí**, los cuatro valores ("Usuario", "AU", "DEC", "Admin") están fijos tanto en el frontend (HTML hardcodeado) como en el seed de la base de datos (`server/migrate.js` líneas 13-15). No representan los actores reales del flujo funcional del SGC.

---

# 3. USO DEL ROL EN EL CÓDIGO

## 3.1 Clasificación de comparaciones de `rol` por archivo

### A) Frontend (src/)

| Archivo | Línea(s) | Uso |
|---|---|---|
| `src/views/registroDatos/usuariosPermisosView.js` | 15-16, 197, 352, 404-409, 511-522 | Mapeo de etiquetas (`fmtRol`), select fijo con 4 valores, aplicación de permisos predeterminados al cambiar rol |
| `src/utils/permissionsCatalog.js` | 102-103, 106-109, 125-134, 154-172 | `resolveUserPermissions`: si `rol === 'admin'` → allPermisos. `permisosFromRol`: plantillas para `au`, `dec`, `usuario` |
| `src/services/permissionsService.js` | Varias | `u?.rol === 'admin'` → acceso total. Múltiples checks de permisos. |
| `src/services/menuService.js` | 2 refs | `u.rol === 'admin'` → menú completo |
| `src/services/authService.js` | 2 refs | `user.rol === role`, `roles.includes(user.rol)` |
| `src/utils/actosModals.js` | 1 ref | `user?.rol === 'admin'` |
| `src/utils/cuadroComparativoModal.js` | 1 ref | Envía `rol_derivacion` en headers |
| `src/utils/cuadroComparativoCoordModal.js` | 1 ref | Envía `x-user-rol` en headers |
| `src/views/loginView.js` | 2 refs | Normalización de permisos al iniciar sesión |
| `src/services/apiService.js` | 1 ref | Envía `x-user-rol` en headers |

### B) Backend (server/)

| Archivo | Línea(s) | Uso | Riesgo |
|---|---|---|---|
| **`server/middleware/requireAuth.js`** | 13, 16 | Carga `rol` del usuario en `req.user` | Medio |
| **`server/routes/usuarios.js`** | 18-20, 32, 80-86, 182-259, 326-336, 352-405, 408-448 | CRUD completo. `requireAdmin` verifica `rol !== 'admin'`. Creación/edición acepta cualquier string en `rol`. | **Alto** |
| **`server/lib/permissionsCatalog.js`** | 100-110, 119-151 | `resolveUserPermissions`: si `rol === 'admin'` → allPermisos. `permisosFromRol`: plantillas para `au`, `dec`, `usuario`. | **Alto** |
| **`server/lib/userDataScope.js`** | 69-107, 218-339 | `isAdminRol`, `isRolTransversalFlujo`: decide si un usuario tiene alcance institucional o transversal. | **Alto** |
| **`server/lib/cuadroComparativo.js`** | Varias | `rolReal === 'ADMINISTRADOR'`, `tr.rol`, validación de transiciones | Medio |
| **`shared/cuadroComparativoRol.js`** | 55-58, 87-123, 148-176 | `isRolSistemaAdmin`, `resolveRolRevision`: infiere rol operativo desde `rol`+`cargo`+`permisos`. | **Alto** |
| **`server/lib/recepcionBienes.js`** | Varias | `resolveRolActor`: mapea rol a actor de bandeja (ALMACEN, AREA_USUARIA, COORDINADOR_CM). Filtros por centro. | Medio |
| **`server/lib/recepcionBienesAlcance.js`** | `isRolTransversalFlujo`, checks de rol | Control de acceso en recepción de bienes | Medio |
| **`server/lib/recepcionActaVisada.js`** | `resolveRolActor` | Control de visado de actas | Bajo |
| **`server/routes/ccp.js`** | `assertRolCcp` | Validación de rol para operaciones CCP | Bajo |
| **`server/routes/ordenesContratacion.js`** | `assertRol` | Validación de rol para órdenes | Bajo |
| **`server/routes/auth.js`** | Normalización de permisos en login | Carga `row.rol` en la sesión | Medio |
| **`server/routes/portal.js`** | Filtrado de bandeja por rol | Portal de proveedores | Bajo |
| **`server/routes/recepcionBienes.js`** | Resolución de actor | Bandejas de recepción | Medio |
| **`server/routes/workflow.js`** | `actor_rol` | Trazabilidad de eventos | Bajo |
| **`server/lib/workflow/*.js`** | `actor_rol`, validación de permisos | Motor de workflow | Medio |
| **`server/lib/validacionesCotizacion.js`** | `u.rol`, `normalizePermisos` | Listado de usuarios para derivación | Medio |
| **`server/lib/actosPreparatorios.js`** | `u.rol`, `normalizePermisos` | Listado de usuarios para actos preparatorios | Medio |
| **`server/lib/ccpCertificacion.js`** | `rol` como string en registros | Auditoría de CCP | Bajo |
| **`server/lib/ordenesContratacion.js`** | `rol` como string en eventos | Auditoría de órdenes | Bajo |
| **`server/lib/trazabilidad.js`** | `rol` en consultas | Historial de trazabilidad | Bajo |
| **`server/migrate.js`** | 13-16, 161-172 | Seed de usuarios por defecto con 3 roles fijos | Medio |

## 3.2 Tabla resumen de valores de rol y su impacto

| Valor de rol | Módulos/Archivos donde se usa | Alcance concedido | Riesgo |
|---|---|---|---|
| **`admin`** | ~25 archivos (todos los guards de permisos, middleware, menú, alcance) | **INSTITUCIONAL**: todos los módulos, submódulos, actividades, centros, CC. Sin restricción de alcance. Puede gestionar usuarios. | **Alto** (cualquier cambio rompe todo el sistema de administración) |
| **`au`** | `permissionsCatalog.js` (FE+BE), `userDataScope.js`, `recepcionBienes.js` | **CENTRO_COSTO**: REQUERIMIENTOS + EJECUCION. Filtrado por área/centro de costo asignado. | **Alto** (cambiar este valor rompe el acceso de todas las áreas usuarias) |
| **`dec`** | `permissionsCatalog.js` (FE+BE), `userDataScope.js`, `recepcionBienes.js`, `cuadroComparativoRol.js`, `cuadroComparativo.js` | **TRANSVERSAL_FLUJO**: CONTRATACIONES (todos los submódulos) + EJECUCION. Sin filtro por centro. | **Alto** (todo el flujo de Contrataciones depende de este rol; además se usa para inferir rol operativo DEC) |
| **`usuario`** | `permissionsCatalog.js` (FE+BE), formulario | **MÍNIMO**: Solo actividad VER. Sin módulos asignados. | **Bajo** |

## 3.3 Evaluación de impacto al cambiar/ampliar valores

**Conclusión:** Cambiar o ampliar los valores de `usuarios.rol` **rompería la lógica existente** de forma generalizada porque:

1. **Comparaciones de igualdad exacta**: Hay al menos 60+ comparaciones del tipo `rol === 'admin'`, `rol === 'au'`, `rol === 'dec'` distribuidas en ~25 archivos tanto frontend como backend.
2. **Plantillas de permisos**: `permisosFromRol()` usa switch exacto sobre los strings 'admin', 'au', 'dec'. Cualquier valor nuevo caería en el caso `else` (sin módulos).
3. **Resolución de alcance**: `isRolTransversalFlujo()` en `userDataScope.js` verifica `['dec', 'cm', 'almacen', 'analista', 'ccp'].includes(rol)`. El valor 'cm' y 'almacen' no existen como `usuarios.rol` hoy, pero el código los contempla.
4. **Middleware de admin**: `requireAdmin` en `server/routes/usuarios.js` verifica `rows[0].rol !== 'admin'`.
5. **Inferencia de rol operativo**: `shared/cuadroComparativoRol.js` infiere el rol de revisión (ANALISTA / COORDINADOR_CM / DEC / CCP / ADMINISTRADOR) principalmente del campo `cargo`, no del `rol`.

**Estrategia de desacoplamiento requerida**: Antes de cualquier cambio, se debe centralizar la lógica de roles en una capa de abstracción (helper/guards) para que los strings concretos no estén dispersos por todo el código.

---

# 4. COMPARATIVA CON MODELO FUNCIONAL

## 4.1 Clasificación de actores funcionales

| Actor funcional | Rol seguridad actual | Perfil funcional que debería tener | Alcance organizacional | ¿Asignación dinámica? |
|---|---|---|---|---|
| **Director / Gerente** | `au` (inferido de cargo) | Director de Centro | **CENTRO**: Todos los CC de su centro | No |
| **Coordinador Administrativo** | `au` | Coordinador Adm de Centro | **CENTRO**: Todos los CC de su centro | No |
| **Analista AU** | `au` | Analista de Área Usuaria | **CENTRO_COSTO**: Solo su área/CC | No |
| **DEC** | `dec` | Jefe/Especialista DEC (o bien Director DEC) | **TRANSVERSAL**: Ve todos los expedientes en etapa DEC | No |
| **Programación** | `dec` (inferido de cargo) | Analista de Programación | **TRANSVERSAL**: Módulo Programación | No |
| **Coordinador CM** | `dec` (inferido de cargo "Coordinador" + "CM") | Coordinador de Contratos Menores | **TRANSVERSAL**: Módulo Coordinación CM | No |
| **Analista CM** | `dec` (inferido de cargo "Analista") | Analista de Contratos Menores | **TRANSVERSAL** + **Asignación por expediente**: Solo opera expedientes asignados por Coordinación CM | **Sí** (por expediente) |
| **Coordinador Almacén** | No existe rol explícito | Coordinador de Almacén | **TRANSVERSAL**: Módulo Almacén / Recepción de Bienes | No |
| **Analista Almacén** | No existe rol explícito | Analista de Almacén | **TRANSVERSAL**: Módulo Almacén | No |
| **Coordinador Ejecución** | `au` (inferido) / `dec` (inferido) | Coordinador de Ejecución Contractual | **TRANSVERSAL**: Módulo Ejecución | **Sí** (por expediente) |
| **Analista Ejecución** | `au` (inferido) / `dec` (inferido) | Analista de Ejecución Contractual | **TRANSVERSAL**: Módulo Ejecución | **Sí** (por expediente) |
| **Administrador** | `admin` | Administrador del Sistema | **INSTITUCIONAL**: Todo | No |

## 4.2 Problemas específicos detectados

1. **Sobrecarga del valor `dec`**: El rol `dec` agrupa a: DEC (Dirección), Programación, Coordinador CM, Analista CM, y potencialmente Coordinador/Analista de Ejecución. Todos comparten el mismo rol de seguridad pero tienen funciones y alcances muy distintos.

2. **Sobrecarga del valor `au`**: Agrupa a: Director/Gerente, Coordinador Adm, Analista AU, Coordinador Ejecución, Analista Ejecución. El alcance debería variar entre CENTRO (director) y CENTRO_COSTO (analista).

3. **Rol 'cm' referenciado pero no implementado**: `userDataScope.js` línea 79 verifica `['dec', 'cm', 'almacen', 'analista', 'ccp'].includes(rol)` y `rol === 'cm'`. El valor `'cm'` nunca se asigna como `usuarios.rol` porque el formulario no lo ofrece.

4. **Rol 'almacen' referenciado pero no implementado**: Similar al punto anterior. El código de `recepcionBienes.js` y `recepcionActaVisada.js` maneja `rol === 'almacen'`, pero el formulario no lo ofrece.

5. **Inferencia frágil por cargo**: El sistema determina el rol operativo (Coordinador CM, DEC, CCP, Almacén) mediante regex sobre el texto libre del campo `cargo`. Si un usuario escribe "Especialista en Compras" en lugar de "Analista de Contrataciones", la inferencia falla.

## 4.3 Ejemplo de jcrisostomo

Un usuario cuyo `cargo` contenga "Coordinador" y "CM" será inferido como `COORDINADOR_CM` por el sistema (ver `esCargoCoordinadorCm()` en `shared/cuadroComparativoRol.js` línea 60-68). Este usuario, con `rol = 'dec'`, tendrá:
- Permisos de módulo CONTRATACIONES + EJECUCION (por el rol `dec`)
- Rol operativo `COORDINADOR_CM` en el Cuadro Comparativo (por inferencia del cargo)
- Alcance TRANSVERSAL (por ser `dec` → `isRolTransversalFlujo` = true)
- Visibilidad de las bandejas de Coordinador CM

Pero NO tendrá el rol de Analista CM (que también es `dec` pero con cargo "Analista") ni podrá ver expedientes asignados a otros analistas.

---

# 5. MODELO OBJETIVO RECOMENDADO

## 5.1 Principios de diseño

**Separación estricta de conceptos:**

| Concepto | Dónde se almacena hoy | Dónde debería almacenarse |
|---|---|---|
| **A. Rol de seguridad** | `usuarios.rol` (4 valores mezclados) | `usuarios.rol`: solo `ADMIN` / `USUARIO` |
| **B. Perfil funcional** | Inferido de `usuarios.cargo` (regex frágil) | Tabla `perfiles_funcionales` con relación N:M a `usuarios` |
| **C. Permisos de módulos/submódulos** | `usuarios.permisos` (JSONB por usuario) | Asignados a `perfiles_funcionales` (herencia) + override por usuario |
| **D. Alcance organizacional** | `usuarios.alcance_datos` + `usuarios_alcance_asignaciones` | Se mantiene pero vinculado al perfil funcional |
| **E. Asignación dinámica por expediente** | No existe | Nueva tabla `expediente_asignaciones` |

## 5.2 Estructura de datos propuesta

### Tabla `usuarios` (modificada)

```
usuarios
  id SERIAL PK
  dni VARCHAR UNIQUE
  username VARCHAR UNIQUE
  apellidos VARCHAR(150)
  nombres VARCHAR(150)
  email VARCHAR
  telefono VARCHAR(30)
  rol VARCHAR(20) NOT NULL DEFAULT 'USUARIO'  -- SOLO 'ADMIN' | 'USUARIO'
  activo BOOLEAN DEFAULT TRUE
  area_id INTEGER FK → areas
  codigo_centro_costo VARCHAR(50)
  descripcion_area VARCHAR(250)
  centro VARCHAR(30)
  alcance_datos VARCHAR(40)  -- se mantiene: CENTRO_COSTO | CENTRO | PERSONALIZADO | INSTITUCIONAL
  debe_cambiar_password BOOLEAN
  password_hash VARCHAR
  auditoria JSONB DEFAULT '[]'
  usuario_creacion VARCHAR(100)
  usuario_modificacion VARCHAR(100)
  created_at TIMESTAMP
  updated_at TIMESTAMP
```

**Cambio clave:** `usuarios.rol` se reduce a 2 valores: `ADMIN` y `USUARIO`. Todo lo demás se gestiona vía perfiles funcionales y permisos.

### Nueva tabla `perfiles_funcionales`

```sql
CREATE TABLE perfiles_funcionales (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,   -- DIRECTOR_CENTRO, COORDINADOR_ADM, ANALISTA_AU, DEC, COORDINADOR_CM, ANALISTA_CM, COORD_ALMACEN, ANALISTA_ALMACEN, COORD_EJECUCION, ANALISTA_EJECUCION, PROGRAMACION, ADMINISTRADOR
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  alcance_default VARCHAR(40) NOT NULL DEFAULT 'CENTRO_COSTO',
  es_transversal BOOLEAN DEFAULT FALSE,
  requiere_asignacion_expediente BOOLEAN DEFAULT FALSE,
  activo BOOLEAN DEFAULT TRUE,
  permisos JSONB DEFAULT '{"modulos":[],"submodulos":[],"actividades":[],"actividadesPorSubmodulo":{}}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Nueva tabla `usuario_perfiles` (N:M)

```sql
CREATE TABLE usuario_perfiles (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id INTEGER NOT NULL REFERENCES perfiles_funcionales(id) ON DELETE CASCADE,
  vigente BOOLEAN DEFAULT TRUE,
  vigente_desde DATE,
  vigente_hasta DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(150),
  UNIQUE(usuario_id, perfil_id)
);
```

### Nueva tabla `expediente_asignaciones` (asignación dinámica)

```sql
CREATE TABLE expediente_asignaciones (
  id SERIAL PRIMARY KEY,
  expediente_id INTEGER NOT NULL,  -- o requerimiento_id / cotizacion_id
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id INTEGER REFERENCES perfiles_funcionales(id),
  rol_operativo VARCHAR(40) NOT NULL,  -- ANALISTA_CM, ANALISTA_EJECUCION, etc.
  asignado_por INTEGER REFERENCES usuarios(id),
  vigente BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  observacion TEXT
);
CREATE INDEX idx_exp_asig_usuario ON expediente_asignaciones(usuario_id) WHERE vigente = TRUE;
CREATE INDEX idx_exp_asig_expediente ON expediente_asignaciones(expediente_id) WHERE vigente = TRUE;
```

## 5.3 Perfiles funcionales propuestos

| Código | Nombre | Alcance default | Transversal | Asignación por expediente | Permisos base (módulos) |
|---|---|---|---|---|---|
| `ADMINISTRADOR` | Administrador del Sistema | INSTITUCIONAL | Sí | No | Todos |
| `DIRECTOR_CENTRO` | Director / Gerente de Centro | CENTRO | No | No | REQUERIMIENTOS, EJECUCION |
| `COORDINADOR_ADM` | Coordinador Administrativo | CENTRO | No | No | REQUERIMIENTOS, EJECUCION |
| `ANALISTA_AU` | Analista de Área Usuaria | CENTRO_COSTO | No | No | REQUERIMIENTOS, EJECUCION |
| `DEC` | Director/Jefe DEC | TRANSVERSAL | Sí | No | CONTRATACIONES, EJECUCION |
| `PROGRAMACION` | Analista de Programación | TRANSVERSAL | Sí | No | CONTRATACIONES (PROGRAMACION) |
| `COORDINADOR_CM` | Coordinador de Contratos Menores | TRANSVERSAL | Sí | No | CONTRATACIONES (ACTOS_PREP, INVITACIONES, CUADRO_COMP, CCP) |
| `ANALISTA_CM` | Analista de Contratos Menores | TRANSVERSAL | Sí | **Sí** | CONTRATACIONES (ACTOS_PREP, INVITACIONES, CUADRO_COMP) |
| `COORD_ALMACEN` | Coordinador de Almacén | TRANSVERSAL | Sí | No | EJECUCION (RECEPCION_BIENES, ALMACEN) |
| `ANALISTA_ALMACEN` | Analista de Almacén | TRANSVERSAL | Sí | No | EJECUCION (RECEPCION_BIENES, ALMACEN) |
| `COORD_EJECUCION` | Coordinador de Ejecución | TRANSVERSAL | Sí | **Sí** | EJECUCION |
| `ANALISTA_EJECUCION` | Analista de Ejecución | TRANSVERSAL | Sí | **Sí** | EJECUCION |

## 5.4 Decisión sobre el JSON de permisos

**Recomendación: Reutilizar el JSON actual de permisos (`usuarios.permisos`) pero con herencia de perfiles.**

- El formato `{"modulos":[],"submodulos":[],"actividades":[],"actividadesPorSubmodulo":{}}` es adecuado y ya está implementado tanto en frontend como backend.
- Los permisos se definen **por perfil funcional** (campo `permisos` en `perfiles_funcionales`).
- `usuarios.permisos` se mantiene para **overrides individuales** (añadir/quitar permisos específicos a un usuario).
- Permiso efectivo = permisos del perfil ⊕ overrides del usuario.
- El Administrador (`usuarios.rol = 'ADMIN'`) tiene todos los permisos siempre (como hoy).

## 5.5 Diagrama ER (descripción textual)

```
┌──────────────┐       ┌─────────────────────┐       ┌──────────────────────┐
│   usuarios   │       │  usuario_perfiles   │       │  perfiles_funcionales│
├──────────────┤       ├─────────────────────┤       ├──────────────────────┤
│ id (PK)      │──1:N──│ id (PK)             │──N:1──│ id (PK)              │
│ dni          │       │ usuario_id (FK)     │       │ codigo (UNIQUE)      │
│ rol          │       │ perfil_id (FK)      │       │ nombre               │
│ cargo        │       │ vigente             │       │ alcance_default      │
│ area_id (FK) │       │ vigente_desde       │       │ es_transversal       │
│ alcance_datos│       │ vigente_hasta       │       │ req_asig_expediente  │
│ permisos JSON│       │ created_by          │       │ permisos JSONB       │
└──────────────┘       └─────────────────────┘       └──────────────────────┘
       │
       │ 1:N
       ▼
┌───────────────────────┐
│ expediente_asignaciones│
├───────────────────────┤
│ id (PK)               │
│ expediente_id         │
│ usuario_id (FK)       │
│ perfil_id (FK)        │
│ rol_operativo         │
│ asignado_por (FK)     │
│ vigente               │
└───────────────────────┘

Tablas existentes que se mantienen:
┌──────────────────────────┐       ┌─────────┐       ┌─────────┐
│ usuarios_alcance_asig    │       │  areas  │       │ centros │
├──────────────────────────┤       ├─────────┤       ├─────────┤
│ usuario_id (FK)          │       │ id (PK) │       │ id (PK) │
│ tipo (CENTRO/CENTRO_COSTO)│      │ codigo  │       │ codigo  │
│ centro_id (FK)           │       │ nombre  │       │ nombre  │
│ area_id (FK)             │       │ centro_id│      └─────────┘
└──────────────────────────┘       └─────────┘
```

---

# 6. ESTRATEGIA DE MIGRACIÓN GRADUAL

## Fase 1: Mantener valores legacy, cambiar etiquetas visuales, centralizar aliases

**Objetivo:** No romper nada. Preparar el terreno para la separación.

### Paso 1.1 — Crear helper centralizado de roles
**Archivo nuevo:** `shared/securityRoles.js`

```javascript
// Única fuente de verdad para roles de sistema
export const SYSTEM_ROLES = Object.freeze({
  ADMIN: 'admin',
  AU: 'au',
  DEC: 'dec',
  USUARIO: 'usuario',
});

export const ROLE_LABELS = Object.freeze({
  [SYSTEM_ROLES.ADMIN]: 'Administrador',
  [SYSTEM_ROLES.AU]: 'Área Usuaria',
  [SYSTEM_ROLES.DEC]: 'Contrataciones',
  [SYSTEM_ROLES.USUARIO]: 'Usuario Básico',
});

export function isAdmin(rol) { return rol === SYSTEM_ROLES.ADMIN; }
export function isAu(rol) { return rol === SYSTEM_ROLES.AU; }
export function isDec(rol) { return rol === SYSTEM_ROLES.DEC; }
```

### Paso 1.2 — Reemplazar etiquetas en formulario
En `src/views/registroDatos/usuariosPermisosView.js`:
- Cambiar etiquetas visuales: "AU" → "Área Usuaria", "DEC" → "Contrataciones"
- Mantener los mismos valores (`au`, `dec`, `admin`, `usuario`)
- Agregar tooltip explicativo: "El rol determina los módulos base. Las funciones específicas se configuran en Accesos."

### Paso 1.3 — Refactorizar comparaciones de rol
En todos los archivos, reemplazar comparaciones literales (`rol === 'admin'`) por funciones del helper `isAdmin(rol)`, `isAu(rol)`, `isDec(rol)`.

**Dependencias:** Ninguna. Se puede hacer en paralelo con el resto del desarrollo.

**Archivos afectados:** ~25 archivos listados en la sección 3.

---

## Fase 2: Agregar perfiles funcionales y mapear usuarios actuales

**Objetivo:** Introducir la tabla `perfiles_funcionales` y `usuario_perfiles` sin romper el comportamiento actual.

### Paso 2.1 — Crear tablas nuevas (migración)
- Crear `perfiles_funcionales` con seed de 12 perfiles.
- Crear `usuario_perfiles`.
- Ambas tablas sin impacto en código existente (solo existen, no se consultan aún).

### Paso 2.2 — Mapeo automático de usuarios actuales a perfiles
Script de migración de datos (no ejecutar, solo planificar):

```sql
-- Mapeo por rol + cargo
INSERT INTO usuario_perfiles (usuario_id, perfil_id, created_by)
SELECT u.id, pf.id, 'migracion_fase2'
FROM usuarios u
JOIN perfiles_funcionales pf ON (
  -- admin → ADMINISTRADOR
  (u.rol = 'admin' AND pf.codigo = 'ADMINISTRADOR')
  -- au + cargo Director/Gerente → DIRECTOR_CENTRO
  OR (u.rol = 'au' AND pf.codigo = 'DIRECTOR_CENTRO' AND u.cargo ~* '(director|gerente)')
  -- au + cargo Coordinador Adm → COORDINADOR_ADM
  OR (u.rol = 'au' AND pf.codigo = 'COORDINADOR_ADM' AND u.cargo ~* 'coordinador\s+administrativ')
  -- au default → ANALISTA_AU
  OR (u.rol = 'au' AND pf.codigo = 'ANALISTA_AU' AND u.cargo !~* '(director|gerente|coordinador)')
  -- dec + cargo DEC → DEC
  OR (u.rol = 'dec' AND pf.codigo = 'DEC' AND u.cargo ~* '\bdec\b')
  -- dec + cargo Coordinador + CM → COORDINADOR_CM
  OR (u.rol = 'dec' AND pf.codigo = 'COORDINADOR_CM' AND u.cargo ~* 'coordinador.*cm')
  -- dec + cargo Programación → PROGRAMACION
  OR (u.rol = 'dec' AND pf.codigo = 'PROGRAMACION' AND u.cargo ~* 'programacion')
  -- dec + cargo Analista → ANALISTA_CM
  OR (u.rol = 'dec' AND pf.codigo = 'ANALISTA_CM' AND u.cargo ~* 'analista')
  -- dec default → ANALISTA_CM
  OR (u.rol = 'dec' AND pf.codigo = 'ANALISTA_CM' AND u.cargo !~* '(dec|coordinador|programacion)')
)
WHERE u.activo = TRUE;
```

### Paso 2.3 — Adaptar `resolveRolRevision` y `isRolTransversalFlujo`
Modificar estas funciones para que **primero consulten perfiles funcionales** (si existen) y usen la inferencia por cargo como fallback.

**Dependencias:** Fase 1 completada (helpers centralizados).

---

## Fase 3: Eliminar inferencias por cargo/nombre y desactivar roles obsoletos

**Objetivo:** Los perfiles funcionales son la única fuente de verdad. Los roles `au` y `dec` se desactivan gradualmente.

### Paso 3.1 — Agregar columna `usuarios.rol_nuevo` (o reutilizar `rol`)
En este punto, todos los usuarios tienen:
- `usuarios.rol` = `admin` o `usuario` (se migran los `au`/`dec` a `usuario`)
- `usuario_perfiles` con sus perfiles funcionales asignados
- `usuarios.permisos` con permisos heredados de sus perfiles

### Paso 3.2 — Remover referencias a roles legacy
- Eliminar casos `'au'` y `'dec'` de `permisosFromRol()` y `resolveUserPermissions()`.
- Remover las opciones "AU" y "DEC" del formulario de usuario.
- Reemplazar por selector de perfiles funcionales (múltiples checkboxes).

### Paso 3.3 — Crear tabla `expediente_asignaciones`
- Implementar asignación dinámica para Analistas CM y Ejecución.
- UI para que Coordinador CM asigne analistas a expedientes específicos.

**Dependencias:** Fase 2 completada y validada en staging.

---

# 7. RIESGOS Y PRUEBAS SUGERIDAS

## 7.1 Riesgos identificados

| Riesgo | Tipo | Severidad | Mitigación |
|---|---|---|---|
| **Regresión de acceso masiva**: Cambiar la lógica de roles puede bloquear el acceso de usuarios reales a sus módulos | Seguridad/Regresión | **Crítica** | Fase 1 sin cambios de comportamiento. Pruebas de regresión exhaustivas en cada fase. |
| **Inferencia incorrecta en migración**: El mapeo automático por regex de cargo puede asignar perfiles erróneos | Integridad de datos | **Alta** | Script de mapeo con revisión manual. Posibilidad de ajuste por usuario. |
| **Permisos heredados mal resueltos**: La fusión de permisos (perfil ⊕ usuario) puede producir resultados inesperados | Seguridad | **Alta** | Pruebas unitarias del resolver de permisos efectivos para cada combinación. |
| **Rendimiento en consultas**: Agregar JOINs a `usuario_perfiles` y `perfiles_funcionales` puede impactar el rendimiento | Rendimiento | **Media** | Caché de perfiles en sesión (ya se hace con `req.user`). Índices adecuados. |
| **Asignaciones dinámicas sin UI**: La tabla `expediente_asignaciones` requiere nuevas interfaces para Coordinadores | Funcional | **Media** | Planificar los componentes UI en Fase 3. |
| **Doble agencia de permisos**: Durante la transición, los permisos pueden venir del rol legacy Y del perfil nuevo | Integridad | **Media** | Cierre de Fase 3 elimina el path legacy. |

## 7.2 Casos de prueba sugeridos (mínimo 5)

### CP1 — Analista CM solo ve expedientes asignados
**Precondición:**
- Usuario con `rol = 'USUARIO'`, perfil `ANALISTA_CM`
- 3 expedientes en bandeja de Coordinación CM
- Solo 1 asignado a este analista en `expediente_asignaciones`

**Pasos:**
1. Login como el analista CM
2. Navegar a bandeja de Coordinación CM

**Resultado esperado:**
- Solo ve el expediente asignado
- No ve los otros 2 expedientes

### CP2 — Director ve todos los centros de su área
**Precondición:**
- Usuario con perfil `DIRECTOR_CENTRO`, `alcance_datos = 'CENTRO'`
- Centro OA tiene 3 áreas: Administración, Logística, RRHH
- Hay requerimientos en las 3 áreas

**Pasos:**
1. Login como director
2. Navegar a bandeja de Requerimientos (AU)

**Resultado esperado:**
- Ve requerimientos de Administración, Logística y RRHH (todo el centro OA)
- NO ve requerimientos de otros centros (GG, OCI, etc.)

### CP3 — Usuario con dos perfiles (Analista AU + Coordinador CM) tiene ambos alcances
**Precondición:**
- Usuario con 2 perfiles activos: `ANALISTA_AU` (alcance CC: Logística-OA) + `COORDINADOR_CM` (alcance transversal)
- Existen requerimientos en Logística-OA y expedientes en Coordinación CM

**Pasos:**
1. Login como usuario multi-perfil
2. Navegar a bandeja de Requerimientos (AU)
3. Navegar a bandeja de Coordinación CM

**Resultado esperado:**
- En bandeja AU: solo ve requerimientos de Logística-OA (alcance CC)
- En bandeja CM: ve todos los expedientes de Coordinación CM (alcance transversal)
- Los permisos efectivos son la unión de ambos perfiles

### CP4 — Analista de Ejecución ve solo expedientes asignados dinámicamente
**Precondición:**
- Usuario con perfil `ANALISTA_EJECUCION`
- 5 expedientes en fase de Ejecución Contractual
- Asignado a 2 de ellos en `expediente_asignaciones`

**Pasos:**
1. Login como analista de ejecución
2. Navegar a bandeja de Ejecución Contractual

**Resultado esperado:**
- Solo ve los 2 expedientes asignados
- Puede realizar acciones (registrar recepción, etc.) solo en esos 2

### CP5 — Admin mantiene acceso total en todas las fases
**Precondición:**
- Usuario con `rol = 'ADMIN'`, sin perfiles asignados (o con todos)

**Pasos:**
1. Login como admin
2. Navegar por todas las bandejas: Requerimientos, DEC, Programación, Coordinación CM, CCP, Órdenes, Ejecución, Almacén

**Resultado esperado:**
- Ve todos los expedientes de todas las bandejas
- Puede realizar todas las acciones en todos los módulos
- La funcionalidad "Actuar como" (modo prueba) permite simular cualquier perfil

---

# 8. ARCHIVOS POTENCIALMENTE AFECTADOS Y MIGRACIONES

## 8.1 Archivos que cambiarían

### Backend (server/)

| Archivo | Tipo de cambio | Fase |
|---|---|---|
| `server/middleware/requireAuth.js` | Cargar perfiles funcionales en `req.user` | 2 |
| `server/routes/usuarios.js` | Selector de perfiles en CRUD. `requireAdmin` usa `isAdmin()`. | 1-3 |
| `server/routes/auth.js` | Cargar perfiles en sesión. Login response incluye perfiles. | 2 |
| `server/lib/permissionsCatalog.js` | `permisosFromRol` → `permisosFromPerfiles`. `resolveUserPermissions` fusiona perfiles + overrides. | 2-3 |
| `server/lib/userDataScope.js` | `resolveUserDataScope` usa perfiles para determinar alcance transversal. | 2-3 |
| `shared/cuadroComparativoRol.js` | `resolveRolRevision` consulta perfiles primero, cargo como fallback. | 2-3 |
| `server/lib/cuadroComparativo.js` | Adaptar a nuevos roles operativos de perfiles. | 2-3 |
| `server/lib/cuadroComparativoRevision.js` | Transiciones basadas en perfiles, no en strings fijos. | 2-3 |
| `server/lib/recepcionBienes.js` | `resolveRolActor` usa perfiles funcionales. | 2-3 |
| `server/lib/recepcionBienesAlcance.js` | `isRolTransversalFlujo` → consulta perfiles. | 2-3 |
| `server/lib/recepcionActaVisada.js` | Usa perfiles para determinar actor. | 2-3 |
| `server/lib/actosPreparatorios.js` | `listUsuariosPorSubmodulo` filtra por perfil funcional. | 2-3 |
| `server/lib/validacionesCotizacion.js` | `listUsuariosDerivacionValidacion` filtra por perfil. | 2-3 |
| `server/lib/trazabilidad.js` | Registros incluyen `perfil_id` en metadata. | 3 |
| `server/routes/ccp.js` | `assertRolCcp` → `assertPerfilCcp`. | 2-3 |
| `server/routes/ordenesContratacion.js` | Similar adaptación. | 2-3 |
| `server/routes/recepcionBienes.js` | Usa perfiles para autorización. | 2-3 |
| `server/routes/portal.js` | Adaptar filtros de bandeja. | 2-3 |
| `server/routes/workflow.js` | Registro de `actor_perfil` en eventos. | 3 |
| `server/lib/workflow/*.js` | `validarPermiso` usa perfiles. | 2-3 |
| `server/migrate.js` | Seed de perfiles funcionales. | 2 |

### Frontend (src/)

| Archivo | Tipo de cambio | Fase |
|---|---|---|
| `src/views/registroDatos/usuariosPermisosView.js` | Reemplazar select de rol fijo por multi-select de perfiles funcionales. | 2-3 |
| `src/utils/permissionsCatalog.js` | `permisosFromRol` → `permisosFromPerfiles`. `resolveUserPermissions` fusiona perfiles. | 2-3 |
| `src/services/permissionsService.js` | `hasAccess` usa perfiles. | 2-3 |
| `src/services/menuService.js` | Menú basado en perfiles. | 2-3 |
| `src/services/authService.js` | `hasRole` → `hasPerfil`. | 2-3 |
| `src/utils/actosModals.js` | Usa `hasPerfil` en lugar de `rol === 'admin'`. | 2-3 |
| `src/utils/cuadroComparativoModal.js` | Headers incluyen `x-user-perfiles`. | 2-3 |
| `src/utils/cuadroComparativoCoordModal.js` | Adaptación similar. | 2-3 |
| `src/views/loginView.js` | Normalizar permisos desde perfiles. | 2-3 |
| `src/services/apiService.js` | Headers incluyen perfiles. | 2-3 |
| `src/views/contratacion/cuadroComparativoView.js` | Selector de "Actuar como" basado en perfiles. | 3 |

### Componentes nuevos a crear

| Archivo | Descripción | Fase |
|---|---|---|
| `shared/securityRoles.js` | Constantes y helpers centralizados de roles. | 1 |
| `src/components/PerfilesSelector.js` | Componente UI para selección múltiple de perfiles funcionales. | 2 |
| `src/utils/expedienteAsignaciones.js` | Servicio para gestionar asignaciones dinámicas. | 3 |
| `src/views/coordinacion/AsignarAnalistasModal.js` | Modal para que Coordinador CM asigne analistas a expedientes. | 3 |
| `server/lib/perfilesService.js` | Lógica de negocio para resolución de permisos efectivos desde perfiles. | 2 |

## 8.2 Migraciones necesarias (esbozo, sin ejecutar)

### Migración 044 — Tablas de perfiles funcionales

```sql
-- Crear tabla perfiles_funcionales
CREATE TABLE IF NOT EXISTS perfiles_funcionales (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  alcance_default VARCHAR(40) NOT NULL DEFAULT 'CENTRO_COSTO',
  es_transversal BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_asignacion_expediente BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  permisos JSONB DEFAULT '{"modulos":[],"submodulos":[],"actividades":[],"actividadesPorSubmodulo":{}}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed de perfiles
INSERT INTO perfiles_funcionales (codigo, nombre, alcance_default, es_transversal, requiere_asignacion_expediente, permisos) VALUES
('ADMINISTRADOR', 'Administrador del Sistema', 'INSTITUCIONAL', TRUE, FALSE, '{"modulos":["REQUERIMIENTOS","CONTRATACIONES","EJECUCION","MANTENIMIENTO"],"submodulos":[...],"actividades":["VER","CREAR","EDITAR","ELIMINAR","APROBAR","OBSERVAR","DERIVAR","RECHAZAR","EXPORTAR","FIRMAR","DESCARGAR"]}'),
('DIRECTOR_CENTRO', 'Director / Gerente de Centro', 'CENTRO', FALSE, FALSE, '{"modulos":["REQUERIMIENTOS","EJECUCION"],...}'),
-- ... 10 perfiles más
;

-- Crear tabla usuario_perfiles
CREATE TABLE IF NOT EXISTS usuario_perfiles (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id INTEGER NOT NULL REFERENCES perfiles_funcionales(id) ON DELETE CASCADE,
  vigente BOOLEAN NOT NULL DEFAULT TRUE,
  vigente_desde DATE,
  vigente_hasta DATE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(150),
  UNIQUE(usuario_id, perfil_id)
);

CREATE INDEX idx_up_usuario ON usuario_perfiles(usuario_id) WHERE vigente = TRUE;
CREATE INDEX idx_up_perfil ON usuario_perfiles(perfil_id) WHERE vigente = TRUE;
```

### Migración 045 — Tabla de asignaciones dinámicas por expediente

```sql
CREATE TABLE IF NOT EXISTS expediente_asignaciones (
  id SERIAL PRIMARY KEY,
  expediente_id INTEGER NOT NULL,
  tipo_expediente VARCHAR(30) NOT NULL DEFAULT 'REQUERIMIENTO',
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id INTEGER REFERENCES perfiles_funcionales(id),
  rol_operativo VARCHAR(40) NOT NULL,
  asignado_por INTEGER REFERENCES usuarios(id),
  vigente BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  observacion TEXT
);

CREATE INDEX idx_ea_usuario ON expediente_asignaciones(usuario_id) WHERE vigente = TRUE;
CREATE INDEX idx_ea_expediente ON expediente_asignaciones(expediente_id) WHERE vigente = TRUE;
```

### Migración 046 — Agregar columna perfil_id a eventos de trazabilidad (opcional)

```sql
ALTER TABLE orden_eventos ADD COLUMN IF NOT EXISTS perfil_id INTEGER;
ALTER TABLE recepcion_bienes_eventos ADD COLUMN IF NOT EXISTS perfil_id INTEGER;
```

---

# RESUMEN EJECUTIVO

## Situación actual

El sistema SGC **no separa** adecuadamente los conceptos de rol de seguridad, perfil funcional, permisos de módulos y alcance organizacional. Estos cuatro conceptos están fusionados en un solo campo `usuarios.rol` con 4 valores fijos (`admin`, `au`, `dec`, `usuario`) y un campo de texto libre `usuarios.cargo` que se intenta interpretar mediante expresiones regulares.

## Hallazgos críticos

1. **Solo 4 roles de sistema** para ~12 actores funcionales distintos → sobrecarga semántica.
2. **Inferencia por regex del campo `cargo`**: frágil, no auditada, propensa a errores de clasificación.
3. **Ausencia de asignación dinámica por expediente**: Los Analistas CM y de Ejecución no pueden ser acotados a expedientes específicos.
4. **Código disperso**: ~60 comparaciones literales de `rol === 'admin'` en ~25 archivos, sin una capa de abstracción.
5. **Infraestructura parcialmente preparada**: La migración 036 creó `usuarios_alcance_asignaciones` y el campo `alcance_datos`, pero estos no se integran plenamente con la lógica de roles.

## Recomendación principal

**Separar el modelo en 3 capas independientes:**
- **Rol de seguridad** (`usuarios.rol`): Solo `ADMIN` / `USUARIO` (acceso al sistema).
- **Perfiles funcionales** (`perfiles_funcionales` + `usuario_perfiles`): 12 perfiles que definen módulos, submódulos, actividades y alcance.
- **Asignación dinámica** (`expediente_asignaciones`): Acota a usuarios específicos a expedientes concretos.

## Esfuerzo estimado

| Fase | Alcance | Complejidad | Duración estimada |
|---|---|---|---|
| Fase 1 | Centralizar helpers, cambiar etiquetas | Baja | 1-2 días |
| Fase 2 | Crear tablas de perfiles, mapear usuarios | Media-Alta | 5-8 días |
| Fase 3 | Eliminar roles legacy, asignación dinámica | Alta | 8-12 días |

---

**Fin del informe diagnóstico.**