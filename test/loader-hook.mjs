// Custom ESM loader: resolves extensionless imports to .js
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(pathToFileURL('./test/loader-resolve.mjs'));
