// comprobar.mjs · Comprobaciones mínimas de la práctica (apartado 7).
// Requisitos: PostgreSQL arrancado y el servidor en marcha (npm start) en otra
// terminal. Ejecutar desde la raíz: npm run comprobar
//
// ATENCIÓN: al empezar se ejecuta init.sql, que REINICIA los datos de
// practica_prestamos, para partir de un estado conocido.
//
// No basta con mirar el código HTTP: después de cada escritura se consultan
// las tablas para comprobar el estado real (disponibilidad y préstamos).
import { readFile } from 'node:fs/promises';
import { pool } from '../src/db.mjs';

const base = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const resultados = [];

// Envía una petición. datos puede ser un objeto (se convierte a JSON) o un
// texto (para probar JSON mal formado).
async function enviar(metodo, ruta, datos) {
  const opciones = { method: metodo };
  if (datos !== undefined) {
    opciones.headers = { 'Content-Type': 'application/json' };
    opciones.body = typeof datos === 'string' ? datos : JSON.stringify(datos);
  }
  const r = await fetch(base + ruta, opciones);
  const texto = await r.text();           // un 204 llega con cuerpo vacío
  const esJson = (r.headers.get('content-type') ?? '').includes('json');
  return {
    estado: r.status,
    cuerpo: esJson ? JSON.parse(texto) : texto,
    location: r.headers.get('location')
  };
}

// Estado almacenado de un equipo: disponibilidad, préstamos activos y totales.
async function estadoEquipo(id) {
  const e = await pool.query(
    'SELECT disponible FROM practica_prestamos.equipos WHERE id = $1', [id]);
  const activos = await pool.query(
    `SELECT id FROM practica_prestamos.prestamos
     WHERE equipo_id = $1 AND fecha_devolucion IS NULL`, [id]);
  const total = await pool.query(
    'SELECT id FROM practica_prestamos.prestamos WHERE equipo_id = $1', [id]);
  return {
    existe: e.rowCount === 1,
    disponible: e.rows[0]?.disponible,
    activos: activos.rowCount,
    total: total.rowCount
  };
}

function anotar(caso, peticion, esperado, obtenido, correcto) {
  resultados.push({ caso, peticion, esperado, obtenido, correcto });
}

// Comprueba que los códigos aparecen en el HTML y en ese orden.
function enOrden(html, codigos) {
  let posicion = -1;
  for (const codigo of codigos) {
    const nueva = html.indexOf(`<td>${codigo}</td>`);
    if (nueva <= posicion) return false;
    posicion = nueva;
  }
  return true;
}
const contiene = (html, codigo) => html.includes(`<td>${codigo}</td>`);

