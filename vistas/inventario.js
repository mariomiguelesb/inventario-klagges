/**
 * ============================================================
 * Archivo: vistas/inventario.js
 * Dónde va: GitHub, repositorio inventario-klagges, carpeta vistas
 * Entrega 2C · Hito 2 · versión 0.2.0
 * ============================================================
 * Pantalla Inventario (solo lectura): qué hay en cada lugar, cuánto es y cuánto vale.
 * - Filtros: lugar (o todos), búsqueda por nombre o código y categoría.
 * - Celular: tarjetas. Tableta y computador: tabla. Desde 1.100 px de ancho, la ficha del artículo
 *   se abre al costado de la lista; en pantallas más angostas se abre sola y Atrás vuelve a la lista.
 * - La dirección guarda el lugar y el artículo abierto (#/inventario?lugar=LUG-0001&articulo=ART-0001):
 *   así Inicio abre un lugar o una ficha directamente.
 */

import { cargarCatalogos, cargarInventario } from '../api.js';
import { crear, agregar, vaciar, icono, formatoPesos, formatoCantidad, formatoNumero, coincide, retrasar, plural } from '../util.js';
import { armarExistencias, textoMomento, GRUPOS_TIPO } from '../existencias.js';
import { dibujarFicha, etiquetaVencimiento, etiquetaMinimo } from './articulo.js';

const ANCHO_TABLA = '(min-width: 600px)';
const ANCHO_COMPUTADOR = '(min-width: 1024px)';
const ANCHO_COSTADO = '(min-width: 1100px)';

