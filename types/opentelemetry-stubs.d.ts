// Stubs for OpenTelemetry modules
declare module "@opentelemetry/api-logs" {
  export const logs: any;
  export function getLoggerProvider(): any;
}

declare module "@opentelemetry/sdk-logs" {
  export class LoggerProvider {
    addLogRecordProcessor(processor: any): void;
    getLogger(name: string, version?: string): any;
  }
  export class ConsoleLogRecordExporter {
    export(records: any[]): any;
    shutdown(): Promise<void>;
  }
}

declare module "@opentelemetry/sdk-metrics" {
  export class MeterProvider {
    addMetricReader(reader: any): void;
    getMeter(name: string, version?: string): any;
  }
  export class PeriodicExportingMetricReader {
    constructor(options: any);
  }
}

declare module "@opentelemetry/sdk-trace-base" {
  export class TracerProvider {
    addSpanProcessor(processor: any): void;
    getTracer(name: string, version?: string): any;
  }
  export class BatchSpanProcessor {
    constructor(exporter: any);
  }
}
