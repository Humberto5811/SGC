SGC.md - Sistema de Gestión de Contrataciones (SGC)

Resumen Ejecutivo
Propósito: Sistema web para la gestión integral de contrataciones en entidades del Estado Peruano, conforme a la Ley N° 32069 (Ley General de Contrataciones Públicas), permitiendo el flujo completo desde el requerimiento del área usuaria hasta la ejecución contractual y seguimiento.
Marco Legal: Ley N° 32069, Reglamento, Directiva de Contratos Menores OECE.
Usuarios objetivos:
• Administrador - Configuración de documentos, gestión de usuarios
• Operador DEC (Dependencia Encargada de Contrataciones) - Difusión, invitaciones, evaluación de cotizaciones, adjudicación
• Área Usuaria (AU) - Registro de requerimientos, evaluación técnica, subsanación
• Proveedor (externo) - Recepción de invitaciones, cotización, consultas

________________________________________
User Stories (Épicas y Funcionalidades)
UE-01: Autenticación y Gestión de Acceso
Como usuario registrado con Certificado SEACE v3.0
Quiero iniciar sesión con DNI y contraseña, con rol específico
Para acceder a las funcionalidades según mi perfil (Operador DEC, Área Usuaria, Administrador)
Criterios de aceptación:
• Autenticación de acuerdo a las autorizaciones y accesos brindados 
• Roles: Operador DEC, Operador AU, Administrador de documentos
• Políticas de privacidad y términos de uso previo al ingreso

________________________________________
UE-02: Registro de Requerimiento (Área Usuaria)
Como Operador del Área Usuaria
Quiero registrar un nuevo requerimiento con datos generales, entregables, RTM e ítems
Para iniciar formalmente un proceso de contratación menor
Criterios de aceptación:
• CRUD completo de Registro de requerimientos
• Que permita seleccionar el tipo de contratación: Bienes, Servicios , Locación, Licitación Pública y Concurso Publico
• Si el tipo de contratación de contratación es bienes que muestre la siguiente estructura :
BIENES
• Selección de Área usuaria o centro de costo con autocompletado
• Campo 2 DENOMINACIÓN DE LA CONTRATACIÓN 
• Titulo 3 OBJETIVO Y/O FINALIDAD PÚBLICA
• Campo 3.1 OBJETIVO DE LA CONTRATACIÓN
• Campo 3.2 FINALIDAD DE LA CONTRATACIÓN
• Titulo 4 Requerimiento o Características
• Campo a) de Selección de ítem sigamef , debe permitir la búsqueda por descripción o por código ; una vez seleccionado debe mostrar los datos del código , descripción unidad de medida, debe existir un campo para que el usuario registre la cantidad a solicitar
• Campo b) De acuerdo al código del ítem sigamef seleccionado, debe traer automáticamente la información de todos los campos de la ficha técnica del bien que esta vinculada. 
• Campo c) de documentación para acreditar cumplimiento de características técnicas, experiencia del postor y personal clave.
• Campo d) de vigencia del producto.
• Campo de 5 REGLAMENTOS TÉCNICOS, NORMAS METROLÓGICAS Y/O SANITARIAS, REGLAMENTOS Y DEMÁS NORMAS
• Campo de 6 ACONDICIONAMIENTO, MONTAJE O INSTALACIÓN
• Campo de 7 ENTREGAS
• Campo de 8 GARANTÍA COMERCIAL
• Campo de 9 PRESTACIONES ACCESORIAS
• Campo de 10 REQUISITOS DEL PROVEEDOR
• Titulo 11 LUGAR DE ENTREGA Y CONDICIONES DE ENTREGA
• Campo 11.1 LUGAR DE ENTREGA  
• Campo 11.2 CONDICIONES DE ENTREGA
• Campo 12 RESPONSABILIDAD POR VICIOS OCULTOS
• Titulo 13 RESPONSABILIDAD POR VICIOS OCULTOS
• Campo 13.1 RESPONSABILIDAD POR VICIOS OCULTOS
• Campo 13.2 CLÁUSULA SOLUCIÓN DE CONTROVERSIAS CONTRACTUALES:
• Campo 13.3 CLÁUSULA RESOLUCIÓN DEL CONTRATO POR INCUMPLIMIENTO:
• Campo 13.4 CLÁUSULA GESTIÓN DE RIESGOS:
• Campo 13.5 CLÁUSULA DE CONFIDENCIALIDAD Y PROPIEDAD INTELECTUAL:
• Campo 13.6 CAUSALES DE RESOLUCIÓN DE CONTRATO:
• Titulo 14 ENTREGA DEL BIEN, MODALIDAD Y CONDICIONES DE PAGO
• Campo 14.1 PLAZO DE ENTREGA DEL BIEN:
• Ademas debajo del campo 14.1 , debe contar con un cuadro donde el usuario pueda seleccionar la 1era entrega y luego debe aparecer un cuadro donde debe poner el numero de días de cada entrega y al costado derecho debe existir un campo para que el usuario registre información. El usuario puede registrar varias entregas y debe contar con un ID incremental. Debe permitir modificar y eliminar cada entrega por parte del usuario
• Campo 14.2 MODALIDAD DE PAGO:
• Campo 14.3 CONDICIONES DE PAGO:
• Campo 15 CONFORMIDAD DE RECEPCION DEL BIEN:
• Campo 16 PENALIDAD:
• Campo 17 OTRAS PENALIDADES (opcional)
• Campo 18 OTROS:
• Generar PDF del anexo
• Solicitar aprobación, en caso de que el coordinador o director , quien luego de revisar el requerimiento podrá marcar las opciones de aprobado o rechazado.
• En caso de que el requerimiento este aprobado pasará al módulo de CONTRATACIONES

