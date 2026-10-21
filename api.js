/**
 * ============================================================
 * Archivo: api.js
 * Dónde va: GitHub, repositorio inventario-klagges (raíz)
 * Entrega 2B-1 · Hito 2 · versión 0.2.0
 * ============================================================
 * Conversación con la API de Apps Script y sesión del usuario.
 * - Cada llamada viaja por POST con el cuerpo {accion, token, datos} en texto plano, para evitar
 *   el bloqueo del navegador entre dominios (CORS). La respuesta es {ok, datos, error}.
 * - La sesión (token de 30 días) se guarda en este navegador: en localStorage si la persona marcó
 *   "Recordar este dispositivo"; si no, en sessionStorage, que se borra al cerrar la pestaña.
 * - Si el servidor dice que la sesión venció o no es válida, se borra aquí y se avisa a la app
 *   con el evento 'klagges:sesion-terminada', para volver a la pantalla de ingreso.
 * - Catálogos e inventario quedan en memoria mientras la app está abierta (en el Hito 6 se
 *   guardarán en el teléfono para trabajar sin señal).
 */

import { URL_API } from './config.js';
import { ahoraIso } from './util.js';

const CLAVE_SESION = 'klagges.sesion';
const CLAVE_AMBIENTE = 'klagges.ambiente';
const ESPERA_MAXIMA_MS = 30000;
const CODIGOS_SESION = ['SESION_REQUERIDA', 'SESION_INVALIDA', 'SESION_EXPIRADA', 'USUARIO_INACTIVO'];
export const EVENTO_SESION_TERMINADA = 'klagges:sesion-terminada';

/** Error con código, para que cada pantalla sepa qué pasó (SIN_CONEXION, SESION_EXPIRADA, SIN_PERMISO…). */
export class ErrorApi extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.codigo = codigo;
  }
}

// ---------- Llamadas ----------

/**
 * Llama a una acción de la API y devuelve sus datos; si algo falla, lanza un ErrorApi con un mensaje
 * listo para mostrar. opciones: {conToken: false} para acciones públicas, {espera: ms} para el plazo.
 */
export async function llamar(accion, datos, opciones) {
  const conToken = !opciones || opciones.conToken !== false;
  const cuerpo = { accion: accion, datos: datos || {} };
  if (conToken) {
    const sesion = obtenerSesion();
    if (!sesion) throw terminarSesion(new ErrorApi('SESION_REQUERIDA', 'Inicia sesión para continuar.'));
    cuerpo.token = sesion.token;
  }
  const control = typeof AbortController === 'function' ? new AbortController() : null;
  const reloj = control ? setTimeout(() => control.abort(), (opciones && opciones.espera) || ESPERA_MAXIMA_MS) : null;
  let respuesta;
  try {
    const http = await fetch(URL_API, {
      method: 'POST', body: JSON.stringify(cuerpo), credentials: 'omit', signal: control ? control.signal : undefined
    });
    const texto = await http.text();
    try {
      respuesta = JSON.parse(texto);
    } catch (error) {
      throw new ErrorApi('RESPUESTA_INVALIDA', 'El servidor respondió algo inesperado. Intenta de nuevo y, si sigue, avisa al administrador.');
    }
  } catch (error) {
    if (error instanceof ErrorApi) throw error;
    if (error && error.name === 'AbortError') {
      throw new ErrorApi('TIEMPO_AGOTADO', 'El servidor tardó demasiado en responder. Revisa la señal e intenta de nuevo.');
    }
    throw new ErrorApi('SIN_CONEXION', navigator.onLine === false
      ? 'No hay conexión a internet. Intenta de nuevo cuando vuelva la señal.'
      : 'No se pudo conectar con el servidor. Revisa la señal e intenta de nuevo.');
  } finally {
    if (reloj) clearTimeout(reloj);
  }
  if (!respuesta || typeof respuesta !== 'object') {
    throw new ErrorApi('RESPUESTA_INVALIDA', 'El servidor respondió algo inesperado. Intenta de nuevo.');
  }
  if (!respuesta.ok) {
    const detalle = respuesta.error || {};
    const error = new ErrorApi(detalle.codigo || 'ERROR_DESCONOCIDO', detalle.mensaje || 'Ocurrió un error en el servidor.');
    if (conToken && CODIGOS_SESION.indexOf(error.codigo) >= 0) throw terminarSesion(error);
    throw error;
  }
  return respuesta.datos;
}

