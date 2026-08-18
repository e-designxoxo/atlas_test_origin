# Document Identity

Core fields:
- documentId
- versionId
- fingerprint
- jurisdiction
- authority
- documentType
- reference
- source
- confidence

## Classification dimensions (added 18 Aug 2026)

`documentType` answers "which parser reads this" — a mechanical question.
It does not answer "what legal function does this document perform." Those
are independent dimensions, implemented as per-type defaults in
`schema.js` (`TYPE_DIMENSION_DEFAULTS`) and surfaced on every detection
result by `pipeline.js`:

- `origin` — judicial / legislative / administrative / academic / private / international
- `documentFamily` — judicial-decision / regulatory-instrument / foundational-instrument / legislative-act / international-instrument / private-instrument / scholarship / preparatory-material
- `authorityClass` — primary / secondary / preparatory / non-binding-institutional / private (legal WEIGHT, not source — an administrative-origin regulation is primary; administrative-origin guidance on that regulation is typically non-binding)
- `bindingCharacter` — binding / persuasive / non-binding / enforceable-inter-partes (contracts bind the parties, not third parties)

Known gap: `judgment` defaults to `bindingCharacter: undetermined` because
precedential weight depends on which court, in which jurisdiction, issued
the decision — not modelled yet. A Cour de cassation arrêt and a first-instance
tribunal judgment cannot share a default. This needs a court-hierarchy
registry per jurisdiction before judgments can get a real default here.

Not yet done: these dimensions are DEFAULTS keyed by `type` — no parser
currently overrides them per-document (e.g. detecting that a specific
administrative document is itself a binding regulation rather than
guidance). That override path, and threading these fields through
`identifier.js` and `fiche-generator.js` into the fiche/UI layer, is the
next step, not this one.
