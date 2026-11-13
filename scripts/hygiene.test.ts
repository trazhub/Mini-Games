import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const SELF = 'scripts/hygiene.test.ts';

/** The one private LAN address the docs may print (non-routable). */
const ALLOWED_PRIVATE = new Set(['10.10.15.254']);

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

function readText(path: string): string | null {
  const buf = readFileSync(resolve(ROOT, path));
  if (buf.includes(0)) return null; // binary
  return buf.toString('utf8');
}

/** Tracked text files that the network-identifier scan covers. */
function scannedFiles(): { path: string; text: string }[] {
  const files: { path: string; text: string }[] = [];
  for (const path of trackedFiles()) {
    if (path === SELF || path === 'package-lock.json' || path.endsWith('/package-lock.json')) continue;
    if (!existsSync(resolve(ROOT, path))) continue; // deleted in the working tree
    const text = readText(path);
    if (text !== null) files.push({ path, text });
  }
  return files;
}

const TAILSCALE_CGNAT = /\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/;
// Four dotted decimal groups that are not part of a longer dotted/numeric run (so semver-ish strings with 5+ parts do not match).
const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d]|\.\d)/g;

/** Returns a reason when the address must not appear in a tracked file, otherwise null. */
function classify(ip: string): string | null {
  const o = ip.split('.').map(Number);
  if (o.some((n) => n > 255)) return null; // not an address
  const [a, b, c] = o as [number, number, number, number];
  if (TAILSCALE_CGNAT.test(ip)) return 'Tailscale CGNAT address';
  if (a === 10) return ALLOWED_PRIVATE.has(ip) ? null : 'private 10.x address other than the allowlisted VM address';
  if (a === 127 || a === 0 || ip === '255.255.255.255') return null;
  if (a === 172 && b >= 16 && b <= 31) return null;
  if (a === 192 && b === 168) return null;
  if (a === 169 && b === 254) return null;
  if (a === 192 && b === 0 && c === 2) return null; // documentation
  if (a === 198 && b === 51 && c === 100) return null; // documentation
  if (a === 203 && b === 0 && c === 113) return null; // documentation
  return 'routable public IPv4 address';
}

function findIdentifiers(): string[] {
  const hits: string[] = [];
  for (const { path, text } of scannedFiles()) {
    text.split(/\r?\n/).forEach((line, idx) => {
      for (const m of line.matchAll(IPV4)) {
        const reason = classify(m[0]);
        if (reason) hits.push(`${path}:${idx + 1}: ${reason}: ${m[0]}`);
      }
    });
  }
  return hits;
}

describe('repository hygiene', () => {
  it('has the required open-source files', () => {
    const required = [
      'LICENSE',
      'CONTRIBUTING.md',
      'CODE_OF_CONDUCT.md',
      'SECURITY.md',
      'CHANGELOG.md',
      '.github/ISSUE_TEMPLATE/bug_report.yml',
      '.github/ISSUE_TEMPLATE/feature_request.yml',
      '.github/ISSUE_TEMPLATE/new_game.yml',
      '.github/PULL_REQUEST_TEMPLATE.md',
      'docs/README.md',
      'docs/LEGAL.md',
    ];
    const missing = required.filter((p) => !existsSync(resolve(ROOT, p)));
    expect(missing).toEqual([]);
  });

  it('tracks no env files except examples', () => {
    const env = trackedFiles().filter((p) => /(^|\/)\.env(\.|$)/.test(p));
    expect(env.sort()).toEqual(['.env.example', 'apps/web/.env.example']);
  });

  it('has no site-specific network identifiers in tracked files', () => {
    const hits = findIdentifiers();
    expect(hits, `Remove or replace with a placeholder:\n${hits.join('\n')}`).toEqual([]);
  });

  it('detects what it is meant to detect', () => {
    expect(classify('100.64.0.1')).toMatch(/Tailscale/);
    expect(classify('100.127.255.254')).toMatch(/Tailscale/);
    expect(classify('100.128.0.1')).toMatch(/public/);
    expect(classify('8.8.8.8')).toMatch(/public/);
    expect(classify('10.0.0.5')).toMatch(/10\.x/);
    expect(classify('10.10.15.254')).toBeNull();
    for (const ok of ['127.0.0.1', '0.0.0.0', '255.255.255.255', '172.16.0.1', '192.168.1.1', '169.254.1.1', '203.0.113.9', '198.51.100.7', '192.0.2.1', '999.1.1.1']) {
      expect(classify(ok), ok).toBeNull();
    }
    // version-like strings with more than four groups are not addresses
    expect('1.2.3.4.5'.match(IPV4)).toBeNull();
  });

  it('declares license and repository in package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      license?: string;
      repository?: { url?: string } | string;
    };
    expect(pkg.license).toBe('MIT');
    const url = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? '');
    expect(url).toContain('trazhub/Mini-Games');
  });
});
