/**
 * @quilt/nomad — core types
 *
 * The bridge between Quilt cells and Nomad jobs. A Quilt sheet is
 * compiled into one or more Nomad job specifications; cell changes
 * are translated into Nomad API calls.
 */

/** Configuration for the Nomad client. */
export interface NomadConfig {
  /** Nomad agent address (e.g. "http://nomad.service.consul:4646"). */
  address: string;
  /** ACL token (if Nomad is ACL-enabled). */
  token?: string;
  /** Default region for multi-region deployments. */
  region?: string;
  /** Default namespace (Nomad Enterprise feature). */
  namespace?: string;
  /** Request timeout in ms (default 30_000). */
  timeoutMs?: number;
}

/** A Nomad job specification (subset of the full schema). */
export interface NomadJobSpec {
  ID: string;
  Name: string;
  Type?: 'service' | 'batch' | 'system' | 'sysbatch';
  Priority?: number;
  Datacenters?: string[];
  TaskGroups: NomadTaskGroup[];
  Meta?: Record<string, string>;
  Variable?: NomadVariable[];
}

export interface NomadTaskGroup {
  Name: string;
  Count: number;
  Tasks: NomadTask[];
  Services?: NomadService[];
}

export interface NomadTask {
  Name: string;
  Driver: 'docker' | 'exec' | 'java' | 'qemu' | 'raw_exec' | 'rkt' | 'podman';
  Config: Record<string, unknown>;
  Env?: Record<string, string>;
  Resources?: NomadResources;
  Templates?: NomadTemplate[];
}

export interface NomadService {
  Name: string;
  PortLabel?: string;
  Tags?: string[];
  Checks?: NomadCheck[];
}

export interface NomadCheck {
  Name: string;
  Type: 'http' | 'tcp' | 'script' | 'grpc';
  Interval?: number;
  Timeout?: number;
  Path?: string;
  Port?: string;
  AddressMode?: 'host' | 'driver';
  Command?: string;
}

export interface NomadVariable {
  Name: string;
  Value?: string;
  Type?: 'string' | 'number' | 'bool' | 'hcl' | 'env';
}

export interface NomadResources {
  CPU?: number;
  MemoryMB?: number;
  DiskMB?: number;
}

export interface NomadTemplate {
  DestPath: string;
  EmbeddedTmpl: string;
  Perms?: string;
}

/** A Nomad evaluation (job queue result). */
export interface NomadEvaluation {
  ID: string;
  Priority: number;
  Type: 'service' | 'batch';
  JobID: string;
  Status: 'pending' | 'blocked' | 'complete' | 'failed' | 'canceled';
  TriggeredBy: string;
  CreateTime: number;
  ModifyTime: number;
}

/** A Nomad node. */
export interface NomadNode {
  ID: string;
  Datacenter: string;
  Name: string;
  Status: 'ready' | 'down' | 'unknown';
  SchedulingEligibility: 'eligible' | 'ineligible';
  Classes?: string[];
}

/** A compile result: the Nomad specs derived from a Quilt sheet. */
export interface CompiledNomadJobs {
  /** Job specs (one per top-level "job" cell). */
  jobs: NomadJobSpec[];
  /** Variables (one per top-level "value" cell that's referenced). */
  variables: NomadVariable[];
  /** Health checks (one per "api" cell). */
  checks: NomadCheck[];
  /** Watches (one per "listener" cell). */
  watches: Array<{ JobID: string; Type: 'service_register' | 'service_deregister'; Handler: string }>;
}

/** Result of applying a Quilt sheet to Nomad. */
export interface ApplyResult {
  jobID: string;
  evaluationID: string;
  previousReplicas?: number;
  newReplicas: number;
  durationMs: number;
}
