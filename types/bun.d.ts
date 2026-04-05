// Type declarations for Bun global in Node.js environment
declare global {
  namespace Bun {
    function hash(input: string | Buffer): string;
    function gc(fullCollect?: boolean): void;
    function which(command: string): string | null;
    function spawn(command: string, args?: string[], options?: any): any;

    namespace file {
      function read(path: string): Buffer;
      function write(path: string, data: any): void;
      function exists(path: string): boolean;
    }

    function stringWidth(str: string): number;
    function wrapAnsi(str: string, width: number): string;

    namespace semver {
      function parse(version: string): { major: number; minor: number; patch: number } | null;
      function gte(version: string, target: string): boolean;
    }
  }

  const Bun: typeof Bun;
}

export {};
