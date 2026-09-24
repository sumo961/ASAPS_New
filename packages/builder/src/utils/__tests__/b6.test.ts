import { describe, it, expect } from 'vitest';
import { parseGitHubRemote, isValidGitHubUsername, buildShareMessage } from '../githubShare';
import { availablePublishTargets, PUBLISH_TARGETS } from '../../export/publishTargets';
import { recommendWebExportMode } from '../../export/webExportMode';

describe('parseGitHubRemote', () => {
  it('parses https, ssh and ssh:// remotes', () => {
    expect(parseGitHubRemote('https://github.com/sumo961/ASAPS_New.git')).toEqual({ owner: 'sumo961', repo: 'ASAPS_New' });
    expect(parseGitHubRemote('https://github.com/a/b')).toEqual({ owner: 'a', repo: 'b' });
    expect(parseGitHubRemote('https://x-access-token:abc@github.com/a/b.git\n')).toEqual({ owner: 'a', repo: 'b' });
    expect(parseGitHubRemote('git@github.com:hk/story-one.git')).toEqual({ owner: 'hk', repo: 'story-one' });
    expect(parseGitHubRemote('ssh://git@github.com/hk/story.two.git')).toEqual({ owner: 'hk', repo: 'story.two' });
  });
  it('rejects non-GitHub remotes and junk', () => {
    expect(parseGitHubRemote('https://gitlab.com/a/b.git')).toBeNull();
    expect(parseGitHubRemote('')).toBeNull();
    expect(parseGitHubRemote(null)).toBeNull();
  });
});

describe('isValidGitHubUsername', () => {
  it('follows GitHub rules', () => {
    expect(isValidGitHubUsername('octo-cat')).toBe(true);
    expect(isValidGitHubUsername('-bad')).toBe(false);
    expect(isValidGitHubUsername('bad-')).toBe(false);
    expect(isValidGitHubUsername('a--b')).toBe(false);
    expect(isValidGitHubUsername('x'.repeat(40))).toBe(false);
  });
});

describe('buildShareMessage', () => {
  const repo = { owner: 'hk', repo: 'head-to-head' };
  it('invited: accept step first, then the Open-from-GitHub step with the clone URL', () => {
    const m = buildShareMessage({ repo, storyTitle: 'Head to Head', invited: true });
    expect(m).toContain('"Head to Head"');
    expect(m).toMatch(/1\. Accept the GitHub invitation/);
    expect(m).toContain('https://github.com/hk/head-to-head/invitations');
    expect(m).toMatch(/2\. In ASAPS Builder choose File → Open Project from GitHub…/);
    expect(m).toContain('https://github.com/hk/head-to-head.git');
  });
  it('not invited (public repo): no accept step', () => {
    const m = buildShareMessage({ repo, storyTitle: 'X', invited: false });
    expect(m).not.toContain('invitation');
    expect(m).toMatch(/^1\. In ASAPS Builder/m);
  });
});

describe('publish targets', () => {
  it('only available targets reach the menu; the app target is defined but hidden', () => {
    expect(availablePublishTargets().map((t) => t.id)).toEqual(['web']);
    expect(PUBLISH_TARGETS.find((t) => t.id === 'app')?.available).toBe(false);
  });
});

describe('recommendWebExportMode', () => {
  it('small stories → one file; large → folder; unknown → folder', () => {
    expect(recommendWebExportMode(3 * 1024 * 1024).mode).toBe('single-file');
    expect(recommendWebExportMode(0).reason).toMatch(/under 1 MB/);
    expect(recommendWebExportMode(40 * 1024 * 1024).mode).toBe('folder');
    expect(recommendWebExportMode(undefined).mode).toBe('folder');
  });
});
