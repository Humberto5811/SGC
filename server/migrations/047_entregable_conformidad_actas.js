/**
 * Migración 047 — RC8.15.5A: Modelo documental de Acta de Conformidad por
 * entregable de servicios/locación (Presentación Entregables de Servicios).
 *
 * Reutiliza el patrón probado de Recepción de Bienes:
 *   - entregable_conformidad_actas        ← recepcion_bienes_actas (acta generada)
 *   - entregable_conformidad_acta_visados ← recepcion_bienes_acta_visados (acta firmada)
 *
 * Unidad funcional: orden_entregas.id (NO la orden completa).
 * Idempotente (CREATE TABLE IF NOT EXISTS / INDEX IF NOT EXISTS).
 * No copia campos de recepción física de Bienes.
 * No toca orden_entregas / entregable_recepciones / entregable_recepcion_documentos
 * ni ninguna tabla de Recepción de Bienes.
 */
export default `
CREATE TABLE IF NOT EXISTS entregable_conformidad_actas (
  id                 SERIAL PRIMARY KEY,
  orden_id           INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE CASCADE,
  orden_entrega_id   INTEGER NOT NULL REFERENCES orden_entregas(id) ON DELETE CASCADE,
  numero_acta        VARCHAR(80) NULL,
  version            INTEGER NOT NULL DEFAULT 1,
  estado_documental  VARCHAR(64) NOT NULL DEFAULT 'ACTA_CONFORMIDAD_GENERADA',
  contenido_html     TEXT NULL,
  documento_nombre   VARCHAR(255) NULL,
  documento_mime     VARCHAR(120) NULL,
  documento_base64   TEXT NULL,
  generado_at        TIMESTAMP NULL,
  generado_por       VARCHAR(150) NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_eca_version_pos CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS idx_eca_orden ON entregable_conformidad_actas(orden_id);
CREATE INDEX IF NOT EXISTS idx_eca_entrega ON entregable_conformidad_actas(orden_entrega_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_eca_entrega_version
  ON entregable_conformidad_actas(orden_entrega_id, version);

CREATE TABLE IF NOT EXISTS entregable_conformidad_acta_visados (
  id                  SERIAL PRIMARY KEY,
  orden_id            INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE CASCADE,
  orden_entrega_id    INTEGER NOT NULL REFERENCES orden_entregas(id) ON DELETE CASCADE,
  acta_id             INTEGER NOT NULL REFERENCES entregable_conformidad_actas(id) ON DELETE CASCADE,
  version             INTEGER NOT NULL DEFAULT 1,
  nombre              VARCHAR(255) NOT NULL,
  mime_type           VARCHAR(120) NOT NULL DEFAULT 'application/pdf',
  contenido_base64    TEXT NOT NULL,
  tamano_bytes        INTEGER NULL,
  estado_documental   VARCHAR(64) NOT NULL DEFAULT 'ACTA_CONFORMIDAD_FIRMADA',
  observacion         TEXT NULL,
  vigente             BOOLEAN NOT NULL DEFAULT TRUE,
  reemplaza_id        INTEGER NULL REFERENCES entregable_conformidad_acta_visados(id) ON DELETE SET NULL,
  idempotency_key     VARCHAR(120) NULL,
  created_by          VARCHAR(150) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMP NULL,
  deleted_by          VARCHAR(150) NULL,
  deleted_motivo      TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_ecav_acta ON entregable_conformidad_acta_visados(acta_id);
CREATE INDEX IF NOT EXISTS idx_ecav_entrega ON entregable_conformidad_acta_visados(orden_entrega_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ecav_acta_version
  ON entregable_conformidad_acta_visados(acta_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ecav_idem
  ON entregable_conformidad_acta_visados(orden_entrega_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;
`;