/** Acción pública ping: versión de la API y ambiente (PRUEBA o PRODUCCION), que queda recordado. */
export async function ping() {
  const datos = await llamar('ping', {}, { conToken: false, espera: 20000 });
  escribir('localStorage', CLAVE_AMBIENTE, String(datos.ambiente || ''));
  return datos;
}

/** Último ambiente conocido, para mostrar la franja de prueba aunque no haya señal. */
export function ambienteGuardado() {
  return leer('localStorage', CLAVE_AMBIENTE) || '';
}

// ---------- Sesión ----------

let sesionEnMemoria = null; // por si el navegador no deja guardar (modo privado)

/** Ingresa con usuario y PIN. Devuelve el perfil del usuario. */
export async function ingresar(usuario, pin, recordar) {
  const datos = await llamar('login', { usuario: usuario, pin: pin, dispositivo: describirDispositivo() }, { conToken: false });
  guardarSesion({ token: datos.token, expira_en: datos.expira_en, usuario: datos.usuario }, recordar);
  limpiarDatos();
  return datos.usuario;
}

/** Cierra la sesión en el servidor y en este equipo (aunque el servidor no responda). */
export async function salir() {
  try {
    if (obtenerSesion()) await llamar('cerrar_sesion', {}, { espera: 10000 });
  } catch (error) {
    // La sesión igual se borra en este equipo; en el servidor vence sola.
  }
  borrarSesion();
  limpiarDatos();
}

/** Sesión guardada y vigente: {token, expira_en, usuario, recordar}, o null. */
export function obtenerSesion() {
  const texto = leer('localStorage', CLAVE_SESION) || leer('sessionStorage', CLAVE_SESION);
  let sesion = sesionEnMemoria;
  if (texto) {
    try {
      sesion = JSON.parse(texto);
    } catch (error) {
      sesion = null;
    }
  }
  if (!sesion || !/^[0-9a-f]{64}$/.test(String(sesion.token || '')) || !sesion.usuario) return null;
  if (String(sesion.expira_en || '') <= ahoraIso()) {
    borrarSesion();
    return null;
  }
  return sesion;
}

/** Perfil del usuario con sesión: {id_usuario, usuario, nombre, rol, lugares_permitidos, ve_costos}. */
export function usuarioActual() {
  const sesion = obtenerSesion();
  return sesion ? sesion.usuario : null;
}

function guardarSesion(sesion, recordar) {
  borrarSesion();
  const datos = { token: sesion.token, expira_en: sesion.expira_en, usuario: sesion.usuario, recordar: Boolean(recordar) };
  if (!escribir(recordar ? 'localStorage' : 'sessionStorage', CLAVE_SESION, JSON.stringify(datos))) sesionEnMemoria = datos;
}

/** Actualiza el perfil guardado (el servidor lo devuelve con los catálogos, por si el administrador lo cambió). */
function actualizarUsuario(usuario) {
  const sesion = obtenerSesion();
  if (!sesion || !usuario) return;
  sesion.usuario = usuario;
  if (!escribir(sesion.recordar ? 'localStorage' : 'sessionStorage', CLAVE_SESION, JSON.stringify(sesion))) sesionEnMemoria = sesion;
}

function borrarSesion() {
  sesionEnMemoria = null;
  quitar('localStorage', CLAVE_SESION);
  quitar('sessionStorage', CLAVE_SESION);
}