try {
  // ---------- Estado inicial conocido ----------
  const sql = await readFile(new URL('../init.sql', import.meta.url), 'utf8');
  await pool.query(sql);

  // ---------- Consulta y filtros (GET /equipos) ----------
  let r = await enviar('GET', '/equipos');
  anotar('Consulta', 'GET /equipos', '200, 5 primeros por código y enlace Siguiente',
    `${r.estado}`, r.estado === 200 &&
    enOrden(r.cuerpo, ['ALT-001', 'AUR-001', 'CAM-001', 'POR-001', 'POR-002']) &&
    !contiene(r.cuerpo, 'POR-003') && r.cuerpo.includes('Siguiente'));

  r = await enviar('GET', '/equipos?pagina=2');
  anotar('Consulta', 'GET /equipos?pagina=2', '200, POR-003 … ROU-001 y enlace Anterior',
    `${r.estado}`, r.estado === 200 &&
    enOrden(r.cuerpo, ['POR-003', 'PRY-001', 'PRY-002', 'RAT-001', 'ROU-001']) &&
    !contiene(r.cuerpo, 'ALT-001') && r.cuerpo.includes('Anterior'));

  r = await enviar('GET', '/equipos?q=PORT');
  anotar('Búsqueda ILIKE', 'GET /equipos?q=PORT', '200, solo los 3 portátiles',
    `${r.estado}`, r.estado === 200 &&
    contiene(r.cuerpo, 'POR-001') && contiene(r.cuerpo, 'POR-002') &&
    contiene(r.cuerpo, 'POR-003') && !contiene(r.cuerpo, 'TAB-001'));

  r = await enviar('GET', '/equipos?categoria=Audio');
  anotar('Filtro categoría', 'GET /equipos?categoria=Audio', '200, ALT-001 y AUR-001',
    `${r.estado}`, r.estado === 200 &&
    contiene(r.cuerpo, 'ALT-001') && contiene(r.cuerpo, 'AUR-001') &&
    !contiene(r.cuerpo, 'POR-001'));

  r = await enviar('GET', '/equipos?disponible=no');
  anotar('Filtro disponibilidad', 'GET /equipos?disponible=no', '200, PRY-001 y TAB-001',
    `${r.estado}`, r.estado === 200 &&
    contiene(r.cuerpo, 'PRY-001') && contiene(r.cuerpo, 'TAB-001') &&
    !contiene(r.cuerpo, 'POR-001'));

  r = await enviar('GET', '/equipos?q=hp&categoria=portatil&disponible=si');
  anotar('Filtros combinados', 'GET /equipos?q=hp&categoria=portatil&disponible=si',
    '200, solo POR-002', `${r.estado}`, r.estado === 200 &&
    contiene(r.cuerpo, 'POR-002') && !contiene(r.cuerpo, 'POR-001'));

  r = await enviar('GET', '/equipos?orden=nombre');
  anotar('Ordenación', 'GET /equipos?orden=nombre', '200, Altavoz, Auriculares, Cámara…',
    `${r.estado}`, r.estado === 200 &&
    enOrden(r.cuerpo, ['ALT-001', 'AUR-001', 'CAM-001']));

  r = await enviar('GET', '/equipos?disponible=si');
  anotar('Filtros al paginar', 'GET /equipos?disponible=si',
    'El enlace Siguiente conserva disponible=si', `${r.estado}`,
    r.estado === 200 &&
    r.cuerpo.includes('disponible=si&amp;orden=codigo&amp;pagina=2'));

  r = await enviar('GET', '/equipos?q=zzzz');
  anotar('Sin resultados', 'GET /equipos?q=zzzz', '200 y mensaje "No hay equipos"',
    `${r.estado}`, r.estado === 200 && r.cuerpo.includes('No hay equipos'));

  r = await enviar('GET', '/equipos?pagina=0');
  anotar('Filtro inválido', 'GET /equipos?pagina=0', '400', `${r.estado}`, r.estado === 400);

  r = await enviar('GET', '/equipos?orden=disponible');
  anotar('Orden no permitido', 'GET /equipos?orden=disponible', '400',
    `${r.estado}`, r.estado === 400);

  // ---------- Detalle (GET /equipos/:id) ----------
  r = await enviar('GET', '/equipos/1');
  anotar('Detalle', 'GET /equipos/1', '200, sin préstamo activo y 2 préstamos históricos',
    `${r.estado}`, r.estado === 200 && r.cuerpo.includes('Nadie') &&
    r.cuerpo.includes('Ana García') && r.cuerpo.includes('Luis Martín'));

  r = await enviar('GET', '/equipos/6');
  anotar('Detalle', 'GET /equipos/6', '200, prestado actualmente a Marta Pérez',
    `${r.estado}`, r.estado === 200 &&
    r.cuerpo.includes('Marta Pérez (desde'));

  r = await enviar('GET', '/equipos/abc');
  anotar('Detalle', 'GET /equipos/abc', '400', `${r.estado}`, r.estado === 400);

  r = await enviar('GET', '/equipos/9999');
  anotar('Detalle', 'GET /equipos/9999', '404', `${r.estado}`, r.estado === 404);

  // ---------- Alta y modificación ----------
  r = await enviar('POST', '/api/equipos',
    { codigo: 'PRU-001', nombre: '  Portátil de pruebas ', categoria: 'Portatil' });
  const nuevo = r.cuerpo;
  anotar('Alta', 'POST /api/equipos {PRU-001}', '201, id, Location y disponible=true',
    `${r.estado} ${r.location}`, r.estado === 201 && Number.isInteger(nuevo.id) &&
    r.location === `/equipos/${nuevo.id}` && nuevo.disponible === true &&
    nuevo.nombre === 'Portátil de pruebas' && nuevo.categoria === 'portatil');

  r = await enviar('POST', '/api/equipos',
    { codigo: 'POR-001', nombre: 'Repetido', categoria: 'portatil' });
  anotar('Alta', 'POST /api/equipos {POR-001 repetido}', '409 CODIGO_DUPLICADO',
    `${r.estado} ${r.cuerpo.error}`, r.estado === 409);

  r = await enviar('POST', '/api/equipos', { codigo: 'X-1', nombre: '   ', categoria: 'red' });
  anotar('Alta', 'POST /api/equipos {nombre vacío}', '400', `${r.estado}`, r.estado === 400);

  r = await enviar('POST', '/api/equipos', '{"codigo": "MAL"');
  anotar('Alta', 'POST /api/equipos (JSON mal formado)', '400 JSON_INVALIDO',
    `${r.estado} ${r.cuerpo.error}`, r.estado === 400);

  r = await enviar('POST', '/api/equipos',
    { codigo: 'X-2', nombre: 'Algo', categoria: 'red', disponible: false });
  anotar('Alta', 'POST /api/equipos {disponible}', '400 DISPONIBLE_NO_MODIFICABLE',
    `${r.estado} ${r.cuerpo.error}`, r.estado === 400);

  r = await enviar('PUT', `/api/equipos/${nuevo.id}`,
    { codigo: 'PRU-001', nombre: 'Portátil de pruebas (revisado)', categoria: 'portatil' });
  anotar('Modificación', `PUT /api/equipos/${nuevo.id}`, '200 con el nombre nuevo',
    `${r.estado} ${r.cuerpo.nombre}`, r.estado === 200 &&
    r.cuerpo.nombre === 'Portátil de pruebas (revisado)');

  r = await enviar('PUT', `/api/equipos/${nuevo.id}`,
    { codigo: 'POR-002', nombre: 'Choque', categoria: 'portatil' });
  anotar('Modificación', `PUT /api/equipos/${nuevo.id} {POR-002}`, '409 CODIGO_DUPLICADO',
    `${r.estado} ${r.cuerpo.error}`, r.estado === 409);

  r = await enviar('PUT', '/api/equipos/9999',
    { codigo: 'NO-EXISTE', nombre: 'Nada', categoria: 'red' });
  anotar('Modificación', 'PUT /api/equipos/9999', '404', `${r.estado}`, r.estado === 404);

  // ---------- Borrado ----------
  r = await enviar('DELETE', `/api/equipos/${nuevo.id}`);
  anotar('Borrado', `DELETE /api/equipos/${nuevo.id} (sin historial)`, '204 sin cuerpo',
    `${r.estado}`, r.estado === 204 && r.cuerpo === '');

  r = await enviar('DELETE', `/api/equipos/${nuevo.id}`);
  anotar('Borrado', `DELETE /api/equipos/${nuevo.id} (otra vez)`, '404',
    `${r.estado}`, r.estado === 404);

  r = await enviar('DELETE', '/api/equipos/1');
  const tras = await estadoEquipo(1);
  anotar('Borrado', 'DELETE /api/equipos/1 (con préstamos finalizados)',
    '409 TIENE_PRESTAMOS y el equipo sigue existiendo',
    `${r.estado} ${r.cuerpo.error}`, r.estado === 409 && tras.existe);

  // ---------- Préstamo correcto ----------
  r = await enviar('POST', '/api/prestamos', { equipoId: 2, usuarioId: 1 });
  const prestamo = r.cuerpo;
  let e = await estadoEquipo(2);
  anotar('Préstamo correcto', 'POST /api/prestamos {equipoId:2, usuarioId:1}',
    '201; 1 préstamo activo; disponible=false',
    `${r.estado}; activos=${e.activos}; disponible=${e.disponible}`,
    r.estado === 201 && Number.isInteger(prestamo.id) &&
    e.activos === 1 && e.disponible === false);

  // ---------- Préstamo duplicado ----------
  r = await enviar('POST', '/api/prestamos', { equipoId: 2, usuarioId: 3 });
  e = await estadoEquipo(2);
  anotar('Préstamo duplicado', 'POST /api/prestamos {equipoId:2, usuarioId:3}',
    '409 NO_DISPONIBLE; sigue habiendo 1 préstamo',
    `${r.estado} ${r.cuerpo.error}; total=${e.total}`,
    r.estado === 409 && e.total === 1 && e.activos === 1);

  r = await enviar('POST', '/api/prestamos', { equipoId: 9999, usuarioId: 1 });
  anotar('Préstamo', 'POST /api/prestamos {equipoId:9999}', '404 EQUIPO_INEXISTENTE',
    `${r.estado} ${r.cuerpo.error}`, r.estado === 404);

  r = await enviar('POST', '/api/prestamos', { equipoId: '2', usuarioId: 1 });
  anotar('Préstamo', 'POST /api/prestamos {equipoId:"2"}', '400 DATOS_INVALIDOS',
    `${r.estado}`, r.estado === 400);

  // ---------- Rollback ----------
  r = await enviar('POST', '/api/prestamos', { equipoId: 3, usuarioId: 999 });
  e = await estadoEquipo(3);
  anotar('Rollback', 'POST /api/prestamos {equipoId:3, usuarioId:999}',
    '404 USUARIO_INEXISTENTE; disponible=true; 0 préstamos',
    `${r.estado} ${r.cuerpo.error}; disponible=${e.disponible}; total=${e.total}`,
    r.estado === 404 && e.disponible === true && e.total === 0);

  // ---------- Devolución ----------
  r = await enviar('POST', `/api/prestamos/${prestamo.id}/devolucion`);
  e = await estadoEquipo(2);
  const fila = await pool.query(
    'SELECT fecha_devolucion FROM practica_prestamos.prestamos WHERE id = $1',
    [prestamo.id]);
  const fechaRegistrada = fila.rows[0].fecha_devolucion;
  anotar('Devolución', `POST /api/prestamos/${prestamo.id}/devolucion`,
    '200; fecha_devolucion registrada; disponible=true',
    `${r.estado}; fecha=${fechaRegistrada !== null}; disponible=${e.disponible}`,
    r.estado === 200 && r.cuerpo.fechaDevolucion !== null &&
    fechaRegistrada !== null && e.disponible === true && e.activos === 0);

  r = await enviar('POST', `/api/prestamos/${prestamo.id}/devolucion`);
  const filaOtra = await pool.query(
    'SELECT fecha_devolucion FROM practica_prestamos.prestamos WHERE id = $1',
    [prestamo.id]);
  e = await estadoEquipo(2);
  anotar('Devolución repetida', `POST /api/prestamos/${prestamo.id}/devolucion`,
    '409 YA_DEVUELTO; la fecha no cambia',
    `${r.estado} ${r.cuerpo.error}`,
    r.estado === 409 && e.disponible === true &&
    filaOtra.rows[0].fecha_devolucion.getTime() === fechaRegistrada.getTime());

  r = await enviar('POST', '/api/prestamos/9999/devolucion');
  anotar('Devolución', 'POST /api/prestamos/9999/devolucion', '404 PRESTAMO_INEXISTENTE',
    `${r.estado} ${r.cuerpo.error}`, r.estado === 404);

  // ---------- Simultaneidad ----------
  // Promise.all inicia las dos peticiones sin esperar a que acabe la primera.
  const respuestas = await Promise.all([
    enviar('POST', '/api/prestamos', { equipoId: 5, usuarioId: 1 }),
    enviar('POST', '/api/prestamos', { equipoId: 5, usuarioId: 2 })
  ]);
  const estados = respuestas.map(x => x.estado).sort();
  e = await estadoEquipo(5);
  anotar('Simultaneidad', '2 × POST /api/prestamos {equipoId:5} a la vez',
    '[201, 409]; 1 sola fila de préstamo',
    `[${estados.join(', ')}]; total=${e.total}`,
    estados[0] === 201 && estados[1] === 409 && e.total === 1 &&
    e.disponible === false);
} catch (error) {
  console.error('No se pudieron completar las comprobaciones:', error.message);
  console.error('¿Está arrancado el servidor (npm start) y PostgreSQL?');
  process.exitCode = 1;
} finally {
  await pool.end();
}

// ---------- Informe (tabla Markdown para el README) ----------
console.log('| Caso | Petición | Resultado esperado | Resultado obtenido | ¿OK? |');
console.log('|---|---|---|---|---|');
for (const x of resultados) {
  console.log(`| ${x.caso} | \`${x.peticion}\` | ${x.esperado} | ${x.obtenido} | ${x.correcto ? 'Sí' : 'NO'} |`);
}
const fallos = resultados.filter(x => !x.correcto).length;
console.log(`\n${resultados.length - fallos} de ${resultados.length} comprobaciones correctas`);
if (fallos > 0) process.exitCode = 1;
