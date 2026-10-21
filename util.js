/**
 * ============================================================
 * Archivo: util.js
 * Dónde va: GitHub, repositorio inventario-klagges (raíz)
 * Entrega 2B-1 · Hito 2 · versión 0.2.0
 * ============================================================
 * Utilidades de la app: formatos chilenos (pesos, cantidades, fechas), vencimientos,
 * búsqueda sin tildes, creación segura de elementos e íconos.
 * Todo texto que viene del servidor se pinta como texto, nunca como HTML: así un nombre de
 * artículo con símbolos raros no puede romper la página.
 */

export const ZONA_HORARIA = 'America/Santiago';
const SVG = 'http://www.w3.org/2000/svg';

// ---------- Números y montos (formato chileno: 1.234.567,5) ----------

/** 1234.5 → "1.234,5". Hasta 3 decimales por defecto, sin ceros de relleno. */
export function formatoNumero(valor, decimales) {
  const maximo = decimales === undefined ? 3 : decimales;
  const numero = Number(valor) || 0;
  const partes = Math.abs(numero).toFixed(maximo).split('.');
  const entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraccion = (partes[1] || '').replace(/0+$/, '');
  const negativo = numero < 0 && (entero !== '0' || fraccion !== '');
  return (negativo ? '-' : '') + entero + (fraccion ? ',' + fraccion : '');
}

/** 1234567 → "$1.234.567" (pesos enteros). */
export function formatoPesos(valor) {
  const pesos = Math.round(Number(valor) || 0);
  return (pesos < 0 ? '-$' : '$') + formatoNumero(Math.abs(pesos), 0);
}

// Cómo se muestra cada unidad base.
const UNIDADES = { KG: 'kg', G: 'g', L: 'L', ML: 'ml', UN: 'un' };

export function textoUnidad(unidad) {
  const codigo = String(unidad || '').trim().toUpperCase();
  return UNIDADES[codigo] || codigo.toLowerCase();
}

/** 8.5, 'KG' → "8,5 kg". */
export function formatoCantidad(cantidad, unidad) {
  return formatoNumero(cantidad, 3) + ' ' + textoUnidad(unidad);
}

/** 3, 'artículo', 'artículos' → "3 artículos". */
export function plural(cantidad, singular, varios) {
  return formatoNumero(cantidad, 0) + ' ' + (Number(cantidad) === 1 ? singular : varios);
}

// ---------- Fechas (texto ISO en hora de Chile, igual que en la planilla) ----------

function partesChile(fecha) {
  const partes = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(fecha || new Date()).forEach(parte => { partes[parte.type] = parte.value; });
  if (partes.hour === '24') partes.hour = '00';
  return partes;
}

/** Fecha de hoy en Chile: "AAAA-MM-DD". */
export function hoyIso() {
  const p = partesChile();
  return p.year + '-' + p.month + '-' + p.day;
}

/** Fecha y hora actual en Chile: "AAAA-MM-DDTHH:MM:SS". */
export function ahoraIso() {
  const p = partesChile();
  return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second;
}

/** "2026-10-24" → "24-10-2026". */
export function formatoFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

/** "2026-10-21T09:02:15" → "21-10-2026 09:02". */
export function formatoFechaHora(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso || ''));
  return m ? m[3] + '-' + m[2] + '-' + m[1] + ' ' + m[4] + ':' + m[5] : formatoFecha(iso);
}

