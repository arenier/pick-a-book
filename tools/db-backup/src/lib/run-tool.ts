import { execFile } from 'node:child_process';

/**
 * A command-line tool that exited in error. Carries the tool's stderr and nothing else: Node's
 * own error would repeat the command line, and ours carries the database URL.
 */
export class ToolFailed extends Error {
  constructor(
    readonly tool: string,
    readonly stderr: string,
  ) {
    super(`${tool} exited in error`);
    this.name = 'ToolFailed';
  }
}

/** Runs `tool` with `args` — no shell, so no quoting to get wrong — and resolves its stdout. */
export async function runTool(tool: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      tool,
      args,
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout);
        } else {
          reject(new ToolFailed(tool, stderr.trim()));
        }
      },
    );
  });
}
