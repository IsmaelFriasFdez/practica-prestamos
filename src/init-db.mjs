// init-db.mjs · Ejecuta init.sql con el usuario dwes_app (alternativa a pegarlo
// en psql). Crea el esquema practica_prestamos y REINICIA sus datos.
import { readFile } from 'node:fs/promises';
import { pool } from './db.mjs';

try {
  const sql = await readFile(new URL('../init.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('Esquema practica_prestamos inicializado con los datos de ejemplo');
} catch {
  console.error('No se pudo inicializar la base de datos');
  process.exitCode = 1;
} finally {
  await pool.end();
}
