import { describe, it, expect } from 'vitest';
import { explainGitRefusal } from '../BranchesTab';

describe('explainGitRefusal', () => {
  it('names the uncommitted files that block a switch', () => {
    const git = 'error: Your local changes to the following files would be overwritten by checkout:\n\tclusters/_unclustered/dialogTree_beat_36.json\nPlease commit your changes or stash them before you switch branches.\nAborting';
    const text = explainGitRefusal("Couldn't switch to main", git);
    expect(text).toContain('(clusters/_unclustered/dialogTree_beat_36.json)');
    expect(text).toContain('Commit them in Pending Changes first');
  });

  it('points an unfinished merge at Keep both', () => {
    expect(explainGitRefusal("Couldn't switch to main", 'error: you need to resolve your current index first\nproject.json: needs merge'))
      .toContain('Keep both');
  });

  it('passes anything else through', () => {
    expect(explainGitRefusal("Couldn't switch to x", "fatal: invalid reference: x")).toBe("Couldn't switch to x: fatal: invalid reference: x");
    expect(explainGitRefusal('Merge', '')).toBe('Merge: Git refused without saying why.');
  });
});
