// Lets node run client modules the way Vite does: '@shared/x' -> ../shared/x.js and
// extensionless relative imports -> .js / .jsx-free. Used by the headless scripts only.
import { register } from 'node:module'

register(
  'data:text/javascript,' +
    encodeURIComponent(`
const SHARED = ${JSON.stringify(new URL('../../shared/', import.meta.url).href)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@shared/')) specifier = SHARED + specifier.slice(8);
  try {
    return await next(specifier, context);
  } catch (err) {
    if ((specifier.startsWith('.') || specifier.startsWith('file:')) && !/\.[cm]?js$/.test(specifier)) {
      return next(specifier + '.js', context);
    }
    throw err;
  }
}`),
)
