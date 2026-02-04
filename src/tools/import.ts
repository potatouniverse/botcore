// Import tool - Extract and install a bot package
export interface ImportOptions {
  dest: string;
  platform?: string;
}

export async function importBot(archivePath: string, options: ImportOptions): Promise<void> {
  // TODO: Extract tar.gz and rewrite paths
  throw new Error('Not implemented');
}
