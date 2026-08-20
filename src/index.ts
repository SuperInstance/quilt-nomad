/**
 * @quilt/nomad — main entry
 *
 * Quilt as a control plane for HashiCorp Nomad. Edit a cell; the
 * Nomad cluster reconfigures. The user never has to touch a
 * Nomad HCL file.
 */
export { NomadClient, NomadError } from './nomad-client.js';
export type { NomadClientOptions } from './nomad-client.js';
export { CellAdapter } from './adapters/cell-adapter.js';
export type { QuiltCellLike, QuiltSheetLike } from './adapters/cell-adapter.js';
export { NomadEngine } from './nomad-engine.js';
export type { NomadEngineOptions } from './nomad-engine.js';
export type {
  NomadConfig, NomadJobSpec, NomadTaskGroup, NomadTask, NomadService,
  NomadCheck, NomadVariable, NomadResources, NomadTemplate,
  NomadEvaluation, NomadNode, CompiledNomadJobs, ApplyResult,
} from './types.js';
