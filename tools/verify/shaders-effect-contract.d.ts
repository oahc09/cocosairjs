/** Optional Node tooling metadata. Not an exported CocosAirJS runtime API. */
export type UpdateMode = 'uniform' | 'resource' | 'pipeline' | 'structure';
export type Status = 'PASS' | 'FAIL' | 'NOT_RUN' | 'BLOCKED' | 'LIMITED';
export type Classification = 'ENGINE_BUG' | 'API_GAP' | 'API_DX' | 'DOC_GAP' | 'EXAMPLE_GAP'
  | 'AGENT_FAILURE' | 'REFERENCE_ERROR' | 'INFRA_FAILURE' | 'PERFORMANCE_GAP';
export type Gate = 'Build' | 'Runtime' | 'Visual' | 'Boundary' | 'Resource' | 'Performance';
export type JSONValue = null | boolean | string | number | JSONValue[] | { [key: string]: JSONValue };
export interface DescriptorBase<T> {
  defaultValue: T;
  enum?: readonly T[];
  unit?: string;
  updateMode: UpdateMode;
  description: string;
}
export type ParameterDescriptor =
  | (DescriptorBase<number> & { type: 'number' | 'integer'; min?: number; max?: number; step?: number })
  | (DescriptorBase<boolean> & { type: 'boolean' })
  | (DescriptorBase<string> & { type: 'string' })
  | (DescriptorBase<readonly number[]> & { type: 'number-array'; length: number; min?: number; max?: number; step?: number });
export interface EffectContract {
  schemaVersion: 'shaders-effect-contract/1';
  name: string;
  version: string;
  params: Record<string, ParameterDescriptor>;
}
export interface FileIdentity { path: string; sha256: string; bytes: number }
export interface InputIdentity {
  source: FileIdentity[];
  sdk: FileIdentity[];
  runner: FileIdentity[];
  reference?: { repo: string; commit: string; license: string; files: FileIdentity[] };
}
export interface Execution {
  command: string;
  cwd: string;
  startedAt: string;
  endedAt: string;
  exitCode: number;
  rawOutputs: FileIdentity[];
}
export interface FixedState {
  viewport: { width: number; height: number };
  dpr: number;
  seed: number;
  input: JSONValue;
  parameters: Record<string, JSONValue>;
  timeSeconds: number;
  simulationStep: number;
}
export interface EvidenceCase {
  caseId: string;
  status: Status;
  reason?: string;
  classification?: Classification;
  method?: 'NODE' | 'REAL_BROWSER';
  browser?: string;
  browserVersion?: string;
  execution?: Execution;
  fixed?: FixedState;
  observation?: Record<string, JSONValue>;
}
export interface EngineReport {
  schemaVersion: 'shaders-engine-evidence/1';
  effect: { name: string; version: string; contractSha256: string };
  identity: InputIdentity;
  status: Status;
  completed: boolean;
  subset: boolean;
  issues: { classification: Classification; reason: string }[];
  gates: Record<Gate, { status: Status; scope: { expectedCaseIds: string[] }; cases: EvidenceCase[] }>;
}
export interface OracleResult { errors: unknown[]; measurements: number }
export interface ValidationOptions {
  definition?: EffectContract;
  expectedIdentity?: InputIdentity;
  expectedScope?: Partial<Record<Gate, string[]>>;
  verifyFiles?: boolean;
  root?: string;
  /** Registered by a frozen collector; independently recompute raw data and pixels. */
  oracles?: Partial<Record<'build' | 'runtime' | 'visual' | 'boundary' | 'resource' | 'performance' | 'agentAccess' | 'agentResult', (value: unknown) => OracleResult>>;
}
export interface ValidationResult {
  ok: boolean;
  errors: { rule: string; path: string; message: string }[];
  scopePassed?: boolean;
  measured?: number;
  skipped?: number;
  failed?: number;
}
export const UPDATE_MODES: readonly UpdateMode[];
export const STATUSES: readonly Status[];
export const CLASSIFICATIONS: readonly Classification[];
export const GATES: readonly Gate[];
export const LIFECYCLE: readonly string[];
export const RESOURCE_KINDS: readonly string[];
export const PERFORMANCE_PROFILES: readonly string[];
export function validateDefinition(value: unknown): ValidationResult;
export function validateParameters(definition: unknown, input: unknown, options?: { defaults?: boolean }): ValidationResult & { values?: Record<string, JSONValue> };
export function structureKey(definition: unknown, input: unknown, identity: unknown): ValidationResult & { key?: string; structural?: Record<string, JSONValue> };
export function checkDocumentation(definition: unknown, descriptors: unknown): ValidationResult;
export function validateEngineReport(value: unknown, options?: ValidationOptions): ValidationResult;
export function validateAgentReport(value: unknown, options?: ValidationOptions): ValidationResult;
export function canonical(value: JSONValue): string;
export function sha256(value: string | Uint8Array): string;
export function main(argv?: string[]): number;
