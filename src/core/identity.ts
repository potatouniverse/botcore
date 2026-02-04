// Identity module - Load/save SOUL.md, IDENTITY.md, USER.md
export interface IdentityData {
  name?: string;
  emoji?: string;
  avatar?: string;
  soul?: {
    vibe?: string;
    boundaries?: string[];
  };
  user?: {
    name?: string;
    timezone?: string;
  };
}

export class Identity {
  static load(path: string): IdentityData {
    // TODO: Load from identity/ folder
    throw new Error('Not implemented');
  }

  static save(path: string, data: IdentityData): void {
    // TODO: Save to identity/ folder
    throw new Error('Not implemented');
  }
}
