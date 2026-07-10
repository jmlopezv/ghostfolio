// Simple pass-through resolver that uses Node's own require.resolve
module.exports = (request, options) => {
  return require.resolve(request, { paths: [options.basedir] });
};
