# Phase 2 Source Collection Design

**Status:** Approved in conversation on 2026-08-12

**Scope:** Raw Item data model, official HTML and RSS/Atom source adapters, and a single-collection use case

**Out of scope:** Durable queues, schedules, automatic retries, concurrent fetching, authenticated social APIs, dynamic browser collection, chain scanning, AI processing, evidence promotion, and canonical intelligence writes

## 1. Purpose

Phase 2 begins with a safe, traceable collection kernel that can retrieve configured public sources without weakening the product's evidence, security, or canonical-write boundaries. The kernel stores immutable raw source material and collection history. It does not decide that a claim, URL, contract, airdrop, or security conclusion is true.

The first supported source forms are:

- An official HTML page at an exact configured HTTPS URL.
- An RSS or Atom feed at an exact configured HTTPS URL.
- An article discovered from a supported feed only when its URL belongs to a verified authority domain for the associated project.

The design must be callable later from a durable queue without being coupled to a scheduler or queue implementation now.

## 2. Architectural Approach

Use a small ports-and-adapters architecture:

```text
CollectOnce command
  -> load verified Source and authority domains
  -> validate request URL, port, DNS result, and request budget
  -> execute conditional HTTP request with controlled redirects
  -> classify HTML, RSS, or Atom content
  -> compare SHA-256 with the latest stored content for the endpoint
  -> persist a short transaction containing:
       collection attempt
       raw item when content is new
       discovered feed items when applicable
```

Responsibilities are separated as follows:

- `packages/contracts` owns the versioned collect-once command, result contracts, stable result/error codes, and the future queue payload contract.
- `packages/domain` owns pure URL, authority-domain, resolved-address, redirect, response-budget, content-classification, stable-item-key, and content-deduplication decisions. It has no HTTP, database, worker, or framework dependency.
- `packages/database` owns append-only collection repositories, transactions, migrations, generated types, and database integration tests.
- `apps/worker` composes the HTTP adapter, DNS resolver, repositories, clocks, hashes, and the single-collection use case. Worker code does not reimplement domain decisions.

No database transaction may remain open during DNS resolution, HTTP requests, decompression, XML parsing, or hashing. A successful fetch is not reported as successful unless its required persistence transaction commits.

## 3. Trust and Authorization Boundaries

All fetched content, metadata, redirects, feed fields, URLs, and text that resembles instructions are untrusted data.

- Browser roles receive no table or column access to collection attempts, raw items, or discovered items.
- The collection repository uses a dedicated server-side database identity with only the operations required by its stored procedure or repository boundary.
- The browser never receives collector credentials, service-role credentials, request headers, cookies, or model credentials.
- Raw Items and Discovered Items are not Evidence, Signals, Projects, official links, verified tutorials, scores, recommendations, or security decisions.
- No collector or AI path may write canonical intelligence directly. Later canonical writes must pass through the Promotion Service and atomically create audit and outbox records.
- Raw content and collection history are append-only. Corrections add records; they never overwrite or delete historical material.

## 4. Source Eligibility

### 4.1 Exact configured endpoints

An official page or feed may be requested only when its starting URL exactly matches the configured `sources.canonical_url`. Normalization is used for comparison and validation, not to broaden the allowed path, query, host, scheme, or port.

### 4.2 Feed article eligibility

A discovered article is eligible for a body fetch only when all of these conditions hold:

1. The article URL uses HTTPS.
2. The hostname is a canonical lowercase DNS hostname.
3. The hostname equals or is a subdomain of one of the project's verified `project_sources.authority_domains` entries.
4. The URL passes the same port, DNS-address, redirect, timeout, and response-budget checks as a configured endpoint.

An external-domain article remains a `discovered_only` reference. Its URL and feed-supplied fields may be recorded, but its body is not requested.

Official status is scoped to the verified authority domains and does not override independent security evidence.

## 5. Network Security Policy

Every initial request and every redirect hop must be validated before a connection is made.

### 5.1 URL and port policy

