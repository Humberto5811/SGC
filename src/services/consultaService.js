class ConsultaService {
  constructor() {
    this.consultas = [];
  }

  list() {
    return this.consultas;
  }

  create(consulta) {
    const next = { ...consulta, id: `q_${Date.now()}`, estado: 'PENDIENTE', createdAt: new Date().toISOString() };
    this.consultas.push(next);
    return next;
  }
}

const consultaService = new ConsultaService();
export { consultaService as ConsultaService };
