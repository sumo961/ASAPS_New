import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRelayDeployScript, buildRelayKitFiles, relayKeysFor } from '../relayKit';

describe('the relay kit\'s deploy script', () => {
  it('asks for the keys this export needs, and no others', () => {
    expect(relayKeysFor({ aiProxyUrl: '/r', aiProvider: 'anthropic' })).toEqual(['ANTHROPIC_API_KEY']);
    expect(relayKeysFor({ aiProxyUrl: '/r', aiProvider: 'openai', ttsRelayUrl: '/r', ttsProvider: 'openai' })).toEqual(['OPENAI_API_KEY']);
    expect(relayKeysFor({ aiProxyUrl: '/r', aiProvider: 'anthropic', ttsRelayUrl: '/r', ttsProvider: 'elevenlabs' })).toEqual(['ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY']);
    // Voices through the relay in a story without AI beats.
    expect(relayKeysFor({ ttsRelayUrl: '/r', ttsProvider: 'elevenlabs', aiProvider: 'openai' })).toEqual(['ELEVENLABS_API_KEY']);
    const script = buildRelayDeployScript(['ELEVENLABS_API_KEY']);
    expect(script).toContain('KEYS="ELEVENLABS_API_KEY"');
    expect(script).not.toContain('OPENAI_API_KEY');
  });

  it('is in the kit, marked to run', () => {
    const file = buildRelayKitFiles(['OPENAI_API_KEY']).find((f) => f.path === 'deploy.sh')!;
    expect(file.mode).toBe(0o755);
    expect(file.content.startsWith('#!/usr/bin/env bash\n')).toBe(true);
  });

  it('never puts a key on a command line, and cleans up the file it hands over', () => {
    const script = buildRelayDeployScript();
    // Keys go through env:import from a private file; env:set only marks them secret, without a value.
    expect(script).toMatch(/env:import "\$ENVFILE"/);
    expect(script).not.toMatch(/env:set "\$KEY" "?\$VALUE/);
    expect(script).toContain('chmod 600 "$ENVFILE"');
    expect(script).toContain(`trap 'rm -f "$ENVFILE"' EXIT`);
    expect(script).toContain('read -rs VALUE');
    // The CLI's status ends without an error when logged out, so the answer is read.
    expect(script).toContain('status --json');
  });

  it('is valid bash, and stops with a plain message outside an export folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'asaps-relay-'));
    try {
      const path = join(dir, 'deploy.sh');
      writeFileSync(path, buildRelayDeployScript(['OPENAI_API_KEY']));
      execFileSync('bash', ['-n', path]);
      let out = '';
      try { execFileSync('bash', [path], { encoding: 'utf8', stdio: 'pipe' }); } catch (e: any) { out = String(e.stdout) + String(e.stderr); }
      expect(out).toMatch(/index\.html is not in this folder|Node\.js is needed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs the four steps in order, with a stand-in for the Netlify CLI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'asaps-relay-'));
    try {
      mkdirSync(join(dir, 'site/netlify/functions'), { recursive: true });
      mkdirSync(join(dir, 'bin'));
      writeFileSync(join(dir, 'site/index.html'), '<html></html>');
      writeFileSync(join(dir, 'site/netlify/functions/asaps-ai.mjs'), '');
      writeFileSync(join(dir, 'site/deploy.sh'), buildRelayDeployScript(['OPENAI_API_KEY', 'ELEVENLABS_API_KEY']));
      // "npx": notes what it was asked, and what the handed-over file looked like.
      const log = join(dir, 'calls.log');
      writeFileSync(join(dir, 'bin/npx'), `#!/usr/bin/env bash
shift 2  # --yes netlify-cli
echo "$*" | sed -E 's#/[^ ]*tmp[^ ]*#<file>#' >> "${log}"
case "$1" in
  status) echo '{ "loggedIn": false }' ;;
  env:import) echo "file: $(stat -f %Lp "$2" 2>/dev/null || stat -c %a "$2") $(grep -c . "$2") lines, has-openai=$(grep -c '^OPENAI_API_KEY=sk-test-123$' "$2")" >> "${log}"; echo "$2" > "${join(dir, 'envfile.path')}" ;;
esac
`, { mode: 0o755 });
      // The OpenAI key typed with stray spaces; the ElevenLabs one left empty.
      const out = execFileSync('bash', [join(dir, 'site/deploy.sh')], { encoding: 'utf8', input: '  sk-test-123 \n\n', env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` } });
      const calls = readFileSync(log, 'utf8').trim().split('\n');
      expect(calls).toEqual([
        'status --json',
        'login',
        'sites:create',
        'env:import <file>',
        'file: 600 1 lines, has-openai=1',
        'env:set OPENAI_API_KEY --secret --force',
        'deploy --prod',
      ]);
      // The key is in no command line and not in what the script prints.
      expect(calls.join(' ')).not.toContain('sk-test-123');
      expect(out).not.toContain('sk-test-123');
      expect(out).toContain('Set OPENAI_API_KEY.');
      // And the file it was handed over in is gone.
      expect(existsSync(readFileSync(join(dir, 'envfile.path'), 'utf8').trim())).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

