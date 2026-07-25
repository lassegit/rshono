interface ImportMeta {
  webpackHot?: {
    accept(dependencies?: string | string[], callback?: () => void): void;
    check(autoApply?: boolean): Promise<unknown>;
    apply(): Promise<unknown>;
    status(): string;
  };
}

declare const __webpack_hash__: string;

declare var __webpack_nonce__: string | undefined;

/** Framework config resolved from rshono.config.ts and inlined into the server bundle by DefinePlugin. */
declare const __RSHONO_CONFIG__: import('../server/server-config.js').ServerConfig;
