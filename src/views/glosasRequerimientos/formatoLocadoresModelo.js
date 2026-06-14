// Definición del documento Formato Locadores (Glosas de Requerimientos):
// Estructura según GLOSA TDR LOCADOR V2.docx
// kind: 'numero' | 'heading' | 'perfil_academico' | 'tabla_entregas' | 'tabla_informacion' | 'firmas'
export const MODELO_LOCADORES = [
  // ===== 4.2 — CARACTERÍSTICAS TÉCNICAS DEL SERVICIO =====
  { key: '4.2', kind: 'numero', label: '4.2', type: 'textarea', titulo: 'CARACTERÍSTICAS TÉCNICAS DEL SERVICIO', helper: '(Indicar detalladamente cada una de las actividades que realizará el locador)', default: 'Las características técnicas del presente servicio consisten en:\n\nxxxxxxxx.\nxxxxxxxx.\n(se deberá precisar detalladamente cada una de las actividades que realizará el locador, NO se deberá consignar la frase: "y otras funciones que designe la jefatura"; esto con la finalidad de evitar crear vínculo laboral).' },

  // ===== 5 — PERFIL DEL PROVEEDOR =====
  { key: '5', kind: 'heading', label: '5', titulo: 'PERFIL DEL PROVEEDOR' },
  { key: '5.1', kind: 'perfil_academico', label: '5.1', titulo: 'FORMACIÓN ACADÉMICA' },
  { key: '5.2', kind: 'numero', label: '5.2', type: 'textarea', titulo: 'EXPERIENCIA EN GENERAL', default: 'Experiencia laboral general no menor a xxx (xx) año en el sector público y/o privado.' },
  { key: '5.3', kind: 'numero', label: '5.3', type: 'textarea', titulo: 'EXPERIENCIA ESPECÍFICA', default: 'Experiencia laboral específica no menor a xxx (xxx) año en: …..\n\n(se deberá precisar en qué materia se tiene la experiencia específica. Por ejemplo: experiencia específica como analista en contrataciones y/o especialista en contrataciones y/o coordinación de logística).' },
  { key: '5.4', kind: 'numero', label: '5.4', type: 'textarea', titulo: 'CAPACITACIÓN', default: 'xxxxxxxx.\n(se deberá precisar si es curso, diplomado, programa de especialización u otro tipo de capacitación, la misma que deberá ser acreditada fehacientemente con el documento correspondiente).' },
  { key: '5.5', kind: 'numero', label: '5.5', type: 'textarea', titulo: 'ACREDITACIÓN', default: 'El nivel de formación se acreditará con la copia del diploma respectivo.\nLa capacitación y/o entrenamiento se acreditará con copia de certificados, diplomas o constancias.\nLa experiencia del personal se acreditará con cualquiera de los siguientes documentos: (i) copia simple de contratos, (ii) órdenes de servicio, (iii) constancias, (iv) certificados, (v) cualquier otra documentación que de manera fehaciente demuestre la experiencia del personal propuesto.' },
  { key: '5.6', kind: 'numero', label: '5.6', type: 'textarea', titulo: 'REQUISITOS ADICIONALES PARA LA CONTRATACIÓN', default: 'Cotización y anexos remitidos en la solicitud de cotización.\nRegistro Nacional de Proveedores (RNP), vigente.\nConsulta RUC, activo.\nSuspensión de 4ta categoría, de corresponder.\nFormato CCI enlazado al RUC.\nCurrículum vitae (hoja de vida) documentado.' },

  // ===== 6 — SEGURO =====
  { key: '6', kind: 'numero', label: '6', type: 'textarea', titulo: 'SEGURO', default: 'En la contratación del servicio se debe solicitar la presentación del seguro contra accidentes personales o seguro complementario de trabajo de riesgo (pensión, salud) o ESSALUD ó SIS.' },

  // ===== 7 — OTRAS CLÁUSULAS =====
  { key: '7', kind: 'heading', label: '7', titulo: 'OTRAS CLÁUSULAS' },
  { key: '7.1', kind: 'numero', label: '7.1', type: 'textarea', titulo: 'SEGURIDAD DE LA INFORMACIÓN DE LA ENTIDAD', default: 'De requerir en el requerimiento, el contratista se compromete a respetar y aplicar en el servicio brindado, los lineamientos de Seguridad de la Información con Proveedores del INS, los mismos que declara conocer y aceptar. Asimismo, para el inicio efectivo del servicio el contratista deberá de presentar la siguiente documentación: Compromiso de confidencialidad y no divulgación de información del INS. Constancia de recepción de lineamiento de seguridad de la información.' },
  { key: '7.2', kind: 'numero', label: '7.2', type: 'textarea', titulo: 'CLÁUSULA ANTICORRUPCIÓN Y ANTISOBORNO', default: 'El proveedor adjudicado declara y garantiza no haber, directa o indirectamente, o tratándose de una persona jurídica a través de sus socios, integrantes de los órganos de administración, apoderados, representantes legales, funcionarios, asesores o personas vinculadas a las que se refiere el artículo 7 del Reglamento de la Ley de Contrataciones del Estado, ofrecido, negociado o efectuado, cualquier pago o, en general, cualquier beneficio o incentivo ilegal en relación al contrato o contrato menor.' },
  { key: '7.3', kind: 'numero', label: '7.3', type: 'textarea', titulo: 'CLÁUSULA DE CONFIDENCIALIDAD Y PROPIEDAD INTELECTUAL', default: 'El proveedor adjudicado se compromete a respetar los acuerdos de confidencialidad, el derecho de propiedad intelectual de la ENTIDAD y la información recibida para la ejecución de la prestación.' },
  { key: '7.4', kind: 'numero', label: '7.4', type: 'textarea', titulo: 'CLÁUSULA DE CUMPLIMIENTO — LEY N° 31564', default: 'El proveedor adjudicado se compromete a cumplir las disposiciones de la Ley N° 31564 y su reglamento, así como las directivas vigentes emitidas por OSCE.' },
  { key: '7.5', kind: 'numero', label: '7.5', type: 'textarea', titulo: 'SOLUCIÓN DE CONTROVERSIA', default: 'Cualquier controversia derivada de la presente contratación menor será resuelta mediante los mecanismos de solución de controversias establecidos en la normativa vigente.' },
  { key: '7.6', kind: 'numero', label: '7.6', type: 'textarea', titulo: 'VICIOS OCULTOS', default: 'El proveedor adjudicado responderá por la calidad de los bienes y/o servicios ofrecidos durante la vigencia del contrato menor y hasta un (01) año después de la conformidad otorgada.' },
  { key: '7.7', kind: 'numero', label: '7.7', type: 'textarea', titulo: 'GESTIÓN DE RIESGOS', default: 'El contratista deberá identificar y gestionar los riesgos que pudieran afectar la ejecución del servicio.' },
  { key: '7.8', kind: 'numero', label: '7.8', type: 'textarea', titulo: 'SOBRE LA DECLARACIÓN JURADA DE INTERESES', default: 'El proveedor adjudicado deberá presentar una declaración jurada de intereses, conforme a lo establecido en la normativa vigente.' },
  { key: '7.9', kind: 'numero', label: '7.9', type: 'textarea', titulo: 'CAUSALES DE RESOLUCIÓN DE CONTRATO', default: 'Son causales de resolución del contrato menor:\n\na) El incumplimiento injustificado de las obligaciones contractuales, legales o reglamentarias a su cargo.\nb) La acumulación del monto máximo de la penalidad por mora.\nc) Las demás establecidas en la normativa vigente.' },

  // ===== 8 — PLAZO, ENTREGABLES, MODALIDAD Y CONDICIONES DE PAGO =====
  { key: '8', kind: 'heading', label: '8', titulo: 'PLAZO, ENTREGABLES, MODALIDAD Y CONDICIONES DE PAGO' },
  { key: '8.1', kind: 'numero', label: '8.1', type: 'textarea', titulo: 'PLAZO DE REALIZACIÓN DEL SERVICIO', default: 'El plazo de ejecución del servicio será realizado hasta los xxx (xx) días calendario, contados a partir de notificada / del día siguiente de notificada la orden de servicio. (Contemplar aquí el plazo total del servicio)\n\nEl servicio se realizará en las instalaciones de xxxxxxxxxxxxxxxxx, de forma' },
  { key: '8.1_modalidad', kind: 'select_modalidad', label: '', titulo: 'Modalidad del servicio' },
  { key: '8.2', kind: 'numero', label: '8.2', type: 'textarea', titulo: 'ENTREGABLE(S)', default: '(De corresponder, detallar el número de entregables, el contenido de cada entregable, los plazos de presentación y condiciones relevantes para cumplir con cada entregable)\n\nEl presente servicio será ejecutado con xxx entregables y cada entregable será sustentado por un informe emitido por el proveedor adjudicado.' },
  { key: '8.2.1', kind: 'tabla_entregas', label: '8.2.1', titulo: 'N° DE ENTREGABLES' },
  { key: '8.2.2', kind: 'tabla_informacion', label: '8.2.2', titulo: 'PLAZO PARA PRESENTAR ENTREGABLES' },
  { key: '8.3', kind: 'numero', label: '8.3', type: 'textarea', titulo: 'MODALIDAD DE PAGO', default: 'Suma alzada.' },
  { key: '8.4', kind: 'numero', label: '8.4', type: 'textarea', titulo: 'CONDICIONES DE PAGO', default: 'Pago periódico / único, conforme a lo establecido en el numeral 8.2 y considerando la oferta económica del proveedor adjudicado.\n\n(Precisar si se realiza el pago de la contraprestación en un solo pago o pagos periódicos. Precisar la documentación obligatoria a presentar por el proveedor para la realización del pago).' },
  { key: '8.5', kind: 'numero', label: '8.5', type: 'textarea', titulo: 'DOCUMENTACIÓN OBLIGATORIA PARA EL PAGO', default: 'Carta de presentación del entregable.\nInforme de actividades.\nRecibo por honorarios.\nSuspensión de 4ta categoría, de corresponder.\nFormato CCI enlazado al RUC.\nSeguro particular, SCTR, ESSALUD o SIS (de corresponder).' },

  // ===== 9 — CONFORMIDAD DE LA PRESTACIÓN =====
  { key: '9', kind: 'numero', label: '9', type: 'textarea', titulo: 'CONFORMIDAD DE LA PRESTACIÓN', default: 'La Conformidad estará a cargo de (del) Centro y/u Oficina, previa presentación del entregable señalado en el numeral 8.2. de los términos de referencia.' },

  // ===== 10 — PENALIDADES =====
  { key: '10', kind: 'numero', label: '10', type: 'textarea', titulo: 'PENALIDADES', default: 'En caso de retraso injustificado en la ejecución de las prestaciones objeto del contrato menor, la entidad contratante le aplica al proveedor una penalidad por cada día de atraso que le sea imputable, hasta por un monto máximo equivalente al 10% del monto de la contratación o ítem correspondiente, que puede descontarse del pago del entregable o del pago final. En todos los casos, la penalidad se aplica automáticamente y se calcula de acuerdo con la siguiente fórmula:\n\nPenalidad diaria = 0.10 x Monto de la contratación o ítem / F x Plazo en días del entregable\nF = 0.40\n\nUna vez que se llega al monto máximo de la penalidad por mora, la entidad contratante puede optar por resolver el contrato menor.' },

  // ===== 11 — OTROS =====
  { key: '11', kind: 'numero', label: '11', type: 'textarea', titulo: 'OTROS', default: 'La presente contratación no busca contratar servicios para cubrir puestos o funciones de carácter permanente, no existiendo subordinación, dependencia, ni vínculo laboral con el locador contratado, no generando derecho laboral alguno para quien lo presta.' },

  // ===== Firmas =====
  { key: 'firmas', kind: 'firmas' },
];
