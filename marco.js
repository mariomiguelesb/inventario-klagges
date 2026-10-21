/**
 * ============================================================
 * Archivo: marco.js
 * Dónde va: GitHub, repositorio inventario-klagges (raíz)
 * Entrega 2B-2 · Hito 2 · versión 0.2.0
 * ============================================================
 * Lo que rodea a cada pantalla: menú, encabezado con el estado de conexión, franja
 * DATOS DE PRUEBA, título de la pestaña, avisos abajo y tema claro u oscuro.
 * app.js decide qué pantalla se muestra; este archivo dibuja el marco alrededor.
 * Los elementos fijos (franja, navegacion, encabezado, avisos) están en index.html.
 */

import { NOMBRE_APP, EMPRESA } from './config.js';
import { crear, agregar, vaciar, icono, marca } from './util.js';

const CLAVE_TEMA = 'klagges.tema';
const COLOR_BARRA = { claro: '#0F4C5C', oscuro: '#0F1D23' };
const NOMBRES_ROL = { ADMIN: 'Administrador', BODEGA: 'Bodega', FAENA: 'Faena', CONSULTA: 'Consulta' };

// Botones del menú, en orden. Movimiento va al centro en el celular y arriba en el computador.
const MENU = [
  { ruta: 'inicio', icono: 'inicio', etiqueta: 'Inicio' },
  { ruta: 'inventario', icono: 'inventario', etiqueta: 'Inventario' },
  { ruta: 'movimiento', icono: 'agregar', etiqueta: 'Movimiento', larga: 'Nuevo movimiento' },
  { ruta: 'faenas', icono: 'faenas', etiqueta: 'Faenas' },
  { ruta: 'mas', icono: 'mas', etiqueta: 'Más' }
];

const partes = {}; // elementos de la página que se reutilizan
const avisos = { fijo: null, breve: null, reloj: null };
const consultaOscuro = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let tituloActual = '';

/** Toma los elementos de index.html y aplica el tema guardado. Se llama una vez, al abrir la app. */
export function iniciarMarco() {
  ['franja', 'navegacion', 'encabezado', 'avisos'].forEach(id => {
    partes[id] = document.getElementById(id);
  });
  aplicarTema(temaElegido());
  if (consultaOscuro && consultaOscuro.addEventListener) consultaOscuro.addEventListener('change', pintarColorBarra);
  window.addEventListener('online', pintarConexion);
  window.addEventListener('offline', pintarConexion);
  window.addEventListener('storage', () => aplicarTema(temaElegido())); // tema cambiado en otra pestaña
}

// ---------- Menú y encabezado ----------

/** Dibuja el menú y el encabezado para el usuario que ingresó. */
export function armarMarco(usuario) {
  const lista = crear('ul', { clase: 'navegacion__lista' }, MENU.map(boton => {
    const central = boton.ruta === 'movimiento';
    const etiquetas = boton.larga
      ? [crear('span', { clase: 'navegacion__etiqueta navegacion__etiqueta--corta' }, boton.etiqueta),
        crear('span', { clase: 'navegacion__etiqueta navegacion__etiqueta--larga' }, boton.larga)]
      : crear('span', { clase: 'navegacion__etiqueta' }, boton.etiqueta);
    return crear('li', { clase: central ? 'navegacion__li-movimiento' : null },
      crear('a', {
        clase: ['navegacion__item', central && 'navegacion__item--movimiento'],
        href: '#/' + boton.ruta, datos: { ruta: boton.ruta }
      }, crear('span', { clase: 'navegacion__icono' }, icono(boton.icono)), etiquetas));
  }));
  partes.usuario = crear('div', { clase: 'navegacion__usuario' });
  agregar(vaciar(partes.navegacion), [
    crear('div', { clase: 'navegacion__marca marca' }, marca(),
      crear('div', null, crear('div', { clase: 'marca__nombre' }, NOMBRE_APP), crear('div', { clase: 'marca__empresa' }, EMPRESA))),
    lista,
    partes.usuario
  ]);
  mostrarUsuario(usuario);

  partes.titulo = crear('h1', { clase: 'encabezado__titulo' }, tituloActual);
  partes.conexion = crear('span', { clase: 'conexion', role: 'status' },
    crear('span', { clase: 'conexion__punto' }), crear('span', null, ''));
  agregar(vaciar(partes.encabezado), [marca('encabezado__marca'), partes.titulo, partes.conexion]);
  pintarConexion();
}

/** Quita el menú y el encabezado (pantalla de ingreso). */
export function desarmarMarco() {
  vaciar(partes.navegacion);
  vaciar(partes.encabezado);
  partes.usuario = null;
  partes.titulo = null;
  partes.conexion = null;
}

/** Bloque del usuario al pie del menú lateral (se ve en el computador). */
export function mostrarUsuario(usuario) {
  if (!partes.usuario || !usuario) return;
  const nombre = usuario.nombre || usuario.usuario || '';
  agregar(vaciar(partes.usuario), [
    crear('span', { clase: 'usuario__avatar', 'aria-hidden': 'true' }, iniciales(nombre)),
    crear('div', { clase: 'usuario__datos' },
      crear('span', { clase: 'usuario__nombre' }, nombre),
      crear('span', { clase: 'usuario__rol' }, nombreRol(usuario.rol)))
  ]);
}

