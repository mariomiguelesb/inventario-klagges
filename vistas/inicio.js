/**
 * ============================================================
 * Archivo: vistas/inicio.js
 * Dónde va: GitHub, repositorio inventario-klagges, carpeta vistas
 * Entrega 2C · Hito 2 · versión 0.2.0
 * ============================================================
 * Pantalla Inicio, versión básica del Hito 2: valor del inventario (total, por tipo de lugar y por
 * lugar), lotes vencidos o por vencer y artículos bajo el mínimo de su lugar. Cada elemento abre
 * el lugar o la ficha en Inventario. Quien no ve costos ve cantidades en vez de valores.
 * El panel completo (gráfico por lugar, faenas con costo por ración y margen, pendientes) llega en
 * el Hito 5.
 */

import { cargarCatalogos, cargarInventario } from '../api.js';
import { crear, agregar, vaciar, icono, formatoPesos, formatoCantidad, formatoNumero, plural, ZONA_HORARIA } from '../util.js';
import { armarExistencias, textoMomento, NOMBRES_TIPO } from '../existencias.js';
import { etiquetaVencimiento } from './articulo.js';

const VISIBLES_AL_COMIENZO = 6;

export function mostrar(contenedor, contexto) {
  const usuario = contexto.usuario || {};
  const subtitulo = crear('p', { clase: 'texto-suave' }, fechaDeHoy());
  // En celular y tableta el botón muestra solo el ícono; en computador, también el texto.
  const botonActualizar = crear('button', { clase: 'boton boton--texto', type: 'button', disabled: true, 'aria-label': 'Actualizar' },
    icono('actualizar'), crear('span', { clase: 'col-amplia' }, 'Actualizar'));
  const saludo = crear('div', null, crear('h2', null, 'Hola, ' + primerNombre(usuario)), subtitulo);
  saludo.style.flex = '1 1 0';
  const cuerpo = crear('div', { clase: 'pila' }, crear('p', { clase: 'cargando' }, 'Cargando inventario…'));
  agregar(contenedor, [
    crear('div', { clase: 'fila fila--entre' }, saludo, botonActualizar),
    cuerpo
  ]);
  botonActualizar.addEventListener('click', () => cargar(true));
  cargar(false);
  return {};

  async function cargar(forzar) {
    botonActualizar.disabled = true;
    try {
      const [catalogos, inventario] = await Promise.all([cargarCatalogos({ forzar: forzar }), cargarInventario({ forzar: forzar })]);
      pintar(armarExistencias(catalogos, inventario));
      if (forzar) contexto.avisar('Inventario actualizado.');
    } catch (error) {
      if (forzar) contexto.avisar(error.message);
      else agregar(vaciar(cuerpo), crear('div', { clase: 'tarjeta vacio pila', role: 'alert' },
        crear('p', null, error.message || 'Ocurrió un error.'),
        crear('p', null, crear('button', { clase: 'boton boton--primario', type: 'button', onclick: () => cargar(true) },
          icono('actualizar'), 'Reintentar'))));
    } finally {
      botonActualizar.disabled = false;
    }
  }

  function pintar(modelo) {
    const momento = textoMomento(modelo.generadoEn, modelo.hoy);
    subtitulo.textContent = fechaDeHoy() + (momento ? ' · datos de ' + momento : '');
    vaciar(cuerpo);
    if (modelo.lugares.length === 0) {
      cuerpo.appendChild(crear('p', { clase: 'vacio' }, 'No tienes lugares asignados. Pide al administrador que te asigne uno.'));
      return;
    }
    agregar(cuerpo, [
      metricas(modelo),
      crear('div', { clase: 'con-panel con-panel--abierto' },
        seccionLugares(modelo),
        crear('div', { clase: 'pila' }, seccionVencimientos(modelo), seccionMinimos(modelo))),
      crear('p', { clase: 'texto-suave' }, 'El panel completo, con el gráfico por lugar, las faenas y los pendientes, llega en el Hito 5.')
    ]);
  }
}

// ---------- Secciones ----------

