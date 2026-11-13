import { registerHooks } from 'node:module';
registerHooks({resolve(specifier, context, next) {
  if (specifier === 'server-only') return {url: 'data:text/javascript,export%20%7B%7D', shortCircuit: true};
  return next(specifier === 'next/headers' ? 'next/headers.js' : specifier, context);
}});
