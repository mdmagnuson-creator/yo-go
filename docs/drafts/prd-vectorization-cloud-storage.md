# PRD: Vectorization Cloud Storage

> **Status:** Draft (Skeleton)
> **Depends on:** prd-vectorization.md (core vectorization must be implemented first)
> **Priority:** Low — Consider when scaling needs arise

## Introduction

Add cloud vector storage options (Pinecone, Weaviate) to the vectorization system for teams that need shared indexes across machines or have codebases too large for local storage.

## When to Implement

Consider this PRD when:
- Multiple team members need to share the same vector index
- Local index size exceeds ~500MB (very large codebases)
- You need cross-machine consistency without re-indexing
- You want to offload embedding storage from local disk

## Goals

- Support Pinecone as a cloud vector backend
- Support Weaviate as a cloud vector backend
- Enable team-wide shared vector indexes
- Maintain local-first fallback for offline work
- Namespace isolation per project

## User Stories (Skeleton)

### US-001: Pinecone Integration

**Description:** As a developer with a large team, I want to store vectors in Pinecone so that all team members share the same index.

**Acceptance Criteria (Draft):**

- [ ] Configuration via `storage: "cloud"` and `cloudProvider: "pinecone"`
- [ ] Pinecone API key via environment variable
- [ ] Namespace isolation per project (using project ID)
- [ ] Sync local changes to cloud on commit
- [ ] Query routing to Pinecone when configured
- [ ] Fallback to local if Pinecone unavailable
- [ ] Cost estimates documented

---

### US-002: Weaviate Integration

**Description:** As a developer preferring open-source, I want to use Weaviate so that I have cloud storage without vendor lock-in.

**Acceptance Criteria (Draft):**

- [ ] Support Weaviate Cloud or self-hosted
- [ ] Configuration via `cloudProvider: "weaviate"`
- [ ] Schema auto-creation for project indexes
- [ ] Same sync and fallback behavior as Pinecone

---

### US-003: Hybrid Local/Cloud Mode

**Description:** As a developer, I want to query locally first and fall back to cloud so that I have fast queries with cloud backup.

**Acceptance Criteria (Draft):**

- [ ] Local index used for queries when fresh
- [ ] Cloud sync happens in background
- [ ] Cloud used when local is stale or missing
- [ ] Clear indicator of which source was used

---

### US-004: Team Sync Protocol

**Description:** As a team, we need a protocol for keeping cloud index in sync across multiple contributors.

**Acceptance Criteria (Draft):**

- [ ] Conflict resolution strategy (last-write-wins or merge)
- [ ] Incremental sync (only changed chunks)
- [ ] Sync triggered by git push (optional)
- [ ] Manual sync command: `vectorize sync`

---

## Technical Considerations (Draft)

| Aspect | Consideration |
|--------|---------------|
| Cost | Pinecone: ~$70/mo for 1M vectors; Weaviate Cloud: ~$25/mo starter |
| Latency | Cloud adds ~50-100ms vs local |
| Privacy | Code chunks sent to cloud provider |
| Offline | Local fallback required |

## Open Questions

1. Should cloud be primary or backup?
2. How to handle conflicts when multiple people index simultaneously?
3. Should we support self-hosted Weaviate?
4. What's the sync frequency? Per-commit? Per-session?

## Cost Estimates

| Provider | Storage (1M vectors) | Queries (100k/mo) | Total |
|----------|---------------------|-------------------|-------|
| Pinecone Starter | Free (limited) | Free | $0 |
| Pinecone Standard | ~$70/mo | Included | ~$70/mo |
| Weaviate Cloud | ~$25/mo | Included | ~$25/mo |
| Self-hosted | Infrastructure cost | N/A | Varies |

---

*PRD Version: 0.1 (Skeleton)*
*Created: 2026-03-02*
*Status: Draft — For future consideration*
