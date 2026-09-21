import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load a local `.env` if present. Existing process env wins. Used so `npm run start:http`
 * can read gitignored M2M credentials without putting them in Cursor mcp.json.
 */
export const applyDotEnv = (directory: string = process.cwd()): void => {
  const file = resolve(directory, '.env');

  if (!existsSync(file)) {
    return;
  }

  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');

    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};
