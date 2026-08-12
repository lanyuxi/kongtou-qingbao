# Phase 2 source collection architecture

This phase establishes bounded, evidence-preserving collection primitives for verified official HTTPS sources. It covers pure URL and content policy, pinned-address transport, and strict RSS/Atom parsing. Collection orchestration and runtime activation are outside Task 7.

## Network boundary

Configured collection URLs and every redirect remain subject to the same verified authority-domain set. DNS validation considers the complete answer and rejects it when any address is non-global. The HTTPS adapter then connects through a custom lookup callback pinned to one validated address while retaining the original hostname for TLS SNI and certificate verification. It uses Node's HTTPS implementation directly, disables agent reuse for these requests, and does not consult proxy environment variables.

Node's `net.isIP()` validates textual IP syntax but does not provide the CIDR classification, IPv4-mapped IPv6 conversion, or range semantics required by the SSRF policy. The domain package therefore pins `ipaddr.js` 2.4.0 for security-correct IPv4/IPv6 parsing and classification behind the pure network-policy interface.

## XML parser boundary

Node 22 has no built-in XML parser. The worker pins `saxes` 6.0.0 because it is a strict, namespace-aware, non-validating streaming parser and does not automatically fetch external resources. It is isolated behind the `FeedParser` port so a future implementation can replace it without changing collection use cases.

Feed XML is untrusted input. The adapter rejects dangerous DTD and entity declaration syntax before parsing. During parsing it latches the first error and ignores subsequent parser events; every `doctype` event, unresolved entity or other parse error, XInclude element identified by its namespace, unsupported root, and nesting depth above 64 produces `invalid_feed`. It supplies no external entity or namespace resolver and does not use a DOM.

The transport has already limited decompressed Feed input to 2 MiB. The parser preserves document order, considers only the first 100 entries, extracts only the defined RSS/Atom metadata fields, and bounds values to the `discovered_items` persistence contracts. Content fields are never interpreted as article bodies. Atom `xml:base` can resolve a link into an untrusted URL candidate only; that operation does not establish authority or safety. The later network policy remains responsible for accepting an HTTPS authority URL before any fetch or trusted use.