SERVICIOS
• Selección de Área usuaria o centro de costo con autocompletado
• Campo 2 DENOMINACIÓN DE LA CONTRATACIÓN 
• Titulo 3 OBJETIVO Y/O FINALIDAD PÚBLICA
• Campo 3.1 OBJETIVO DE LA CONTRATACIÓN
• Campo 3.2 FINALIDAD DE LA CONTRATACIÓN
• Titulo 4 DESCRIPCIÓN DEL SERVICIO
• Campo 4.1 REQUERIMIENTO , debe permitir seleccionar el ítem sigamef , debe permitir la búsqueda por descripción o por código ; una vez seleccionado debe mostrar los datos del código , descripción y la unidad de medida
• Campo 4.2 CARACTERISTICAS DEL SERVICIO 
• Campo de 5 REQUISITOS DEL PROVEEDOR 
• Campo 5.1 EXPERIENCIA DEL PROVEEDOR
• Campo 5.2 REQUISITOS ADICIONALES PARA LA CONTRATACIÓN
• 
• Campo de 6 GARANTIA
• Campo de 7 SEGURO
• Campo de 8 OTRAS CLAUSULAS
• Campo de 8.1 SEGURIDAD DE LA INFORMACIÓN DE LA ENTIDAD
• Campo de 8.2 CLÁUSULA ANTICORRUPCIÓN Y ANTISOBORNO
• Campo de 8.3 CLÁUSULA DE CONFIDENCIALIDAD Y PROPIEDAD INTELECTUAL
• Campo de 8.4 CLAUSULA DE CUMPLIMIENTO
• Campo 8.5 RESPONSABILIDAD POR VICIOS OCULTOS
• Campo 8.6 CLÁUSULA SOLUCIÓN DE CONTROVERSIAS CONTRACTUALES:
• Campo 8.7 CLÁUSULA RESOLUCIÓN DEL CONTRATO POR INCUMPLIMIENTO:
• Campo 8.8 CLÁUSULA GESTIÓN DE RIESGOS:
• Campo 8.9 SOBRE LA DECLARACION JURADA DE INTERESES:
• Titulo 9 PLAZO, ENTREGABLES, MODALIDAD Y CONDICIONES DE PAGO
• Campo 9.1 PLAZO DE REALIZACIÓN DEL SERVICIO:
• Campo 9.2 ENTREGABLES:
• Ademas debajo del campo 9.2 , debe contar con un cuadro donde el usuario pueda seleccionar la 1era entrega y luego debe aparecer un cuadro donde debe poner el numero de días de cada entrega y al costado derecho debe existir un campo para que el usuario registre información. El usuario puede registrar varias entregas y debe contar con un ID incremental. Debe permitir modificar y eliminar cada entrega por parte del usuario
• Campo 9.3 MODALIDAD DE PAGO:
• Campo 9.4 CONDICIONES DE PAGO:
• Campo 10 CONFORMIDAD DE LA PRESTACION
• Campo 11 PENALIDAD:
• Campo 12 OTRAS PENALIDADES (opcional)
• Campo 13 OTROS:
• Generar PDF del anexo
• Solicitar aprobación, en caso de que el coordinador o director , quien luego de revisar el requerimiento podrá marcar las opciones de aprobado o rechazado.
• En caso de que el requerimiento este aprobado pasará al modulo de CONTRATACIONES

