/**
 * Tests for the NomadEngine and CellAdapter.
 * Uses a mocked fetch — no real Nomad agent needed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NomadEngine, CellAdapter } from '../src/index.ts';

function makeMockFetch(responses: Map<string, { status: number; body: string }>) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    for (const [k, v] of responses) {
      if (key.startsWith(k)) {
        return new Response(v.body, { status: v.status });
      }
    }
    return new Response('{}', { status: 200 });
  };
}

describe('CellAdapter', () => {
  test('compiles a value cell to a Nomad variable', () => {
    const adapter = new CellAdapter();
    const r = adapter.compile({
      name: 'test',
      cells: [{ path: 'replicas', kind: 'value', value: 3 }],
    });
    assert.equal(r.variables.length, 1);
    assert.equal(r.variables[0]?.Name, 'replicas');
    assert.equal(r.variables[0]?.Value, '3');
  });

  test('compiles a string value cell', () => {
    const adapter = new CellAdapter();
    const r = adapter.compile({
      name: 'test',
      cells: [{ path: 'image', kind: 'value', value: 'nginx:1.27' }],
    });
    assert.equal(r.variables[0]?.Value, 'nginx:1.27');
    assert.equal(r.variables[0]?.Type, 'string');
  });

  test('compiles a formula cell with TaskGroups to a job spec', () => {
    const adapter = new CellAdapter();
    const r = adapter.compile({
      name: 'test',
      cells: [{
        path: 'web',
        kind: 'formula',
        fn: '(ctx) => ({ Job: { Name: "web", TaskGroups: [] } })',
      }],
    });
    assert.equal(r.jobs.length, 1);
    assert.equal(r.jobs[0]?.Name, 'web');
  });

  test('compiles an api cell to an HTTP health check', () => {
    const adapter = new CellAdapter();
    const r = adapter.compile({
      name: 'test',
      cells: [{ path: 'health', kind: 'api', endpoint: 'http://web:8080/health' }],
    });
    assert.equal(r.checks.length, 1);
    assert.equal(r.checks[0]?.Name, 'health');
    assert.equal(r.checks[0]?.Type, 'http');
    assert.equal(r.checks[0]?.Path, '/health');
  });

  test('compiles a listener cell to a Nomad watch', () => {
    const adapter = new CellAdapter();
    const r = adapter.compile({
      name: 'test',
      cells: [{ path: 'log', kind: 'listener', listens: 'count', fn: '/bin/handle' }],
    });
    assert.equal(r.watches.length, 1);
    assert.equal(r.watches[0]?.JobID, 'count');
    assert.equal(r.watches[0]?.Handler, '/bin/handle');
  });

  test('ignores cells of unknown kinds', () => {
    const adapter = new CellAdapter();
    const r = adapter.compile({
      name: 'test',
      cells: [{ path: 'foo', kind: 'unknown_kind' }],
    });
    assert.equal(r.variables.length, 0);
    assert.equal(r.jobs.length, 0);
  });
});

describe('NomadEngine.health', () => {
  test('returns ok when agent is healthy', async () => {
    const fetchImpl = makeMockFetch(new Map([
      ['GET http://nomad:4646/v1/agent/health', { status: 200, body: JSON.stringify({ server: { ok: true, message: 'alive' } }) }],
    ]));
    const engine = new NomadEngine({ config: { address: 'http://nomad:4646' }, fetchImpl });
    const h = await engine.health();
    assert.equal(h.ok, true);
  });

  test('returns not-ok when agent is unhealthy', async () => {
    const fetchImpl = makeMockFetch(new Map([
      ['GET http://nomad:4646/v1/agent/health', { status: 200, body: JSON.stringify({ server: { ok: false, message: 'unhealthy' } }) }],
    ]));
    const engine = new NomadEngine({ config: { address: 'http://nomad:4646' }, fetchImpl });
    const h = await engine.health();
    assert.equal(h.ok, false);
  });
});

describe('NomadEngine.apply', () => {
  test('registers a job and returns the apply result', async () => {
    const fetchImpl = makeMockFetch(new Map([
      ['POST http://nomad:4646/v1/jobs', { status: 200, body: JSON.stringify({ EvalID: 'eval-1' }) }],
      ['GET http://nomad:4646/v1/job/web', { status: 404, body: '' }],
    ]));
    const engine = new NomadEngine({ config: { address: 'http://nomad:4646' }, fetchImpl });
    const results = await engine.apply({
      name: 'test',
      cells: [
        { path: 'replicas', kind: 'value', value: 3 },
        {
          path: 'web', kind: 'formula',
          fn: '(ctx) => ({ Job: { Name: "web", TaskGroups: [{ Name: "web", Count: ctx.replicas, Tasks: [] }] } })',
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.jobID, 'web');
    assert.equal(results[0]?.evaluationID, 'eval-1');
  });

  test('tracks previous replica count when updating a job', async () => {
    const fetchImpl = makeMockFetch(new Map([
      ['POST http://nomad:4646/v1/jobs', { status: 200, body: JSON.stringify({ EvalID: 'eval-2' }) }],
      ['GET http://nomad:4646/v1/job/web', { status: 200, body: JSON.stringify({ ID: 'web', Job: { Name: 'web', TaskGroups: [{ Name: 'web', Count: 2, Tasks: [] }] } }) }],
    ]));
    const engine = new NomadEngine({ config: { address: 'http://nomad:4646' }, fetchImpl });
    const results = await engine.apply({
      name: 'test',
      cells: [
        {
          path: 'web', kind: 'formula',
          fn: '(ctx) => ({ Job: { Name: "web", TaskGroups: [{ Name: "web", Count: 5, Tasks: [] }] } })',
        },
      ],
    });
    assert.equal(results[0]?.previousReplicas, 2);
    assert.equal(results[0]?.newReplicas, 5);
  });
});

describe('NomadEngine.scale', () => {
  test('scales a job to N instances', async () => {
    const fetchImpl = makeMockFetch(new Map([
      ['POST http://nomad:4646/v1/job/web/scale', { status: 200, body: JSON.stringify({ EvalID: 'eval-3' }) }],
    ]));
    const engine = new NomadEngine({ config: { address: 'http://nomad:4646' }, fetchImpl });
    const r = await engine.scale('web', 10);
    assert.equal(r.EvalID, 'eval-3');
    assert.equal(r.newCount, 10);
  });
});

describe('NomadEngine.deregister', () => {
  test('deregisters a job without purge by default', async () => {
    let called = '';
    const fetchImpl = async (url: string, init?: RequestInit) => {
      called = `${init?.method ?? 'GET'} ${url}`;
      return new Response(JSON.stringify({ EvalID: 'eval-4' }), { status: 200 });
    };
    const engine = new NomadEngine({ config: { address: 'http://nomad:4646' }, fetchImpl });
    await engine.deregister('web');
    assert.equal(called, 'DELETE http://nomad:4646/v1/job/web');
  });

  test('deregisters with purge when requested', async () => {
    let called = '';
    const fetchImpl = async (url: string, init?: RequestInit) => {
      called = `${init?.method ?? 'GET'} ${url}`;
      return new Response('{}', { status: 200 });
    };
    const engine = new NomadEngine({ config: { address: 'http://nomad:4646' }, fetchImpl });
    await engine.deregister('web', true);
    assert.equal(called, 'DELETE http://nomad:4646/v1/job/web?purge=true');
  });
});

describe('NomadEngine.listJobs', () => {
  test('returns the list of jobs', async () => {
    const fetchImpl = makeMockFetch(new Map([
      ['GET http://nomad:4646/v1/jobs', { status: 200, body: JSON.stringify([
        { ID: 'web', Name: 'web', Status: 'running', Type: 'service' },
        { ID: 'api', Name: 'api', Status: 'pending', Type: 'service' },
      ]) }],
    ]));
    const engine = new NomadEngine({ config: { address: 'http://nomad:4646' }, fetchImpl });
    const jobs = await engine.listJobs();
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0]?.ID, 'web');
  });
});
