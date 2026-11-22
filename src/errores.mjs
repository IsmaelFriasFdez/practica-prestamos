// errores.mjs · Errores de dominio.
// Los errores de dominio llevan la propiedad codigo; los de PostgreSQL, code
// (SQLSTATE). La capa HTTP decide qué estado corresponde a cada codigo.
export function fallo(codigo) {
  return Object.assign(new Error(codigo), { codigo });
}
