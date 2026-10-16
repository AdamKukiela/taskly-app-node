import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { command } from './process.ts';
import { safePath } from './policy.ts';
import { AgentError } from './contracts.ts';

export function revision(repo: string, ref: string): string {
  if (!/^[a-zA-Z0-9_./-]+$/.test(ref) || ref.startsWith('-')) throw new AgentError('CONFIG_ERROR', 'Invalid revision');
  return command('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: repo }).trim();
}
export function changedPaths(repo: string, base: string, head: string): string[] {
  return command('git', ['diff', '--name-only', '-z', base, head, '--'], { cwd: repo }).split('\0').filter(Boolean);
}
export function readTree(repo: string, head: string): Map<string, string> {
  const tree = new Map<string, string>();
  const entries = command('git', ['ls-tree', '-rz', head, '--', 'backend', 'frontend'], { cwd: repo }).split('\0').filter(Boolean);
  for (const entry of entries) {
    const separator = entry.indexOf('\t');
    const [mode, kind, blob] = entry.slice(0, separator).split(' ');
    const path = entry.slice(separator + 1);
    if (kind !== 'blob' || !['100644', '100755'].includes(mode) || !safePath(path)) {
      throw new AgentError('NEEDS_REVIEW', `Unsupported repository entry: ${path}`);
    }
    if (path.includes('/node_modules/') || path.includes('/.git/') || /(^|\/)\.env($|\.)/.test(path) && !path.endsWith('.example')) {
      throw new AgentError('NEEDS_REVIEW', `Unexpected dependency or environment file: ${path}`);
    }
    tree.set(path, command('git', ['cat-file', 'blob', blob], { cwd: repo }));
  }
  return tree;
}
export async function writeTree(tree: Map<string, string>, destination: string): Promise<void> {
  for (const [path, content] of tree) {
    await mkdir(dirname(join(destination, path)), { recursive: true });
    await writeFile(join(destination, path), content);
  }
}
export function diff(repo: string, base: string, head: string): string {
  return command('git', ['diff', '--no-ext-diff', '--no-textconv', '--unified=4', base, head, '--', 'backend/src', 'backend/tests', 'frontend/src'], { cwd: repo });
}
export function collectContext(tree: Map<string, string>, targets: string[]): Record<string, string> {
  const context: Record<string, string> = {};
  const pending = [...targets];
  for (const source of targets) {
    if (source.startsWith('backend/')) pending.push(`backend/tests/${posix.basename(source, '.ts')}.test.ts`);
    else pending.push(source.replace(/\.tsx?$/, '.test.ts'), source.replace(/\.tsx?$/, '.test.tsx'));
    const side = source.split('/')[0];
    pending.push(`${side}/package.json`, `${side}/tsconfig.json`);
  }
  while (pending.length) {
    const path = pending.shift()!;
    if (Object.hasOwn(context, path) || !tree.has(path) || path.includes('/generated/')) continue;
    const content = tree.get(path)!;
    context[path] = content;
    for (const match of content.matchAll(/(?:from\s*|import\s*\(|vi\.mock\s*\()\s*['"](\.[^'"]+)['"]/g)) {
      const stem = posix.normalize(posix.join(posix.dirname(path), match[1]));
      const candidates = [stem, stem.replace(/\.js$/, '.ts'), `${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`, `${stem}/index.tsx`];
      const resolved = candidates.find(candidate => tree.has(candidate));
      if (resolved) pending.push(resolved);
    }
  }
  return context;
}
