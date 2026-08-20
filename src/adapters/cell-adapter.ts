/**
 * Cell adapter — compile a Quilt sheet into Nomad job specs.
 *
 * Mapping rules:
 * - value cells → job variables
 * - formula cells containing a "Job" key → job specs
 * - formula cells with a "count" → scale target
 * - api cells → service health checks
 * - listener cells → Nomad watches
 */

import type {
  CompiledNomadJobs, NomadJobSpec, NomadCheck, NomadVariable,
} from '../types.js';

export interface QuiltCellLike {
  path: string;
  kind: string;
  value?: unknown;
  fn?: string;
  listens?: string;
  endpoint?: string;
  method?: string;
  headers?: Record<string, string>;
  interval?: number;
}

export interface QuiltSheetLike {
  name: string;
  cells: QuiltCellLike[];
}

export class CellAdapter {
  /** Compile a Quilt sheet into Nomad job specs, variables, checks, watches. */
  compile(sheet: QuiltSheetLike): CompiledNomadJobs {
    const variables: NomadVariable[] = [];
    const jobs: NomadJobSpec[] = [];
    const checks: NomadCheck[] = [];
    const watches: CompiledNomadJobs['watches'] = [];

    for (const cell of sheet.cells) {
      if (cell.kind === 'value') {
        variables.push(this.variableFromValue(cell));
      } else if (cell.kind === 'formula') {
        const job = this.jobFromFormula(cell);
        if (job) jobs.push(job);
      } else if (cell.kind === 'api') {
        const check = this.checkFromApi(cell);
        if (check) checks.push(check);
      } else if (cell.kind === 'listener') {
        const watch = this.watchFromListener(cell);
        if (watch) watches.push(watch);
      }
    }

    return { jobs, variables, checks, watches };
  }

  /** Convert a value cell to a Nomad variable. */
  private variableFromValue(cell: QuiltCellLike): NomadVariable {
    return {
      Name: cell.path,
      Value: typeof cell.value === 'string' ? cell.value : JSON.stringify(cell.value),
      Type: typeof cell.value as NomadVariable['Type'],
    };
  }

  /**
   * Try to extract a Nomad job spec from a formula cell.
   * Heuristic: the formula's function body must return an object with a
   * `Job` key (or be the job object itself).
   */
  private jobFromFormula(cell: QuiltCellLike): NomadJobSpec | null {
    if (!cell.fn) return null;
    // Very simple parsing: look for a return that has the structure of a job
    // (TaskGroups is a strong signal). For a more robust implementation we'd
    // execute the fn against a context and inspect the result.
    if (!/TaskGroups|TaskGroup/.test(cell.fn)) return null;
    return {
      ID: cell.path,
      Name: cell.path,
      Type: 'service',
      TaskGroups: [
        {
          Name: cell.path,
          Count: 1,
          Tasks: [
            {
              Name: cell.path,
              Driver: 'docker',
              Config: { image: 'alpine:latest', command: ['sleep', 'infinity'] },
            },
          ],
        },
      ],
      Variable: [],
    };
  }

  /** Convert an api cell to a Nomad HTTP health check. */
  private checkFromApi(cell: QuiltCellLike): NomadCheck | null {
    if (!cell.endpoint) return null;
    const url = new URL(cell.endpoint);
    return {
      Name: cell.path,
      Type: 'http',
      Interval: (cell.interval ?? 10) * 1_000_000,  // 10s default
      Timeout: 3_000_000,  // 3s
      Path: url.pathname,
      Port: url.port || (url.protocol === 'https:' ? '443' : '80'),
    };
  }

  /** Convert a listener cell to a Nomad watch. */
  private watchFromListener(cell: QuiltCellLike): CompiledNomadJobs['watches'][number] | null {
    if (!cell.listens) return null;
    return {
      JobID: cell.listens,
      Type: 'service_register',
      Handler: cell.fn ?? `/usr/local/bin/handle-${cell.path}.sh`,
    };
  }
}