export function mostrar(contenedor, contexto) {
  const estado = {
    lugar: contexto.parametros.lugar || '', articulo: contexto.parametros.articulo || '', busqueda: '', categoria: '',
    modelo: null, sola: false, fichaConHistoria: false, posicionLista: 0, primeraVez: true
  };
  const [anchoTabla, anchoComputador, anchoCostado] = [ANCHO_TABLA, ANCHO_COMPUTADOR, ANCHO_COSTADO]
    .map(consulta => window.matchMedia(consulta));

  // ---------- Partes de la pantalla ----------
  const resumen = crear('p', { clase: 'texto-suave' }, 'Cargando inventario…');
  // En celular y tableta el botón muestra solo el ícono; en computador, también el texto.
  const botonActualizar = crear('button', { clase: 'boton boton--texto', type: 'button', disabled: true, 'aria-label': 'Actualizar' },
    icono('actualizar'), crear('span', { clase: 'col-amplia' }, 'Actualizar'));
  const metricas = crear('div', { clase: 'metricas col-amplia' });
  const selectorLugar = crear('select', { clase: 'campo__control', 'aria-label': 'Lugar' });
  const campoBusqueda = crear('input', {
    clase: 'campo__control', type: 'search', placeholder: 'Buscar por nombre o código', 'aria-label': 'Buscar artículo',
    autocomplete: 'off', enterkeyhint: 'search'
  });
  const buscador = crear('div', { clase: 'buscador' }, icono('buscar'), campoBusqueda);
  const selectorCategoria = crear('select', { clase: 'campo__control', 'aria-label': 'Categoría' });
  const filaFiltros = crear('div', { clase: 'fila' }, selectorLugar, buscador);
  const zonaChips = crear('div');
  // El resumen cede espacio al botón Actualizar. Los filtros comparten fila si caben (computador)
  // y bajan uno por fila si no (celular).
  resumen.style.flex = '1 1 0';
  selectorLugar.style.flex = '1 1 220px';
  buscador.style.flex = '2 1 260px';
  selectorCategoria.style.flex = '1 1 200px';
  const lista = crear('div');
  const panel = crear('aside', { clase: 'tarjeta con-panel__panel', 'aria-label': 'Ficha del artículo', hidden: true });
  const cabecera = crear('div', { clase: 'pila' },
    crear('div', { clase: 'fila fila--entre' }, resumen, botonActualizar), metricas, filaFiltros, zonaChips);
  const cuerpo = crear('div', { clase: 'con-panel' }, lista, panel);
  agregar(contenedor, [cabecera, cuerpo]);

  // ---------- Eventos ----------
  botonActualizar.addEventListener('click', () => cargar(true));
  selectorLugar.addEventListener('change', () => {
    contexto.navegar('inventario', { lugar: selectorLugar.value, articulo: estado.articulo }, { reemplazar: true });
  });
  campoBusqueda.addEventListener('input', retrasar(() => {
    estado.busqueda = campoBusqueda.value;
    pintarLista();
  }, 150));
  selectorCategoria.addEventListener('change', () => elegirCategoria(selectorCategoria.value));
  const consultas = [anchoTabla, anchoComputador, anchoCostado];
  consultas.forEach(consulta => escuchar(consulta, alCambiarAncho));
  const alTeclear = evento => { if (evento.key === 'Escape' && estado.articulo && !estado.sola) cerrarFicha(); };
  document.addEventListener('keydown', alTeclear);

  cargar(false);

  return {
    actualizar(parametros) {
      const articulo = parametros.articulo || '';
      if (!articulo) estado.fichaConHistoria = false;
      const lugar = estado.modelo ? lugarValido(parametros.lugar || '') : parametros.lugar || '';
      const cambioLugar = lugar !== estado.lugar;
      const cambioArticulo = articulo !== estado.articulo;
      estado.lugar = lugar;
      estado.articulo = articulo;
      if (!estado.modelo) return; // todavía cargando: se dibuja al terminar
      if (cambioLugar) pintarListado();
      if (cambioLugar || cambioArticulo) pintarFicha();
    },
    alSalir() {
      consultas.forEach(consulta => dejarDeEscuchar(consulta, alCambiarAncho));
      document.removeEventListener('keydown', alTeclear);
    }
  };

  // ---------- Datos ----------

  async function cargar(forzar) {
    botonActualizar.disabled = true;
    try {
      const [catalogos, inventario] = await Promise.all([cargarCatalogos({ forzar: forzar }), cargarInventario({ forzar: forzar })]);
      estado.modelo = armarExistencias(catalogos, inventario);
      estado.lugar = lugarValido(estado.lugar);
      pintarListado();
      pintarFicha();
      if (forzar) contexto.avisar('Inventario actualizado.');
    } catch (error) {
      if (estado.modelo) contexto.avisar(error.message);
      else mostrarError(error);
    } finally {
      botonActualizar.disabled = false;
    }
  }

  /** El lugar pedido si existe y se puede ver; si no, todos (o el único lugar del usuario). */
  function lugarValido(lugar) {
    const modelo = estado.modelo;
    if (lugar && modelo.lugarPorId[lugar]) return lugar;
    return modelo.lugares.length === 1 ? modelo.lugares[0].id_lugar : '';
  }

  function mostrarError(error) {
    resumen.textContent = 'No se pudo cargar el inventario.';
    agregar(vaciar(lista), crear('div', { clase: 'tarjeta vacio pila', role: 'alert' },
      crear('p', null, error.message || 'Ocurrió un error.'),
      crear('p', null, crear('button', { clase: 'boton boton--primario', type: 'button', onclick: () => cargar(true) },
        icono('actualizar'), 'Reintentar'))));
  }

  // ---------- Dibujo ----------

  /** Todo lo que depende del lugar: resumen, tarjetas, filtros y lista. */
  function pintarListado() {
    pintarResumen();
    pintarMetricas();
    pintarSelectorLugar();
    pintarCategorias();
    pintarLista();
  }

  function pintarResumen() {
    const modelo = estado.modelo;
    const datos = modelo.resumen(estado.lugar);
    const partes = [plural(datos.articulos, 'artículo', 'artículos')];
    if (modelo.conCostos) partes.push(formatoPesos(datos.valor) + (modelo.bruto ? ' bruto' : ' neto'));
    const momento = textoMomento(modelo.generadoEn, modelo.hoy);
    if (momento) partes.push('actualizado ' + momento);
    resumen.textContent = partes.join(' · ');
  }

  /** Tarjetas de arriba (solo en computador): valor por tipo de lugar o, para un lugar, sus alertas. */
  function pintarMetricas() {
    const modelo = estado.modelo;
    const tarjeta = (etiqueta, valor, detalle) => crear('div', { clase: 'metrica' },
      crear('span', { clase: 'metrica__etiqueta' }, etiqueta), crear('span', { clase: 'metrica__valor' }, valor),
      crear('span', { clase: 'metrica__detalle' }, detalle));
    vaciar(metricas);
    if (!estado.lugar && modelo.conCostos) {
      const tipos = modelo.porTipo();
      const depositos = { valor: 0, lugares: 0 };
      ['BODEGA', 'CAMARA'].forEach(tipo => {
        if (tipos[tipo]) { depositos.valor += tipos[tipo].valor; depositos.lugares += tipos[tipo].lugares; }
      });
      agregar(metricas, [
        tarjeta('Valor total del inventario', formatoPesos(modelo.resumen('').valor), plural(modelo.lugares.length, 'lugar', 'lugares')),
        depositos.lugares ? tarjeta('Bodega y cámaras', formatoPesos(depositos.valor), plural(depositos.lugares, 'lugar', 'lugares')) : null,
        tipos.FAENA ? tarjeta('Faenas', formatoPesos(tipos.FAENA.valor), plural(tipos.FAENA.activos, 'faena activa', 'faenas activas')) : null
      ]);
      return;
    }
    const datos = modelo.resumen(estado.lugar);
    const umbral = Math.max.apply(null, modelo.umbrales);
    agregar(metricas, [
      modelo.conCostos
        ? tarjeta(estado.lugar ? 'Valor en este lugar' : 'Valor total', formatoPesos(datos.valor), plural(datos.articulos, 'artículo', 'artículos'))
        : tarjeta('Artículos con stock', formatoNumero(datos.articulos, 0), plural(datos.lotes, 'lote', 'lotes')),
      tarjeta('Por vencer en ' + umbral + ' días', plural(datos.porVencer, 'lote', 'lotes'),
        datos.vencidos ? plural(datos.vencidos, 'lote vencido', 'lotes vencidos') : 'Ningún lote vencido'),
      tarjeta('Bajo el mínimo', plural(datos.bajoMinimo, 'artículo', 'artículos'), 'Según el mínimo de cada lugar')
    ]);
  }

  function pintarSelectorLugar() {
    const modelo = estado.modelo;
    vaciar(selectorLugar);
    selectorLugar.appendChild(crear('option', { value: '' }, 'Todos los lugares'));
    GRUPOS_TIPO.forEach(([tipo, titulo]) => {
      const propios = modelo.lugares.filter(lugar => lugar.tipo === tipo);
      if (propios.length === 0) return;
      selectorLugar.appendChild(crear('optgroup', { label: titulo }, propios.map(lugar =>
        crear('option', { value: lugar.id_lugar }, lugar.nombre + (lugar.estado !== 'ACTIVO' ? ' (inactivo)' : '')))));
    });
    selectorLugar.value = estado.lugar;
  }

  /** Categorías con artículos en el lugar: botones en celular y tableta, lista desplegable en computador. */
  function pintarCategorias() {
    const vistas = {};
    estado.modelo.filas(estado.lugar).forEach(fila => { vistas[fila.categoria.id_categoria] = fila.categoria; });
    const categorias = Object.keys(vistas).map(id => vistas[id]).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (!vistas[estado.categoria]) estado.categoria = '';
    vaciar(zonaChips);
    vaciar(selectorCategoria);
    if (anchoComputador.matches) {
      selectorCategoria.appendChild(crear('option', { value: '' }, 'Todas las categorías'));
      categorias.forEach(categoria => selectorCategoria.appendChild(crear('option', { value: categoria.id_categoria }, categoria.nombre)));
      selectorCategoria.value = estado.categoria;
      filaFiltros.appendChild(selectorCategoria);
      return;
    }
    if (selectorCategoria.parentNode) selectorCategoria.remove();
    if (categorias.length < 2) return;
    zonaChips.appendChild(crear('div', { clase: 'chips', role: 'group', 'aria-label': 'Categoría' },
      [{ id_categoria: '', nombre: 'Todas' }].concat(categorias).map(categoria => crear('button', {
        clase: 'chip', type: 'button', datos: { categoria: categoria.id_categoria },
        'aria-pressed': String(categoria.id_categoria === estado.categoria),
        onclick: () => elegirCategoria(categoria.id_categoria)
      }, categoria.nombre))));
  }

  function elegirCategoria(idCategoria) {
    estado.categoria = idCategoria;
    zonaChips.querySelectorAll('.chip').forEach(chip => chip.setAttribute('aria-pressed', String(chip.dataset.categoria === idCategoria)));
    pintarLista();
  }

  function pintarLista() {
    const modelo = estado.modelo;
    const filas = modelo.filas(estado.lugar)
      .filter(fila => !estado.categoria || fila.categoria.id_categoria === estado.categoria)
      .filter(fila => coincide(estado.busqueda, [fila.articulo.nombre, fila.articulo.id_articulo, fila.articulo.codigo_barra || '', fila.categoria.nombre]));
    vaciar(lista);
    if (modelo.lugares.length === 0) {
      lista.appendChild(crear('p', { clase: 'vacio' }, 'No tienes lugares asignados. Pide al administrador que te asigne uno.'));
    } else if (filas.length === 0) {
      lista.appendChild(crear('p', { clase: 'vacio' }, estado.busqueda.trim()
        ? 'Ningún artículo coincide con «' + estado.busqueda.trim() + '».' : 'No hay stock en este lugar.'));
    } else {
      lista.appendChild(anchoTabla.matches ? tabla(filas) : tarjetas(filas));
    }
    if (estado.primeraVez && estado.articulo) {
      const elegida = lista.querySelector('[aria-selected="true"]');
      if (elegida && anchoCostado.matches) elegida.scrollIntoView({ block: 'center' });
    }
    estado.primeraVez = false;
  }

  function tabla(filas) {
    const modelo = estado.modelo;
    const todos = !estado.lugar;
    return crear('div', { clase: 'tabla-contenedor' }, crear('table', { clase: 'tabla' },
      crear('thead', null, crear('tr', null,
        crear('th', { scope: 'col' }, 'Artículo'),
        crear('th', { scope: 'col', clase: 'col-amplia' }, 'Categoría'),
        todos ? crear('th', { scope: 'col', clase: 'col-amplia col-numero' }, 'Lugares') : null,
        crear('th', { scope: 'col', clase: 'col-numero' }, 'Cantidad'),
        modelo.conCostos ? crear('th', { scope: 'col', clase: 'col-numero' }, modelo.bruto ? 'Valor bruto' : 'Valor neto') : null,
        crear('th', { scope: 'col' }, 'Vence'))),
      crear('tbody', null, filas.map(fila => crear('tr', {
        datos: { articulo: fila.articulo.id_articulo },
        'aria-selected': String(fila.articulo.id_articulo === estado.articulo),
        onclick: () => abrirFicha(fila.articulo.id_articulo)
      },
      crear('td', null, crear('button', { clase: 'tabla__boton', type: 'button' }, fila.articulo.nombre),
        fila.bajoMinimo ? [' ', etiquetaMinimo()] : null),
      crear('td', { clase: 'texto-suave col-amplia' }, fila.categoria.nombre),
      todos ? crear('td', { clase: 'col-amplia col-numero' }, formatoNumero(fila.lugares, 0)) : null,
      crear('td', { clase: 'col-numero' }, formatoCantidad(fila.cantidad, fila.articulo.unidad_base)),
      modelo.conCostos ? crear('td', { clase: 'col-numero' }, formatoPesos(fila.valor)) : null,
      crear('td', null, fila.cantidad === 0 ? crear('span', { clase: 'texto-suave' }, 'Sin stock')
        : etiquetaVencimiento(fila.estado, fila.vence, true)))))));
  }

  function tarjetas(filas) {
    const modelo = estado.modelo;
    return crear('ul', { clase: 'lista-articulos' }, filas.map(fila => crear('li', null,
      crear('button', {
        clase: 'articulo', type: 'button', onclick: () => abrirFicha(fila.articulo.id_articulo),
        'aria-current': fila.articulo.id_articulo === estado.articulo ? 'true' : null
      },
      crear('span', { clase: 'articulo__nombre' }, fila.articulo.nombre),
      crear('span', { clase: 'articulo__cantidad' }, formatoCantidad(fila.cantidad, fila.articulo.unidad_base)),
      crear('span', null, fila.cantidad === 0 ? crear('span', { clase: 'estado' }, 'Sin stock')
        : etiquetaVencimiento(fila.estado, fila.vence, false), fila.bajoMinimo ? [' ', etiquetaMinimo()] : null),
      crear('span', { clase: 'articulo__valor' }, modelo.conCostos ? formatoPesos(fila.valor)
        : (!estado.lugar && fila.lugares > 1 ? 'en ' + fila.lugares + ' lugares' : ''))))));
  }

  // ---------- Ficha ----------

  function abrirFicha(idArticulo) {
    if (idArticulo === estado.articulo) return;
    const yaAbierta = Boolean(estado.articulo);
    contexto.navegar('inventario', { lugar: estado.lugar, articulo: idArticulo }, { reemplazar: yaAbierta });
    if (!yaAbierta) estado.fichaConHistoria = true;
  }

  /** Si la ficha se abrió desde esta lista, vuelve atrás (como el botón Atrás); si no, la cierra. */
  function cerrarFicha() {
    if (estado.fichaConHistoria) history.back();
    else contexto.navegar('inventario', { lugar: estado.lugar }, { reemplazar: true });
  }

  /** Muestra u oculta la ficha: al costado desde 1.100 px; sola (en vez de la lista) en pantallas angostas. */
  function pintarFicha() {
    const abierta = Boolean(estado.articulo && estado.modelo);
    const sola = abierta && !anchoCostado.matches;
    if (sola && !estado.sola) estado.posicionLista = window.scrollY;
    const veniaSola = estado.sola;
    estado.sola = sola;
    vaciar(panel);
    panel.hidden = !abierta;
    cuerpo.classList.toggle('con-panel--abierto', abierta && !sola);
    cabecera.hidden = sola;
    lista.hidden = sola;
    if (abierta) {
      panel.appendChild(dibujarFicha(estado.modelo, estado.articulo, {
        lugar: estado.lugar, modo: sola ? 'sola' : 'costado', alCerrar: cerrarFicha
      }));
    }
    const ficha = abierta ? estado.modelo.ficha(estado.articulo) : null;
    contexto.ponerTitulo(sola && ficha ? ficha.articulo.nombre : 'Inventario');
    if (sola) window.scrollTo(0, 0);
    else if (veniaSola) window.scrollTo(0, estado.posicionLista);
    lista.querySelectorAll('tr[data-articulo]').forEach(fila => {
      fila.setAttribute('aria-selected', String(fila.dataset.articulo === estado.articulo));
    });
  }

  function alCambiarAncho() {
    if (!estado.modelo) return;
    pintarCategorias();
    pintarLista();
    pintarFicha();
  }
}

// Navegadores antiguos (Safari 13) solo conocen addListener.
function escuchar(consulta, funcion) {
  if (consulta.addEventListener) consulta.addEventListener('change', funcion);
  else consulta.addListener(funcion);
}

function dejarDeEscuchar(consulta, funcion) {
  if (consulta.removeEventListener) consulta.removeEventListener('change', funcion);
  else consulta.removeListener(funcion);
}
