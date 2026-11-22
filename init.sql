-- init.sql · Práctica DWES UD4 · Gestión de préstamos de material informático
-- Ejecutar como dwes_app en la base dwes (psql o npm run init-db).
-- ATENCIÓN: reinicia los datos del esquema practica_prestamos; no lo uses sobre
-- información que quieras conservar.

CREATE SCHEMA IF NOT EXISTS practica_prestamos;

-- Usuarios de prueba: existen desde la inicialización y no tienen endpoints.
CREATE TABLE IF NOT EXISTS practica_prestamos.usuarios (
  id integer PRIMARY KEY,
  nombre text NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 1 AND 80)
);

-- Inventario de equipos.
-- id autogenerado; codigo único de 1 a 20 caracteres; nombre y categoría
-- obligatorios y no vacíos; disponible booleano con valor inicial true.
CREATE TABLE IF NOT EXISTS practica_prestamos.equipos (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo text NOT NULL UNIQUE CHECK (char_length(codigo) BETWEEN 1 AND 20),
  nombre text NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 1 AND 80),
  categoria text NOT NULL CHECK (char_length(trim(categoria)) BETWEEN 1 AND 40),
  disponible boolean NOT NULL DEFAULT true
);

-- Préstamos. Las claves foráneas NO llevan ON DELETE CASCADE: así no se puede
-- borrar un equipo (ni un usuario) que tenga préstamos, aunque estén finalizados,
-- y se conserva el historial.
CREATE TABLE IF NOT EXISTS practica_prestamos.prestamos (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  equipo_id integer NOT NULL
    REFERENCES practica_prestamos.equipos(id),
  usuario_id integer NOT NULL
    REFERENCES practica_prestamos.usuarios(id),
  fecha_prestamo timestamptz NOT NULL DEFAULT now(),
  fecha_devolucion timestamptz,
  CHECK (fecha_devolucion IS NULL OR fecha_devolucion >= fecha_prestamo)
);

-- Solo un préstamo activo (fecha_devolucion IS NULL) por equipo.
-- Los préstamos ya devueltos no cuentan, así se conserva el historial.
CREATE UNIQUE INDEX IF NOT EXISTS un_prestamo_activo_por_equipo
ON practica_prestamos.prestamos(equipo_id)
WHERE fecha_devolucion IS NULL;

-- Reinicio de los datos de la práctica (estado conocido para las pruebas).
TRUNCATE practica_prestamos.prestamos,
  practica_prestamos.equipos, practica_prestamos.usuarios
RESTART IDENTITY;

INSERT INTO practica_prestamos.usuarios VALUES
  (1, 'Ana García'),
  (2, 'Luis Martín'),
  (3, 'Marta Pérez');

-- Las categorías se guardan en minúsculas: la aplicación normaliza igual.
-- Tras RESTART IDENTITY los ids se asignan en este orden: 1, 2, 3...
INSERT INTO practica_prestamos.equipos(codigo, nombre, categoria, disponible) VALUES
  ('POR-001', 'Portátil Lenovo ThinkPad E14', 'portatil', true),     -- id 1
  ('POR-002', 'Portátil HP ProBook 450', 'portatil', true),          -- id 2
  ('POR-003', 'Portátil Dell Latitude 3540', 'portatil', true),      -- id 3
  ('TAB-001', 'Tableta Samsung Galaxy Tab A9', 'tableta', false),    -- id 4
  ('TAB-002', 'Tableta Lenovo Tab M10', 'tableta', true),            -- id 5
  ('PRY-001', 'Proyector Epson EB-W51', 'proyector', false),         -- id 6
  ('PRY-002', 'Proyector BenQ MW560', 'proyector', true),            -- id 7
  ('CAM-001', 'Cámara web Logitech C920', 'periferico', true),       -- id 8
  ('RAT-001', 'Ratón inalámbrico Logitech M185', 'periferico', true),-- id 9
  ('AUR-001', 'Auriculares Jabra Evolve2 30', 'audio', true),        -- id 10
  ('ALT-001', 'Altavoz Bluetooth JBL Go 3', 'audio', true),          -- id 11
  ('ROU-001', 'Router 4G TP-Link MR600', 'red', true);               -- id 12

-- Historial: dos préstamos finalizados del equipo 1 y dos préstamos activos
-- (equipos 4 y 6, marcados arriba como no disponibles).
INSERT INTO practica_prestamos.prestamos
  (equipo_id, usuario_id, fecha_prestamo, fecha_devolucion) VALUES
  (1, 1, '2026-10-05 09:00+02', '2026-10-07 14:00+02'),
  (1, 2, '2026-10-20 10:30+02', '2026-10-24 12:15+02'),
  (4, 2, '2026-11-16 08:45+01', NULL),
  (6, 3, '2026-11-18 11:00+01', NULL);
