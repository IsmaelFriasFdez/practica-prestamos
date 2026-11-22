# Práctica DWES UD4 · Gestión de préstamos de material informático

Aplicación Node.js + Express 5 + PostgreSQL 18 (Docker) que mantiene un inventario de
equipos y registra préstamos y devoluciones de forma transaccional. Acceso a datos con
SQL directo y consultas parametrizadas mediante `pg` 8; dos vistas HTML con EJS 3.

## 1. Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 24 (necesario para `--env-file`) |
| Docker y Docker Compose | `docker compose` (con espacio) |
| PostgreSQL | 18, en contenedor (`postgres:18`) |
| Dependencias npm | `express@5`, `pg@8`, `ejs@3` |

Comprobación previa:

```bash
node --version
npm --version
docker version
docker compose version
```

## 2. Estructura

```
practica-prestamos/
  infra-postgres/
    compose.yaml          Servicio db (PostgreSQL 18) con volumen persistente
    .env.example          Plantilla de la clave de administrador de PostgreSQL
  init.sql                Esquema practica_prestamos, restricciones y datos de ejemplo
  .env.example            Plantilla de la conexión de Node (sin credenciales reales)
  package.json
  src/
    server.mjs            Arranque de Express, rutas, validación y errores HTTP
    db.mjs                Validación de configuración y creación del pool
    equipos.repo.mjs      SQL de consulta, alta, modificación y borrado de equipos
    prestamos.service.mjs Transacciones de préstamo y devolución
    validacion.mjs        Validación de ids, cuerpos JSON y filtros
    errores.mjs           Errores de dominio (propiedad codigo)
    init-db.mjs           Ejecuta init.sql desde Node (alternativa a psql)
  views/
    equipos.ejs           Listado con filtros y paginación
    equipo.ejs            Detalle e historial de préstamos
  pruebas/
    comprobar.mjs         Comprobaciones con fetch y Promise.all
```

## 3. Instalación de dependencias

```bash
cd practica-prestamos
npm install
```

`npm install` genera `package-lock.json`, que se entrega junto al código. No se entregan
`node_modules/`, los archivos `.env` ni el volumen de PostgreSQL (ver `.gitignore`).

## 4. Arranque de PostgreSQL en Docker

```bash
cd infra-postgres
cp .env.example .env        # y escribe una clave de administrador propia
docker compose up -d
docker compose ps           # espera a que el servicio db aparezca como healthy
```

El puerto `15432` del equipo (solo `127.0.0.1`) se dirige al `5432` del contenedor. Los
datos se guardan en el volumen `datos_pg`. `docker compose stop` / `start` detienen y
reanudan el servicio; `docker compose down` borra el contenedor pero **mantiene** el volumen;
`docker compose down -v` borra también los datos.


### Crear el usuario de la aplicación (una sola vez)

La aplicación no usa el usuario `postgres`. Desde `infra-postgres`:

```bash
docker compose exec db psql -U postgres -d dwes
```

```sql
CREATE ROLE dwes_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
\password dwes_app
GRANT CONNECT, CREATE ON DATABASE dwes TO dwes_app;
\q
```

## 5. Configuración de Node

En la raíz del proyecto:

```bash
cp .env.example .env        # y escribe la clave real de dwes_app en PGPASSWORD
```

| Variable | Valor |
|---|---|
| `PGHOST` | `127.0.0.1` (Node se ejecuta fuera de Docker) |
| `PGPORT` | `15432` |
| `PGDATABASE` | `dwes` |
| `PGUSER` | `dwes_app` |
| `PGPASSWORD` | clave de `dwes_app` |
| `PORT` | `3000` |

## 6. Inicialización de la base de datos

`init.sql` crea el esquema `practica_prestamos`, las tablas, restricciones e índice, y
**reinicia** sus datos de ejemplo. Se puede repetir para volver al estado inicial.

Opción A (desde Node):

```bash
npm run init-db
```

Opción B (como en clase, pegando el contenido de `init.sql` en psql):

```bash
cd infra-postgres
docker compose exec db psql -h 127.0.0.1 -U dwes_app -d dwes -W
```

### Modelo de datos

| Tabla | Restricciones |
|---|---|
| `usuarios(id, nombre)` | `PRIMARY KEY`; nombre `NOT NULL` y no vacío (`CHECK`) |
| `equipos(id, codigo, nombre, categoria, disponible)` | `id` `GENERATED ALWAYS AS IDENTITY PRIMARY KEY`; `codigo` `NOT NULL UNIQUE` con `CHECK` de 1 a 20 caracteres; nombre y categoría `NOT NULL` y no vacíos (`CHECK` con `trim`); `disponible boolean NOT NULL DEFAULT true` |
| `prestamos(id, equipo_id, usuario_id, fecha_prestamo, fecha_devolucion)` | `FOREIGN KEY` a equipos y usuarios **sin** `ON DELETE CASCADE`; `fecha_prestamo DEFAULT now()`; `fecha_devolucion` `NULL` mientras está activo; `CHECK` devolución ≥ préstamo |
| Índice `un_prestamo_activo_por_equipo` | `UNIQUE (equipo_id) WHERE fecha_devolucion IS NULL`: un solo préstamo activo por equipo, conservando el historial |