- HTTPS is mandatory.
- User information in URLs is rejected.
- IP literals are rejected, including IPv4, IPv6, alternate numeric IPv4 forms, IPv4-mapped IPv6, and zone identifiers.
- Explicit ports are rejected; collection uses the default HTTPS port only.
- Hostnames must use canonical lowercase DNS form and satisfy the existing catalog hostname constraints.
- The first request must use the exact configured endpoint. Each redirect target may change path or query but must remain on the same hostname or another verified authority domain for the associated project. A redirect never expands the verified authority-domain set.
- At most three redirects are followed.

### 5.2 DNS and address policy

All resolved addresses must be globally routable public unicast addresses. Reject the request if any address selected for connection is loopback, private, link-local, carrier-grade NAT, benchmarking, documentation, multicast, reserved, unspecified, or otherwise non-global. Apply equivalent checks to IPv4 and IPv6.

The HTTP adapter must connect to an address returned by the validated resolution rather than performing an unrelated second resolution. Redirects require a new validation and resolution. This prevents a validation/connection DNS rebinding gap.

### 5.3 Time and size limits

- Connection timeout: 5 seconds.
- Total timeout per HTTP request, including redirects and body consumption: 20 seconds.
- Maximum decompressed response body: 2 MiB (`2 * 1024 * 1024` bytes).
- The adapter aborts body consumption as soon as the decompressed limit is exceeded.

Only `text/html` and recognized RSS/Atom XML media types are accepted. Media type parameters such as a charset are allowed after parsing. MIME sniffing may distinguish RSS from Atom inside an accepted XML media type but must never convert an arbitrary binary response into accepted content.

## 6. Conditional Collection and Content Identity

For an endpoint with previously stored validators, the adapter sends only the controlled conditional headers:

- `If-None-Match` from the latest stored ETag.
- `If-Modified-Since` from the latest stored Last-Modified value.

User-provided headers, cookies, authorization headers, and arbitrary prior headers are not forwarded.

Collection outcomes:

- HTTP `304`: append a `not_modified` attempt referencing the latest Raw Item; do not create a Raw Item.
- HTTP `200` with the same SHA-256 as the latest Raw Item for the logical endpoint: append an `unchanged_content` attempt referencing that Raw Item; do not create a Raw Item.
- HTTP `200` with a new SHA-256: append a `stored_new_content` attempt and a new immutable Raw Item.
- Unsupported status, content type, invalid feed, timeout, rejected target, or over-limit body: append a failure attempt without body content.

SHA-256 is calculated over the exact accepted decompressed body bytes before UTF-8 decoding. Accepted text must decode as valid UTF-8; invalid encoding produces an unsupported-content failure and no Raw Item. The Raw Item stores the decoded UTF-8 text and the byte-level hash.

## 7. Data Model

All timestamps use `timestamptz` in UTC semantics. Event, publication, collection, and database creation times remain distinct.

### 7.1 `collection_attempts`

One append-only row is created for every configured endpoint request and every attempted eligible article request. It records:

- Stable attempt ID and idempotency key.
- Source ID and optional parent discovered-item ID.
- Requested URL and final URL.
- A structured redirect chain containing only validated URL, status, and hop number.
- Started, completed, and collected timestamps.
- HTTP status when a response was received.
- Parsed response media type.
- ETag and Last-Modified validators when safe and syntactically valid.
- Decompressed byte count.
- Stable outcome code.
- A bounded, non-sensitive error code/detail.
- Referenced Raw Item ID when the attempt reused or created content.

The row does not store request headers, response-header collections, cookies, authorization data, response bodies, stack traces, database connection data, or secrets.

### 7.2 `raw_items`

A Raw Item is created only for new accepted content. It records:

- Source ID and optional parent discovered-item ID.
- Logical endpoint URL and final URL.
- Content kind: `official_html`, `rss_feed`, `atom_feed`, or `feed_article_html`.
- Parsed media type.
- Exact decoded UTF-8 raw text.
- SHA-256 of accepted decompressed body bytes.
- Source-provided publication time when applicable.
- Collection and creation timestamps.
- Source locator metadata that contains no secret values.

