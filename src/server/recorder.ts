import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';

/**
 * Appends every raw GSI frame to a JSONL file so a match can later be replayed as a fixture.
 * Enabled by setting GSI_RECORD_DIR. One record per line: {"t": "<iso capture time>", "payload": {...}}.
 * Heartbeat frames (no `previously`) and menu frames are recorded too; the detector tests rely on them.
 */
export class FrameRecorder {
  private stream: WriteStream | null = null;
  private readonly path: string;
  private count = 0;

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.path = join(directory, `gsi-${stamp}.jsonl`);
  }

  record(payload: unknown): void {
    if (!this.stream) {
      this.stream = createWriteStream(this.path, { flags: 'a' });
      console.log(`Recording GSI frames to ${this.path}`);
    }
    this.stream.write(JSON.stringify({ t: new Date().toISOString(), payload }) + '\n');
    this.count += 1;
  }

  close(): void {
    if (this.stream) {
      this.stream.end();
      console.log(`Recorded ${this.count} GSI frames to ${this.path}`);
      this.stream = null;
    }
  }
}

export function createRecorderFromEnv(): FrameRecorder | null {
  const directory = process.env.GSI_RECORD_DIR;
  return directory ? new FrameRecorder(directory) : null;
}
