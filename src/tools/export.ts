// Export tool - Package a bot into a portable archive
export interface ExportOptions {
  output: string;
  includeSessions?: boolean;
  includeSecrets?: boolean;
}

export async function exportBot(sourcePath: string, options: ExportOptions): Promise<void> {
  // TODO: Create tar.gz with bot package
  throw new Error('Not implemented');
}
