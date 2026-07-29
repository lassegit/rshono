interface ImportMeta {
  webpackHot?: {
    check(autoApply?: boolean): Promise<unknown>;
    status(): string;
  };
}

declare const __webpack_hash__: string;

declare var __webpack_nonce__: string | undefined;
