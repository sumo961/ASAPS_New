/**
 * VCS Integration - Version control system awareness for directory projects
 */

export { detectVCS, type VCSType, type VCSInfo } from './VCSDetector';
export { getGitStatus, getChangedFiles, getChangedFilesBetween, type GitStatus, type GitFileStatus } from './GitAdapter';
export { getP4Status, p4Edit, p4Revert, getP4Locks, type P4Status, type P4FileInfo } from './PerforceAdapter';
export { VCSStatusProvider, useVCSStatus, useRequiredVCSStatus, type VCSState, type VCSContextValue } from './VCSStatusProvider';
