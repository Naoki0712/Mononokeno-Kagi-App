declare module "cloudflare:workers" {
  /**
   * Cloudflare injects this binding at runtime. It is intentionally typed
   * loosely here so the GitHub Pages static build can type-check code that is
   * only executed in the Workers environment.
   */
  export const env: {
    DB?: any;
    [key: string]: unknown;
  };
}
