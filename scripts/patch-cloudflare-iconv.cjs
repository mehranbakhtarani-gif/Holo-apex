const fs = require('node:fs');
const path = require('node:path');

const root = path.join(process.cwd(), 'node_modules');
let patched = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name === 'iconv-lite') {
      const packageFile = path.join(full, 'package.json');
      if (fs.existsSync(packageFile)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
          if (pkg.browser && typeof pkg.browser === 'object') {
            delete pkg.browser['./lib/streams'];
            delete pkg.browser['./lib/extend-node'];
            if (Object.keys(pkg.browser).length === 0) delete pkg.browser;
            fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + '\n');
            patched += 1;
          }
        } catch (error) {
          process.stderr.write(`Could not patch ${packageFile}: ${String(error)}\n`);
          process.exitCode = 1;
        }
      }
    }
    if (entry.name.startsWith('.')) continue;
    walk(full);
  }
}

walk(root);
process.stdout.write(`Cloudflare iconv-lite compatibility patch applied to ${patched} package copy/copies.\n`);
