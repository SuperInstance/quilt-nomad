# 🏔️ quilt-nomad

> **Quilt as a control plane for HashiCorp Nomad.** Edit a spreadsheet cell; the Nomad cluster re-configures instantly. Value → job variable. Formula → task template. Listener → watch. API cell → HTTP check.

```
 ██████╗ ██╗   ██╗██╗██╗     ████████╗      ███╗   ██╗ ██████╗ ███╗   ███╗ █████╗ ██████╗
██╔═══██╗██║   ██║██║██║     ╚══██╔══╝      ████╗  ██║██╔═══██╗████╗ ████║██╔══██╗██╔══██╗
██║   ██║██║   ██║██║██║        ██║         ██╔██╗ ██║██║   ██║██╔████╔██║███████║██║  ██║
██║▄▄ ██║██║   ██║██║██║        ██║         ██║╚██╗██║██║   ██║██║╚██╔╝██║██╔══██║██║  ██║
╚██████╔╝╚██████╔╝██║██║        ██║         ██║ ╚████║╚██████╔╝██║ ╚═╝ ██║██║  ██║██████╔╝
 ╚══▀▀═╝  ╚═════╝ ╚═╝╚═╝        ╚═╝         ╚═╝  ╚═══╝ ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚═════╝
                                                ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
                                                  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
                                              bridge Quilt cells to Nomad jobs
```

[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![typescript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](./tsconfig.json)
[![node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](./package.json)
[![version](https://img.shields.io/badge/version-0.1.0-orange.svg)](./package.json)

---

## ✦ What is `quilt-nomad`?

A from-the-ground-up integration of [Quilt](https://github.com/SuperInstance/quilt) and [HashiCorp Nomad](https://www.nomadproject.io/). Quilt's reactive spreadsheet becomes a Nomad control plane: edit a cell, the corresponding Nomad job/task/watch updates in real time. The end-user interacts with a Quilt sheet; the underlying Nomad cluster reconfigures itself.

This is the second embedded orchestrator in the Quilt ecosystem after `quilt-swarm`. Use **Nomad** when you need to run containers, raw binaries, Java JARs, and systemd services in the same cluster. Use **Swarm** when you only need containers.

## ✦ The mapping (Quilt cell → Nomad concept)

| Quilt cell kind | Nomad artifact |
|---|---|
| `value` | Job variable (`variable { ... }`) |
| `formula` | Task `config { template = ... }` |
| `listener` | Nomad `watch { ... }` block |
| `api` | `service { check { http { ... } } }` |
| `program` | Job task `exec` command |
| `sensor` | Host volume `mount { ... }` + `template` block |

## ✦ Quick start

```ts
import { QuiltEngine } from '@quilt/core';
import { NomadEngine } from '@quilt/nomad';

const nomad = new NomadEngine({ address: 'http://nomad.service.consul:4646' });
const quilt = new QuiltEngine('my-nomad-app');

quilt.loadSheet({
  name: 'web',
  cells: [
    { path: 'replicas', kind: 'value', value: 3 },
    { path: 'image', kind: 'value', value: 'nginx:1.27' },
    { path: 'port', kind: 'value', value: 8080 },
    { path: 'job', kind: 'formula',
      fn: (ctx) => ({ Job: { Name: 'web', TaskGroups: [{
        Name: 'web', Count: ctx.replicas,
        Tasks: [{ Name: 'nginx', Config: {
          image: ctx.image,
          ports: [`${ctx.port}`],
        }}],
      }]}}) },
    { path: 'health', kind: 'api', endpoint: 'http://web:8080/health' },
  ],
});

// Edit a cell, Nomad re-configures
quilt.set('replicas', 5);  // nomad.scale('web', 5) under the hood
```

## ✦ Cross-references

`quilt-nomad` is part of the Quilt 24-repo ecosystem. It depends on:

- `@quilt/core` — the cell runtime
- `@quilt/sdk` — `FederatedArtifactStore` for Nomad job templates
- `@quilt/ai` — natural-language → Nomad job generator
- `quilt-fleet` — multi-cluster orchestration
- `quilt-base` — minimal container base for the Nomad client

## ✦ The Nomad API endpoints we wrap

- `POST /v1/jobs` — register a job (HCL or JSON)
- `GET /v1/jobs` — list all jobs
- `POST /v1/job/{id}/scale` — scale a job to N instances
- `GET /v1/evaluations` — recent job evaluations
- `GET /v1/nodes` — cluster members
- `GET /v1/agent/health` — agent liveness

## ✦ License

Apache 2.0. See [LICENSE](./LICENSE).
