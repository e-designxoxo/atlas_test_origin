/**
 * Compatibility alias for the canonical parser-core.js module.
 *
 * Node parsers historically required `_core.js`, while the browser loaded
 * `parser-core.js`. Keep this small alias during migration so there is only
 * one implementation to maintain.
 */

(function initAtlasParserCoreAlias(root) {
  "use strict";

  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = require("./parser-core.js");
    return;
  }

  if (!root.ATLAS_ParserCore) {
    throw new Error("[parser-core-alias] Load parser-core.js before _core.js.");
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
