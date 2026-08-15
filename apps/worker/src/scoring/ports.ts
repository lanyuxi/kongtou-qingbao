import type {
  RecordProjectScoreInput,
  ScoringProjectInput,
  ScoringRepository,
} from '@airdrop/database';

export type { ScoringRepository };

export interface ScoringRunnerPorts {
  readonly repository: ScoringRepository;
  readonly maxProjects?: number;
  readonly now?: () => Date;
}

export type { RecordProjectScoreInput, ScoringProjectInput };
