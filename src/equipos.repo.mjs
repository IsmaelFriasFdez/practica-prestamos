// equipos.repo.mjs · Repositorio de equipos: SQL directo con pg y parámetros.
// No conoce Express, req, res ni códigos HTTP. Recibe el pool al construirse.
import { fallo } from './errores.mjs';

export const TAMANO_PAGINA = 5;

export function crearRepositorioEquipos(pool) {
  return {
    // Listado con búsqueda, filtros, orden y paginación.
    // Solo se concatenan fragmentos fijos escritos aquí (condiciones con su
    // marcador $n y el ORDER BY elegido entre dos opciones). Todos los valores
    // del cliente viajan en el array de parámetros.
    async listar({ q, categoria, disponible, orden, pagina }) {
      const valores = [`%${q}%`];
      const condiciones = ['nombre ILIKE $1'];
      if (categoria !== '') {
        valores.push(categoria);
        condiciones.push(`categoria = $${valores.length}`);
      }
      if (disponible !== '') {
        valores.push(disponible === 'si');
        condiciones.push(`disponible = $${valores.length}`);
      }
      // Orden estable: el id desempata.
      const ordenSQL = orden === 'nombre' ? 'nombre, id' : 'codigo, id';
      // Se pide una fila más del tamaño de página para saber si hay siguiente.
      valores.push(TAMANO_PAGINA + 1, (pagina - 1) * TAMANO_PAGINA);
      const r = await pool.query(
        `SELECT id, codigo, nombre, categoria, disponible
         FROM practica_prestamos.equipos
         WHERE ${condiciones.join(' AND ')}
         ORDER BY ${ordenSQL}
         LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
        valores
      );
      return {
        equipos: r.rows.slice(0, TAMANO_PAGINA),
        haySiguiente: r.rows.length > TAMANO_PAGINA
      };
    },

    // Detalle: datos del equipo + préstamo activo (si existe) + historial.
    // LEFT JOIN conserva el equipo aunque no tenga préstamo activo. La
    // condición fecha_devolucion IS NULL va en ON y no en WHERE: en WHERE
    // eliminaría las filas sin coincidencia del LEFT JOIN.
    async buscarDetalle(id) {
      const r = await pool.query(
        `SELECT e.id, e.codigo, e.nombre, e.categoria, e.disponible,
                u.nombre AS usuario_actual, p.fecha_prestamo AS prestado_desde
         FROM practica_prestamos.equipos AS e
         LEFT JOIN practica_prestamos.prestamos AS p
           ON p.equipo_id = e.id AND p.fecha_devolucion IS NULL
         LEFT JOIN practica_prestamos.usuarios AS u ON u.id = p.usuario_id
         WHERE e.id = $1`,
        [id]
      );
      if (!r.rows.length) return null;
      const historial = await pool.query(
        `SELECT p.id, u.nombre AS usuario, p.fecha_prestamo, p.fecha_devolucion
         FROM practica_prestamos.prestamos AS p
         INNER JOIN practica_prestamos.usuarios AS u ON u.id = p.usuario_id
         WHERE p.equipo_id = $1
         ORDER BY p.fecha_prestamo DESC, p.id DESC`,
        [id]
      );
      return { equipo: r.rows[0], prestamos: historial.rows };
    },

    // INSERT ... RETURNING: recupera el equipo creado sin una segunda consulta.
    // disponible no se envía: toma su valor por defecto (true).
    async crear({ codigo, nombre, categoria }) {
      try {
        const r = await pool.query(
          `INSERT INTO practica_prestamos.equipos(codigo, nombre, categoria)
           VALUES ($1, $2, $3)
           RETURNING id, codigo, nombre, categoria, disponible`,
          [codigo, nombre, categoria]
        );
        return r.rows[0];
      } catch (error) {
        if (error.code === '23505') throw fallo('CODIGO_DUPLICADO');
        throw error;
      }
    },

    // UPDATE ... WHERE id=$4. disponible no se modifica aquí.
    // rowCount 0 significa que no existe: se devuelve null.
    async actualizar(id, { codigo, nombre, categoria }) {
      try {
        const r = await pool.query(
          `UPDATE practica_prestamos.equipos
           SET codigo = $1, nombre = $2, categoria = $3
           WHERE id = $4
           RETURNING id, codigo, nombre, categoria, disponible`,
          [codigo, nombre, categoria, id]
        );
        if (r.rowCount === 0) return null;
        return r.rows[0];
      } catch (error) {
        if (error.code === '23505') throw fallo('CODIGO_DUPLICADO');
        throw error;
      }
    },

    // DELETE ... WHERE id=$1. Devuelve false si no existía.
    // La clave foránea sin cascada impide borrar un equipo con préstamos
    // (SQLSTATE 23503), incluidos los ya finalizados.
    async eliminar(id) {
      try {
        const r = await pool.query(
          'DELETE FROM practica_prestamos.equipos WHERE id = $1',
          [id]
        );
        return r.rowCount === 1;
      } catch (error) {
        if (error.code === '23503') throw fallo('TIENE_PRESTAMOS');
        throw error;
      }
    }
  };
}
