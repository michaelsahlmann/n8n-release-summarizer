import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'output');

export function sortVersionsDesc(versions) {
  return [...versions].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

export async function listLocalReleaseVersions() {
  try {
    const files = await readdir(OUTPUT_DIR);
    const versions = files
      .filter((fileName) => fileName.endsWith('.md'))
      .map((fileName) => fileName.replace(/\.md$/, ''));

    return sortVersionsDesc(versions);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }

    throw err;
  }
}
