// server.mjs · Arranque de Express, rutas HTTP, validación y errores.
// El SQL está en equipos.repo.mjs y prestamos.service.mjs; el pool en db.mjs.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { pool } from './db.mjs';
import { crearRepositorioEquipos } from './equipos.repo.mjs';
import { crearServicioPrestamos } from './prestamos.service.mjs';
import {
  idDesdeTexto, idValido, esObjeto, leerDatosEquipo, leerFiltros
} from './validacion.mjs';

const app = express();
const equipos = crearRepositorioEquipos(pool);
const prestamos = crearServicioPrestamos(pool);

app.set('view engine', 'ejs');
app.set('views', fileURLToPath(new URL('../views/', import.meta.url)));
app.use(express.json({ limit: '10kb' }));

// ---------- Modelos de vista (preparan los datos para EJS) ----------
const formatoFecha = fecha =>
  fecha ? fecha.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : '';

const aVistaLista = fila => ({
  id: fila.id,
  codigo: fila.codigo,
  nombre: fila.nombre,
  categoria: fila.categoria,
  estado: fila.disponible ? 'Disponible' : 'Prestado'
});

const aVistaDetalle = ({ equipo, prestamos: historial }) => ({
  equipo: {
    id: equipo.id,
    codigo: equipo.codigo,
    nombre: equipo.nombre,
    categoria: equipo.categoria,
    estado: equipo.disponible ? 'Disponible' : 'Prestado',
    usuarioActual: equipo.usuario_actual,          // null si no está prestado
    prestadoDesde: formatoFecha(equipo.prestado_desde)
  },
  prestamos: historial.map(p => ({
    id: p.id,
    usuario: p.usuario,
    fechaPrestamo: formatoFecha(p.fecha_prestamo),
    fechaDevolucion: p.fecha_devolucion ? formatoFecha(p.fecha_devolucion)
                                        : 'Activo (sin devolver)'
  }))
});

// ---------- Vistas HTML (EJS) ----------
app.get('/', (req, res) => res.redirect('/equipos'));

// 4.1 Listado con búsqueda, filtros, orden y paginación de 5 en 5.
app.get('/equipos', async (req, res) => {
  const filtros = leerFiltros(req.query);
  if (!filtros) return res.status(400).send('Filtros no válidos');
  const { equipos: filas, haySiguiente } = await equipos.listar(filtros);
  // URLSearchParams codifica los enlaces y conserva los filtros.
  const enlace = n => '/equipos?' + new URLSearchParams({
    q: filtros.q, categoria: filtros.categoria,
    disponible: filtros.disponible, orden: filtros.orden,
    pagina: String(n)
  });
  res.render('equipos', {
    equipos: filas.map(aVistaLista),
    filtros,
    anterior: filtros.pagina > 1 ? enlace(filtros.pagina - 1) : null,
    siguiente: haySiguiente ? enlace(filtros.pagina + 1) : null
  });
});

// 4.2 Detalle de un equipo con préstamo actual e historial.
app.get('/equipos/:id', async (req, res) => {
  const id = idDesdeTexto(req.params.id);
  if (id === null) return res.status(400).send('Identificador no válido');
  const detalle = await equipos.buscarDetalle(id);
  if (!detalle) return res.status(404).send('Equipo inexistente');
  res.render('equipo', aVistaDetalle(detalle));
});

// ---------- API JSON de escritura ----------
app.post('/api/equipos', async (req, res) => {
  if (esObjeto(req.body) && req.body.disponible !== undefined) {
    return res.status(400).json({ error: 'DISPONIBLE_NO_MODIFICABLE' });
  }
  const datos = leerDatosEquipo(req.body);
  if (!datos) return res.status(400).json({ error: 'DATOS_INVALIDOS' });
  const equipo = await equipos.crear(datos);
  res.status(201).location(`/equipos/${equipo.id}`).json(equipo);
});

