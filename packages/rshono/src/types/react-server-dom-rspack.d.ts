/**
 * Ambient types for react-server-dom-rspack@0.0.2, which ships no types.
 * Written against the actual exports of the installed package (the
 * manifest parameter of the classic react-server-dom-webpack API is
 * gone — Rspack's RSC plugins inject a __rspack_rsc_manifest__ global
 * into the server bundle instead).
 */

/** Per-entry RSC manifest injected by Rspack's RscServerPlugin. */
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

  /**
   * A component exported from a 'use server-entry' module: Rspack
   * attaches the page's client assets as static properties.
   */
  export type ServerEntry<T> = T & {
    resource?: string;
    /** Bootstrap scripts of the matching client entry (+ page chunks). */
    entryJsFiles?: string[];
    /** All CSS files reachable from this page's component tree. */
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

  /** Decode the arguments of a client-initiated server action call. */
  export function decodeReply<T = unknown[]>(body: string | FormData, options?: { temporaryReferences?: TemporaryReferenceSet }): Promise<T>;

  /** Load a server action by its reference id (uses the injected manifest). */
  export function loadServerAction(actionId: string): (...args: unknown[]) => Promise<unknown>;

  /**
   * Decode a progressive-enhancement <form action> POST (no JS on the
   * client). Returns a thunk running the action with the form data.
   */
  export function decodeAction(body: FormData, serverManifest: ServerManifest): Promise<() => Promise<unknown>> | null;

  export function decodeFormState(actionResult: unknown, body: FormData, serverManifest: ServerManifest): Promise<ReactFormState | null>;
}

declare module 'react-server-dom-rspack/client' {
  /**
   * SSR-side flight deserializer. Resolved per platform by export
   * conditions; in the framework's SSR layer this is client.node.
   */
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

  /** Register the transport used when client code calls a server action. */
  export function setServerCallback(callback: (id: string, args: unknown[]) => Promise<unknown>): void;

  export function setFindSourceMapURLCallback(callback: (fileName: string, environmentName: string) => string | null): void;
}