function diaUtc(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Días entre dos fechas "AAAA-MM-DD" (positivo si hasta es posterior). null si alguna falta. */
export function diasEntre(desde, hasta) {
  const a = diaUtc(desde);
  const b = diaUtc(hasta);
  return a === null || b === null ? null : Math.round((b - a) / 86400000);
}

// ---------- Vencimientos ----------

/**
 * Estado de una fecha de vencimiento según los umbrales de Config (por ejemplo [7, 15, 30]).
 * Devuelve {nivel, dias, texto}. nivel: 'vencido', 'critico', 'pronto', 'atento', 'normal' o 'sin'.
 */
export function estadoVencimiento(fecha, umbrales, hoy) {
  const dias = fecha ? diasEntre(hoy || hoyIso(), fecha) : null;
  if (dias === null) return { nivel: 'sin', dias: null, texto: 'Sin vencimiento' };
  const lista = (Array.isArray(umbrales) && umbrales.length ? umbrales : [7, 15, 30]).slice().sort((a, b) => a - b);
  const [critico, pronto, atento] = [lista[0], lista[1] || lista[0], lista[2] || lista[1] || lista[0]];
  let nivel = 'normal';
  if (dias < 0) nivel = 'vencido';
  else if (dias <= critico) nivel = 'critico';
  else if (dias <= pronto) nivel = 'pronto';
  else if (dias <= atento) nivel = 'atento';
  let texto;
  if (dias < -1) texto = 'Venció hace ' + (-dias) + ' días';
  else if (dias === -1) texto = 'Venció ayer';
  else if (dias === 0) texto = 'Vence hoy';
  else if (dias === 1) texto = 'Vence mañana';
  else if (dias <= atento) texto = 'Vence en ' + dias + ' días';
  else texto = 'Vence el ' + formatoFecha(fecha);
  return { nivel: nivel, dias: dias, texto: texto };
}

/** Clase CSS del estado de un vencimiento: estado--critico, estado--pronto, estado--atento o ''. */
export function claseVencimiento(nivel) {
  if (nivel === 'vencido' || nivel === 'critico') return 'estado--critico';
  if (nivel === 'pronto') return 'estado--pronto';
  if (nivel === 'atento') return 'estado--atento';
  return '';
}

// ---------- Búsqueda ----------

/** "Plátano Ñuble" → "platano nuble": minúsculas y sin tildes, para buscar sin importar cómo se escriba. */
export function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** true si cada palabra buscada aparece en alguno de los textos (nombre, código, categoría…). */
export function coincide(busqueda, textos) {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const donde = normalizar(textos.join(' '));
  return palabras.every(palabra => donde.indexOf(palabra) >= 0);
}

/** Ejecuta la función solo cuando pasan unos milisegundos sin nuevas llamadas (por ejemplo, al escribir). */
export function retrasar(funcion, milisegundos) {
  let espera = null;
  return function () {
    const argumentos = arguments;
    clearTimeout(espera);
    espera = setTimeout(() => funcion.apply(null, argumentos), milisegundos);
  };
}

// ---------- Elementos de la página ----------

/**
 * Crea un elemento: crear('button', {clase: 'boton', type: 'button', onclick: fn}, 'Texto', otroElemento).
 * clase acepta texto o lista; datos llena data-*; on… agrega eventos; true deja el atributo sin valor.
 */
export function crear(etiqueta, atributos) {
  const elemento = document.createElement(etiqueta);
  const opciones = atributos || {};
  Object.keys(opciones).forEach(clave => {
    const valor = opciones[clave];
    if (valor === undefined || valor === null || valor === false) return;
    if (clave === 'clase') elemento.className = Array.isArray(valor) ? valor.filter(Boolean).join(' ') : valor;
    else if (clave === 'datos') Object.keys(valor).forEach(dato => { elemento.dataset[dato] = valor[dato]; });
    else if (clave.indexOf('on') === 0 && typeof valor === 'function') elemento.addEventListener(clave.slice(2), valor);
    else elemento.setAttribute(clave, valor === true ? '' : String(valor));
  });
  agregar(elemento, Array.prototype.slice.call(arguments, 2));
  return elemento;
}

/** Agrega hijos a un elemento: textos (como texto), elementos o listas de ambos. Omite null y false. */
export function agregar(elemento, hijos) {
  (Array.isArray(hijos) ? hijos : [hijos]).forEach(hijo => {
    if (hijo === null || hijo === undefined || hijo === false) return;
    if (Array.isArray(hijo)) agregar(elemento, hijo);
    else elemento.appendChild(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  });
  return elemento;
}

/** Quita todo el contenido de un elemento. */
export function vaciar(elemento) {
  while (elemento.firstChild) elemento.removeChild(elemento.firstChild);
  return elemento;
}

// Íconos de línea (24 × 24): cada uno es una lista de [etiqueta SVG, atributos].
const ICONOS = {
  inicio: [['path', { d: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z' }]],
  inventario: [['rect', { x: 3, y: 3, width: 8, height: 8, rx: 1.5 }], ['rect', { x: 13, y: 3, width: 8, height: 8, rx: 1.5 }],
    ['rect', { x: 3, y: 13, width: 8, height: 8, rx: 1.5 }], ['rect', { x: 13, y: 13, width: 8, height: 8, rx: 1.5 }]],
  agregar: [['path', { d: 'M12 5v14M5 12h14' }]],
  faenas: [['path', { d: 'M3 20 12 4l9 16' }], ['path', { d: 'M8.5 20 12 13l3.5 7' }], ['path', { d: 'M2 20h20' }]],
  mas: [['circle', { cx: 5, cy: 12, r: 1.8, fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: 12, cy: 12, r: 1.8, fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: 19, cy: 12, r: 1.8, fill: 'currentColor', stroke: 'none' }]],
  buscar: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'm20 20-3.5-3.5' }]],
  volver: [['path', { d: 'm15 18-6-6 6-6' }]],
  siguiente: [['path', { d: 'm9 6 6 6-6 6' }]],
  cerrar: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
  actualizar: [['path', { d: 'M20 12a8 8 0 1 1-2.3-5.7' }], ['path', { d: 'M20 4v5h-5' }]],
  salir: [['path', { d: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3' }], ['path', { d: 'm10 17-5-5 5-5' }], ['path', { d: 'M5 12h11' }]],
  alerta: [['path', { d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' }],
    ['path', { d: 'M12 9v4M12 17h.01' }]],
  usuario: [['circle', { cx: 12, cy: 8, r: 4 }], ['path', { d: 'M4 21a8 8 0 0 1 16 0' }]]
};

function elementoSvg(etiqueta, atributos) {
  const elemento = document.createElementNS(SVG, etiqueta);
  Object.keys(atributos).forEach(clave => elemento.setAttribute(clave, String(atributos[clave])));
  return elemento;
}

/** Ícono de línea por nombre (ver ICONOS). Toma el color del texto que lo rodea. */
export function icono(nombre, clase) {
  const svg = elementoSvg('svg', {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
    class: 'icono' + (clase ? ' ' + clase : '')
  });
  (ICONOS[nombre] || []).forEach(parte => svg.appendChild(elementoSvg(parte[0], parte[1])));
  return svg;
}

/** Ícono de la app: K con tallo de tenedor, en blanco sobre azul petróleo. */
export function marca(clase) {
  const svg = elementoSvg('svg', { viewBox: '0 0 512 512', 'aria-hidden': 'true', focusable: 'false', class: clase || 'marca__icono' });
  const tinta = '#FFFFFF';
  [
    ['rect', { width: 512, height: 512, rx: 112, fill: '#0F4C5C' }],
    ['line', { x1: 232, y1: 262, x2: 356, y2: 152, stroke: tinta, 'stroke-width': 60, 'stroke-linecap': 'round' }],
    ['line', { x1: 232, y1: 286, x2: 356, y2: 384, stroke: tinta, 'stroke-width': 60, 'stroke-linecap': 'round' }],
    ['rect', { x: 138, y: 116, width: 22, height: 100, rx: 11, fill: tinta }],
    ['rect', { x: 171, y: 116, width: 22, height: 100, rx: 11, fill: tinta }],
    ['rect', { x: 204, y: 116, width: 22, height: 100, rx: 11, fill: tinta }],
    ['path', { fill: tinta, d: 'M138 196 L226 196 L226 214 C226 236 214 248 208 256 L208 380 C208 396 196 404 183 404 ' +
      'C170 404 158 396 158 380 L158 256 C152 248 138 236 138 214 Z' }]
  ].forEach(parte => svg.appendChild(elementoSvg(parte[0], parte[1])));
  return svg;
}
