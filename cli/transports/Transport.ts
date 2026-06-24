/**
 * Transport Types - Stub Implementation
 */

export interface Transport {
  send(data: any): Promise<any>;
  receive(): Promise<any>;
  close(): void;
}
