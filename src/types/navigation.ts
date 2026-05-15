import { TriageResult } from './triage';

export type RootStackParamList = {
  Home: undefined;
  Triage: undefined;
  Results: { result: TriageResult };
};
