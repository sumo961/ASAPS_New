/**
 * PerforceAdapter - Perforce (P4) integration for file locking/checkout
 *
 * Provides checkout, lock status, and opened files info via Electron IPC.
 */

export interface P4FileInfo {
  /** Depot path */
  depotFile: string;
  /** Local file path */
  clientFile: string;
  /** Action: 'edit', 'add', 'delete', 'move/add', etc. */
  action: string;
  /** Change number */
  change: string;
  /** User who has the file checked out */
  user?: string;
}

export interface P4Status {
  /** Files currently opened for edit in this workspace */
  openedFiles: P4FileInfo[];
  /** Current workspace/client name */
  clientName: string;
  /** Whether Perforce is connected */
  connected: boolean;
}

/**
 * Get Perforce status for the project directory
 */
export async function getP4Status(projectPath: string): Promise<P4Status> {
  const api = window.electronAPI;
  if (!api?.fs?.runCommand) {
    throw new Error('P4 status requires Electron runCommand API');
  }

  // Get client info
  const infoResult = await api.fs.runCommand('p4', ['info'], projectPath);
  if (infoResult.exitCode !== 0) {
    return { openedFiles: [], clientName: '', connected: false };
  }

  const clientMatch = infoResult.stdout.match(/Client name:\s*(.+)/);
  const clientName = clientMatch ? clientMatch[1].trim() : '';

  // Get opened files
  const openedResult = await api.fs.runCommand('p4', ['opened', '...'], projectPath);
  const openedFiles: P4FileInfo[] = [];

  if (openedResult.exitCode === 0 && openedResult.stdout.trim()) {
    // Parse p4 opened output: //depot/path#rev - action change N (type)
    const lines = openedResult.stdout.trim().split('\n');
    for (const line of lines) {
      const match = line.match(/^(.+?)#\d+\s+-\s+(\w+)\s+(?:default\s+)?change\s+(\w+)/);
      if (match) {
        openedFiles.push({
          depotFile: match[1],
          clientFile: '', // Would need p4 where to map
          action: match[2],
          change: match[3],
        });
      }
    }
  }

  return {
    openedFiles,
    clientName,
    connected: true,
  };
}

/**
 * Check out a file for editing (p4 edit)
 */
export async function p4Edit(filePath: string, projectPath: string): Promise<boolean> {
  const api = window.electronAPI;
  if (!api?.fs?.runCommand) return false;

  const result = await api.fs.runCommand('p4', ['edit', filePath], projectPath);
  return result.exitCode === 0;
}

/**
 * Revert a file (p4 revert)
 */
export async function p4Revert(filePath: string, projectPath: string): Promise<boolean> {
  const api = window.electronAPI;
  if (!api?.fs?.runCommand) return false;

  const result = await api.fs.runCommand('p4', ['revert', filePath], projectPath);
  return result.exitCode === 0;
}

/**
 * Get lock status for files (who has them locked)
 */
export async function getP4Locks(
  projectPath: string
): Promise<Map<string, string>> {
  const api = window.electronAPI;
  if (!api?.fs?.runCommand) return new Map();

  const result = await api.fs.runCommand('p4', ['locks', '...'], projectPath);
  const locks = new Map<string, string>();

  if (result.exitCode === 0 && result.stdout.trim()) {
    const lines = result.stdout.trim().split('\n');
    for (const line of lines) {
      // Parse: //depot/path - username@workspace
      const match = line.match(/^(.+?)\s+-\s+(\S+)/);
      if (match) {
        locks.set(match[1], match[2]);
      }
    }
  }

  return locks;
}

// ============================================================================
// Perforce Operations
// ============================================================================

/** Result of a Perforce operation */
export interface P4OperationResult {
  success: boolean;
  message: string;
}

/** A parsed Perforce file history entry */
export interface P4HistoryEntry {
  revision: number;
  change: number;
  action: string;
  date: string;
  user: string;
  description: string;
}

function getRunCommand() {
  const api = window.electronAPI;
  if (!api?.fs?.runCommand) {
    throw new Error('Perforce operations require Electron runCommand API');
  }
  return api.fs.runCommand;
}

/** Submit a changelist */
export async function p4Submit(projectPath: string, description: string, filePaths?: string[]): Promise<P4OperationResult> {
  const run = getRunCommand();
  // If specific files, reopen them into a new changelist and submit that
  if (filePaths && filePaths.length > 0) {
    // Create a pending changelist with the description, then submit
    const submitResult = await run('p4', ['submit', '-d', description, ...filePaths], projectPath);
    return {
      success: submitResult.exitCode === 0,
      message: submitResult.exitCode === 0 ? submitResult.stdout.trim() : submitResult.stderr.trim(),
    };
  }
  const result = await run('p4', ['submit', '-d', description], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

/** Sync workspace to latest */
export async function p4Sync(projectPath: string): Promise<P4OperationResult> {
  const run = getRunCommand();
  const result = await run('p4', ['sync'], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

/** Shelve current changes */
export async function p4Shelve(projectPath: string, filePaths?: string[]): Promise<P4OperationResult> {
  const run = getRunCommand();
  const args = filePaths ? ['shelve', ...filePaths] : ['shelve'];
  const result = await run('p4', args, projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

/** Unshelve a changelist */
export async function p4Unshelve(projectPath: string, changelist: string): Promise<P4OperationResult> {
  const run = getRunCommand();
  const result = await run('p4', ['unshelve', '-s', changelist], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

/** Get file history */
export async function p4History(projectPath: string, filePath: string, limit = 20): Promise<P4HistoryEntry[]> {
  const run = getRunCommand();
  const result = await run('p4', ['filelog', `-m${limit}`, filePath], projectPath);
  if (result.exitCode !== 0 || !result.stdout.trim()) return [];

  const entries: P4HistoryEntry[] = [];
  const lines = result.stdout.trim().split('\n');

  for (const line of lines) {
    // Parse: ... #rev change N action on date by user@client (type) 'desc'
    const match = line.match(
      /^\.\.\.\s+#(\d+)\s+change\s+(\d+)\s+(\w+)\s+on\s+(\S+\s+\S+)\s+by\s+(\S+).*?'(.*)'/
    );
    if (match) {
      entries.push({
        revision: parseInt(match[1], 10),
        change: parseInt(match[2], 10),
        action: match[3],
        date: match[4],
        user: match[5],
        description: match[6],
      });
    }
  }

  return entries;
}

/** Get diff for a file */
export async function p4Diff(projectPath: string, filePath: string): Promise<string> {
  const run = getRunCommand();
  const result = await run('p4', ['diff', filePath], projectPath);
  return result.stdout;
}

/** Lock a file */
export async function p4Lock(projectPath: string, filePath: string): Promise<P4OperationResult> {
  const run = getRunCommand();
  const result = await run('p4', ['lock', filePath], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

/** Unlock a file */
export async function p4Unlock(projectPath: string, filePath: string): Promise<P4OperationResult> {
  const run = getRunCommand();
  const result = await run('p4', ['unlock', filePath], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}