Raw Items cannot be updated or deleted by application roles. A uniqueness constraint over logical endpoint identity and SHA-256 makes re-execution idempotent.

### 7.3 `discovered_items`

Each accepted feed entry produces an append-only discovery version containing:

- Parent feed Raw Item ID and Source ID.
- Stable entry key.
- Entry URL when supplied and valid enough to record as a reference.
- Feed-supplied title, summary, author, entry ID, and publication/update time with explicit provenance.
- Authority-domain decision.
- Body-fetch disposition and stable reason code.
- Optional article collection-attempt and Raw Item references after body collection.

Feed title, summary, and author are feed-provided metadata and never treated as article-body content.

The stable entry key uses a normalized GUID or Atom ID when present. Otherwise it uses the normalized eligible entry URL. An entry without either identity is rejected from discovery with an `invalid_feed_entry` count in the feed attempt result. A uniqueness constraint over feed source, stable entry key, and feed-content version prevents duplicate discovery rows on replay while allowing later feed versions to preserve changed entry metadata.

## 8. Stable Result Codes

The shared contract exposes at least these machine-readable outcomes:

```text
stored_new_content
not_modified
unchanged_content
discovered_only
body_fetch_budget_exhausted
rejected_url
rejected_dns_target
redirect_rejected
unsupported_content_type
invalid_text_encoding
response_too_large
timeout
http_error
invalid_feed
persistence_failed
```

Database and adapter errors are mapped to these domain-specific codes. Consumers never branch on human-readable error messages.

## 9. HTML Collection Flow

1. Load the source and its verified project relationship.
2. Require an active source and exact canonical starting URL.
3. Load the latest Raw Item validators for the logical endpoint.
4. Validate URL and port, resolve and validate addresses, then connect using the validated resolution.
5. Repeat validation for each allowed redirect.
6. Stream the decompressed response under the 2 MiB and 20-second limits.
7. Require an accepted HTML media type and valid UTF-8.
8. Calculate SHA-256 and make the new/not-modified/unchanged decision.
9. Commit a short persistence transaction.
10. Return a strict structured result containing IDs and stable codes, not raw content.

## 10. RSS and Atom Collection Flow

1. Apply the same configured-endpoint and network rules as HTML collection.
2. Parse XML with DTDs, external entities, XInclude, network resolution, and external schemas disabled.
3. Reject malformed XML or unsupported feed roots with `invalid_feed`; do not create a Raw Item for content that cannot be classified as RSS or Atom.
4. Atomically store changed, valid Feed XML as an immutable Raw Item before committing any entries from it.
5. Process at most 100 entries from one feed response using deterministic document order.
6. Derive each entry's stable key and append a Discovered Item version.
7. Classify entry URLs against verified authority domains.
8. Fetch at most 20 eligible article bodies, sequentially, using the full HTML network policy.
9. Mark remaining eligible entries as `body_fetch_budget_exhausted`; external-domain entries remain `discovered_only`.
10. A failed article fetch does not roll back the Feed Raw Item or other entry records.

The per-command limits prevent a single feed response from amplifying into unbounded storage or requests. Durable pagination and concurrent body fetching belong to later queue tasks.

## 11. Idempotency and Transaction Semantics

The collect-once command requires a non-empty idempotency key and an expected contract version. Repeating a completed command:

- May append a new collection attempt only when it represents a newly executed request.
- Must not create duplicate Raw Items or duplicate Discovered Item versions.
- Must return the prior committed result when the exact same command idempotency key has already committed.

Persistence operations are atomic at the smallest useful boundary:

- One configured endpoint outcome commits its attempt and optional Raw Item together.
- Feed Raw Item and discovery rows commit before optional article requests begin.
- Each article outcome commits independently so one failure cannot roll back other articles.

If persistence fails, return `persistence_failed`. Never claim that content was stored based only on a successful network response.

