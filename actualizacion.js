/**
 * ============================================================
 * Archivo: actualizacion.js
 * Dónde va: GitHub, repositorio inventario-klagges (raíz)
 * Entrega 2D · Hito 2 · versión 0.2.0
 * ============================================================
 * Instalación de la app en el equipo y aviso de versión nueva:
 * - Registra el service worker (sw.js), que guarda la app en el equipo para que abra al instante
 *   y sin señal. La versión viaja en la dirección: sw.js?v=0.2.0.
 * - Revisa si hay una versión nueva al abrir la app, al volver a ella (como máximo cada 30
 *   minutos), al recuperar la señal y con el botón "Buscar actualización" de Más. Compara el
 *   APP_VERSION de config.js publicado en GitHub con el de la versión en uso.
 * - Si hay una, la descarga completa en segundo plano y recién entonces muestra "Hay una versión
 *   nueva de la app" con el botón Actualizar. La app no se recarga sola, para no interrumpir lo
 *   que se está haciendo; si se cierra y se vuelve a abrir, ya abre con la versión nueva.
 * La usa app.js: iniciar({version, avisar}). La pantalla Más usa buscar().
 */

const MINUTOS_ENTRE_REVISIONES = 30;
const ESPERA_PRIMERA_REVISION_MS = 5000; // deja pasar primero la carga de los datos
const ESPERA_DESCARGA_MS = 60000; // tope para esperar que termine de bajar una versión nueva
const ESPERA_ACTIVACION_MS = 8000; // si la versión nueva no toma el control, se recarga igual
const OPCIONES_REGISTRO = { scope: './', updateViaCache: 'none' };

const estado = {
  version: '', // versión en uso (APP_VERSION de config.js)
  avisar: null, // función de marco.js para los avisos
  registro: null, // promesa con el registro del service worker, o null si el navegador no lo permite
  teniaControlador: false, // la pantalla ya estaba en manos del service worker al abrirse
  pidioActualizar: false, // la persona tocó Actualizar en esta pantalla
  recargando: false,
  ultimaRevision: 0, // hora de la última revisión que obtuvo respuesta
  revisando: null, // promesa de la revisión en curso
  aviso: null, // aviso fijo mostrado por este archivo
  versionAvisada: ''
};

/** Se llama una vez, al abrir la app. */
export function iniciar(opciones) {
  estado.version = String(opciones.version || '');
  estado.avisar = opciones.avisar;
  if ('serviceWorker' in navigator) {
    estado.teniaControlador = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', alCambiarControlador);
    estado.registro = prepararRegistro().catch(error => {
      // Por ejemplo, ventana privada de algunos navegadores: la app funciona igual, solo en línea.
      console.warn('No se pudo registrar el service worker:', error);
      return null;
    });
  } else {
    estado.registro = Promise.resolve(null);
  }
  const revisarSinApuro = () => revisar(false).catch(() => {});
  setTimeout(revisarSinApuro, ESPERA_PRIMERA_REVISION_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revisarSinApuro();
  });
  window.addEventListener('online', revisarSinApuro);
}

/**
 * Botón "Buscar actualización" de Más. Devuelve true si hay una versión nueva (este archivo
 * muestra los avisos) y false si la que está en uso es la publicada. Sin señal, lanza un error.
 */
export function buscar() {
  return revisar(true);
}

// ---------- Registro del service worker ----------

/**
 * Pantalla servida por el service worker: si ya está bajando o esperando una versión nueva, solo
 * la sigue (registrar la versión en uso la reemplazaría por la antigua).
 * Pantalla abierta sin él (primera vez o recarga forzada): sus archivos vienen recién publicados,
 * así que se registra esa versión.
 */
async function prepararRegistro() {
  let registro = null;
  if (navigator.serviceWorker.controller) registro = await navigator.serviceWorker.getRegistration();
  if (!registro || !(registro.installing || registro.waiting)) {
    registro = await navigator.serviceWorker.register(direccionTrabajador(estado.version), OPCIONES_REGISTRO);
  }
  registro.addEventListener('updatefound', () => seguirDescarga(registro, registro.installing));
  if (registro.installing) seguirDescarga(registro, registro.installing);
  else if (registro.waiting) alTerminarDescarga(registro, registro.waiting);
  return registro;
}

function direccionTrabajador(version) {
  return 'sw.js?v=' + encodeURIComponent(version);
}

/** Versión de un service worker, tomada de su dirección (sw.js?v=0.2.0). */
function versionDe(trabajador) {
  if (!trabajador) return '';
  return new URL(trabajador.scriptURL).searchParams.get('v') || '';
}

function seguirDescarga(registro, trabajador) {
  esperarDescarga(trabajador).then(lista => {
    if (lista) alTerminarDescarga(registro, trabajador);
  });
}