function metricas(modelo) {
  const tarjeta = (etiqueta, valor, detalle) => crear('div', { clase: 'metrica' },
    crear('span', { clase: 'metrica__etiqueta' }, etiqueta), crear('span', { clase: 'metrica__valor' }, valor),
    crear('span', { clase: 'metrica__detalle' }, detalle));
  const total = modelo.resumen('');
  if (!modelo.conCostos) {
    const umbral = Math.max.apply(null, modelo.umbrales);
    return crear('div', { clase: 'metricas' },
      tarjeta('Artículos con stock', formatoNumero(total.articulos, 0), 'en ' + plural(modelo.lugares.length, 'lugar', 'lugares')),
      tarjeta('Por vencer en ' + umbral + ' días', plural(total.porVencer, 'lote', 'lotes'),
        total.vencidos ? plural(total.vencidos, 'lote vencido', 'lotes vencidos') : 'Ningún lote vencido'),
      tarjeta('Bajo el mínimo', plural(total.bajoMinimo, 'artículo', 'artículos'), 'Según el mínimo de cada lugar'));
  }
  const tipos = modelo.porTipo();
  const depositos = { valor: 0, lugares: 0 };
  ['BODEGA', 'CAMARA'].forEach(tipo => {
    if (tipos[tipo]) { depositos.valor += tipos[tipo].valor; depositos.lugares += tipos[tipo].lugares; }
  });
  return crear('div', { clase: 'metricas' },
    tarjeta('Valor del inventario' + (modelo.bruto ? ' (bruto)' : ' (neto)'), formatoPesos(total.valor),
      plural(total.articulos, 'artículo', 'artículos') + ' en ' + plural(modelo.lugares.length, 'lugar', 'lugares')),
    depositos.lugares ? tarjeta('Bodega y cámaras', formatoPesos(depositos.valor), plural(depositos.lugares, 'lugar', 'lugares')) : null,
    tipos.FAENA ? tarjeta('Faenas', formatoPesos(tipos.FAENA.valor), plural(tipos.FAENA.activos, 'faena activa', 'faenas activas')) : null);
}

/** Cada lugar con su valor (o sus artículos) y su parte del total; abre el lugar en Inventario. */
function seccionLugares(modelo) {
  const total = modelo.resumen('').valor;
  return seccion('Inventario por lugar', modelo.lugares.map(lugar => enlace({ lugar: lugar.id_lugar },
    lugar.nombre,
    modelo.conCostos ? formatoPesos(lugar.valor) : plural(lugar.articulos, 'artículo', 'artículos'),
    crear('span', { clase: 'texto-suave' }, [
      NOMBRES_TIPO[lugar.tipo] || lugar.tipo,
      modelo.conCostos ? plural(lugar.articulos, 'artículo', 'artículos') : plural(lugar.lotes, 'lote', 'lotes'),
      lugar.estado !== 'ACTIVO' ? 'inactivo' : ''
    ].filter(Boolean).join(' · ')),
    crear('span', { clase: 'articulo__valor' }, modelo.conCostos && total > 0 ? formatoNumero(lugar.valor / total * 100, 0) + ' %' : ''))),
  { vacio: 'No tienes lugares asignados.' });
}

/** Semáforo de vencimientos y los lotes más urgentes. */
function seccionVencimientos(modelo) {
  const lotes = modelo.vencimientos();
  const umbrales = modelo.umbrales.slice().sort((a, b) => a - b);
  const [critico, pronto, atento] = [umbrales[0], umbrales[1] || umbrales[0], umbrales[2] || umbrales[1] || umbrales[0]];
  const cuenta = { vencido: 0, critico: 0, pronto: 0, atento: 0 };
  lotes.forEach(item => { cuenta[item.lote.estado.nivel]++; });
  const semaforo = (cantidad, texto, clase) => crear('span', { clase: ['estado', cantidad > 0 && clase] }, cantidad + ' ' + texto);
  const enFaenas = lotes.some(item => item.posicion.lugar.tipo === 'FAENA');
  return seccion('Vencimientos', lotes.map(item => enlace({ lugar: item.posicion.lugar.id_lugar, articulo: item.posicion.articulo.id_articulo },
    item.posicion.articulo.nombre,
    formatoCantidad(item.lote.cantidad, item.posicion.articulo.unidad_base),
    crear('span', { clase: 'texto-suave' }, item.posicion.lugar.nombre),
    crear('span', { clase: 'articulo__valor' }, etiquetaVencimiento(item.lote.estado, item.lote.vence, false)))),
  {
    limite: VISIBLES_AL_COMIENZO,
    vacio: 'No hay lotes vencidos ni por vencer en los próximos ' + atento + ' días.',
    antes: crear('div', { clase: 'fila' },
      semaforo(cuenta.vencido, cuenta.vencido === 1 ? 'vencido' : 'vencidos', 'estado--critico'),
      semaforo(cuenta.critico, 'en ' + critico + ' días', 'estado--critico'),
      semaforo(cuenta.pronto, 'en ' + (critico + 1) + ' a ' + pronto + ' días', 'estado--pronto'),
      semaforo(cuenta.atento, 'en ' + (pronto + 1) + ' a ' + atento + ' días', 'estado--atento')),
    nota: enFaenas ? 'En las faenas, el consumo se descuenta en cada conteo semanal: parte de lo que aparece ahí puede estar ya consumido.' : ''
  });
}

