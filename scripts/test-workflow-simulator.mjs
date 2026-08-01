// Pruebas S de simulación pura: recorridos, viáticos, saltos, internos, devoluciones, una válida, idempotencia.
import { assert, summarize } from './workflowTestUtils.mjs';
import { simularTransicion, simularRecorridoCompleto } from '../server/lib/workflow/workflowSimulator.js';
import { TIPOS_CONTRATACION as T } from '../shared/workflow/tiposContratacion.js';

const base = (tipo, etapa, evento, extra = {}) => ({
  tipo_contratacion: tipo, etapa_actual: etapa, evento, actor_rol: 'SISTEMA',
  metadata: { idempotency_key: 'test:sim:1:abc12345' }, ...extra,
});

// Bien completo
const pasosBien = ['REQUERIMIENTO_REGISTRADO','REQUERIMIENTO_ENVIADO_EVALUACION','EVALUACION_APROBADA','DEC_APROBADO','PROGRAMACION_APROBADA','COORDINACION_CM_APROBADA','COTIZACION_PRESENTADA','COTIZACIONES_DERIVADAS_VALIDACION','VALIDACION_COMPLETADA','CUADRO_APROBADO_DEC','CCP_REGISTRADA','ORDEN_DERIVADA_EJECUCION','EXPEDIENTE_DERIVADO_PAGO','EXPEDIENTE_FINALIZADO'];
const resBien = simularRecorridoCompleto(T.BIEN, {}, pasosBien.map((e) => ({ evento: e })));
assert(resBien.length === pasosBien.length && resBien.every((r) => r.permitido), '1. Bien completo permitido');
assert(resBien[resBien.length - 1].etapa_destino === 'FINALIZADO', '2. Bien termina en FINALIZADO');

// Servicio completo
const pasosServ = ['REQUERIMIENTO_ENVIADO_EVALUACION','EVALUACION_APROBADA','DEC_APROBADO','PROGRAMACION_APROBADA','COORDINACION_CM_APROBADA','COTIZACION_PRESENTADA','COTIZACIONES_DERIVADAS_VALIDACION','VALIDACION_COMPLETADA','CUADRO_APROBADO_DEC','CCP_REGISTRADA','ORDEN_DERIVADA_EJECUCION','EXPEDIENTE_DERIVADO_PAGO','EXPEDIENTE_FINALIZADO'];
const resServ = simularRecorridoCompleto(T.SERVICIO, {}, pasosServ.map((e) => ({ evento: e })));
assert(resServ.every((r) => r.permitido), '3. Servicio completo permitido');
assert(resServ[resServ.length - 1].etapa_destino === 'FINALIZADO', '4. Servicio termina FINALIZADO');

// Locación salta a CCP
const resLoc = simularRecorridoCompleto(T.LOCACION, {}, ['REQUERIMIENTO_ENVIADO_EVALUACION','EVALUACION_APROBADA','DEC_APROBADO','PROGRAMACION_APROBADA','COORDINACION_CM_APROBADA','COTIZACION_PRESENTADA','LOCACION_APROBADA_RECEPCION','CCP_REGISTRADA','ORDEN_DERIVADA_EJECUCION','EXPEDIENTE_DERIVADO_PAGO','EXPEDIENTE_FINALIZADO'].map((e) => ({ evento: e })));
assert(resLoc.every((r) => r.permitido), '5. Locación completa permitido');
const pasoLoc = resLoc.find((r) => r.historial_simulado?.[0]?.evento === 'LOCACION_APROBADA_RECEPCION');
assert(pasoLoc?.etapa_destino === 'CCP', '6. Locación → CCP directo');

// Viático desactivado
const via = simularTransicion(base(T.VIATICO_PASAJE_AEREO, 'INVITACIONES', 'VIATICO_APROBADO_INVITACIONES'));
assert(!via.permitido, '7. Viático desactivado no permitido');

// Salto ilegal
const salto = simularTransicion(base(T.BIEN, 'REGISTRO', 'DEC_APROBADO'));
assert(!salto.permitido && salto.errores.length > 0, '8. salto ilegal bloqueado');

// Evento interno no cambia ubicación
const interno = simularTransicion(base(T.BIEN, 'RECEPCION_BIENES', 'ENTREGA_RECIBIDA'));
assert(interno.permitido && interno.etapa_destino === 'RECEPCION_BIENES' && !interno.cambia_ubicacion, '9. ENTREGA_RECIBIDA interno');

// Devolución todas inválidas VALIDACIONES→INVITACIONES
const devueltas = simularTransicion(base(T.BIEN, 'VALIDACIONES', 'COTIZACIONES_INVALIDAS_DEVUELTAS'));
assert(devueltas.permitido && devueltas.etapa_destino === 'INVITACIONES', '10. devolución todas inválidas → INVITACIONES');

// Una cotización válida permite Cuadro (simulación de VALIDACION_COMPLETADA con 1 válida)
const una = simularTransicion(base(T.BIEN, 'VALIDACIONES', 'VALIDACION_COMPLETADA'));
assert(una.permitido && una.etapa_destino === 'CUADRO_COMPARATIVO', '11. una válida permite Cuadro');

// Orden notificada permanece
const notif = simularTransicion(base(T.BIEN, 'REGISTRO_ORDEN', 'ORDEN_NOTIFICADA'));
assert(notif.permitido && notif.etapa_destino === 'REGISTRO_ORDEN' && !notif.cambia_ubicacion, '12. ORDEN_NOTIFICADA interna');

// Idempotencia simulada: misma clave devuelve mismo resultado determinístico
const r1 = simularTransicion(base(T.BIEN, 'REGISTRO', 'REQUERIMIENTO_ENVIADO_EVALUACION', { metadata: { idempotency_key: 'test:sim:key:abc12345' } }));
const r2 = simularTransicion(base(T.BIEN, 'REGISTRO', 'REQUERIMIENTO_ENVIADO_EVALUACION', { metadata: { idempotency_key: 'test:sim:key:abc12345' } }));
assert(r1.permitido === r2.permitido && r1.etapa_destino === r2.etapa_destino, '13. simulación determinística (idempotencia)');

summarize('test-workflow-simulator');