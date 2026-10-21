/**
 * The `promise` polyfill ships no TypeScript declarations. Only the
 * rejection-tracking entry is used (crash-guard's unhandled-rejection
 * telemetry), so only that surface is declared here.
 */
declare module 'promise/setimmediate/rejection-tracking' {
  export function enable(opts: {
    allRejections: boolean;
    onUnhandled: (id: number, error: unknown) => void;
    onHandled: (id: number) => void;
  }): void;
  export function disable(): void;
}
