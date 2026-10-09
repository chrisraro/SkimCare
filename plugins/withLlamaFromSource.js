/**
 * Builds llama.rn's native library from source instead of using its prebuilt
 * .so, so our patch in patches/llama.rn+*.patch is actually compiled in.
 * The patch removes native logs that wrote prompt tokens / token text to
 * logcat (PRD §14: no contract text in logs).
 */
const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'rnllamaBuildFromSource';

module.exports = function withLlamaFromSource(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === KEY));
    cfg.modResults.push({ type: 'property', key: KEY, value: 'true' });
    return cfg;
  });
};