/** Artículos bajo el mínimo definido para su lugar. */
function seccionMinimos(modelo) {
  return seccion('Bajo el mínimo', modelo.bajoMinimo().map(posicion => {
    const unidad = posicion.articulo.unidad_base;
    return enlace({ lugar: posicion.lugar.id_lugar, articulo: posicion.articulo.id_articulo },
      posicion.articulo.nombre,
      formatoCantidad(posicion.cantidad, unidad) + ' de ' + formatoCantidad(posicion.minimo, unidad),
      crear('span', { clase: 'texto-suave' }, posicion.lugar.nombre),
      crear('span', { clase: 'articulo__valor' }, crear('span', { clase: 'estado estado--critico' },
        'Faltan ' + formatoCantidad(posicion.minimo - posicion.cantidad, unidad))));
  }), {
    limite: VISIBLES_AL_COMIENZO,
    vacio: 'Ningún artículo está bajo el mínimo de su lugar.',
    nota: 'Se compara con el mínimo definido para cada lugar.'
  });
}

// ---------- Piezas ----------

/**
 * Sección con título y lista. opciones: vacio (texto si no hay elementos), antes (elementos entre el
 * título y la lista), nota (texto al pie) y limite (cuántos se ven antes de "Ver los N"; sin límite si falta).
 */
function seccion(titulo, elementos, opciones) {
  const config = opciones || {};
  const limite = config.limite || elementos.length;
  const lista = crear('ul', { clase: 'lista-articulos' });
  const boton = crear('button', { clase: 'boton boton--texto', type: 'button' });
  let abierta = false;
  const pintarLista = () => {
    vaciar(lista);
    elementos.slice(0, abierta ? elementos.length : limite).forEach(elemento => lista.appendChild(crear('li', null, elemento)));
    boton.textContent = abierta ? 'Ver menos' : 'Ver los ' + elementos.length;
  };
  boton.addEventListener('click', () => { abierta = !abierta; pintarLista(); });
  pintarLista();
  return crear('section', { clase: 'pila' },
    crear('h2', null, titulo),
    config.antes || null,
    elementos.length ? lista : crear('p', { clase: 'texto-suave' }, config.vacio || ''),
    elementos.length > limite ? crear('div', null, boton) : null,
    config.nota ? crear('p', { clase: 'texto-suave' }, config.nota) : null);
}

/** Enlace a Inventario con el aspecto de las tarjetas de artículo: nombre, cifra y dos datos abajo. */
function enlace(parametros, nombre, cifra, detalle, extremo) {
  const consulta = new URLSearchParams();
  Object.keys(parametros).forEach(clave => consulta.set(clave, parametros[clave]));
  return crear('a', { clase: 'articulo tarjeta--boton', href: '#/inventario?' + consulta.toString() },
    crear('span', { clase: 'articulo__nombre' }, nombre),
    crear('span', { clase: 'articulo__cantidad' }, cifra),
    detalle,
    extremo);
}

function primerNombre(usuario) {
  return String(usuario.nombre || usuario.usuario || '').trim().split(/\s+/)[0] || '';
}

/** "Miércoles, 21 de octubre" en la hora de Chile. */
function fechaDeHoy() {
  const texto = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA_HORARIA })
    .format(new Date());
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