LOCACIÓN DE SERVICIOS
• Selección de Área usuaria o centro de costo con autocompletado
• Campo 2 DENOMINACIÓN DE LA CONTRATACIÓN 
• Titulo 3 OBJETIVO Y/O FINALIDAD PÚBLICA
• Campo 3.1 OBJETIVO DE LA CONTRATACIÓN
• Campo 3.2 FINALIDAD DE LA CONTRATACIÓN
• Titulo 4 DESCRIPCIÓN DEL SERVICIO
• Campo 4.1 REQUERIMIENTO , debe permitir seleccionar el ítem sigamef , debe permitir la búsqueda por descripción o por código ; una vez seleccionado debe mostrar los datos del código , descripción y la unidad de medida
• Campo 4.2 CARACTERÍSTICAS DEL SERVICIO 
• Campo de 5 PERFIL DEL PROVEEDOR 
• Campo 5.1 FORMACIÓN ACADÉMICA
• Campo 5.2 EXPERIENCIA EN GENERAL
• Campo 5.3 EXPERIENCIA ESPECIFICA
• Campo 5.4 CAPACITACIÓN
• Campo 5.5 ACREDITACIÓN
• Campo 5.6 REQUISITOS ADICIONALES PARA LA CONTRATACIÓN
• Campo de 6 SEGURO
• Campo de 7 OTRAS CLAUSULAS
• Campo de 7.1 SEGURIDAD DE LA INFORMACIÓN DE LA ENTIDAD
• Campo de 7.2 CLÁUSULA ANTICORRUPCIÓN Y ANTISOBORNO
• Campo de 7.3 CLÁUSULA DE CONFIDENCIALIDAD Y PROPIEDAD INTELECTUAL
• Campo de 7.4 CLAUSULA DE CUMPLIMIENTO
• Campo 7.5 RESPONSABILIDAD POR VICIOS OCULTOS
• Campo 7.6 CLÁUSULA SOLUCIÓN DE CONTROVERSIAS CONTRACTUALES:
• Campo 7.7 CLÁUSULA RESOLUCIÓN DEL CONTRATO POR INCUMPLIMIENTO:
• Campo 7.8 CLÁUSULA GESTIÓN DE RIESGOS:
• Campo 7.9 SOBRE LA DECLARACION JURADA DE INTERESES:
• Titulo 8 PLAZO, ENTREGABLES, MODALIDAD Y CONDICIONES DE PAGO
• Campo 8.1 PLAZO DE REALIZACIÓN DEL SERVICIO:
• Campo 8.2 ENTREGABLES:
• Ademas debajo del campo 8.2 , debe contar con un cuadro donde el usuario pueda seleccionar la 1era entrega y luego debe aparecer un cuadro donde debe poner el numero de días de cada entrega y al costado derecho debe existir un campo para que el usuario registre información. El usuario puede registrar varias entregas y debe contar con un ID incremental. Debe permitir modificar y eliminar cada entrega por parte del usuario
• Campo 8.3 MODALIDAD DE PAGO:
• Campo 8.4 CONDICIONES DE PAGO:
• Campo 9 CONFORMIDAD DE LA PRESTACION
• Campo 10 PENALIDAD:
• Campo 11 OTRAS PENALIDADES (opcional)
• Campo 12 OTROS:
• Generar PDF del anexo
• Solicitar aprobación, en caso de que el coordinador o director , quien luego de revisar el requerimiento podrá marcar las opciones de aprobado o rechazado.
• En caso de que el requerimiento este aprobado pasará al modulo de CONTRATACIONES

