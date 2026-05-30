-- Esquema de base de datos SGC
-- Idempotente: se puede ejecutar varias veces sin error.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============ USUARIOS ============
CREATE TABLE IF NOT EXISTS usuarios (
  id           SERIAL PRIMARY KEY,
  dni          VARCHAR(20) NOT NULL UNIQUE,
  nombre       VARCHAR(150),
  rol          VARCHAR(30) NOT NULL DEFAULT 'usuario',
  email        VARCHAR(150),
  password_hash TEXT,
  activo       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- ============ CATÁLOGO SIGAMEF ============
CREATE TABLE IF NOT EXISTS catalogo_sigamef (
  id                  SERIAL PRIMARY KEY,
  tipo_bien           VARCHAR(10) DEFAULT 'B',
  item_bien           VARCHAR(50),
  nombre_item         TEXT,
  unidad_medida       VARCHAR(60),
  precio_unitario     NUMERIC(14,2) DEFAULT 0,
  ficha_tecnica       BOOLEAN DEFAULT FALSE,
  acuerdo_marco       BOOLEAN DEFAULT FALSE,
  producto_controlado BOOLEAN DEFAULT FALSE,
  ficha_homologada    BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catalogo_item_bien ON catalogo_sigamef (item_bien);
CREATE INDEX IF NOT EXISTS idx_catalogo_nombre_trgm ON catalogo_sigamef USING gin (nombre_item gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalogo_item_trgm ON catalogo_sigamef USING gin (item_bien gin_trgm_ops);

-- ============ FICHAS TÉCNICAS ============
CREATE TABLE IF NOT EXISTS fichas_tecnicas (
  id            SERIAL PRIMARY KEY,
  codigo        VARCHAR(60),
  descripcion   TEXT,
  unidad_medida VARCHAR(60),
  version       VARCHAR(30),
  estado        VARCHAR(30) DEFAULT 'Activo',
  observaciones TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fichas_codigo ON fichas_tecnicas (codigo);

-- ============ CONFIGURACIÓN DOCUMENTARIA ============
CREATE TABLE IF NOT EXISTS configuracion_doc (
  id           SERIAL PRIMARY KEY,
  objeto       VARCHAR(60),
  nombre       VARCHAR(200),
  descripcion  TEXT,
  obligatorio  BOOLEAN DEFAULT FALSE,
  estado       VARCHAR(30) DEFAULT 'Activo',
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- ============ METAS ============
CREATE TABLE IF NOT EXISTS metas (
  id           SERIAL PRIMARY KEY,
  codigo       VARCHAR(60),
  nombre       VARCHAR(200),
  descripcion  TEXT,
  estado       VARCHAR(30) DEFAULT 'Activo',
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- ============ ÁREAS ============
CREATE TABLE IF NOT EXISTS areas (
  id           SERIAL PRIMARY KEY,
  codigo       VARCHAR(60),
  nombre       VARCHAR(200),
  responsable  VARCHAR(150),
  estado       VARCHAR(30) DEFAULT 'Activo',
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- ============ ÓRDENES ============
CREATE TABLE IF NOT EXISTS ordenes (
  id           SERIAL PRIMARY KEY,
  numero       VARCHAR(60),
  tipo         VARCHAR(30),
  proveedor    VARCHAR(200),
  ruc          VARCHAR(20),
  monto        NUMERIC(14,2) DEFAULT 0,
  fecha        DATE,
  estado       VARCHAR(30) DEFAULT 'Registrado',
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ordenes_numero ON ordenes (numero);

-- ============ SIAF ============
CREATE TABLE IF NOT EXISTS siaf (
  id              SERIAL PRIMARY KEY,
  expediente      VARCHAR(60),
  ciclo           VARCHAR(30),
  fase            VARCHAR(30),
  meta            VARCHAR(60),
  clasificador    VARCHAR(60),
  fuente_financ   VARCHAR(100),
  monto           NUMERIC(14,2) DEFAULT 0,
  fecha           DATE,
  estado          VARCHAR(30) DEFAULT 'Registrado',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_siaf_expediente ON siaf (expediente);

-- ============ GLOSAS DE REQUERIMIENTOS ============
-- tipo: bienes | servicios | locacion | licitaciones | concurso
CREATE TABLE IF NOT EXISTS glosas (
  id           SERIAL PRIMARY KEY,
  tipo         VARCHAR(30) NOT NULL,
  codigo       VARCHAR(60),
  titulo       VARCHAR(200),
  contenido    TEXT,
  estado       VARCHAR(30) DEFAULT 'Activo',
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_glosas_tipo ON glosas (tipo);

-- ============ ENTIDAD (registro único de datos institucionales) ============
CREATE TABLE IF NOT EXISTS entidad (
  id           SERIAL PRIMARY KEY,
  ruc          VARCHAR(20),
  nombre       VARCHAR(250),
  siglas       VARCHAR(60),
  direccion    TEXT,
  telefono     VARCHAR(60),
  email        VARCHAR(150),
  titular      VARCHAR(200),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- ============ LOGOTIPOS ============
CREATE TABLE IF NOT EXISTS logotipos (
  id           SERIAL PRIMARY KEY,
  nombre       VARCHAR(150),
  tipo         VARCHAR(60),
  data_url     TEXT,
  estado       VARCHAR(30) DEFAULT 'Activo',
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);
