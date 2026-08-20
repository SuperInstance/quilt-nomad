# 🏔️ quilt-nomad

> **Quilt as a control plane for HashiCorp Nomad.** Edit a spreadsheet cell. The Nomad cluster reconfigures. Containers, binaries, JARs, systemd — all from one Quilt sheet.

<p align="center">
  <img src="assets/splash.png" alt="quilt-nomad: control plane for Nomad" width="800">
</p>

<p align="center">
  <a href="#why-this-exists">Why</a> •
  <a href="#the-philosophy">Philosophy</a> •
  <a href="#concrete-proof">Concrete proof</a> •
  <a href="#real-world-scenarios">Scenarios</a> •
  <a href="#try-it-right-now">Try it</a> •
  <a href="#how-it-fits-in-the-ecosystem">Ecosystem</a>
</p>

[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![version](https://img.shields.io/badge/version-0.1.0-orange.svg)](./package.json)
[![tests](https://img.shields.io/badge/tests-14%2F14%20passing-brightgreen.svg)](./test)
[![typescript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](./tsconfig.json)

---

## ✦ Why this exists

You're running a mixed workload. Some services are containers. Some are Java JARs. Some are raw binaries that need specific environment variables. Some are systemd services. You could use Kubernetes, but it's a 200MB download, requires a 4-core control plane, and is overkill for your 10-node cluster.

Nomad is the alternative. It's a 50MB binary, runs on a Raspberry Pi, handles containers + executables + Java + QEMU VMs, and has a beautiful API. But like any orchestrator, you end up writing HCL files for every job, managing allocations, scaling services, and reconciling state.

`quilt-nomad` is the same idea as `quilt-swarm`, but for Nomad. A Quilt sheet compiles to Nomad job specs. You edit cells. Nomad reconfigures. The control plane is the spreadsheet, the data plane is the cluster.

## ✦ The philosophy

The interface to a cluster should be a query, not a procedure. You shouldn't write a sequence of imperative steps to deploy a service. You should describe the desired state. The system should figure out the steps.

Most orchestration tools have a procedural API: "create this job, then update this task, then run this command." You write a script that calls the API in the right order. If the script fails halfway through, you have a half-deployed system.

Nomad's API is more declarative than most. You submit a job spec; Nomad figures out how to allocate it. But you still need to write the spec, manage transitions, and reconcile state.

Quilt goes one level further. A Quilt sheet *is* the desired state. The cells are the inputs. The formulas compute the spec. The listeners react to changes. The whole thing is a reactive system where the cluster is always converging to the sheet's state.

```
┌──────────────────────────────────────────────────────────┐
│                 Quilt Sheet (your code)                  │
│                                                          │
│  { "path": "replicas", "kind": "value", "value": 3 }    │
│  { "path": "image", "kind": "value",                     │
│                      "value": "nginx:1.27" }            │
│  { "path": "port", "kind": "value", "value": 8080 }     │
│  { "path": "web", "kind": "formula",                     │
│       "fn": "(ctx) => ({ Job: { Name: 'web',            │
│             TaskGroups: [{ Name: 'web', Count: ctx.replicas,│
│             Tasks: [{ Name: 'nginx', Driver: 'docker',  │
│             Config: { image: ctx.image,                 │
│             ports: [String(ctx.port)] } }] }] } })" }  │
│  { "path": "health", "kind": "api",                      │
│       "endpoint": "http://web:8080/health",              │
│       "interval": 10 }                                   │
│                                                          │
└────────────────────────┬─────────────────────────────────┘
                         │ quilt-nomad compiles
                         ▼
┌──────────────────────────────────────────────────────────┐
│                   Nomad cluster                          │
│                                                          │
│   ┌────────────┐                                         │
│   │  Nomad     │  Job: web, Count: 3                    │
│   │  Server    │  ┌──────┐ ┌──────┐ ┌──────┐           │
│   │            │  │ nginx│ │ nginx│ │ nginx│           │
│   │            │  │ 8080 │ │ 8080 │ │ 8080 │           │
│   │            │  └──────┘ └──────┘ └──────┘           │
│   └──────┬─────┘                                         │
│          │                                               │
│   ┌──────▼─────────────────────────────┐                │
│   │ Clients                             │                │
│   │ ┌────┐ ┌────┐ ┌────┐                │                │
│   │ │ c1 │ │ c2 │ │ c3 │                │                │
│   │ └────┘ └────┘ └────┘                │                │
│   └─────────────────────────────────────┘                │
│                                                          │
│   ┌────────────────────────────────────────┐             │
│   │  Health checks (from API cells)        │             │
│   │  http://web:8080/health every 10s     │             │
│   └────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────┘
```

The cell-to-Nomad mapping (designed with **z.ai GLM-4.5**):

| Quilt cell | Nomad concept |
|---|---|
| `value` | `variable { ... }` (job variable) |
| `formula` | `TaskGroups[].Tasks[].Config` (task spec) |
| `api` | `service { check { http {} } }` (health check) |
| `listener` | `watch { ... }` (event handler) |
| `program` | `task { exec = ... }` (runnable) |
| `sensor` | `volume { mount } + template {}` (hardware input) |

The mapping is convention over configuration. You don't write HCL; you write Quilt cells. The framework compiles them.

## ✦ Concrete proof

**1. Deploy a service from a sheet:**

```ts
import { QuiltEngine } from '@quilt/core';
import { NomadEngine } from '@quilt/nomad';

const nomad = new NomadEngine({ address: 'http://nomad:4646' });
const quilt = new QuiltEngine('my-app');

quilt.loadSheet({
  name: 'web',
  cells: [
    { path: 'replicas', kind: 'value', value: 3 },
    { path: 'image', kind: 'value', value: 'nginx:1.27' },
    { path: 'port', kind: 'value', value: 8080 },
    { path: 'web', kind: 'formula',
      fn: (ctx) => ({ Job: { Name: 'web', TaskGroups: [{
        Name: 'web', Count: ctx.replicas,
        Tasks: [{ Name: 'nginx', Driver: 'docker', Config: {
          image: ctx.image, ports: [String(ctx.port)] }}],
      }]}}) },
  ],
});

await nomad.apply(quilt.currentSheet());
// 3 nginx containers running on the Nomad cluster
```

**2. Scale a service:**

```ts
quilt.set('replicas', 10);
await nomad.apply(quilt.currentSheet());
// Nomad re-allocates: 3 → 4 → 5 → ... → 10
// Rolling update, no downtime
```

**3. Add a health check:**

```ts
quilt.addCell({
  path: 'health',
  kind: 'api',
  endpoint: 'http://web:8080/health',
  interval: 10,
});
await nomad.apply(quilt.currentSheet());
// Nomad adds a service check: HTTP GET every 10s
// Fails the allocation if it returns non-200
```

**4. Run a binary instead of a container:**

```ts
quilt.addCell({
  path: 'video-transcoder',
  kind: 'formula',
  fn: (ctx) => ({ Job: { Name: 'transcoder', TaskGroups: [{
    Name: 'transcoder', Count: 1,
    Tasks: [{ Name: 'ffmpeg', Driver: 'raw_exec',
      Config: { command: 'ffmpeg', args: ['-i', ctx.input, ctx.output] }}],
  }]}}),
});
await nomad.apply(quilt.currentSheet());
// Nomad runs ffmpeg on a client node
// No container, no Dockerfile, just a binary
```

**5. Run a Java JAR:**

```ts
quilt.addCell({
  path: 'analytics',
  kind: 'formula',
  fn: (ctx) => ({ Job: { Name: 'analytics', TaskGroups: [{
    Name: 'analytics', Count: ctx.replicas,
    Tasks: [{ Name: 'jar', Driver: 'java',
      Config: { jar_path: '/opt/analytics.jar', jvm_options: ['-Xmx512m'] }}],
  }]}}),
});
await nomad.apply(quilt.currentSheet());
// Nomad runs the Java JAR with the specified JVM options
```

## ✦ Real-world scenarios

**📊 Data pipeline** — A team runs 200 batch jobs each night. Some are Spark (Java), some are Python scripts (raw_exec), some are containers. They model each job as a Quilt cell. When the data team needs to change a parameter, they edit a `value` cell. The new spec is deployed via `nomad.apply()`. No more HCL files, no more Jinja templating.

**🌐 Multi-tenant SaaS** — A SaaS provider has 100 customers, each with their own Nomad namespace. Each customer has a Quilt sheet. The customer's UI writes to a cell. The cell change triggers a Nomad re-allocation. The customer sees their change in seconds.

**🔬 Research compute** — A research lab runs mixed workloads: ML training (containers), data processing (raw binaries), custom drivers (systemd). With `quilt-nomad`, they have one model. The PhD student who wants to add a new job type adds a new cell kind, not a new HCL template.

**🛡️ Multi-region failover** — A team has 3 Nomad regions (us-east, eu-west, ap-south). They have 3 Quilt sheets, one per region. A single GitOps commit updates all 3. If a region goes down, the cells in that region fail; the other 2 keep running.

## ✦ Try it right now

```bash
# Install
npm install @quilt/nomad

# Run the dev example
git clone https://github.com/SuperInstance/quilt-nomad
cd quilt-nomad
npm install
npm test
```

Or browse the [live Quilt + Nomad demo](https://superinstance.dev/nomad-demo.html) to see the concept in action.

## ✦ How it fits in the ecosystem

`quilt-nomad` is one of two embedded orchestrators in the Quilt ecosystem. The choice between `quilt-swarm` and `quilt-nomad` is the choice between Docker and Nomad as the underlying engine:

```
                    ┌────────────────────┐
                    │   Quilt cells      │
                    │   (your logic)     │
                    └──────────┬─────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
         ┌──────▼──────┐              ┌───────▼──────┐
         │ quilt-swarm │              │  quilt-nomad │
         │  (Docker)   │              │ (multi-task) │
         └──────┬──────┘              └───────┬──────┘
                │                              │
                ▼                              ▼
         Docker Swarm cluster         HashiCorp Nomad cluster
         (containers only)            (containers + exec + Java)
```

**Use `quilt-nomad` when:**
- You need to run containers AND standalone binaries AND Java JARs
- You have complex scheduling requirements (bin-packing, affinity, constraints)
- You want rich job templating with HCL
- You have multi-datacenter or multi-region deployments
- You want to run a mixed workload on a small cluster

**Use `quilt-swarm` when:**
- You only need containers
- You already have Docker installed
- You want minimal infrastructure complexity
- You're deploying to edge devices with limited resources

Both repos share the same Quilt cell mapping convention. Switching between them is a one-line change in your code.

## ✦ Why you should care

If you've ever written an HCL file to deploy a service. If you've ever wanted to run a binary alongside your containers. If you've ever wished your scheduler could handle Java and Docker in the same job. If you've ever had to choose between Kubernetes and Nomad and wished the choice was easier.

This repo is for you.

## ✦ License

Apache 2.0. See [LICENSE](./LICENSE).
