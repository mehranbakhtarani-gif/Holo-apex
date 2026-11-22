// Cloudflare Worker-only alias for Express's eager body-parser import.
 // The Worker has its own bounded JSON middleware in server.ts.
 // These exports deliberately fail if any route tries to use Express's parser.
function unsupportedParser() {
  throw new Error('Express body-parser middleware is disabled in the Cloudflare Worker runtime.');
}

module.exports = {
  json: unsupportedParser,
  raw: unsupportedParser,
  text: unsupportedParser,
  urlencoded: unsupportedParser,
};
