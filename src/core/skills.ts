// Skills module - Load and manage bot skills
export interface Skill {
  name: string;
  description: string;
  metadata?: any;
}

export class Skills {
  static load(path: string): Map<string, Skill> {
    // TODO: Load from skills/ folder
    throw new Error('Not implemented');
  }

  get(name: string): Skill | undefined {
    // TODO: Retrieve skill by name
    throw new Error('Not implemented');
  }
}