function terminarSesion(error) {
  borrarSesion();
  limpiarDatos();
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_SESION_TERMINADA, { detail: { codigo: error.codigo, mensaje: error.message } }));
  } catch (otroError) {
    // Sin el aviso, la app igual vuelve al ingreso en la próxima llamada.
  }
  return error;
}

/** Texto que identifica el equipo en la hoja Sesiones (sirve para revisar o cerrar sesiones). */
function describirDispositivo() {
  const agente = navigator.userAgent || '';
  const sistema = /Android/i.test(agente) ? 'Android' : /iPhone|iPad|iPod/i.test(agente) ? 'iPhone o iPad'
    : /Windows/i.test(agente) ? 'Windows' : /Mac OS X/i.test(agente) ? 'Mac' : /Linux/i.test(agente) ? 'Linux' : 'Otro equipo';
  const navegador = /Edg\//.test(agente) ? 'Edge' : /OPR\//.test(agente) ? 'Opera' : /Chrome\//.test(agente) ? 'Chrome'
    : /Firefox\//.test(agente) ? 'Firefox' : /Safari\//.test(agente) ? 'Safari' : 'navegador';
  const instalada = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  return 'Inventario Klagges · ' + sistema + ' · ' + navegador + (instalada ? ' · app instalada' : '');
}

// ---------- Datos en memoria: catálogos e inventario ----------

const datosCargados = { catalogos: null, inventario: null };
const cargasEnCurso = { catalogos: null, inventario: null };

/** Catálogos (lugares, artículos, categorías…). Usa los ya cargados salvo {forzar: true}. */
export function cargarCatalogos(opciones) {
  return cargar('catalogos', opciones);
}

/** Inventario (saldos por lugar, artículo y lote). Usa el ya cargado salvo {forzar: true}. */
export function cargarInventario(opciones) {
  return cargar('inventario', opciones);
}

function cargar(accion, opciones) {
  const forzar = Boolean(opciones && opciones.forzar);
  if (!forzar && datosCargados[accion]) return Promise.resolve(datosCargados[accion].datos);
  if (cargasEnCurso[accion]) return cargasEnCurso[accion];
  const carga = llamar(accion, {})
    .then(datos => {
      datosCargados[accion] = { datos: datos, cargadoEn: Date.now() };
      if (accion === 'catalogos' && datos.usuario) actualizarUsuario(datos.usuario);
      return datos;
    })
    .finally(() => { cargasEnCurso[accion] = null; });
  cargasEnCurso[accion] = carga;
  return carga;
}

/** Minutos desde la última carga de 'catalogos' o 'inventario' (Infinity si nunca se cargó). */
export function minutosDesdeCarga(accion) {
  const entrada = datosCargados[accion];
  return entrada ? (Date.now() - entrada.cargadoEn) / 60000 : Infinity;
}

/** Olvida lo cargado (al entrar, salir o cuando termina la sesión). */
export function limpiarDatos() {
  datosCargados.catalogos = null;
  datosCargados.inventario = null;
}

// ---------- Almacenamiento del navegador (puede estar bloqueado: nunca debe botar la app) ----------

function almacen(tipo) {
  try {
    return window[tipo] || null;
  } catch (error) {
    return null;
  }
}

function leer(tipo, clave) {
  try {
    const lugar = almacen(tipo);
    return lugar ? lugar.getItem(clave) : null;
  } catch (error) {
    return null;
  }
}

function escribir(tipo, clave, valor) {
  try {
    const lugar = almacen(tipo);
    if (!lugar) return false;
    lugar.setItem(clave, valor);
    return true;
  } catch (error) {
    return false;
  }
}

function quitar(tipo, clave) {
  try {
    const lugar = almacen(tipo);
    if (lugar) lugar.removeItem(clave);
  } catch (error) {
    // Nada que hacer.
  }
}
