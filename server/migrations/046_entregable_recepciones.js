/**
 * RC8.15.1 — Presentación Entregables de Servicios (Ejecución).
 *
 * Separa:
 *   A) DEFINICIÓN CONTRACTUAL  → orden_entregas (NO se modifica)
 *   B) RECEPCIÓN REAL          → entregable_recepciones (registro operativo)
 *
 * Relación: orden_entregas 1 ──< entregable_recepciones N
 *   - 1er registro = INICIAL
 *   - subsanaciones futuras = nuevas recepciones (no sobrescribir historial)
 *
 * fecha_recepcion_mesa_partes es DATE (no timestamp): el dato institucional
 * capturado por Mesa de Partes / SGD es solo la fecha de cargo del expediente,
 * no una fecha + hora. Los timestamps de auditoría (registrado_at / actualizado_at)
 * siguen la política UTC en BD → America/Lima en UI (ver server/lib/workflow/fechaLima.js).
 *
 * NO se modifica orden_entregas.estado: ACTIVO / ANULADO sigue siendo estado
 * contractual (fuente de vigencia), no estado operativo de recepción.
 */
export default `
CREATE TABLE IF NOT EXISTS entregable_recepciones (
  id SERIAL PRIMARY KEY,
  orden_entrega_id INTEGER NOT NULL REFERENCES orden_entregas(id) ON DELETE RESTRICT,
  orden_id INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE RESTRICT,
  numero_recepcion INTEGER NOT NULL,
  tipo_recepcion VARCHAR(30) NOT NULL DEFAULT 'INICIAL',
  fecha_recepcion_mesa_partes DATE NOT NULL,
  numero_expediente_sgd VARCHAR(120) NOT NULL,
  observacion TEXT NULL,
  estado VARCHAR(40) NOT NULL DEFAULT 'RECIBIDO',
  registrado_por VARCHAR(150) NULL,
  registrado_at TIMESTAMP NOT NULL DEFAULT NOW(),
  actualizado_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_entregable_recepciones_tipo
    CHECK (tipo_recepcion IN ('INICIAL', 'SUBSANACION')),
  CONSTRAINT chk_entregable_recepciones_estado
    CHECK (estado IN ('RECIBIDO', 'OBSERVADO', 'SUBSANADO', 'CONFORME'))
);

COMMENT ON COLUMN entregable_recepciones.numero_recepcion
  IS 'Secuencia de recepción por entregable: 1 = recepción inicial, N = subsanaciones';
COMMENT ON COLUMN entregable_recepciones.tipo_recepcion
  IS 'INICIAL para la primera recepción; SUBSANACION para recepciones posteriores';
COMMENT ON COLUMN entregable_recepciones.fecha_recepcion_mesa_partes
  IS 'Fecha de cargo en Mesa de Partes / SGD (DATE institucional, sin hora)';
COMMENT ON COLUMN entregable_recepciones.numero_expediente_sgd
  IS 'Número de expediente SGD generado por Mesa de Partes';
COMMENT ON COLUMN entregable_recepciones.estado
  IS 'Estado operativo de la recepción. Inicial: RECIBIDO. Futuro: OBSERVADO/SUBSANADO/CONFORME';

-- Evita duplicados accidentales del mismo N.º de recepción dentro de un entregable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_entregable_recepciones_numero
  ON entregable_recepciones (orden_entrega_id, numero_recepcion);

CREATE INDEX IF NOT EXISTS idx_entregable_recepciones_orden
  ON entregable_recepciones (orden_id);

CREATE INDEX IF NOT EXISTS idx_entregable_recepciones_entrega
  ON entregable_recepciones (orden_entrega_id);

CREATE TABLE IF NOT EXISTS entregable_recepcion_documentos (
  id SERIAL PRIMARY KEY,
  recepcion_id INTEGER NOT NULL REFERENCES entregable_recepciones(id) ON DELETE CASCADE,
  nombre_archivo VARCHAR(300) NOT NULL,
  mime_type VARCHAR(120) NOT NULL DEFAULT 'application/pdf',
  contenido_base64 TEXT NOT NULL,
  tamanio_bytes INTEGER NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN entregable_recepcion_documentos.contenido_base64
  IS 'Contenido binario en base64 (mismo patrón documental que orden_documentos / recepcion_bienes_documentos)';
COMMENT ON COLUMN entregable_recepcion_documentos.tamanio_bytes
  IS 'Tamaño aproximado del archivo en bytes (opcional, para validación/UI)';

CREATE INDEX IF NOT EXISTS idx_entregable_recepcion_docs
  ON entregable_recepcion_documentos (recepcion_id);
`;