## 7. Arranque de la aplicación

```bash
npm start                   # node --env-file=.env src/server.mjs
```

Antes de escuchar se ejecuta `SELECT 1` para comprobar la conexión. Abre
<http://127.0.0.1:3000/equipos>. `Ctrl+C` cierra el servidor y el pool.

## 8. Rutas disponibles

### Vistas HTML

| Ruta | Descripción |
|---|---|
| `GET /equipos` | Tabla con código, nombre, categoría y estado. Parámetros GET: `q` (búsqueda parcial `ILIKE` por nombre), `categoria`, `disponible` (`si` / `no`), `orden` (`codigo` / `nombre`), `pagina`. 5 equipos por página con `ORDER BY`, `LIMIT` y `OFFSET`; los enlaces Anterior/Siguiente conservan los filtros. Parámetros no válidos → 400. |
| `GET /equipos/:id` | Datos del equipo, usuario que lo tiene ahora (`LEFT JOIN`) e historial de préstamos (`JOIN`). Id mal formado → 400; inexistente → 404. |

El orden solo se elige entre dos fragmentos SQL fijos (`codigo, id` o `nombre, id`): nunca
se concatena un nombre de columna recibido en la petición.

### API JSON

| Método y ruta | Cuerpo | Respuestas |
|---|---|---|
| `POST /api/equipos` | `{ "codigo", "nombre", "categoria" }` | 201 + equipo con id + cabecera `Location`; 400 datos/JSON no válidos; 409 `CODIGO_DUPLICADO` |
| `PUT /api/equipos/:id` | `{ "codigo", "nombre", "categoria" }` | 200 equipo actualizado; 400; 404 `EQUIPO_INEXISTENTE`; 409 `CODIGO_DUPLICADO` |
| `DELETE /api/equipos/:id` | — | 204 sin cuerpo; 400; 404; 409 `TIENE_PRESTAMOS` |
| `POST /api/prestamos` | `{ "equipoId", "usuarioId" }` (enteros) | 201 préstamo con id; 400; 404 `EQUIPO_INEXISTENTE` / `USUARIO_INEXISTENTE`; 409 `NO_DISPONIBLE` |
| `POST /api/prestamos/:id/devolucion` | — | 200 préstamo devuelto; 400; 404 `PRESTAMO_INEXISTENTE`; 409 `YA_DEVUELTO` |

Validación: `codigo` con mayúsculas, números o guiones (1–20); `nombre` de 1 a 80
caracteres y `categoria` de 1 a 40, tras quitar espacios (la categoría se guarda en
minúsculas). `disponible` no se admite en POST ni en PUT (400 `DISPONIBLE_NO_MODIFICABLE`):
solo cambia al prestar o devolver. Los errores de PostgreSQL se tratan por su SQLSTATE
(`23505` UNIQUE, `23503` FOREIGN KEY, `23502`/`23514` NOT NULL/CHECK). El cliente nunca
recibe el mensaje técnico de SQL.

### Transacciones

- **Préstamo**: un único cliente (`pool.connect`) con `BEGIN`; `UPDATE ... SET
  disponible=false WHERE id=$1 AND disponible=true`. Si `rowCount` es 0, no se inserta
  nada (404 si el equipo no existe, 409 si está prestado). Si no, `INSERT` del préstamo;
  si el usuario no existe falla la clave foránea y el `ROLLBACK` devuelve el equipo a
  disponible. `COMMIT` solo si las dos escrituras terminan bien; `cliente.release()` en
  `finally`.
- **Devolución**: `UPDATE prestamos SET fecha_devolucion=now() WHERE id=$1 AND
  fecha_devolucion IS NULL` y, en la misma transacción, `disponible=true` en el equipo.
  Si el préstamo no existe o ya estaba devuelto, no se toca ningún equipo.
- **Simultaneidad**: con Read Committed, el segundo `UPDATE` condicional espera el bloqueo
  de la fila, vuelve a evaluar `disponible=true` y afecta a 0 filas → 409. El índice
  único parcial protege la regla también en la base de datos.

## 9. Datos iniciales

Usuarios: 1 Ana García, 2 Luis Martín, 3 Marta Pérez.

