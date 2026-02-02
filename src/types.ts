export interface WebOSAPI {
  getObsidianApp(): unknown;
  loadWidgetState(id: string): Promise<unknown | null>;
  saveWidgetState(id: string, data: unknown): Promise<void>;
  resolveResourcePath(path: string): string;
}