/** Espera que un service worker termine de guardar sus archivos: true si quedó listo, false si falló. */
function esperarDescarga(trabajador) {
  return new Promise(resolver => {
    if (!trabajador) {
      resolver(false);
      return;
    }
    let reloj = null;
    const terminar = () => {
      if (trabajador.state === 'installing' || trabajador.state === 'parsed') return false;
      trabajador.removeEventListener('statechange', terminar);
      clearTimeout(reloj);
      resolver(trabajador.state !== 'redundant');
      return true;
    };
    if (terminar()) return;
    trabajador.addEventListener('statechange', terminar);
    reloj = setTimeout(() => {
      trabajador.removeEventListener('statechange', terminar);
      resolver(false);
    }, ESPERA_DESCARGA_MS);
  });
}

/** Una versión terminó de guardarse en el equipo. */
function alTerminarDescarga(registro, trabajador) {
  const version = versionDe(trabajador);
  if (version === estado.version) {
    // Es la misma versión que ya muestra esta pantalla: que tome el control sin preguntar.
    if (registro.waiting === trabajador) trabajador.postMessage({ tipo: 'activar' });
    return;
  }
  mostrarAvisoNueva(registro, version, false);
}

// ---------- Revisión de versión nueva ----------

function revisar(manual) {
  if (estado.revisando) return estado.revisando;
  if (!manual && Date.now() - estado.ultimaRevision < MINUTOS_ENTRE_REVISIONES * 60000) return Promise.resolve(false);
  estado.revisando = revisarAhora(manual).finally(() => {
    estado.revisando = null;
  });
  return estado.revisando;
}

async function revisarAhora(manual) {
  const registro = await estado.registro;
  const esperando = registro ? registro.waiting : null;
  if (esperando && versionDe(esperando) !== estado.version) {
    // Ya se descargó una versión nueva: basta con volver a mostrar el aviso.
    mostrarAvisoNueva(registro, versionDe(esperando), manual);
    return true;
  }

  const publicada = await leerVersionPublicada();
  estado.ultimaRevision = Date.now();
  if (publicada === estado.version) return false;
  if (!registro) {
    // Navegador sin service worker: basta con recargar para traer la versión nueva.
    mostrarAvisoNueva(null, publicada, manual);
    return true;
  }

  if (manual) estado.avisar('Hay una versión nueva. Descargándola…');
  const enCurso = registro.installing || registro.waiting;
  let trabajador = enCurso;
  if (!enCurso || versionDe(enCurso) !== publicada) {
    const nuevo = await navigator.serviceWorker.register(direccionTrabajador(publicada), OPCIONES_REGISTRO);
    trabajador = nuevo.installing || nuevo.waiting || nuevo.active;
  }
  const lista = await esperarDescarga(trabajador);
  if (lista) alTerminarDescarga(registro, trabajador);
  else if (manual) estado.avisar('Hay una versión nueva, pero no terminó de descargarse. Intenta de nuevo en unos minutos.');
  return true;
}

/** APP_VERSION de config.js tal como está publicado (sin copias guardadas en el equipo). */
async function leerVersionPublicada() {
  const respuesta = await fetch('config.js?comprobar=' + Date.now(), { cache: 'no-store' });
  if (!respuesta.ok) throw new Error('config.js respondió ' + respuesta.status);
  const encontrada = /APP_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(await respuesta.text());
  if (!encontrada) throw new Error('config.js no trae APP_VERSION');
  return encontrada[1];
}

// ---------- Avisos y cambio de versión ----------

/** Aviso fijo "Hay una versión nueva de la app" con el botón Actualizar (una vez por versión). */
function mostrarAvisoNueva(registro, version, repetir) {
  if (estado.aviso && estado.versionAvisada === version && !repetir) return;
  if (estado.aviso) estado.aviso.cerrar();
  estado.versionAvisada = version;
  estado.aviso = estado.avisar('Hay una versión nueva de la app.', {
    accion: 'Actualizar',
    alAccionar: () => actualizar(registro)
  });
}

/** Botón Actualizar: activa la versión que espera y, cuando toma el control, recarga la pantalla. */
function actualizar(registro) {
  estado.aviso = null;
  estado.versionAvisada = '';
  const esperando = registro ? registro.waiting : null;
  if (!esperando || versionDe(esperando) === estado.version) {
    recargar(); // la versión nueva ya está activa (o no hay service worker): basta con recargar
    return;
  }
  estado.pidioActualizar = true;
  estado.avisar('Actualizando la app…', { duracion: ESPERA_ACTIVACION_MS });
  esperando.postMessage({ tipo: 'activar' });
  setTimeout(recargar, ESPERA_ACTIVACION_MS);
}

/** Otro service worker tomó el control de esta pantalla. */
function alCambiarControlador() {
  const primeraVez = !estado.teniaControlador;
  estado.teniaControlador = true;
  if (estado.pidioActualizar) {
    recargar();
    return;
  }
  if (primeraVez) return; // recién instalado: esta pantalla ya es la versión publicada
  // Otra ventana de la app tocó Actualizar: esta sigue con los archivos anteriores en memoria.
  if (estado.aviso) estado.aviso.cerrar();
  estado.versionAvisada = '';
  estado.aviso = estado.avisar('La app se actualizó en otra ventana.', { accion: 'Recargar', alAccionar: recargar });
}

function recargar() {
  if (estado.recargando) return;
  estado.recargando = true;
  window.location.reload();
}