| id | Código | Nombre | Categoría | Estado inicial |
|---|---|---|---|---|
| 1 | POR-001 | Portátil Lenovo ThinkPad E14 | portatil | Disponible (2 préstamos finalizados) |
| 2 | POR-002 | Portátil HP ProBook 450 | portatil | Disponible |
| 3 | POR-003 | Portátil Dell Latitude 3540 | portatil | Disponible |
| 4 | TAB-001 | Tableta Samsung Galaxy Tab A9 | tableta | Prestado a Luis Martín |
| 5 | TAB-002 | Tableta Lenovo Tab M10 | tableta | Disponible |
| 6 | PRY-001 | Proyector Epson EB-W51 | proyector | Prestado a Marta Pérez |
| 7 | PRY-002 | Proyector BenQ MW560 | proyector | Disponible |
| 8 | CAM-001 | Cámara web Logitech C920 | periferico | Disponible |
| 9 | RAT-001 | Ratón inalámbrico Logitech M185 | periferico | Disponible |
| 10 | AUR-001 | Auriculares Jabra Evolve2 30 | audio | Disponible |
| 11 | ALT-001 | Altavoz Bluetooth JBL Go 3 | audio | Disponible |
| 12 | ROU-001 | Router 4G TP-Link MR600 | red | Disponible |

## 10. Pruebas realizadas

Con el servidor arrancado (`npm start`), en otra terminal:

```bash
npm run comprobar           # node --env-file=.env pruebas/comprobar.mjs
```

El script **reinicia los datos** con `init.sql`, envía las peticiones con `fetch`
(la de simultaneidad con `Promise.all`) y, tras cada escritura, consulta las tablas para
comprobar el estado real. Al terminar imprime una tabla Markdown con el resultado obtenido
de cada caso.

| Caso | Petición | Resultado esperado | Resultado obtenido |
|---|---|---|---|
| Consulta | `GET /equipos` | 200, ALT-001…POR-002 ordenados por código, enlace Siguiente | |
| Segunda página | `GET /equipos?pagina=2` | 200, POR-003…ROU-001, enlace Anterior | |
| Búsqueda ILIKE | `GET /equipos?q=PORT` | 200, los 3 portátiles | |
| Categoría | `GET /equipos?categoria=Audio` | 200, ALT-001 y AUR-001 | |
| Disponibilidad | `GET /equipos?disponible=no` | 200, PRY-001 y TAB-001 | |
| Filtros combinados | `GET /equipos?q=hp&categoria=portatil&disponible=si` | 200, solo POR-002 | |
| Ordenación | `GET /equipos?orden=nombre` | 200, Altavoz, Auriculares, Cámara… | |
| Filtros al paginar | `GET /equipos?disponible=si` | Enlace Siguiente con `disponible=si` | |
| Sin resultados | `GET /equipos?q=zzzz` | 200 y mensaje "No hay equipos" | |
| Filtro / orden no válidos | `GET /equipos?pagina=0`, `?orden=disponible` | 400 | |
| Detalle | `GET /equipos/1`, `/equipos/6` | 200; sin préstamo activo + historial / prestado a Marta Pérez | |
| Detalle erróneo | `GET /equipos/abc`, `/equipos/9999` | 400 / 404 | |
| Alta | `POST /api/equipos {PRU-001}` | 201, id, `Location`, `disponible=true` | |
| Código repetido | `POST /api/equipos {POR-001}` | 409 | |
| Datos no válidos | nombre vacío, JSON mal formado, campo `disponible` | 400 | |
| Modificación | `PUT /api/equipos/:id` | 200; 409 con código de otro equipo; 404 con id 9999 | |
| Borrado | `DELETE` sin historial / repetido / `id=1` con préstamos | 204 / 404 / 409 | |
| Préstamo correcto | `POST /api/prestamos {2, 1}` | 201, 1 préstamo activo, equipo no disponible | |
| Préstamo duplicado | `POST /api/prestamos {2, 3}` | 409, sigue habiendo 1 sola fila | |
| Rollback | `POST /api/prestamos {3, 999}` | 404; equipo 3 disponible y 0 préstamos | |
| Devolución | `POST /api/prestamos/:id/devolucion` | 200; fecha registrada y equipo disponible | |
| Devolución repetida | la misma petición otra vez | 409; la fecha no cambia | |
| Simultaneidad | 2 × `POST /api/prestamos {5, …}` con `Promise.all` | `[201, 409]` y 1 sola fila | |

Antes de entregar, rellena la última columna con la tabla que imprime `npm run comprobar`.

## 11. Limitaciones conocidas

- Demostración local: sin autenticación ni autorización. `usuarioId` llega en el cuerpo
  solo para practicar; en una aplicación real se obtendría de la identidad autenticada.
- No hay endpoints de usuarios: se cargan desde `init.sql`.
- La búsqueda `q` admite los comodines `%` y `_` de `ILIKE` (no se escapan).
- La categoría se filtra por coincidencia exacta (normalizada a minúsculas).
- Paginación por `OFFSET`: si se insertan o borran equipos entre peticiones, las páginas
  pueden desplazarse. No se muestra el número total de páginas: se pide una fila más
  para saber si hay página siguiente.
- La disponibilidad se guarda en `equipos.disponible` y también se deduce de los préstamos
  activos. Las transacciones mantienen las dos coherentes.
- Las secuencias de identidad pueden dejar huecos tras un error o un `ROLLBACK`.
- Las fechas se muestran en hora de `Europe/Madrid`.
- `npm run comprobar` y `npm run init-db` borran los datos de `practica_prestamos`.
