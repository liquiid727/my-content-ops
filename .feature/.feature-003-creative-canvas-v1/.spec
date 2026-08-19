# Creative Canvas V1 — Technical SPEC

**Status:** Approved  
**Supersedes:** the product/runtime direction in `.feature-001-canvas-runtime`; Foundation persistence and legacy endpoints remain compatible.

## 1. Architecture

Canvas, Text Studio, and Image Studio are projections of one project workflow:

```text
Project Workflow
├── WorkflowGraph (revisioned layout and connections)
├── Artifact (durable content and immutable versions)
├── Recipe (reusable operation configuration)
├── ExecutionPlan (immutable, topologically ordered run intent)
└── ChangeSet (proposed graph commands requiring approval)
```

The implementation is additive. New `workflow_*`, `recipes`, `execution_plans`, `change_sets`, and `collection_items` tables sit beside the shipped Foundation canvas tables. Reading a workflow imports missing legacy artifact nodes so existing projects open without a destructive migration. Legacy `/graph`, `/nodes`, and `/edges` routes remain for one compatibility cycle.

## 2. Contracts

`WorkflowNode` has a discriminated subject (`artifact` or `recipe`), position, optional size, collapsed state, renderer, z-index, and timestamp. `WorkflowConnection` references node IDs and typed port IDs. A connection is rejected when subjects are missing, ports are incompatible, or it creates a cycle.

A recipe stores a server-owned `capabilityId`, user-facing title, JSON configuration, and revision. An execution plan snapshots a topologically ordered list of recipe steps. A ChangeSet stores a base graph revision, bounded graph commands, validation result, proposer metadata, summary, and decision state.

## 3. Graph commands

The mutation API accepts: `add_artifact_node`, `create_recipe_node`, `move_node`, `resize_node`, `remove_node`, `connect_nodes`, `disconnect_nodes`, and `update_recipe`. Every mutation includes `expectedRevision`. Stale changes use the standard `CONFLICT` envelope and return the current revision.

## 4. Capability registry

| Capability | Inputs | Outputs |
|---|---|---|
| `text.draft` | optional text/context | text |
| `text.rewrite` | text | text |
| `image.generate` | optional image refs | image collection |
| `image.edit` | image, optional refs/mask | image collection |
| `image.outpaint` | image, mask | image collection |
| `image.variation` | image | image collection |
| `image.enhance` | image | image collection |

Capability definitions and config validation are server-owned; recipes cannot inject executable code.

## 5. HTTP API

```text
GET  /api/v1/projects/:projectId/workflow
POST /api/v1/projects/:projectId/graph-commands
POST /api/v1/projects/:projectId/recipes
PATCH /api/v1/projects/:projectId/recipes/:recipeId
POST /api/v1/projects/:projectId/execution-plans
POST /api/v1/execution-plans/:planId/execute
POST /api/v1/projects/:projectId/change-sets
GET  /api/v1/change-sets/:changeSetId
POST /api/v1/change-sets/:changeSetId/approve
POST /api/v1/change-sets/:changeSetId/reject
```

All responses use existing envelopes. Graph mutation and approval require `expectedRevision`. Image binary input uses the existing asset upload path; graph requests reference IDs.

## 6. Image provider

`OpenAIImageProvider` calls an OpenAI Images-compatible base URL. It supports generation and edit endpoints, multipart references/masks, multiple candidates, and base64 or URL results. Base URL, model, and credential come from existing provider configuration and secret storage; domain code does not hardcode a model.

Without an enabled image provider, image execution fails with `PROVIDER_NOT_CONFIGURED`. Seed media is available only in explicit demo/test mode and is labelled in artifact metadata. Masks must be dimension-compatible with the source and use transparency for the editable region.

## 7. UI

- `/projects/:id/canvas` is the orchestration surface.
- `/projects/:id/text/:artifactId` is Text Studio.
- `/projects/:id/image/:artifactId` is Image Studio.
- Recipe nodes use compact amber styling; artifacts keep content-oriented pink/neutral styling.
- A bottom shelf explains selection, blocked inputs, plan order, and execution state.
- ChangeSets open in a review surface with command-by-command diff and Approve/Reject actions.

All controls use shared UI components, Lucide icons, and semantic tokens.

## 8. MCP boundary

MCP exposes only `creative_canvas_get_snapshot`, `creative_canvas_validate_change_set`, `creative_canvas_propose_change_set`, and `creative_canvas_get_change_set`. Approval and execution are absent.

## 9. Limits and rollout

V1 limits: 100 commands per batch, 500 nodes per project, 8 image references, 8 candidates, and 50 MB per uploaded image. Migration is additive, legacy nodes are imported on workflow read, the new UI switches to workflow APIs, and Foundation routes remain operational until a later explicitly approved removal.
