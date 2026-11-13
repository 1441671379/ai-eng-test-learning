declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): {
      all(...params: (string | number | null | Uint8Array)[]): Record<string, unknown>[];
      get(...params: (string | number | null | Uint8Array)[]): Record<string, unknown> | undefined;
      run(...params: (string | number | null | Uint8Array)[]): unknown;
    };
    close(): void;
  }
}
