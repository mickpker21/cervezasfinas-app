export const canCreateCliente = (role) => ["admin", "conquista"].includes(role);
export const canEditTelefono = (role) => ["admin", "televenta", "asesor", "gerente"].includes(role);
export const canCreateVisita = (role) => ["admin", "asesor", "conquista", "gerente"].includes(role);