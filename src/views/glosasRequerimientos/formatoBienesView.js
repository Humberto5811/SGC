import { createGlosaView } from './glosaFactory.js';

const view = createGlosaView('bienes', 'Formato Bienes', 'bi-box');
const renderFormatoBienesView = view.render;
const initFormatoBienesView = view.init;
export { renderFormatoBienesView, initFormatoBienesView };
