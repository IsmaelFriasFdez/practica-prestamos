// prestamos.service.mjs · Préstamo y devolución transaccionales.
// No recibe req ni res, no genera HTML y no conoce códigos HTTP.
// Recibe datos ya validados y depende del pool.
import { fallo } from './errores.mjs';

// Modelo de respuesta: nombres de la API en lugar de los de SQL.
const aPrestamo = fila => ({
  id: fila.id,
  equipoId: fila.equipo_id,
  usuarioId: fila.usuario_id,
  fechaPrestamo: fila.fecha_prestamo,
  fechaDevolucion: fila.fecha_devolucion
});

export function crearServicioPrestamos(pool) {
  // Un único cliente del pool para toda la transacción.
  // COMMIT solo si el trabajo termina bien; ante cualquier fallo, ROLLBACK.
  // El cliente se libera siempre en finally; si también falla el ROLLBACK
  // se descarta para que no vuelva al pool en estado incierto.
  async function transaccion(trabajo) {
    const cliente = await pool.connect();
    let descartar = false;
    try {
      await cliente.query('BEGIN');
      const resultado = await trabajo(cliente);
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      try { await cliente.query('ROLLBACK'); }
      catch { descartar = true; }
      throw error;
    } finally {
      cliente.release(descartar);
    }
  }

  return {
    async prestar(equipoId, usuarioId) {
      return transaccion(async cliente => {
        // 1. Actualización condicional: solo pasa a false si estaba en true.
        //    Con Read Committed, una petición simultánea espera el bloqueo de
        //    la fila y vuelve a evaluar la condición: afectará a 0 filas.
        const cambio = await cliente.query(
          `UPDATE practica_prestamos.equipos
           SET disponible = false
           WHERE id = $1 AND disponible = true
           RETURNING id`,
          [equipoId]
        );
        // 2. Si no se ha modificado ninguna fila, no se crea el préstamo.
        //    Se distingue equipo inexistente (404) de equipo ocupado (409).
        if (cambio.rowCount === 0) {
          const existe = await cliente.query(
            'SELECT id FROM practica_prestamos.equipos WHERE id = $1',
            [equipoId]
          );
          throw fallo(existe.rowCount === 0 ? 'EQUIPO_INEXISTENTE'
                                            : 'NO_DISPONIBLE');
        }
        // 3. Inserción del préstamo. Va después del UPDATE a propósito: si el
        //    usuario no existe, la clave foránea falla (23503) y el ROLLBACK
        //    devuelve el equipo a disponible=true.
        try {
          const r = await cliente.query(
            `INSERT INTO practica_prestamos.prestamos(equipo_id, usuario_id)
             VALUES ($1, $2)
             RETURNING id, equipo_id, usuario_id,
                       fecha_prestamo, fecha_devolucion`,
            [equipoId, usuarioId]
          );
          return aPrestamo(r.rows[0]);
        } catch (error) {
          if (error.code === '23503') throw fallo('USUARIO_INEXISTENTE');
          // Índice único parcial: ya existe un préstamo activo del equipo.
          if (error.code === '23505') throw fallo('NO_DISPONIBLE');
          throw error;
        }
      });
    },

    async devolver(prestamoId) {
      return transaccion(async cliente => {
        // 1. Modificación condicional: solo un préstamo activo.
        const r = await cliente.query(
          `UPDATE practica_prestamos.prestamos
           SET fecha_devolucion = now()
           WHERE id = $1 AND fecha_devolucion IS NULL
           RETURNING id, equipo_id, usuario_id,
                     fecha_prestamo, fecha_devolucion`,
          [prestamoId]
        );
        // 3. Si no existe o ya estaba devuelto, no se toca ningún equipo.
        if (r.rowCount === 0) {
          const existe = await cliente.query(
            'SELECT id FROM practica_prestamos.prestamos WHERE id = $1',
            [prestamoId]
          );
          throw fallo(existe.rowCount === 0 ? 'PRESTAMO_INEXISTENTE'
                                            : 'YA_DEVUELTO');
        }
        // 2. En la misma transacción, el equipo vuelve a estar disponible.
        await cliente.query(
          `UPDATE practica_prestamos.equipos SET disponible = true
           WHERE id = $1`,
          [r.rows[0].equipo_id]
        );
        return aPrestamo(r.rows[0]);
      });
    }
  };
}