________________________________________
UE-03: Evaluación y Subsanación de Requerimientos
Como Operador del Área Usuaria (evaluador)
Quiero evaluar cada sección del requerimiento, aprobar u observar
Para validar que el requerimiento cumple con los requisitos antes de enviarlo a DEC
Criterios de aceptación:
• Bandejas por estado: "No recibidos", "Recibidos" (por DEC), "Observado", "Aprobado"
• Evaluación por sección (Datos generales, Anexo) con botones: ✅ Aprobar / ❌ Observar / ↩️ Volver a evaluar
• Registro de feedback textual por cada observación
• Subsanación: edición de secciones observadas, regeneración de PDF, nueva solicitud de aprobación
• PDF de subsanación firmado
• Remisión automática a DEC al finalizar
________________________________________
UE-04: Difusión de Contratación Menor (DEC)
Como Operador DEC
Quiero crear una nueva contratación (con o sin requerimiento previo) y publicarla
Para que los proveedores puedan presentar cotizaciones
Criterios de aceptación:
Caso 1 - Sin requerimiento previo:
• Registrar N° de contratación, año, sigla (con creación dinámica)
• Cronograma: fechas/horas de Consultas (inicio/fin) y Cotización (inicio/fin)
• Objeto, Área usuaria, descripción
• CUI (opcional, búsqueda)
• Cuadro Multianual (Anexo 04/06)
• Tipo de invitación: Abierta (invita 20 proveedores RNP aleatorios) o Cerrada (justificación, invitación manual)
• Tipo de evaluación: Por paquete de ítem (cotiza todos) o Por relación de ítem (cotiza al menos uno)
• Adjuntar archivo de requerimiento (max 5 MB)
• Documentos solicitados al proveedor (configurables por objeto)
• Registro de ítems con CUBSO, cantidad, UM, moneda, ubicación
• Publicar → estado "VIGENTE"
Caso 2 - Con requerimiento previo:
• Requerimiento debe estar "Aprobado" por AU
• DEC recibe → Botón "Recibir" → Botón "Evaluar"
• Evaluación similar a AU (aprobar/observar por sección)
• Observaciones al AU → subsanación
• Sin observaciones → botón "Aprobar" → formulario de Nueva Contratación (datos automáticos)
________________________________________
UE-05: Invitaciones a Proveedores
Como Operador DEC
Quiero gestionar los proveedores invitados a cotizar
Para asegurar que los postores adecuados participen
Criterios de aceptación:
• Invitación abierta: Botón "Invitaciones" muestra 20 proveedores aleatorios, agregar más manualmente
• Invitación cerrada: Búsqueda de proveedores por:
o Con RNP: filtros por objeto, RUC, estado RNP (Vigente), búsqueda
o Sin RNP: validar RUC (consulta SUNAT), correo, celular, agregar manual
• Selección múltiple de proveedores, botón "Agregar proveedores"
• Envío de invitaciones por correo (simular con console.log)
• Lista de invitados visible
________________________________________
UE-06: Consultas de Proveedores
Como Proveedor (simulado)
Quiero realizar consultas sobre la contratación
Para aclarar dudas antes de cotizar
Como Operador DEC / AU
Quiero absolver consultas de los proveedores
Para brindar transparencia y claridad
Criterios de aceptación:
• Proveedor escribe consulta (texto, max 500 caracteres)
• DEC recibe consulta → puede responder directamente o Derivar al Área Usuaria
• AU recibe consulta derivada → responde
• Historial de consultas/respuestas visible
• Plazo de respuesta (días configurable)
________________________________________
UE-07: Apertura y Evaluación de Cotizaciones
Como Operador DEC
Quiero abrir las cotizaciones después de la fecha/hora de fin
Para evaluar las propuestas de los proveedores
Criterios de aceptación:
Apertura:
• Botón "Abrir cotizaciones" habilitado solo después de fecha/hora de fin
• Si otro usuario abre: solicitar Motivo de apertura (obligatorio, max 500 caracteres)
• Contratación cambia a estado "EN EVALUACIÓN"
• Mostrar cantidad de cotizaciones recibidas
Evaluación - Por paquete de ítem:
• Listado de proveedores con: RUC, Razón Social, Monto cotizado, Fecha, Estado
• Solicitar evaluación técnica (opción SI/NO):
o SI: seleccionar AU, medio (correo/bandeja), detalle, días para respuesta
o NO: motivo por qué no requiere evaluación
• AU recibe → evalúa cada cotización: "Cumple" / "No cumple" (con motivo)
• Estado de cotización: Adjudicado, Calificado, Descalificado, Sin evaluación
• Subsanación: DEC puede solicitar al proveedor subsanar documentos (días para subsanar)
Evaluación - Por relación de ítem:
• Seleccionar ítem del listado
• Ver cotizaciones por cada ítem
• Evaluar por ítem (adjudicado/calificado/descalificado)
• Sorteo electrónico si montos coinciden → adjudica aleatorio
________________________________________
UE-08: Presupuesto y Certificado de Crédito Presupuestario (CCP)
Como Operador DEC
Quiero registrar el CCP y la previsión presupuestal
Para formalizar el compromiso financiero
Criterios de aceptación:
• N° de Certificado de Crédito Presupuestario (campo numérico)
• Registrar CCP manual:
o Año fiscal (actual, no editable)
o Meta, Clasificador de gasto, FF-Rubro (lista desplegable con 8 opciones)
o Moneda, N° de CCP, Monto a utilizar
o Adjuntar archivo del CCP
o Agregar/editar/eliminar múltiples CCPs
• Visualización de monto total del presupuesto
• Publicar → estado cambia a "CULMINADO"
________________________________________
UE-09: Cuadro Comparativo y Firma
Como Operador DEC
Quiero generar el Cuadro Comparativo y firmarlo
Para oficializar el resultado de la evaluación
Criterios de aceptación:
• Botón "Cuadro comparativo" genera PDF con:
o Por paquete: tabla comparativa de proveedores vs criterios
o Por relación de ítem: tabla por ítem con adjudicatarios
• Firma digital (simulada):
o Integración con FIRMA PERÚ (simular con modal)
o Opción "¿Cuenta con DNI Electronico o Token?"
o Carga de documento firmado automáticamente
• Firma manual:
o Botón "Descargar" PDF → firmar físicamente → botón "Cargar" PDF firmado → "Agregar"
• Una vez firmado, botón "Publicar" finaliza la contratación
________________________________________
UE-10: Registro y Publicación de Contrato
Como Operador de Contratos
Quiero registrar el contrato/orden de compra o servicio perfeccionado
Para completar el compromiso financiero con SIAF-MEF
Criterios de aceptación:
• Acceso desde módulo Ejecución Contractual
• Búsqueda de contratación adjudicada/consentida por año, sigla, descripción
• Datos generales:
o Contratista (persona natural/jurídica/consorcio)
o Moneda, Monto del contrato, Tipo (Contrato/Orden Compra/Orden Servicio)
o RUC destinatario de pago, Descripción, N° de contrato
o Fecha de suscripción, Vigencia (inicio/fin)
o Archivo del contrato (doc/docx/pdf), Archivo de consorcio (si aplica)
• Ítems del contrato (precargados de la adjudicación, editable)
• Programación de entregas y pagos
• Garantías: No aplica para contrato menor (razón automática)
• Guardar borrador → estado "BORRADOR"
• Publicar → estado "PUBLICADO"
________________________________________
UE-11: Modificaciones durante Ejecución Contractual
Como Operador de Contratos
Quiero registrar nulidades, resoluciones u otras modificaciones
Para actualizar el contrato según eventos posteriores
Criterios de aceptación:
Nulidad:
• Alcance: Total o Parcial (seleccionar ítems afectados)
• Ingresar monto ejecutado por ítem
• Calendario de pagos actualizado automáticamente
Resolución:
• Alcance: Total o Parcial
• Ítems afectados, monto ejecutado
• Nueva programación de pagos
Otras Modificaciones:
• Adjuntar documentos (adendas, acuerdos, etc.)
________________________________________
UE-12: Acciones de Seguimiento
Como Operador de Contratos
Quiero registrar conformidades, penalidades y ampliaciones de plazo
Para dar seguimiento a la ejecución del contrato
Criterios de aceptación:
Conformidad:
• Registrar por cada entregable
• Adjuntar documento de conformidad
• Fecha de publicación automática
Penalidad:
• Registrar monto, motivo, resolución
• Adjuntar sustento
Ampliación de Plazo:
• Resolución: Aprobada / No aprobada
• Días de ampliación (si aprobada, >0; si no, 0)
• Nueva fecha de culminación automática
________________________________________
UE-13: Configuración de Documentos a Proveedores
Como Administrador de documentos
Quiero configurar la lista de documentos que se solicitarán a proveedores
Para estandarizar según tipo de objeto de contratación
Criterios de aceptación:
• Listado de documentos con: Nombre, Estado (Creado/Activo/Inactivo), Objeto asociado
• Buscar por nombre, estado, fechas de vigencia, objeto
• Registrar documento:
o Nombre del documento, Tipo de objeto (Bienes/Servicios/Obras/Consultorías)
o Adjuntar archivo (Word/PDF, max 2 MB), Fecha de vigencia (inicio/fin)
o Estado por defecto: "Creado", luego cambiar a "Activo"
• Opciones: Editar, Eliminar, Ver detalle

