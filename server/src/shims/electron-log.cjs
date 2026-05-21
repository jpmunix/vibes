// CJS stub for electron-log
const mk = () => {
  const l = {
    scope: () => l,
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
    log: console.log,
    verbose() {},
    silly() {},
    transports: { file: { level: false }, console: { level: false } },
  };
  return l;
};
module.exports = mk();
