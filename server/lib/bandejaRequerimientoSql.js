// Fragmentos SQL compartidos — bandejas Contrataciones (Programación, Coordinación CM, etc.)

/** JOIN lateral: pedidos SIGAMEF y paquete de consolidación por requerimiento. */
export const REQUERIMIENTO_BANDEJA_FROM = `
  FROM requerimientos r
  LEFT JOIN areas a ON r.area = a.nombre
  LEFT JOIN centros c ON a.centro_id = c.id
  LEFT JOIN LATERAL (
    SELECT string_agg(
      DISTINCT COALESCE(
        NULLIF(TRIM(p.codigo_pedido), ''),
        CASE
          WHEN p.nro_pedido IS NOT NULL AND TRIM(COALESCE(p.nro_pedido, '')) <> ''
          THEN CONCAT(UPPER(LEFT(COALESCE(p.tipo, 'PB'), 2)), '-', p.nro_pedido)
          ELSE ''
        END
      ),
      ', ' ORDER BY COALESCE(
        NULLIF(TRIM(p.codigo_pedido), ''),
        CASE
          WHEN p.nro_pedido IS NOT NULL AND TRIM(COALESCE(p.nro_pedido, '')) <> ''
          THEN CONCAT(UPPER(LEFT(COALESCE(p.tipo, 'PB'), 2)), '-', p.nro_pedido)
          ELSE ''
        END
      )
    ) AS pedidos_sigamef
    FROM requerimiento_pedidos rp
    JOIN pedidos_sigamef p ON rp.pedido_sigamef_id = p.id
    WHERE rp.requerimiento_id = r.id
  ) ped ON TRUE
  LEFT JOIN LATERAL (
    SELECT pp.codigo_paquete
    FROM paquete_requerimientos pr
    JOIN paquetes_programacion pp ON pp.id = pr.paquete_id
    WHERE pr.requerimiento_id = r.id
    ORDER BY pp.id DESC
    LIMIT 1
  ) paq ON TRUE
`;

export const REQUERIMIENTO_BANDEJA_EXTRA_SELECT = `
  COALESCE(ped.pedidos_sigamef, '') AS pedidos_sigamef,
  COALESCE(paq.codigo_paquete, '') AS codigo_paquete
`;
