import { renderCatalogoSigamefView, initCatalogoSigamefView } from './registroDatos/catalogoSigamefView.js';
import { renderUsuariosPermisosView, initUsuariosPermisosView } from './registroDatos/usuariosPermisosView.js';
import { renderPedidosSigamefView, initPedidosSigamefView } from './registroDatos/pedidosSigamefView.js';
import { renderConfiguracionDocView, initConfiguracionDocView } from './registroDatos/configuracionDocView.js';
import { renderMetasAreasView, initMetasAreasView } from './registroDatos/metasAreasView.js';
import { renderOrdenesView, initOrdenesView } from './registroDatos/ordenesView.js';
import { renderSiafView, initSiafView } from './registroDatos/siafView.js';
import { renderFichaNetView, initFichaNetView } from './registroDatos/fichaNetView.js';
import { renderCarrerasProfesionalesView, initCarrerasProfesionalesView } from './registroDatos/carrerasProfesionalesView.js';
import { renderFormatoBienesView, initFormatoBienesView } from './glosasRequerimientos/formatoBienesView.js';
import { renderFormatoServiciosView, initFormatoServiciosView } from './glosasRequerimientos/formatoServiciosView.js';
import { renderFormatoLocacionView, initFormatoLocacionView } from './glosasRequerimientos/formatoLocacionView.js';
import { renderFormatoLicitacionesView, initFormatoLicitacionesView } from './glosasRequerimientos/formatoLicitacionesView.js';
import { renderFormatoConcursoView, initFormatoConcursoView } from './glosasRequerimientos/formatoConcursoView.js';
import { renderLogotiposView, initLogotiposView } from './institucional/logotiposView.js';
import { renderEntidadView, initEntidadView } from './institucional/entidadView.js';
import { renderProveedoresMaestroView, initProveedoresMaestroView } from './registroDatos/proveedoresMaestroView.js';
import { renderWorkflowSgcView, initWorkflowSgcView } from './mantenimiento/workflowSgcView.js';

const subRoutes = {
  'mantenimiento/usuarios': { render: renderUsuariosPermisosView, init: initUsuariosPermisosView },
  'mantenimiento/proveedores': { render: renderProveedoresMaestroView, init: initProveedoresMaestroView },
  'mantenimiento/workflow-sgc': { render: renderWorkflowSgcView, init: initWorkflowSgcView },
  'mantenimiento/catalogo': { render: renderCatalogoSigamefView, init: initCatalogoSigamefView },
  'mantenimiento/pedidos-sigamef': { render: renderPedidosSigamefView, init: initPedidosSigamefView },
  'mantenimiento/configuracion': { render: renderConfiguracionDocView, init: initConfiguracionDocView },
  'mantenimiento/metas': { render: renderMetasAreasView, init: initMetasAreasView },
  'mantenimiento/ordenes': { render: renderOrdenesView, init: initOrdenesView },
  'mantenimiento/siaf': { render: renderSiafView, init: initSiafView },
  'mantenimiento/fichanet': { render: renderFichaNetView, init: initFichaNetView },
  'mantenimiento/carreras': { render: renderCarrerasProfesionalesView, init: initCarrerasProfesionalesView },
  'mantenimiento/bienes': { render: renderFormatoBienesView, init: initFormatoBienesView },
  'mantenimiento/servicios': { render: renderFormatoServiciosView, init: initFormatoServiciosView },
  'mantenimiento/locacion': { render: renderFormatoLocacionView, init: initFormatoLocacionView },
  'mantenimiento/licitaciones': { render: renderFormatoLicitacionesView, init: initFormatoLicitacionesView },
  'mantenimiento/concurso': { render: renderFormatoConcursoView, init: initFormatoConcursoView },
  'mantenimiento/logotipos': { render: renderLogotiposView, init: initLogotiposView },
  'mantenimiento/entidad': { render: renderEntidadView, init: initEntidadView }
};

export function renderMantenimientoView(currentRoute) {
  const sub = subRoutes[currentRoute];
  if (sub) {
    return sub.render();
  }

  const users = JSON.parse(localStorage.getItem('users') || '[]');
  let tableRows = '';
  users.forEach(u => {
    tableRows += `<tr><td>${u.dni}</td><td>${u.nombre || ''}</td><td>${u.rol}</td><td>${u.email || ''}</td><td>
      <button class="btn btn-sm btn-warning" onclick="alert('Editar usuario: ${u.dni}')">Editar</button>
      <button class="btn btn-sm btn-danger" onclick="alert('Eliminar usuario: ${u.dni}')">Eliminar</button>
    </td></tr>`;
  });

  return `
    <div class="container mt-4">
      <h2>Mantenimiento del Sistema</h2>
      <p class="text-muted">Gestión de usuarios, roles y configuración del sistema</p>
      
      <ul class="nav nav-tabs mb-3">
        <li class="nav-item"><a class="nav-link active" href="#" onclick="alert('Usuarios')">Usuarios</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="alert('Roles y Permisos')">Roles y Permisos</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="alert('Configuración')">Configuración</a></li>
      </ul>
      
      <div class="card">
        <div class="card-header bg-primary text-white">
          <h5 class="mb-0">Gestión de Usuarios</h5>
        </div>
        <div class="card-body">
          <button class="btn btn-success mb-3" onclick="alert('Formulario de nuevo usuario')">+ Nuevo Usuario</button>
          <table class="table table-striped">
            <thead>
              <tr><th>DNI</th><th>Nombre</th><th>Rol</th><th>Email</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function initMantenimientoView(currentRoute) {
  const sub = subRoutes[currentRoute];
  if (sub) {
    sub.init();
    return;
  }
  console.log("Vista de Mantenimiento inicializada");
}
