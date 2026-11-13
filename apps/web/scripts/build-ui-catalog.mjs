import { readFileSync, writeFileSync, renameSync } from 'node:fs';
const root = new URL('../src/lib/i18n/', import.meta.url);
const messages = { ...JSON.parse(readFileSync(new URL('messages.json', root), 'utf8')), ...JSON.parse(readFileSync(new URL('overrides.json', root), 'utf8')) };
for (const [key, value] of Object.entries(messages)) {
  if (!key || !['zh-CN','en'].every(locale => typeof value[locale] === 'string' && value[locale].trim())) throw new Error(`Invalid translation: ${key}`);
}
const source = '// Generated from messages.json and reviewed overrides.json. Runtime is offline.\nexport const messages: Record<string, { "zh-CN": string; en: string }> = ' + JSON.stringify(messages, null, 2) + ';\n';
writeFileSync(new URL('catalog.ts.tmp', root), source);
renameSync(new URL('catalog.ts.tmp', root), new URL('catalog.ts', root));
console.log(`Compiled ${Object.keys(messages).length} UI messages.`);
