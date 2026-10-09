// Inicialización del tema (claro/oscuro). Archivo EXTERNO para permitir una
// Content-Security-Policy estricta sin 'unsafe-inline' en script-src (C4).
import { initTheme } from '../utils/theme.js';
initTheme();
