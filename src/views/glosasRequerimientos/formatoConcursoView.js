import { createGlosaView } from './glosaFactory.js';

const view = createGlosaView('concurso', 'Formato Concurso', 'bi-trophy');
const renderFormatoConcursoView = view.render;
const initFormatoConcursoView = view.init;
export { renderFormatoConcursoView, initFormatoConcursoView };
