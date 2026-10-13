import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const configPath = fileURLToPath(new URL('../config.js', import.meta.url));
const key = process.env.KAKAO_JAVASCRIPT_KEY?.trim();
if (!key) throw new Error('KAKAO_JAVASCRIPT_KEY must be set.');

const config = await readFile(configPath, 'utf8');
const placeholder = '"__KAKAO_JAVASCRIPT_KEY__"';
const matches = config.match(/"__KAKAO_JAVASCRIPT_KEY__"/g) || [];
if (matches.length !== 1) throw new Error('config.js must contain exactly one quoted Kakao key placeholder.');

await writeFile(configPath, config.replace(placeholder, () => JSON.stringify(key)));
