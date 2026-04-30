import { statSync } from 'node:fs';
import { extname, resolve as pathResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function resolve(specifier, context, nextResolve) {
  // If it has an extension already, pass through
  if (extname(specifier)) {
    return nextResolve(specifier, context);
  }

  // Try appending .js for relative/absolute paths
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const parentDir = context.parentURL
      ? fileURLToPath(new URL('.', context.parentURL))
      : process.cwd();
    const candidate = pathResolve(parentDir, specifier + '.js');
    try {
      statSync(candidate);
      return nextResolve(pathToFileURL(candidate).href, context);
    } catch {
      // fall through
    }
  }

  return nextResolve(specifier, context);
}
