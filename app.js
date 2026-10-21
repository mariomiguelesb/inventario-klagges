/**
 * ============================================================
 * Archivo: app.js
 * Dónde va: GitHub, repositorio inventario-klagges (raíz)
 * Entrega 2B-2 · Hito 2 · versión 0.2.0
 * ============================================================
 * Arranque, sesión y cambio de pantallas (el menú, los avisos y el tema están en marco.js):
 * - Muestra el ingreso o la app, según la sesión guardada en este equipo.
 * - Cambia de pantalla según la dirección (#/inicio, #/inventario?lugar=LUG-0001…): así funciona
 *   el botón Atrás del teléfono y cada pantalla se puede guardar como favorito.
 * - Si existe actualizacion.js (entrega 2D), le pasa la instalación y los avisos de versión nueva.
 *
 * Cada pantalla es un archivo de la carpeta vistas que exporta:
 *   mostrar(contenedor, contexto) → opcionalmente {actualizar(parametros), alSalir()}
 * - contenedor: elemento vacío donde la pantalla se dibuja.
 * - contexto: ruta, parametros, usuario, version, servidor (promesa con versión y ambiente de
 *   la API), actualizacion, navegar, avisar, ponerTitulo, salir y tema.
 * - actualizar(parametros): si existe, se usa cuando solo cambian los parámetros de la dirección
 *   (por ejemplo, otro lugar), sin redibujar toda la pantalla.
 * - alSalir(): si existe, se llama al dejar la pantalla.
 */

import { APP_VERSION } from './config.js';
import {
  ping, ambienteGuardado, obtenerSesion, usuarioActual, salir, cargarCatalogos, cargarInventario,
  EVENTO_SESION_TERMINADA
} from './api.js';
import { crear, agregar, vaciar, icono } from './util.js';
import {
  iniciarMarco, armarMarco, desarmarMarco, mostrarUsuario, marcarMenu, ponerTitulo, mostrarFranja,
  avisar, temaElegido, elegirTema
} from './marco.js';

const RUTA_INICIAL = 'inicio';

// Pantallas. datos: necesita los catálogos cargados; hito: pantalla que llega más adelante.
const RUTAS = {
  inicio: { titulo: 'Inicio', modulo: './vistas/inicio.js', datos: true },
  inventario: { titulo: 'Inventario', modulo: './vistas/inventario.js', datos: true },
  movimiento: {
    titulo: 'Nuevo movimiento', hito: 'Hito 3',
    detalle: 'Aquí se registrarán ingresos de compra, traspasos, mermas y devoluciones, con los lotes sugeridos por fecha de vencimiento.'
  },
  faenas: {
    titulo: 'Faenas', hito: 'Hito 4',
    detalle: 'Aquí verás cada faena con sus raciones, consumos, ingresos e indicadores de costo.'
  },
  mas: { titulo: 'Más', modulo: './vistas/mas.js' }
};

const estado = {
  ciclo: 0, // cambia al entrar o salir: descarta cargas que quedaron de antes
  datosListos: false, // ya se intentó cargar los catálogos de esta sesión
  vista: null, // pantalla abierta: {nombre, contenedor, control}
  servidor: null, // promesa con {version, ambiente} de la API, o null si no respondió
  actualizacion: null // promesa con el módulo actualizacion.js, o null mientras no exista
};
const app = document.getElementById('app');
const contenido = document.getElementById('contenido');

iniciar();

// ---------- Arranque ----------

function iniciar() {
  iniciarMarco();
  mostrarFranja(ambienteGuardado());
  estado.servidor = consultarServidor();
  estado.actualizacion = import('./actualizacion.js')
    .then(modulo => {
      modulo.iniciar({ version: APP_VERSION, avisar: avisar });
      return modulo;
    })
    .catch(() => null); // llega en la entrega 2D; mientras tanto la app funciona igual
  window.addEventListener('hashchange', () => mostrarRuta(true));
  window.addEventListener('online', reintentarServidor);
  window.addEventListener('storage', alCambiarOtraPestana);
  window.addEventListener(EVENTO_SESION_TERMINADA, evento => {
    const detalle = evento.detail || {};
    mostrarIngreso(detalle.codigo === 'SESION_REQUERIDA' ? '' : detalle.mensaje);
  });
  if (obtenerSesion()) entrarALaApp();
  else mostrarIngreso('');
}

/** Pregunta a la API su versión y ambiente (PRUEBA o PRODUCCION). Sin señal, vale el último conocido. */
function consultarServidor() {
  return ping()
    .then(datos => {
      mostrarFranja(datos.ambiente);
      return { version: String(datos.version || ''), ambiente: String(datos.ambiente || '') };
    })
    .catch(() => null);
}

