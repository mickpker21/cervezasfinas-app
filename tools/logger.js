// Simple structured logger (se puede reemplazar por pino)
const levelOrder = { debug: 10, info: 20, warn: 30, error: 40 };
const current = process.env.LOG_LEVEL || 'info';
function should(level){
  return levelOrder[level] >= (levelOrder[current] || 20);
}
function fmt(level, msg, meta){
  return JSON.stringify({ t: new Date().toISOString(), level, msg, ...(meta||{}) });
}
export const logger = {
  debug: (m,meta)=> should('debug') && console.debug(fmt('debug',m,meta)),
  info: (m,meta)=> should('info') && console.info(fmt('info',m,meta)),
  warn: (m,meta)=> should('warn') && console.warn(fmt('warn',m,meta)),
  error: (m,meta)=> should('error') && console.error(fmt('error',m,meta)),
};