app.put('/api/equipos/:id', async (req, res) => {
  const id = idDesdeTexto(req.params.id);
  if (id === null) return res.status(400).json({ error: 'ID_INVALIDO' });
  if (esObjeto(req.body) && req.body.disponible !== undefined) {
    return res.status(400).json({ error: 'DISPONIBLE_NO_MODIFICABLE' });
  }
  const datos = leerDatosEquipo(req.body);
  if (!datos) return res.status(400).json({ error: 'DATOS_INVALIDOS' });
  const equipo = await equipos.actualizar(id, datos);
  if (!equipo) return res.status(404).json({ error: 'EQUIPO_INEXISTENTE' });
  res.json(equipo);
});

app.delete('/api/equipos/:id', async (req, res) => {
  const id = idDesdeTexto(req.params.id);
  if (id === null) return res.status(400).json({ error: 'ID_INVALIDO' });
  const borrado = await equipos.eliminar(id);
  if (!borrado) return res.status(404).json({ error: 'EQUIPO_INEXISTENTE' });
  res.status(204).end();
});

app.post('/api/prestamos', async (req, res) => {
  const { equipoId, usuarioId } = esObjeto(req.body) ? req.body : {};
  if (!idValido(equipoId) || !idValido(usuarioId)) {
    return res.status(400).json({ error: 'DATOS_INVALIDOS' });
  }
  const prestamo = await prestamos.prestar(equipoId, usuarioId);
  res.status(201).json(prestamo);
});

app.post('/api/prestamos/:id/devolucion', async (req, res) => {
  const id = idDesdeTexto(req.params.id);
  if (id === null) return res.status(400).json({ error: 'ID_INVALIDO' });
  res.json(await prestamos.devolver(id));
});

// ---------- Tratamiento central de errores ----------
// Express 5 deriva aquí los rechazos de las rutas async. Va después de las
// rutas y tiene cuatro parámetros. Nunca se envía al cliente el mensaje
// técnico de PostgreSQL: solo un código controlado.
app.use((err, req, res, next) => {
  if (!req.originalUrl.startsWith('/api/')) {
    console.error('Error al consultar equipos');
    return res.status(500).send('No se pudieron consultar los datos');
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON_INVALIDO' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'CUERPO_EXCESIVO' });
  }
  if (['EQUIPO_INEXISTENTE', 'USUARIO_INEXISTENTE',
       'PRESTAMO_INEXISTENTE'].includes(err.codigo)) {
    return res.status(404).json({ error: err.codigo });
  }
  if (['CODIGO_DUPLICADO', 'TIENE_PRESTAMOS', 'NO_DISPONIBLE',
       'YA_DEVUELTO'].includes(err.codigo)) {
    return res.status(409).json({ error: err.codigo });
  }
  // Restricciones no previstas por la validación (SQLSTATE).
  if (err.code === '23505') return res.status(409).json({ error: 'CONFLICTO' });
  if (err.code === '23503') {
    return res.status(409).json({ error: 'DATOS_RELACIONADOS' });
  }
  if (['23502', '23514'].includes(err.code)) {
    return res.status(400).json({ error: 'DATOS_NO_ADMITIDOS' });
  }
  console.error('Error en la API de préstamos');
  res.status(500).json({ error: 'ERROR_INTERNO' });
});

// ---------- Arranque y cierre ----------
// Se comprueba la conexión antes de admitir peticiones.
try {
  const r = await pool.query('SELECT 1 AS comprobacion');
  console.log('Conexión comprobada:', r.rows[0].comprobacion);
  const puerto = Number(process.env.PORT ?? 3000);
  const servidor = app.listen(puerto, '127.0.0.1',
    () => console.log(`HTTP preparado en http://127.0.0.1:${puerto}/equipos`));
  const cerrar = () => servidor.close(async () => { await pool.end(); });
  process.once('SIGINT', cerrar);
  process.once('SIGTERM', cerrar);
} catch {
  console.error('No se pudo conectar con PostgreSQL');
  await pool.end();
  process.exitCode = 1;
}
