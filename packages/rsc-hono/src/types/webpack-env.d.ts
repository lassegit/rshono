/**
 * Ambient declarations for the Rspack/webpack runtime globals the
 * framework's client entry uses in development (HMR).
 */
interface ImportMeta {
    webpackHot?: {
        accept(dependencies?: string | string[], callback?: () => void): void;
        check(autoApply?: boolean): Promise<unknown>;
        apply(): Promise<unknown>;
        status(): string;
    };
}

/** Compilation hash of the running client bundle; updated by HMR applies. */
declare const __webpack_hash__: string;