/** Al volver la señal, vuelve a preguntar si la primera consulta no tuvo respuesta. */
function reintentarServidor() {
  estado.servidor.then(servidor => {
    if (!servidor) estado.servidor = consultarServidor();
  });
}

/** Otra pestaña de la app abrió o cerró la sesión en este navegador: esta se pone al día. */
function alCambiarOtraPestana() {
  const conSesion = Boolean(obtenerSesion());
  if (app.dataset.sesion === 'si' && !conSesion) mostrarIngreso('Se cerró la sesión en otra pestaña.');
  else if (app.dataset.sesion !== 'si' && conSesion) entrarALaApp();
}

// ---------- Sesión ----------

/** Muestra la pantalla de ingreso. motivo: texto opcional, por ejemplo "Tu sesión venció…". */
function mostrarIngreso(motivo) {
  estado.ciclo++;
  estado.datosListos = false;
  if (app.dataset.sesion === 'no' && estado.vista && estado.vista.nombre === 'ingreso') return;
  app.dataset.sesion = 'no';
  desarmarMarco();
  ponerTitulo('Ingresar');
  abrirVista('ingreso', './vistas/ingreso.js', {}, { motivo: motivo || '', alIngresar: () => entrarALaApp() });
}

/** Arma la app para el usuario con sesión y abre la pantalla de la dirección actual. */
async function entrarALaApp() {
  const ciclo = ++estado.ciclo;
  const usuario = usuarioActual();
  if (!usuario) {
    mostrarIngreso('');
    return;
  }
  cerrarVista();
  estado.datosListos = false;
  app.dataset.sesion = 'si';
  armarMarco(usuario);
  mostrarRuta(false);
  try {
    // Primero los catálogos: si la sesión ya no sirve, se sabe con una sola llamada.
    await cargarCatalogos();
    cargarInventario().catch(() => {}); // se adelanta la carga del inventario
  } catch (error) {
    // Sin señal u otro problema: cada pantalla muestra su propio aviso con "Reintentar".
  }
  if (ciclo !== estado.ciclo || !obtenerSesion()) return; // la sesión terminó mientras cargaba
  estado.datosListos = true;
  mostrarUsuario(usuarioActual()); // el servidor pudo actualizar el nombre o el rol
  if (!estado.vista) mostrarRuta(false);
}

/** Cierra la sesión en el servidor y en este equipo, y vuelve al ingreso. */
async function cerrarSesion() {
  await salir();
  history.replaceState(null, '', '#/' + RUTA_INICIAL);
  mostrarIngreso('');
  avisar('Cerraste la sesión.');
}

// ---------- Cambio de pantallas ----------

