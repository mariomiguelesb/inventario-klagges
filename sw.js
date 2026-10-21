/**
 * ============================================================
 * Archivo: sw.js
 * Dónde va: GitHub, repositorio inventario-klagges (raíz)
 * Entrega 2D · Hito 2 · versión 0.2.0
 * ============================================================
 * Service worker: guarda los archivos de la app en el equipo para que abra al instante y sin señal.
 * - Lo registra actualizacion.js con la versión en la dirección (sw.js?v=0.2.0). Cada versión
 *   guarda sus archivos aparte, en "klagges-app-0.2.0"; al activarse una nueva, borra las anteriores.
 * - Al instalarse descarga todos los archivos recién publicados (sin copias guardadas por el
 *   navegador o la red). Si alguno falla, o si config.js no trae la misma versión, la instalación
 *   se descarta y sigue la versión anterior.
 * - Una versión nueva espera hasta que la persona toque Actualizar (o cierre la app), para no
 *   cambiar los archivos con una pantalla abierta.
 * - Solo atiende archivos de este mismo sitio: las llamadas a la API de Apps Script siempre van
 *   directo a la red.
 * Cada archivo nuevo de la app se suma a ARCHIVOS.
 */

const VERSION = new URL(self.location.href).searchParams.get('v') || 'sin-version';
const PREFIJO_CACHE = 'klagges-app-';
const CACHE = PREFIJO_CACHE + VERSION;
const PAGINA = 'index.html';

const ARCHIVOS = [
  'index.html', 'styles.css', 'disposicion.css', 'manifest.json',
  'config.js', 'util.js', 'api.js', 'app.js', 'marco.js', 'existencias.js', 'actualizacion.js',
  'vistas/ingreso.js', 'vistas/inicio.js', 'vistas/inventario.js', 'vistas/articulo.js', 'vistas/mas.js',
  'iconos/icono.svg', 'iconos/icono-32.png', 'iconos/icono-192.png', 'iconos/icono-512.png',
  'iconos/icono-maskable-512.png', 'iconos/apple-touch-icon.png'
];

self.addEventListener('install', evento => {
  evento.waitUntil(guardarArchivos());
});

self.addEventListener('activate', evento => {
  evento.waitUntil(borrarVersionesAnteriores().then(() => self.clients.claim()));
});

// La app pide activar la versión que espera cuando la persona toca Actualizar.
self.addEventListener('message', evento => {
  if (evento.data && evento.data.tipo === 'activar') self.skipWaiting();
});

self.addEventListener('fetch', evento => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return; // la API usa POST
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return; // otros sitios, como la API: directo a la red
  if (url.searchParams.has('comprobar')) return; // revisión de versión nueva: siempre a la red
  if (pedido.mode === 'navigate') {
    // La app es una sola página; otras páginas del sitio van a la red.
    if (esPaginaDeLaApp(url)) evento.respondWith(responder(PAGINA, pedido, false));
    return;
  }
  evento.respondWith(responder(pedido, pedido, url.search === ''));
});

/** Descarga todo primero y recién entonces lo guarda: nunca queda una versión a medias. */
async function guardarArchivos() {
  const respuestas = await Promise.all(ARCHIVOS.map(descargar));
  await revisarVersion(respuestas[ARCHIVOS.indexOf('config.js')]);
  const existia = await caches.has(CACHE);
  const cache = await caches.open(CACHE);
  try {
    await Promise.all(ARCHIVOS.map((archivo, posicion) => cache.put(archivo, respuestas[posicion])));
  } catch (error) {
    if (!existia) await caches.delete(CACHE); // por ejemplo, el equipo sin espacio
    throw error;
  }
}

/**
 * Trae un archivo tal como está publicado: la marca ?v= evita copias viejas del navegador o de la
 * red. Se guarda una copia limpia, como si viniera de la dirección sin ?v=, solo con su tipo.
 */
async function descargar(archivo) {
  const respuesta = await fetch(archivo + '?v=' + encodeURIComponent(VERSION), { cache: 'no-store' });
  if (!respuesta.ok) throw new Error(archivo + ' respondió ' + respuesta.status);
  const tipo = respuesta.headers.get('Content-Type') || 'application/octet-stream';
  return new Response(await respuesta.blob(), { status: 200, headers: { 'Content-Type': tipo } });
}

/** config.js debe traer la misma versión con que se registró este service worker. */
async function revisarVersion(respuesta) {
  const encontrada = /APP_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(await respuesta.clone().text());
  const publicada = encontrada ? encontrada[1] : '';
  if (publicada !== VERSION) throw new Error('config.js trae la versión "' + publicada + '" y se esperaba "' + VERSION + '"');
}

async function borrarVersionesAnteriores() {
  const nombres = await caches.keys();
  await Promise.all(nombres
    .filter(nombre => nombre.indexOf(PREFIJO_CACHE) === 0 && nombre !== CACHE)
    .map(nombre => caches.delete(nombre)));
}

/** La página de la app: la carpeta del sitio o index.html, con o sin parámetros. */
function esPaginaDeLaApp(url) {
  const carpeta = new URL('./', self.location.href).pathname;
  return url.pathname === carpeta || url.pathname === carpeta + PAGINA;
}

/**
 * Responde desde los archivos guardados de esta versión. Si un archivo no está guardado, lo pide
 * a la red y, si es un archivo simple de este sitio (sin parámetros), lo guarda para la próxima vez.
 */
async function responder(clave, pedido, guardarSiFalta) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(clave, { ignoreVary: true });
  if (guardada) return guardada;
  const respuesta = await fetch(pedido);
  if (guardarSiFalta && respuesta.ok && respuesta.type === 'basic') {
    cache.put(pedido, respuesta.clone()).catch(() => {});
  }
  return respuesta;
}
