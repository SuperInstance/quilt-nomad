/**
 * NomadEngine — the main entry point for quilt-nomad.
 *
 * Wraps the NomadClient and CellAdapter. Given a Quilt sheet, applies
 * it to a Nomad cluster: compiles the sheet, registers jobs, sets
 * up health checks, and starts watches.
 */
import { NomadClient } from './nomad-client.js';
import { CellAdapter } from './adapters/cell-adapter.js';
import type {
  NomadConfig, NomadJobSpec, ApplyResult, CompiledNomadJobs, QuiltSheetLike,
} from './types.js';

export interface NomadEngineOptions {
  config: NomadConfig;
  /** Inject a custom NomadClient (for tests). */
  client?: NomadClient;
  /** Inject a custom CellAdapter (for tests). */
  adapter?: CellAdapter;
  /** Inject a custom fetch. */
  fetchImpl?: typeof fetch;
}

export class NomadEngine {
  private readonly client: NomadClient;
  private readonly adapter: CellAdapter;
  private readonly config: NomadConfig;

  constructor(options: NomadEngineOptions) {
    this.config = options.config;
    this.client = options.client ?? new NomadClient({ config: options.config, fetchImpl: options.fetchImpl });
    this.adapter = options.adapter ?? new CellAdapter();
  }

  /** Check whether the Nomad agent is healthy. */
  async health(): Promise<{ ok: boolean; message: string }> {
    const h = await this.client.agentHealth();
    return { ok: h.server.ok, message: h.server.message };
  }

  /** Apply a Quilt sheet to the Nomad cluster. Returns the apply results. */
  async apply(sheet: QuiltSheetLike): Promise<ApplyResult[]> {
    const compiled = this.adapter.compile(sheet);
    // Build a context from the value cells so formula cells can be evaluated.
    const ctx: Record<string, unknown> = {};
    for (const cell of sheet.cells) {
      if (cell.kind === 'value') ctx[cell.path] = cell.value;
    }
    const results: ApplyResult[] = [];
    for (let i = 0; i < compiled.jobs.length; i++) {
      const job = compiled.jobs[i]!;
      const cell = sheet.cells.find((c) => c.path === job.ID);
      // If the source cell is a formula, execute it against the ctx to get the real job spec.
      if (cell?.fn) {
        try {
          const fn = new Function('ctx', `return (${cell.fn})(ctx);`);
          const result = await fn(ctx);
          if (result && typeof result === 'object' && 'Job' in result) {
            Object.assign(job, (result as { Job: NomadJobSpec }).Job);
          } else if (result && typeof result === 'object' && 'TaskGroups' in result) {
            Object.assign(job, result);
          }
        } catch (e) {
          // Fall through with the adapter's placeholder spec
        }
      }
      const t0 = Date.now();
      const previous = await this.client.getJob(job.ID);
      const r = await this.client.registerJob(job);
      results.push({
        jobID: job.ID,
        evaluationID: r.EvalID,
        previousReplicas: previous?.Job?.TaskGroups?.[0]?.Count,
        newReplicas: job.TaskGroups[0]?.Count ?? 1,
        durationMs: Date.now() - t0,
      });
    }
    return results;
  }

  /** Scale a job to N instances. */
  async scale(jobID: string, count: number, group?: string): Promise<{ EvalID: string; newCount: number }> {
    const r = await this.client.scale(jobID, count, group);
    return { EvalID: r.EvalID, newCount: count };
  }

  /** Deregister a job. */
  async deregister(jobID: string, purge = false): Promise<void> {
    await this.client.deregister(jobID, purge);
  }

  /** List all jobs in the cluster. */
  async listJobs() {
    return this.client.listJobs();
  }

  /** List cluster nodes. */
  async listNodes() {
    return this.client.listNodes();
  }

  /** List recent evaluations. */
  async listEvaluations() {
    return this.client.listEvaluations();
  }

  /** Compile a sheet without applying it (for inspection). */
  compile(sheet: QuiltSheetLike): CompiledNomadJobs {
    return this.adapter.compile(sheet);
  }

  /** Get the underlying Nomad client (escape hatch). */
  get rawClient(): NomadClient {
    return this.client;
  }
}
