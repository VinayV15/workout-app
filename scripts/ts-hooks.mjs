/**
 * Module resolve hook for the test scripts.
 *
 * The app's imports are extensionless (`./calc`) because that is what Vite and
 * TypeScript expect. Node's ESM resolver requires a real filename, so this maps
 * extensionless relative imports onto their .ts/.tsx source. It exists purely so
 * the tests can import app modules directly, with no build step and no
 * test-framework dependency.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    for (const ext of ['.ts', '.tsx']) {
      try {
        return await nextResolve(specifier + ext, context)
      } catch {
        // Try the next extension.
      }
    }
  }
  return nextResolve(specifier, context)
}