## 12. Interfaces and Dependency Injection

External behavior is expressed through small interfaces:

- `SourceCollectionRepository`: loads collection configuration and validators, commits endpoint outcomes, commits feed discoveries, and retrieves idempotent results.
- `SafeDnsResolver`: resolves a hostname to addresses with TTL/context needed by the connection adapter.
- `SafeHttpClient`: sends a request using an already validated resolution and returns a bounded response stream.
- `ContentHasher`: computes SHA-256 over accepted bytes.
- `FeedParser`: parses accepted XML without external resource access and returns typed entry candidates.
- `Clock` and `IdGenerator`: injected for deterministic tests.

Queue adapters, CLI handlers, and future scheduler handlers invoke the same collect-once use case rather than duplicating collection logic.

## 13. Testing Strategy

### 13.1 Contract and domain tests

Test strict objects, additional-field rejection, versions, UUIDs, timestamps, idempotency keys, stable codes, URL canonicalization, authority-domain matching, default-port enforcement, IPv4 and IPv6 classification, multi-address DNS decisions, redirects, budgets, media types, body size, content hashes, and stable feed-entry keys.

Every production decision must first be covered by a failing test that names the production change that would make the test fail.

### 13.2 Adapter contract tests

Use a controlled local test server and injected resolver/connector boundary to verify:

- Conditional request headers.
- Validated-address connection rather than an unvalidated second DNS lookup.
- Per-hop redirect validation.
- Compressed responses that exceed 2 MiB only after decompression.
- Connection and total timeouts.
- HTML, RSS, and Atom classification.
- Invalid UTF-8 rejection.
- DTD and external-entity rejection without network access.

Local test fixtures may use loopback only through an explicit test connector; production policy must still classify loopback as rejected.

### 13.3 Database integration tests

Use migrations and pgTAP/repository integration to verify:

- Exact columns, types, foreign keys, constraints, indexes, and grants.
- RLS denial for anonymous, authenticated, ordinary admin, and browser-visible roles.
- Append-only Raw Item and attempt history.
- Raw Item update/delete rejection, including service identities outside the repository command boundary.
- Endpoint/hash idempotency and command-idempotency behavior.
- Failure attempts contain no response body or arbitrary headers.
- Feed replay does not duplicate discovery versions.
- Transactions do not claim partial persistence as success.

### 13.4 Use-case tests

Cover new HTML, `304`, equal hash, changed content, Feed XML storage, same-authority article fetching, external-domain discovery-only behavior, article-failure isolation, 100-entry discovery budget, 20-body fetch budget, replay, and persistence failure.

## 14. Acceptance Gates

Run the narrowest relevant tests during each RED/GREEN cycle, then run:

```bash
pnpm --filter @airdrop/contracts test
pnpm --filter @airdrop/domain test
pnpm --filter @airdrop/database test
pnpm --filter @airdrop/worker test
pnpm test:db
pnpm verify
```

Completion requires all of the following:

- Every new behavior has observed RED and GREEN evidence.
- All network paths use the same SSRF and redirect policy.
- No credential, arbitrary header set, body from a failed response, or sensitive stack trace is persisted.
- Raw Item and collection histories are append-only, traceable, and idempotent.
- Feed summaries and external-domain discoveries cannot masquerade as article bodies.
- No Raw Item or Discovered Item can bypass Evidence, review, Promotion Service, audit, or outbox boundaries.
- No durable queue, schedule, automatic retry, concurrency engine, AI call, or canonical promotion implementation appears in this scope.
- The full repository quality gate and database integration gate exit successfully.

## 15. Follow-on Work

After this design is implemented and accepted, Phase 2 continues in the established order:

```text
Durable Queue
  -> AI Run and Candidate records
  -> Grounding verification
  -> Deduplication and conflict preservation
  -> Human review
  -> Promotion Service, audit, and transactional outbox
```

Those stages must consume Raw Item IDs and versions rather than embedding full source documents in queue payloads.
