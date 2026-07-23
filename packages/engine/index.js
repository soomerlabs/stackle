// @sworbl/engine — aggregate entry. Each module is dual IIFE/CommonJS and can
// also be required individually: require('@sworbl/engine/sworbl-core.js').
module.exports = {
  core: require('./sworbl-core.js'),
  seed: require('./sworbl-seed.js'),
  solver: require('./sworbl-solver.js'),
  daily: require('./sworbl-daily.js'),
  status: require('./sworbl-status.js'),
  flow: require('./sworbl-flow.js'),
  run: require('./sworbl-run.js'),
  store: require('./sworbl-store.js'),
  net: require('./sworbl-net.js'),
  words: require('./words.js'),
};