Requisitos Funcionales (FR)
ID Requisito
FR-01 Autenticación con Certificado SEACE (simulado por ahora)
FR-02 Gestión de roles: Operador DEC, Operador AU, Administrador
FR-03 CRUD completo de áreas usuarias
FR-04 CRUD completo de siglas institucionales
FR-05 Búsqueda de SIGAMEF por código o descripción
FR-06 Búsqueda de Código Único de Inversión (CUI)
FR-07 Generación de PDF de Anexos (N° 01-A y N° 01-B) con cláusulas dinámicas
FR-08 Flujo de estados: Borrador → No recibido → Recibido → Observado → Aprobado → Vigente → En evaluación → Culminado
FR-09 Inscripción aleatoria de 20 proveedores RNP para invitación abierta
FR-10 Invitación manual de proveedores con/sin RNP
FR-11 Envío de invitaciones (simular correo)
FR-12 Consultas con respuesta directa o derivación a AU
FR-13 Evaluación técnica por AU (cumple/no cumple con motivo)
FR-14 Sorteo electrónico en caso de empate
FR-15 Subsanación de cotizaciones por proveedor
FR-16 Registro de CCPs múltiples
FR-17 Generación de Cuadro Comparativo (PDF)
FR-18 Firma digital (placeholder) y manual del Cuadro Comparativo
FR-19 Registro, edición y publicación de contrato/orden
FR-20 Nulidad (total/parcial) y Resolución
FR-21 Conformidad, Penalidad, Ampliación de plazo
FR-22 Configuración de documentos solicitados por objeto
FR-23 Exportación de listados a Excel
FR-24 CRUD completo de Centros de costo

