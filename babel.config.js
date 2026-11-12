module.exports = function (api) {
  // true → Babel reuses cached transforms between dev rebuilds (was `false`,
  // which made every bundle recompile all files from scratch).
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