/** Dirección actual: "#/inventario?lugar=LUG-0001" → {nombre: 'inventario', parametros: {lugar: 'LUG-0001'}}. */
function leerRuta() {
  const texto = location.hash.replace(/^#\/?/, '');
  const corte = texto.indexOf('?');
  const parametros = {};
  new URLSearchParams(corte >= 0 ? texto.slice(corte + 1) : '').forEach((valor, clave) => {
    parametros[clave] = valor;
  });
  return { nombre: (corte >= 0 ? texto.slice(0, corte) : texto).split('/')[0], parametros: parametros };
}

/**
 * Lleva a otra pantalla: navegar('inventario', {lugar: 'LUG-0001'}).
 * Con {reemplazar: true} no suma un paso al botón Atrás (sirve para filtros).
 */
function navegar(nombre, parametros, opciones) {
  const consulta = new URLSearchParams();
  Object.keys(parametros || {}).forEach(clave => {
    const valor = parametros[clave];
    if (valor !== undefined && valor !== null && valor !== '') consulta.set(clave, String(valor));
  });
  const destino = '#/' + nombre + (consulta.toString() ? '?' + consulta.toString() : '');
  if (destino === location.hash) return;
  if (opciones && opciones.reemplazar) {
    history.replaceState(history.state, '', destino);
    mostrarRuta(false);
  } else {
    location.hash = destino;
  }
}

/** Abre la pantalla que indica la dirección. enfocar: llegó por un toque en el menú o un enlace. */
function mostrarRuta(enfocar) {
  if (app.dataset.sesion !== 'si') return;
  const ruta = leerRuta();
  const definicion = RUTAS[ruta.nombre];
  if (!definicion) {
    navegar(RUTA_INICIAL, {}, { reemplazar: true });
    return;
  }
  marcarMenu(ruta.nombre);
  ponerTitulo(definicion.titulo);
  const actual = estado.vista;
  if (actual && actual.nombre === ruta.nombre && actual.control && typeof actual.control.actualizar === 'function') {
    Promise.resolve()
      .then(() => actual.control.actualizar(ruta.parametros))
      .catch(error => mostrarFalla(actual, 'Algo falló en esta pantalla', error));
    return;
  }
  if (definicion.hito) mostrarProxima(ruta.nombre, definicion);
  else if (definicion.datos && !estado.datosListos) mostrarCargando();
  else abrirVista(ruta.nombre, definicion.modulo, ruta.parametros, null);
  window.scrollTo(0, 0);
  if (enfocar) contenido.focus({ preventScroll: true });
}

/** Carga el archivo de la pantalla (carpeta vistas) y la dibuja en un contenedor nuevo. */
async function abrirVista(nombre, rutaModulo, parametros, extra) {
  cerrarVista();
  const contenedor = crear('div', { clase: nombre === 'ingreso' ? 'ingreso' : 'vista' },
    crear('p', { clase: 'cargando' }, 'Cargando…'));
  agregar(vaciar(contenido), contenedor);
  const vista = { nombre: nombre, contenedor: contenedor, control: null };
  estado.vista = vista;
  let modulo;
  try {
    modulo = await import(rutaModulo);
  } catch (error) {
    if (estado.vista === vista) {
      mostrarFalla(vista, 'No se pudo abrir esta pantalla', navigator.onLine === false
        ? 'No hay conexión a internet. Intenta de nuevo cuando vuelva la señal.'
        : 'Esta pantalla todavía no está publicada o no terminó de descargarse.');
    }
    return;
  }
  if (estado.vista !== vista) return;
  try {
    vaciar(contenedor);
    const control = await modulo.mostrar(contenedor, crearContexto(nombre, parametros, extra));
    if (estado.vista === vista) vista.control = control || null;
    else if (control && typeof control.alSalir === 'function') control.alSalir();
  } catch (error) {
    if (estado.vista === vista) mostrarFalla(vista, 'Algo falló al mostrar esta pantalla', error);
  }
}

function crearContexto(nombre, parametros, extra) {
  return Object.assign({
    ruta: nombre,
    parametros: Object.assign({}, parametros),
    usuario: usuarioActual(),
    version: APP_VERSION,
    servidor: estado.servidor,
    actualizacion: estado.actualizacion,
    navegar: navegar,
    avisar: avisar,
    ponerTitulo: ponerTitulo,
    salir: cerrarSesion,
    tema: { elegido: temaElegido, elegir: elegirTema }
  }, extra || {});
}

function cerrarVista() {
  const vista = estado.vista;
  estado.vista = null;
  if (vista && vista.control && typeof vista.control.alSalir === 'function') {
    try {
      vista.control.alSalir();
    } catch (error) {
      console.error(error);
    }
  }
}

function mostrarCargando() {
  cerrarVista();
  agregar(vaciar(contenido), crear('div', { clase: 'vista' }, crear('p', { clase: 'cargando' }, 'Cargando datos…')));
}

/** Pantalla que llega en un hito posterior. */
function mostrarProxima(nombre, definicion) {
  cerrarVista();
  const contenedor = crear('div', { clase: 'vista' }, crear('div', { clase: 'tarjeta vacio pila' },
    crear('h2', null, 'Próximamente'),
    crear('p', null, definicion.detalle),
    crear('p', null, 'Llega en el ' + definicion.hito + '. Mientras tanto, puedes revisar el inventario.'),
    crear('p', null, crear('a', { clase: 'boton boton--secundario', href: '#/inventario' }, icono('inventario'), 'Ver inventario'))));
  agregar(vaciar(contenido), contenedor);
  estado.vista = { nombre: nombre, contenedor: contenedor, control: null };
}

/** Mensaje de error dentro de la pantalla, con un botón para volver a cargar la app. */
function mostrarFalla(vista, titulo, detalle) {
  if (detalle instanceof Error) console.error(detalle);
  const texto = typeof detalle === 'string' ? detalle : (detalle && detalle.message) || 'Error desconocido.';
  agregar(vaciar(vista.contenedor), crear('div', { clase: 'tarjeta vacio pila', role: 'alert' },
    crear('h2', null, titulo),
    crear('p', null, texto),
    crear('p', null, crear('button', { clase: 'boton boton--primario', type: 'button', onclick: () => location.reload() },
      icono('actualizar'), 'Reintentar'))));
}