________________________________________
Requisitos No Funcionales (NFR)
ID Requisito
NFR-01 Interfaz responsiva (Bootstrap 5)
NFR-02 Tiempo de respuesta < 3 segundos
NFR-03 Datos persistentes en localStorage (prototipo)
NFR-04 Código modular por módulo funcional
NFR-05 Accesibilidad WCAG 2.1 nivel AA
NFR-06 Auditoría de acciones (log básico)

________________________________________
Casos Extremo (Edge Cases)
1. Cronograma con fecha/hora de fin anterior a inicio - validación y error
2. Sin cotizaciones presentadas - opción de culminar contratación o modificar cronograma
3. Proveedor no invitado intenta cotizar - bloqueo en modo cerrado
4. Empate en montos - habilitar sorteo electrónico
5. Subsanación fuera de plazo - descalificación automática
6. CUI no encontrado - mensaje de error, permitir continuar sin CUI
7. Archivos exceden tamaño - validar antes de subir (2 MB, 5 MB según campo)
8. CCP duplicados - validar número único

________________________________________
Criterios de Éxito
• Usuario puede completar ciclo completo: Requerimiento AU → Evaluación AU → Aprobación DEC → Invitaciones → Cotizaciones → Evaluación → Adjudicación → Contrato
• Proveedores pueden consultar y cotizar (simulado)
• Generación de PDFs funcional
• Firma digital y manual operativa
• Estados actualizan correctamente según flujo
• Exportaciones Excel funcionan