/** ADMIN → "Administrador", BODEGA → "Bodega"… */
export function nombreRol(rol) {
  return NOMBRES_ROL[rol] || String(rol || '');
}

/** "Mario Andrés Migueles Barrenechea" → "MM"; "Christian Klagges Pons" → "CK". */
export function iniciales(nombre) {
  const palabras = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  const apellido = palabras.length >= 3 ? palabras[palabras.length - 2] : palabras[1] || '';
  return (palabras[0].charAt(0) + apellido.charAt(0)).toUpperCase();
}

/** Destaca en el menú el botón de la pantalla abierta. */
export function marcarMenu(ruta) {
  partes.navegacion.querySelectorAll('.navegacion__item').forEach(enlace => {
    if (enlace.dataset.ruta === ruta) enlace.setAttribute('aria-current', 'page');
    else enlace.removeAttribute('aria-current');
  });
}

function pintarConexion() {
  if (!partes.conexion) return;
  const enLinea = navigator.onLine !== false;
  partes.conexion.classList.toggle('conexion--fuera', !enLinea);
  partes.conexion.lastChild.textContent = enLinea ? 'En línea' : 'Sin conexión';
}

/** Título del encabezado y de la pestaña del navegador (con "PRUEBA ·" en el ambiente de prueba). */
export function ponerTitulo(texto) {
  tituloActual = texto || '';
  if (partes.titulo) partes.titulo.textContent = tituloActual;
  const prueba = document.body.classList.contains('con-franja') ? 'PRUEBA · ' : '';
  document.title = prueba + (tituloActual ? tituloActual + ' · ' : '') + NOMBRE_APP;
}

/** Franja amarilla DATOS DE PRUEBA, cuando la API informa ambiente = PRUEBA. */
export function mostrarFranja(ambiente) {
  const prueba = String(ambiente || '').toUpperCase() === 'PRUEBA';
  partes.franja.hidden = !prueba;
  document.body.classList.toggle('con-franja', prueba);
  ponerTitulo(tituloActual);
}

// ---------- Avisos ----------

/**
 * Aviso abajo de la pantalla: avisar('Inventario actualizado') dura 4 segundos.
 * Con {accion: 'Actualizar', alAccionar: fn} lleva un botón y queda fijo hasta que se use, salvo que
 * se indique {duracion: ms}. Un aviso breve tapa al fijo por un momento; después el fijo vuelve.
 * Devuelve {cerrar()} para quitarlo antes.
 */
export function avisar(texto, opciones) {
  const config = opciones || {};
  const aviso = { texto: texto, accion: config.accion, alAccionar: config.alAccionar };
  if (config.accion && !config.duracion) {
    avisos.fijo = aviso;
  } else {
    avisos.breve = aviso;
    clearTimeout(avisos.reloj);
    avisos.reloj = setTimeout(() => quitarAviso(aviso), config.duracion || 4000);
  }
  pintarAviso();
  return { cerrar: () => quitarAviso(aviso) };
}

function quitarAviso(aviso) {
  if (avisos.fijo === aviso) avisos.fijo = null;
  if (avisos.breve === aviso) avisos.breve = null;
  pintarAviso();
}

function pintarAviso() {
  const aviso = avisos.breve || avisos.fijo;
  vaciar(partes.avisos);
  if (!aviso) return;
  agregar(partes.avisos, crear('div', { clase: 'aviso' }, crear('span', null, aviso.texto),
    aviso.accion ? crear('button', {
      clase: 'boton', type: 'button', onclick: () => {
        quitarAviso(aviso);
        if (aviso.alAccionar) aviso.alAccionar();
      }
    }, aviso.accion) : null));
}

// ---------- Tema claro u oscuro ----------

/** Tema guardado en este equipo: 'claro', 'oscuro' o 'sistema' (el del teléfono o computador). */
export function temaElegido() {
  let tema = null;
  try {
    tema = window.localStorage.getItem(CLAVE_TEMA);
  } catch (error) {
    tema = null;
  }
  return tema === 'claro' || tema === 'oscuro' ? tema : 'sistema';
}

/** Elige 'claro', 'oscuro' o 'sistema'. Queda guardado en este equipo. */
export function elegirTema(tema) {
  const valor = tema === 'claro' || tema === 'oscuro' ? tema : 'sistema';
  try {
    if (valor === 'sistema') window.localStorage.removeItem(CLAVE_TEMA);
    else window.localStorage.setItem(CLAVE_TEMA, valor);
  } catch (error) {
    // Sin almacenamiento (modo privado): el tema dura hasta cerrar la app.
  }
  aplicarTema(valor);
}

function aplicarTema(tema) {
  if (tema === 'claro' || tema === 'oscuro') document.documentElement.dataset.tema = tema;
  else delete document.documentElement.dataset.tema;
  pintarColorBarra();
}

/** Color de la barra del navegador (y de la app instalada en Android) según el tema que se ve. */
function pintarColorBarra() {
  const tema = document.documentElement.dataset.tema;
  const oscuro = tema ? tema === 'oscuro' : Boolean(consultaOscuro && consultaOscuro.matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', oscuro ? COLOR_BARRA.oscuro : COLOR_BARRA.claro);
}
