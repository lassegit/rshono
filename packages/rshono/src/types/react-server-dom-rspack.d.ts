declare const __rspack_rsc_manifest__: {
  serverManifest: Record<string, { id: string; name: string; chunks: string[]; async?: boolean }>;
  clientManifest: Record<string, { id: string; name: string; chunks: string[]; async?: boolean }>;
  entryCssFiles: Record<string, string[]>;
  entryJsFiles: string[];
};

declare module 'react-server-dom-rspack/server.node' {
  import type { ReactFormState } from 'react-dom/client';

  export type TemporaryReferenceSet = WeakMap<any, string>;
  export type ServerManifest = Record<string, { id: string; name: string; chunks: string[]; async?: boolean }>;

  export type ServerEntry<T> = T & {
    resource?: string;
    entryJsFiles?: string[];
    entryCssFiles?: string[];
  };

  export function renderToReadableStream(
    model: unknown,
    options?: {
      temporaryReferences?: TemporaryReferenceSet;
      environmentName?: string | (() => string);
      filterStackFrame?: (url: string, functionName: string, lineNumber: number, columnNumber: number) => boolean;
      onError?: (error: unknown) => void;
      identifierPrefix?: string;
      signal?: AbortSignal;
    },
  ): ReadableStream<Uint8Array>;

  export function createTemporaryReferenceSet(): TemporaryReferenceSet;

  export function decodeReply<T = unknown[]>(body: string | FormData, options?: { temporaryReferences?: TemporaryReferenceSet }): Promise<T>;

  export function loadServerAction(actionId: string): (...args: unknown[]) => Promise<unknown>;

  export function decodeAction(body: FormData, serverManifest: ServerManifest): Promise<() => Promise<unknown>> | null;

  export function decodeFormState(actionResult: unknown, body: FormData, serverManifest: ServerManifest): Promise<ReactFormState | null>;
}

declare module 'react-server-dom-rspack/client' {
  export function createFromReadableStream<T>(stream: ReadableStream<Uint8Array>, options?: { nonce?: string }): Promise<T>;
}

declare module 'react-server-dom-rspack/client.browser' {
  export type TemporaryReferenceSet = Map<string, unknown>;

  export function createFromReadableStream<T>(
    stream: ReadableStream<Uint8Array>,
    options?: { temporaryReferences?: TemporaryReferenceSet },
  ): Promise<T>;

  export function createFromFetch<T>(promiseForResponse: Promise<Response>, options?: { temporaryReferences?: TemporaryReferenceSet }): Promise<T>;

  export function createTemporaryReferenceSet(): TemporaryReferenceSet;

  export function encodeReply(
    value: unknown,
    options?: { temporaryReferences?: TemporaryReferenceSet; signal?: AbortSignal },
  ): Promise<string | FormData>;

  export function setServerCallback(callback: (id: string, args: unknown[]) => Promise<unknown>): void;

  export function setFindSourceMapURLCallback(callback: (fileName: string, environmentName: string) => string | null): void;
}
