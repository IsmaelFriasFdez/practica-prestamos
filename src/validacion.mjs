// validacion.mjs · Validación de los datos que llegan del cliente.
// Validar comprueba formato y reglas; parametrizar evita que un valor se
// convierta en sintaxis SQL. Se necesitan ambas cosas.

const ENTERO_MAXIMO = 2147483647; // integer positivo de PostgreSQL

// Identificador recibido como texto en la URL (req.params.id).
// Devuelve el número o null si está mal formado.
export function idDesdeTexto(texto) {
  const id = Number(texto);
  if (typeof texto !== 'string' || !/^[1-9]\d*$/.test(texto) ||
      !Number.isSafeInteger(id) || id > ENTERO_MAXIMO) {
    return null;
  }
  return id;
}

// Identificador recibido como número dentro de un cuerpo JSON.
export const idValido = x =>
  Number.isInteger(x) && x > 0 && x <= ENTERO_MAXIMO;

// El cuerpo JSON debe ser un objeto (no null, no array).
export function esObjeto(cuerpo) {
  return cuerpo !== null && typeof cuerpo === 'object' &&
    !Array.isArray(cuerpo);
}

// Datos de un equipo para POST y PUT: { codigo, nombre, categoria }.
// Devuelve los datos normalizados o null si no son válidos.
// El campo disponible no se admite: solo cambia al prestar o devolver.
export function leerDatosEquipo(cuerpo) {
  if (!esObjeto(cuerpo)) return null;
  const { codigo, nombre, categoria } = cuerpo;
  if (typeof codigo !== 'string' || typeof nombre !== 'string' ||
      typeof categoria !== 'string') {
    return null;
  }
  const nombreLimpio = nombre.trim();
  const categoriaLimpia = categoria.trim().toLocaleLowerCase('es');
  if (!/^[A-Z0-9-]{1,20}$/.test(codigo) ||
      nombreLimpio.length < 1 || nombreLimpio.length > 80 ||
      categoriaLimpia.length < 1 || categoriaLimpia.length > 40) {
    return null;
  }
  return { codigo, nombre: nombreLimpio, categoria: categoriaLimpia };
}

// Filtros del listado GET /equipos. Devuelve null si alguno no es válido.
// Comprobar typeof rechaza parámetros repetidos que Express convierte en arrays.
export function leerFiltros(query) {
  const q = query.q ?? '';
  const categoria = query.categoria ?? '';
  const disponible = query.disponible ?? '';
  const orden = query.orden ?? 'codigo';
  const textoPagina = query.pagina ?? '1';
  if (typeof q !== 'string' || q.length > 80 ||
      typeof categoria !== 'string' || categoria.length > 40 ||
      !['', 'si', 'no'].includes(disponible) ||
      !['codigo', 'nombre'].includes(orden) ||
      typeof textoPagina !== 'string' ||
      !/^[1-9]\d{0,3}$/.test(textoPagina)) {
    return null;
  }
  return {
    q: q.trim(),
    categoria: categoria.trim().toLocaleLowerCase('es'),
    disponible,
    orden,
    pagina: Number(textoPagina)
  };
}
