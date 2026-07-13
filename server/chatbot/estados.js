/** Estados de la máquina de conversación del chatbot WhatsApp */
export const ESTADOS = {
  MENU_PRINCIPAL: 'MENU_PRINCIPAL',
  MENU_ALUMNO: 'MENU_ALUMNO',
  ESPERANDO_DNI: 'ESPERANDO_DNI',
  ESPERANDO_CONSULTA: 'ESPERANDO_CONSULTA',
  ESPERANDO_LIBERAR: 'ESPERANDO_LIBERAR',
};

/** Acciones pendientes cuando el usuario ingresa el DNI */
export const ACCIONES_DNI = {
  VENCIMIENTO: 'VENCIMIENTO',
  CANCELAR: 'CANCELAR',
  RECUPERAR: 'RECUPERAR',
  HORARIOS: 'HORARIOS',
};
