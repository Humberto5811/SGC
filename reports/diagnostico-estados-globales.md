# Diagnóstico de estados globales SGC

Generado: 2026-07-29T02:40:56.121Z

## Resumen

- Inconsistencias: **1**
- Aliases históricos detectados: **2**
- Códigos desconocidos: **1**

## Inconsistencias

- **bug-bandeja-ccp-vs-orden** (evidencia_incompleta_en_bandeja): Orden notificada pero evidencia solo CCP (bug histórico bandejas)
  - Sin orden: `CCP_REGISTRADA`
  - Con orden: `ORDEN_NOTIFICADA`
  - Corrección: Usar loadEstadoExpedienteEvidenceByIds en todas las bandejas

## Aliases históricos

- `ORDEN_ENVIADA` → `ORDEN_NOTIFICADA` (Orden notificada)
- `CCP_REGISTRADO` → `CCP_REGISTRADA` (CCP registrada)

## Códigos desconocidos

- `CODIGO_RARO_DIAG`

## Notas

- Sin conexión DB forzada: analiza reglas del resolvedor y casos sintéticos.
- Para auditoría en vivo, ejecutar con DATABASE_URL y flag --live (opcional futuro).
