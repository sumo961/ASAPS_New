// Temporary type declarations for beat parameter fixes
declare module '@asaps/core' {
  export interface Beat {
    getParameters?(): Record<string, any>;
    updateParameters?(params: Record<string, any>): void;
  }
}
