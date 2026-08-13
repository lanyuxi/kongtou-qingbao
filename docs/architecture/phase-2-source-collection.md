# Phase 2 source collection architecture

This phase establishes bounded, evidence-preserving collection for exact configured official HTML and RSS/Atom HTTPS sources. It stores immutable Feed XML, at most 100 discovery versions in document order, and at most 20 eligible article bodies sequentially. Runtime activation, queues, schedules, automatic retries, concurrent fetching, AI processing, Evidence promotion, and canonical intelligence writes remain out of scope.

`createSourceCollector()` is a dormant composition root for a later queue adapter. It constructs a two-connection postgres.js pool, repository, DNS resolver, pinned-address HTTPS client, strict Feed parser, SHA-256 hasher, clock, and UUID generator, and returns only `collect` plus `close`. Nothing imports it from `apps/worker/src/index.ts`, so collection is not automatically scheduled or started.

Production configuration uses only the environment-variable names `AIRDROP_COLLECTION_DATABASE_URL` and `AIRDROP_COLLECTION_USER_AGENT`. Values are server-only secrets/configuration: never print, log, commit, expose to browser code, or place them in queue payloads. The database login must be provisioned separately with membership that can `SET ROLE collection_worker`; the migration creates `collection_worker` as `NOLOGIN` with no password and narrowly grants append/read access under RLS.

## Network boundary

Configured collection URLs and every redirect remain subject to the same verified authority-domain set. DNS validation considers the complete answer and rejects it when any address is non-global. The HTTPS adapter then connects through a custom lookup callback pinned to one validated address while retaining the original hostname for TLS SNI and certificate verification. It uses Node's HTTPS implementation directly, disables agent reuse for these requests, and does not consult proxy environment variables.

Node's `net.isIP()` validates textual IP syntax but does not provide the CIDR classification, IPv4-mapped IPv6 conversion, or range semantics required by the SSRF policy. The domain package therefore pins `ipaddr.js` 2.4.0 for security-correct IPv4/IPv6 parsing and classification behind the pure network-policy interface.

The worker declares postgres.js because collection commits need short multi-statement transactions with role switching, idempotency locking, Raw Item/discovery writes, and rollback as one unit. Existing browser/PostgREST primitives cannot safely express that boundary. The pool is deliberately small and must be closed by calling the returned `close()` method during the owning adapter's shutdown.

## XML parser boundary

Node 22 has no built-in XML parser. The worker pins `saxes` 6.0.0 because it is a strict, namespace-aware, non-validating streaming parser and does not automatically fetch external resources. It is isolated behind the `FeedParser` port so a future implementation can replace it without changing collection use cases.

Feed XML is untrusted input. The adapter rejects dangerous DTD and entity declaration syntax before parsing. During parsing it latches the first error and ignores subsequent parser events; every `doctype` event, unresolved entity or other parse error, XInclude element identified by its namespace, unsupported root, and nesting depth above 64 produces `invalid_feed`. It supplies no external entity or namespace resolver and does not use a DOM.

The transport has already limited decompressed Feed input to 2 MiB. The parser preserves document order, considers only the first 100 entries, extracts only the defined RSS/Atom metadata fields, and bounds values to the `discovered_items` persistence contracts. Content fields are never interpreted as article bodies. Atom `xml:base` can resolve a link into an absolute HTTPS candidate only; that operation does not establish authority or safety. Userinfo, port, canonical-hostname, and verified-authority checks remain the later network policy's responsibility before any fetch or trusted use.

## Feed and article transaction boundary

Network and parsing work always occurs outside database transactions. A changed, valid Feed is committed atomically with its attempt, immutable Raw Item, and initial discovery versions before any article request. External and deceptive-suffix URLs remain discovery-only. Same-authority and verified-subdomain article requests reuse the conditional validator, redirect, decompressed-byte, fatal UTF-8, and SHA-256 rules. Each article outcome and discovery successor commits independently; a failure cannot roll back the Feed or another article. Exact command replay performs no HTTP, while `not_modified` and unchanged Feed content do not regenerate discoveries or article requests.
