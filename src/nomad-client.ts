/**
 * NomadClient — thin HTTP client for the Nomad API.
 *
 * This is a deliberately small client. We only wrap the endpoints
 * Quilt actually uses. If you need more, please open an issue.
 */
import type {
  NomadConfig, NomadJobSpec, NomadEvaluation, NomadNode,
} from './types.js';

export interface NomadClientOptions {
  config: NomadConfig;
  /** Inject a custom fetch (for tests). */
  fetchImpl?: typeof fetch;
}

export class NomadError extends Error {
  constructor(public status: number, public body: string, message: string) {
    super(message);
    this.name = 'NomadError';
  }
}

export class NomadClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NomadClientOptions) {
    this.baseUrl = options.config.address.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      ...(options.config.token ? { 'X-Nomad-Token': options.config.token } : {}),
    };
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  /** Register or update a job. */
  async registerJob(job: NomadJobSpec): Promise<{ EvalID: string }> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/jobs`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ Job: job }),
    });
    if (!res.ok) throw new NomadError(res.status, await res.text(), `registerJob failed: ${res.statusText}`);
    return res.json() as Promise<{ EvalID: string }>;
  }

  /** List all jobs. */
  async listJobs(): Promise<Array<{ ID: string; Name: string; Status: string; Type: string }>> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/jobs`, { headers: this.headers });
    if (!res.ok) throw new NomadError(res.status, await res.text(), `listJobs failed: ${res.statusText}`);
    return res.json() as Promise<Array<{ ID: string; Name: string; Status: string; Type: string }>>;
  }

  /** Get a single job by ID. */
  async getJob(id: string): Promise<{ ID: string; Job: NomadJobSpec } | null> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/job/${encodeURIComponent(id)}`, { headers: this.headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new NomadError(res.status, await res.text(), `getJob failed: ${res.statusText}`);
    return res.json() as Promise<{ ID: string; Job: NomadJobSpec }>;
  }

  /** Scale a job to N instances. */
  async scale(id: string, count: number, group?: string): Promise<{ EvalID: string }> {
    const groupName = group ?? id;
    const res = await this.fetchImpl(
      `${this.baseUrl}/v1/job/${encodeURIComponent(id)}/scale`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ Count: count, Group: groupName }),
      },
    );
    if (!res.ok) throw new NomadError(res.status, await res.text(), `scale failed: ${res.statusText}`);
    return res.json() as Promise<{ EvalID: string }>;
  }

  /** Deregister (delete) a job. */
  async deregister(id: string, purge = false): Promise<{ EvalID: string }> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/v1/job/${encodeURIComponent(id)}${purge ? '?purge=true' : ''}`,
      { method: 'DELETE', headers: this.headers },
    );
    if (!res.ok) throw new NomadError(res.status, await res.text(), `deregister failed: ${res.statusText}`);
    return res.json() as Promise<{ EvalID: string }>;
  }

  /** List recent evaluations. */
  async listEvaluations(): Promise<NomadEvaluation[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/evaluations`, { headers: this.headers });
    if (!res.ok) throw new NomadError(res.status, await res.text(), `listEvaluations failed: ${res.statusText}`);
    return res.json() as Promise<NomadEvaluation[]>;
  }

  /** List cluster nodes. */
  async listNodes(): Promise<NomadNode[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/nodes`, { headers: this.headers });
    if (!res.ok) throw new NomadError(res.status, await res.text(), `listNodes failed: ${res.statusText}`);
    return res.json() as Promise<NomadNode[]>;
  }

  /** Agent health. */
  async agentHealth(): Promise<{ server: { ok: boolean; message: string }; client?: { ok: boolean; message: string } }> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/agent/health`, { headers: this.headers });
    if (!res.ok) throw new NomadError(res.status, await res.text(), `agentHealth failed: ${res.statusText}`);
    return res.json() as Promise<{ server: { ok: boolean; message: string }; client?: { ok: boolean; message: string } }>;
  }
}
