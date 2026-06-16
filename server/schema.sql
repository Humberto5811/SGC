-- Esquema de base de datos SGC
-- Idempotente: se puede ejecutar varias veces sin error.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============ USUARIOS ============
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  dni VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(150),
  rol VARCHAR(30) NOT NULL DEFAULT 'usuario',
  email VARCHAR(150),
  password_hash TEXT,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ CATÁLOGO SIGAMEF ============
CREATE TABLE IF NOT EXISTS catalogo_sigamef (
  id SERIAL PRIMARY KEY,
  tipo_bien VARCHAR(10) DEFAULT 'B',
  item_bien VARCHAR(50),
  nombre_item TEXT,
  unidad_medida VARCHAR(60),
  precio_unitario NUMERIC(14,2) DEFAULT 0,
  ficha_tecnica BOOLEAN DEFAULT FALSE,
  acuerdo_marco BOOLEAN DEFAULT FALSE,
  producto_controlado BOOLEAN DEFAULT FALSE,
  ficha_homologada BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalogo_item_bien ON catalogo_sigamef (item_bien);
CREATE INDEX IF NOT EXISTS idx_catalogo_nombre_trgm ON catalogo_sigamef USING gin (nombre_item gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalogo_item_trgm ON catalogo_sigamef USING gin (item_bien gin_trgm_ops);

-- ============ FICHAS TÉCNICAS ============
CREATE TABLE IF NOT EXISTS fichas_tecnicas (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(60),
  descripcion TEXT,
  unidad_medida VARCHAR(60),
  version VARCHAR(30),
  estado VARCHAR(30) DEFAULT 'Activo',
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fichas_codigo ON fichas_tecnicas (codigo);

-- ============ CONFIGURACIÓN DOCUMENTARIA ============
CREATE TABLE IF NOT EXISTS configuracion_doc (
  id SERIAL PRIMARY KEY,
  objeto VARCHAR(60),
  nombre VARCHAR(200),
  descripcion TEXT,
  obligatorio BOOLEAN DEFAULT FALSE,
  estado VARCHAR(30) DEFAULT 'Activo',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ METAS ============
CREATE TABLE IF NOT EXISTS metas (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(60),
  nombre VARCHAR(200),
  descripcion TEXT,
  estado VARCHAR(30) DEFAULT 'Activo',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ CENTROS ============
CREATE TABLE IF NOT EXISTS centros (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(60),
  nombre VARCHAR(200),
  estado VARCHAR(30) DEFAULT 'Activo',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ ÁREAS ============
CREATE TABLE IF NOT EXISTS areas (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(60),
  nombre VARCHAR(200),
  responsable VARCHAR(150),
  centro_id INTEGER,
  estado VARCHAR(30) DEFAULT 'Activo',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS centro_id INTEGER REFERENCES centros(id) ON DELETE SET NULL;

-- ============ ÓRDENES ============
CREATE TABLE IF NOT EXISTS ordenes (
  id SERIAL PRIMARY KEY,
  numero VARCHAR(60),
  tipo VARCHAR(30),
  proveedor VARCHAR(200),
  ruc VARCHAR(20),
  monto NUMERIC(14,2) DEFAULT 0,
  fecha DATE,
  estado VARCHAR(30) DEFAULT 'Registrado',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_numero ON ordenes (numero);

-- ============ SIAF ============
CREATE TABLE IF NOT EXISTS siaf (
  id SERIAL PRIMARY KEY,
  expediente VARCHAR(60),
  ciclo VARCHAR(30),
  fase VARCHAR(30),
  meta VARCHAR(60),
  clasificador VARCHAR(60),
  fuente_financ VARCHAR(100),
  monto NUMERIC(14,2) DEFAULT 0,
  fecha DATE,
  estado VARCHAR(30) DEFAULT 'Registrado',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_siaf_expediente ON siaf (expediente);

-- ============ GLOSAS BIENES ============
CREATE TABLE IF NOT EXISTS glosas_bienes (
  id SERIAL PRIMARY KEY,
  literal VARCHAR(10),
  numero VARCHAR(20),
  titulo VARCHAR(250) NOT NULL UNIQUE,
  contenido TEXT,
  total_cantidad NUMERIC(14,2) DEFAULT 0,
  fecha_modificacion TIMESTAMP DEFAULT NOW(),
  usuario_modificacion VARCHAR(150),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS glosas_entregas (
  id SERIAL PRIMARY KEY,
  glosa_id INTEGER NOT NULL REFERENCES glosas_bienes(id) ON DELETE CASCADE,
  numero_entrega INTEGER NOT NULL DEFAULT 1,
  entregable VARCHAR(250),
  cantidad NUMERIC(14,2) NOT NULL DEFAULT 0,
  plazo VARCHAR(120),
  condicion TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_glosas_entregas_glosa_id ON glosas_entregas (glosa_id);

-- Siembra glosas de bienes iniciales
INSERT INTO glosas_bienes (literal, numero, titulo, contenido, usuario_modificacion)
SELECT * FROM (VALUES
  ('c', NULL, 'Documentación para acreditar cumplimiento', '', 'sistema'),
  ('d', NULL, 'Vigencia del producto', '', 'sistema'),
  (NULL, '5', 'Reglamentos técnicos, normas metrológicas y/o sanitarias', '', 'sistema'),
  (NULL, '6', 'Acondicionamiento, montaje o instalación', '', 'sistema'),
  (NULL, '7', 'Entregas', '', 'sistema'),
  (NULL, '8', 'Garantía comercial', '', 'sistema'),
  (NULL, '9', 'Prestaciones accesorias', '', 'sistema'),
  (NULL, '10', 'Requisitos del proveedor', '', 'sistema'),
  (NULL, '11', 'Lugar de entrega y condiciones de entrega', '', 'sistema'),
  (NULL, '11.1', 'Lugar de entrega', '', 'sistema'),
  (NULL, '11.2', 'Condiciones de entrega', '', 'sistema'),
  (NULL, '12', 'Responsabilidad por vicios ocultos', '', 'sistema'),
  (NULL, '13', 'Otras cláusulas', '', 'sistema'),
  (NULL, '13.1', 'Cláusula anticorrupción y antisoborno', '', 'sistema'),
  (NULL, '13.2', 'Cláusula solución de controversias contractuales', '', 'sistema'),
  (NULL, '13.3', 'Cláusula resolución del contrato por incumplimiento', '', 'sistema'),
  (NULL, '13.4', 'Cláusula gestión de riesgos', '', 'sistema'),
  (NULL, '13.5', 'Cláusula de confidencialidad y propiedad intelectual', '', 'sistema'),
  (NULL, '13.6', 'Causales de resolución de contrato', '', 'sistema'),
  (NULL, '14', 'Entrega del bien, modalidad y condiciones de pago', '', 'sistema'),
  (NULL, '14.1', 'Plazo de entrega del bien', '', 'sistema'),
  (NULL, '14.2', 'Modalidad de pago', '', 'sistema'),
  (NULL, '14.3', 'Condiciones de pago', '', 'sistema'),
  (NULL, '14.4', 'Conformidad de recepción del bien', '', 'sistema'),
  (NULL, '15', 'Penalidad', '', 'sistema'),
  (NULL, '16', 'Otras penalidades', '', 'sistema'),
  (NULL, '17', 'Otros', '', 'sistema'),
  (NULL, '18', 'Firma del Sub Director / Jefe / Director General', '', 'sistema')
) AS seed(literal, numero, titulo, contenido, usuario_modificacion)
WHERE NOT EXISTS (
  SELECT 1 FROM glosas_bienes gb WHERE gb.titulo = seed.titulo
);

-- ============ FICHA NET ============
CREATE TABLE IF NOT EXISTS ficha_net (
  id SERIAL PRIMARY KEY,
  idfichanet TEXT,
  idcartcod TEXT,
  idcartcodigosiga TEXT,
  dscartnombre TEXT,
  dscclasdescripcion TEXT,
  dscartpresentacion TEXT,
  dspesomolecular TEXT,
  dsporcentajepureza TEXT,
  dsformula TEXT,
  dsdensidad TEXT,
  dsph TEXT,
  dstemperatura TEXT,
  idclase TEXT,
  dsclase TEXT,
  idsubclase TEXT,
  dssubclase TEXT,
  dscartdocumentos TEXT,
  dscartcaracteristica TEXT,
  dscartfechavencimiento TEXT,
  stcartestado TEXT,
  dscartobservaciones TEXT,
  dafechacreacion TEXT,
  dsusuariocrea TEXT,
  nu_version TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fichanet_codigo_trgm ON ficha_net USING gin (idcartcodigosiga gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fichanet_nombre_trgm ON ficha_net USING gin (dscartnombre gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fichanet_clase_trgm ON ficha_net USING gin (dsclase gin_trgm_ops);

-- ============ ENTIDAD ============
CREATE TABLE IF NOT EXISTS entidad (
  id SERIAL PRIMARY KEY,
  ruc VARCHAR(20),
  nombre VARCHAR(250),
  siglas VARCHAR(60),
  direccion TEXT,
  telefono VARCHAR(60),
  email VARCHAR(150),
  titular VARCHAR(200),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ LOGOTIPOS ============
CREATE TABLE IF NOT EXISTS logotipos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150),
  tipo VARCHAR(60),
  data_url TEXT,
  estado VARCHAR(30) DEFAULT 'Activo',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ REQUERIMIENTOS (Registro de Requerimientos) ============
-- Cada requerimiento es un registro independiente. Los datos del formulario
-- (área, responsable, objetivo, finalidad, ítems SIGAMEF, overrides de glosas
-- c)–18, entregas 14.1 y fichas técnicas adjuntas) se guardan en payload (JSON).
CREATE TABLE IF NOT EXISTS requerimientos (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(30) NOT NULL DEFAULT 'bienes',
  codigo VARCHAR(60),
  cmn VARCHAR(5),
  denominacion VARCHAR(300),
  area VARCHAR(250),
  responsable VARCHAR(200),
  estado VARCHAR(30) DEFAULT 'Registrado',
  payload TEXT,
  usuario_modificacion VARCHAR(150),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add cmn column to existing requerimientos table (for databases created before cmn was added)
ALTER TABLE requerimientos ADD COLUMN IF NOT EXISTS cmn VARCHAR(5);

CREATE INDEX IF NOT EXISTS idx_requerimientos_tipo ON requerimientos (tipo);

-- ============ ADJUNTOS DE REQUERIMIENTOS ============
-- Almacena archivos adjuntos a cada requerimiento para la aprobación
CREATE TABLE IF NOT EXISTS requerimientos_adjuntos (
  id SERIAL PRIMARY KEY,
  requerimiento_id INTEGER NOT NULL REFERENCES requerimientos(id) ON DELETE CASCADE,
  nombre_archivo VARCHAR(300),
  mime_type VARCHAR(100),
  contenido_base64 TEXT,
  tamaño_bytes INTEGER,
  usuario_carga VARCHAR(150),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adjuntos_requerimiento_id ON requerimientos_adjuntos (requerimiento_id);

-- ============ GLOSAS SERVICIOS ============
CREATE TABLE IF NOT EXISTS glosas_servicios (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(250) NOT NULL UNIQUE,
  contenido TEXT,
  estado VARCHAR(30) DEFAULT 'Activo',
  usuario_modificacion VARCHAR(150),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ CARRERAS PROFESIONALES ============
CREATE TABLE IF NOT EXISTS carreras_profesionales (
  id SERIAL PRIMARY KEY,
  nombre_carrera VARCHAR(300) NOT NULL UNIQUE,
  tipo_carrera VARCHAR(50) NOT NULL DEFAULT 'Profesional',
  estado BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carreras_nombre_trgm ON carreras_profesionales USING gin (nombre_carrera gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_carreras_tipo ON carreras_profesionales (tipo_carrera);

-- ============ PEDIDOS SIGAMEF ============
CREATE TABLE IF NOT EXISTS pedidos_sigamef (
  id SERIAL PRIMARY KEY,
  codigo_pedido VARCHAR(20) UNIQUE,
  ano_eje VARCHAR(4),
  tipo VARCHAR(10),
  nro_pedido VARCHAR(20),
  centro VARCHAR(100),
  centro_costo VARCHAR(100),
  fecha_pedido VARCHAR(20),
  fuente_fto VARCHAR(100),
  sec_func VARCHAR(100),
  clase_bien VARCHAR(100),
  familia_bien VARCHAR(100),
  item_bien VARCHAR(100),
  codigo_sigamef VARCHAR(100),
  descripcion TEXT,
  especifica VARCHAR(100),
  unidad_medida VARCHAR(60),
  cant_solicitada NUMERIC(14,4) DEFAULT 0,
  precio_unitario NUMERIC(14,4) DEFAULT 0,
  total_item NUMERIC(14,4) DEFAULT 0,
  estado VARCHAR(30) DEFAULT 'Activo',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_codigo ON pedidos_sigamef (codigo_pedido);
CREATE INDEX IF NOT EXISTS idx_pedidos_nro ON pedidos_sigamef (nro_pedido);
CREATE INDEX IF NOT EXISTS idx_pedidos_tipo ON pedidos_sigamef (tipo);
CREATE INDEX IF NOT EXISTS idx_pedidos_desc_trgm ON pedidos_sigamef USING gin (descripcion gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pedidos_codsig_trgm ON pedidos_sigamef USING gin (codigo_sigamef gin_trgm_ops);

-- ============ GLOSAS LOCADORES ============
CREATE TABLE IF NOT EXISTS glosas_locadores (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(250) NOT NULL UNIQUE,
  contenido TEXT,
  estado VARCHAR(30) DEFAULT 'Activo',
  usuario_modificacion VARCHAR(150),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
