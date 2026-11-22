// db.mjs · Validación mínima de la configuración y creación del pool.
// pg lee PGHOST, PGPORT, PGDATABASE, PGUSER y PGPASSWORD del entorno
// (cargado con node --env-file=.env). Se crea un único pool por proceso.
import pg from 'pg';

for (const clave of ['PGHOST', 'PGPORT', 'PGDATABASE',
                     'PGUSER', 'PGPASSWORD']) {
  if (!process.env[clave]) throw new Error(`Falta ${clave}`);
}
const puerto = Number(process.env.PGPORT);
if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
  throw new Error('PGPORT no es válido');
}

export const pool = new pg.Pool({
  max: 5, connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 10000
});
pool.on('error', () => console.error('Fallo de conexión inactiva'));
