/**
 * ATLAS Ingestion Pipeline - Orchestrator
 *
 * Single entry point for document ingestion:
 * extractor -> detector -> parser -> fiche generator.
 *
 * This file belongs in data/pipeline/, not data/pipeline/parsers/.
 * Parsers understand document types; the orchestrator coordinates the product
 * workflow around them.
 */

(function initAtlasPipeline(root, factory) {
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = factory(
      require("./extractor.js"),
      require("./document-detector.js"),
      require("./fiche-generator.js"),
      require("./schema.js"),
      require("./identifier.js"),
      require("./validators.js"),
      {
        constitution: require("./parsers/constitution-parser.js"),
        regulation: require("./parsers/regulation-parser.js"),
        directive: require("./parsers/directive-parser.js"),
        treaty: require("./parsers/treaty-parser.js"),
        statute: require("./parsers/statute-parser.js"),
        judgment: require("./parsers/judgment-parser.js"),
        contract: require("./parsers/contract-parser.js"),
        unknown: require("./parsers/generic-parser.js")
      }
    );
    return;
  }

  root.ATLAS_Pipeline = factory(
    root.ATLAS_Extractor,
    root.ATLAS_DocumentDetector,
    root.ATLAS_FicheGenerator,
    root.ATLAS_Schema,
    root.ATLAS_Identifier,
    root.ATLAS_Validators,
    {
      constitution: root.ATLAS_ConstitutionParser,
      regulation: root.ATLAS_RegulationParser,
      directive: root.ATLAS_DirectiveParser,
      treaty: root.ATLAS_TreatyParser,
      statute: root.ATLAS_StatuteParser,
      judgment: root.ATLAS_JudgmentParser,
      contract: root.ATLAS_ContractParser,
      unknown: root.ATLAS_GenericParser
    }
  );
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasPipeline(extractor, detector, ficheGenerator, schema, identifier, validators, parsers) {
  "use strict";

  const VERSION = "1.0.0";
  const AUTO_ROUTE_CONFIDENCE = 70;
  const REVIEW_ROUTE_CONFIDENCE = 40;

  const STAGES = [
    { id: "extracting", label: "Extracting text", weight: 10 },
    { id: "detecting", label: "Identifying document type", weight: 10 },
    { id: "routing", label: "Selecting parser", weight: 5 },
    { id: "parsing", label: "Parsing document structure", weight: 40 },
    { id: "identifying", label: "Building canonical identity", weight: 10 },
    { id: "generating", label: "Generating fiche", weight: 15 },
    { id: "complete", label: "Complete", weight: 10 }
  ];

  async function process(input, options = {}) {
    const startedAt = Date.now();
    const warnings = [];
    const timing = {};
    const report = createProgressReporter(options.onProgress);

    refreshDependencies();
    const dependencies = checkDependencies();
    if (!dependencies.ready) {
      return failedResult("dependencies", dependencies.message, input, warnings);
    }

    report("extracting", "Reading source text.");
    const extractionStart = Date.now();
    let extraction;
    try {
      extraction = await runExtraction(input, options);
    } catch (error) {
      return failedResult(error.stage || "extraction", error.message, input, warnings);
    }
    timing.extractionMs = Date.now() - extractionStart;
    warnings.push(...normalizeWarnings(extraction.warnings));
    if (validators?.validateExtraction) warnings.push(...validators.validateExtraction(extraction));

    report("detecting", "Scanning legal form signals.");
    const detectionStart = Date.now();
    const detection = runDetection(extraction, options);
    timing.detectionMs = Date.now() - detectionStart;
    warnings.push(...normalizeWarnings(detection.warnings));
    if (validators?.validateDetection) warnings.push(...validators.validateDetection(detection));

    report("routing", "Choosing safest parser.");
    const routing = routeParser(detection, options);
    if (routing.warning) warnings.push(routing.warning);

    report("parsing", `Parsing as ${routing.parserType}.`);
    const parseStart = Date.now();
    let parserOutput;
    try {
      parserOutput = runParser(routing, extraction, detection, options, warnings);
    } catch (error) {
      warnings.push(makeWarning("ALL_PARSERS_FAILED", error.message));
      return {
        version: VERSION,
        stage: "parsing",
        status: "failed",
        fiche: ficheGenerator.generateFallbackFiche(extraction.text || extraction.normalizedText || "", extraction.filename, warnings),
        extraction,
        detection,
        routing,
        identity: null,
        parserOutput: null,
        duplicate: null,
        warnings: dedupeWarnings(warnings),
        error: error.message,
        timing
      };
    }
    timing.parsingMs = Date.now() - parseStart;
    warnings.push(...normalizeWarnings(parserOutput.warnings));
    if (validators?.validateParserOutput) warnings.push(...validators.validateParserOutput(parserOutput));

    report("identifying", "Building canonical identity.");
    const identity = buildIdentity(extraction, detection, routing, parserOutput, options);
    warnings.push(...normalizeWarnings(identity.warnings));
    if (validators?.validateIdentity) warnings.push(...validators.validateIdentity(identity));

    report("generating", "Building workspace fiche.");
    const ficheStart = Date.now();
    const fiche = runFicheGenerator(parserOutput, extraction, detection, routing, identity, options, warnings);
    timing.ficheGenerationMs = Date.now() - ficheStart;
    if (validators?.validateFiche) warnings.push(...validators.validateFiche(fiche));

    const duplicate = checkDuplicates(identity, options.existingLibrary);
    timing.totalMs = Date.now() - startedAt;

    report("complete", "Fiche ready.");

    return {
      version: VERSION,
      stage: "complete",
      status: duplicate ? "duplicate-detected" : "complete",
      fiche,
      extraction,
      detection,
      routing,
      identity,
      parserOutput,
      duplicate,
      warnings: dedupeWarnings(warnings),
      timing
    };
  }

  async function reclassify(extractionOrInput, parserType, options = {}) {
    return process(extractionOrInput, {
      ...options,
      forceParserType: parserType
    });
  }

  async function runExtraction(input, options) {
    if (options.skipExtraction || looksLikeExtraction(input)) {
      return normalizeExtraction(input, options);
    }

    return extractor.extract(input, options.extraction || {});
  }

  function enrichWithDimensions(detectionResult) {
    if (!schema || typeof schema.dimensionDefaultsForType !== "function") return detectionResult;
    const dimensions = schema.dimensionDefaultsForType(detectionResult.type);
    return Object.assign({}, detectionResult, {
      origin: detectionResult.origin || (dimensions && dimensions.origin) || null,
      documentFamily: detectionResult.documentFamily || (dimensions && dimensions.documentFamily) || null,
      authorityClass: detectionResult.authorityClass || (dimensions && dimensions.authorityClass) || null,
      bindingCharacter: detectionResult.bindingCharacter || (dimensions && dimensions.bindingCharacter) || null
    });
  }

  function runDetection(extraction, options) {
    if (options.forceParserType || options.confirmedType) {
      const type = normalizeParserType(options.forceParserType || options.confirmedType);
      return enrichWithDimensions({
        version: detector.VERSION || null,
        type,
        label: labelForType(type),
        parser: type,
        confidence: 100,
        decision: options.forceParserType ? "forced" : "user-confirmed",
        language: options.language || "en",
        filename: extraction.filename || "",
        signals: [],
        allScores: [],
        warnings: []
      });
    }

    return enrichWithDimensions(detector.detect(extraction, { filename: extraction.filename }));
  }

  function routeParser(detectionResult = {}, options = {}) {
    const requestedType = normalizeParserType(options.forceParserType || options.confirmedType || detectionResult.type || "unknown");
    const confidence = detectionResult.confidence || 0;
    const decision = detectionResult.decision || "unknown";
    let parserType = "unknown";
    let reason = "fallback";
    let autoRouted = false;
    let warning = null;

    if (options.forceParserType || options.confirmedType || decision === "forced" || decision === "user-confirmed") {
      parserType = requestedType;
      reason = options.forceParserType ? "forced" : "user-confirmed";
      autoRouted = false;
    } else if (decision === "auto" && confidence >= AUTO_ROUTE_CONFIDENCE) {
      parserType = requestedType;
      reason = "auto";
      autoRouted = true;
    } else if (confidence >= REVIEW_ROUTE_CONFIDENCE && parsers[requestedType]) {
      parserType = requestedType;
      reason = "review-suggested";
      autoRouted = true;
      warning = makeWarning("ROUTED_WITH_REVIEW", `Parser selected with ${confidence}% confidence; human review is recommended.`);
    } else {
      parserType = "unknown";
      reason = "generic-fallback";
      warning = makeWarning("GENERIC_ROUTING", "Document type was not confident enough for a specialized parser; generic parser selected.");
    }

    if (!parsers[parserType]) {
      warning = makeWarning("PARSER_NOT_AVAILABLE", `Parser "${parserType}" is not available; generic parser selected.`);
      parserType = "unknown";
      reason = "missing-parser";
    }

    const runnerUp = Array.isArray(detectionResult.allScores) && detectionResult.allScores.length > 1
      ? detectionResult.allScores[1]
      : null;

    return {
      parser: parsers[parserType] || parsers.unknown,
      parserType,
      requestedType,
      confidence,
      decision,
      reason,
      autoRouted,
      warning,
      suggestion: runnerUp ? {
        alternativeType: runnerUp.type,
        alternativeLabel: runnerUp.label,
        alternativeScore: runnerUp.score || runnerUp.confidence || 0
      } : null
    };
  }

  function runParser(routing, extraction, detection, options, warnings) {
    const parser = routing.parser || parsers.unknown;
    const language = options.language || detection.language || extraction.language || "en";

    try {
      return parser.parse(extraction, { language, detection, routing });
    } catch (error) {
      warnings.push(makeWarning("PARSER_FAILED", `${routing.parserType} parser failed: ${error.message}`));
      if (routing.parserType === "unknown" || !parsers.unknown) throw error;

      const fallback = parsers.unknown.parse(extraction, { language, detection, routing: { ...routing, parserType: "unknown", reason: "parser-error-fallback" } });
      fallback.warnings = normalizeWarnings(fallback.warnings).concat(makeWarning("SPECIALIZED_PARSER_FALLBACK", "Generic parser used after specialized parser failure."));
      return fallback;
    }
  }

  function buildIdentity(extraction, detection, routing, parserOutput, options) {
    if (identifier && typeof identifier.buildIdentity === "function") {
      return identifier.buildIdentity({ extraction, detection, routing, parserOutput, options });
    }

    const text = extraction.normalizedText || extraction.text || extraction.rawText || "";
    const fingerprint = `fp-${String(text.length)}-${String(text).slice(0, 24).replace(/\W+/g, "-")}`;
    return {
      schemaVersion: "atlas.identity.v1",
      identityVersion: "atlas.identity.v1",
      canonicalId: `${routing.parserType || "unknown"}-${fingerprint}`,
      fingerprint,
      displayTitle: parserOutput.metadata?.title || extraction.filename || "Untitled Legal Document",
      shortTitle: parserOutput.metadata?.shortTitle || parserOutput.metadata?.title || extraction.filename || "Untitled",
      documentType: parserOutput.documentType || routing.parserType || "unknown",
      jurisdiction: parserOutput.metadata?.jurisdiction || "Unknown",
      authority: parserOutput.metadata?.court || parserOutput.metadata?.body || "Unknown",
      date: parserOutput.metadata?.adoptionDate || parserOutput.metadata?.judgmentDate || "Unknown",
      reference: parserOutput.metadata?.caseNumber || parserOutput.metadata?.regulationNumber || "Unknown",
      sourceFilename: extraction.filename || "",
      confidence: { detection: detection.confidence || 0, identity: 20 },
      warnings: [makeWarning("IDENTIFIER_FALLBACK", "Canonical identity module was not available.")]
    };
  }

  function runFicheGenerator(parserOutput, extraction, detection, routing, identity, options, warnings) {
    try {
      return ficheGenerator.generate(parserOutput, {
        language: options.language || detection.language || parserOutput.stats?.language || "en",
        detection,
        routing,
        identity,
        filename: extraction.filename,
        warnings
      });
    } catch (error) {
      warnings.push(makeWarning("FICHE_GENERATION_FAILED", error.message));
      return ficheGenerator.generateFallbackFiche(extraction.text || extraction.normalizedText || "", extraction.filename, warnings);
    }
  }

  function checkDependencies() {
    refreshDependencies();
    const missing = [];
    if (!extractor || typeof extractor.extract !== "function") missing.push("extractor");
    if (!detector || typeof detector.detect !== "function") missing.push("document-detector");
    if (!ficheGenerator || typeof ficheGenerator.generate !== "function") missing.push("fiche-generator");
    if (!schema || !schema.SCHEMA_VERSIONS) missing.push("schema");
    if (!identifier || typeof identifier.buildIdentity !== "function") missing.push("identifier");
    if (!validators || typeof validators.validateIdentity !== "function") missing.push("validators");
    if (!parsers || !parsers.unknown || typeof parsers.unknown.parse !== "function") missing.push("generic-parser");

    return {
      ready: missing.length === 0,
      missing,
      message: missing.length ? `Missing pipeline dependency: ${missing.join(", ")}.` : "Pipeline dependencies ready."
    };
  }

  function refreshDependencies() {
    const root = typeof globalThis !== "undefined" ? globalThis : null;
    if (!root) return;

    extractor = extractor || root.ATLAS_Extractor;
    detector = detector || root.ATLAS_DocumentDetector;
    ficheGenerator = ficheGenerator || root.ATLAS_FicheGenerator;
    schema = schema || root.ATLAS_Schema;
    identifier = identifier || root.ATLAS_Identifier;
    validators = validators || root.ATLAS_Validators;
    parsers = parsers || {};
    parsers.constitution = parsers.constitution || root.ATLAS_ConstitutionParser;
    parsers.regulation = parsers.regulation || root.ATLAS_RegulationParser;
    parsers.directive = parsers.directive || root.ATLAS_DirectiveParser;
    parsers.treaty = parsers.treaty || root.ATLAS_TreatyParser;
    parsers.statute = parsers.statute || root.ATLAS_StatuteParser;
    parsers.judgment = parsers.judgment || root.ATLAS_JudgmentParser;
    parsers.contract = parsers.contract || root.ATLAS_ContractParser;
    parsers.unknown = parsers.unknown || root.ATLAS_GenericParser;
  }

  function checkDuplicates(identityOrMetadata, existingLibrary) {
    if (!Array.isArray(existingLibrary) || existingLibrary.length === 0) return null;

    const metadata = identityOrMetadata || {};
    const fingerprint = normalizeComparable(metadata.fingerprint);
    const canonicalId = normalizeComparable(metadata.canonicalId);
    const title = normalizeComparable(metadata.displayTitle || metadata.title);
    const ref = normalizeComparable(metadata.reference || metadata.regulationNumber || metadata.directiveNumber || metadata.caseNumber || metadata.actNumber);

    for (const existing of existingLibrary) {
      const existingMetadata = existing.metadata || existing;
      const existingFingerprint = normalizeComparable(existingMetadata.fingerprint || existingMetadata.identity?.fingerprint);
      const existingCanonicalId = normalizeComparable(existingMetadata.canonicalId || existingMetadata.identity?.canonicalId);
      const existingTitle = normalizeComparable(existingMetadata.displayTitle || existingMetadata.title);
      const existingRef = normalizeComparable(existingMetadata.reference || existingMetadata.regulationNumber || existingMetadata.directiveNumber || existingMetadata.caseNumber || existingMetadata.actNumber);

      if (fingerprint && existingFingerprint && fingerprint === existingFingerprint) return existing;
      if (canonicalId && existingCanonicalId && canonicalId === existingCanonicalId) return existing;
      if (ref && existingRef && ref === existingRef) return existing;
      if (title && existingTitle && title === existingTitle) return existing;
      if (title && existingTitle && title.length > 20 && stringSimilarity(title, existingTitle) > 0.82) return existing;
    }

    return null;
  }

  function createProgressReporter(onProgress) {
    const totalWeight = STAGES.reduce((sum, stage) => sum + stage.weight, 0);

    return function report(stageId, detail) {
      const index = STAGES.findIndex(stage => stage.id === stageId);
      if (index < 0 || typeof onProgress !== "function") return;

      const completed = STAGES.slice(0, index).reduce((sum, stage) => sum + stage.weight, 0);
      const progress = stageId === "complete" ? 100 : Math.min(99, Math.round((completed / totalWeight) * 100));
      const stage = STAGES[index];

      onProgress({
        stageId,
        stageLabel: stage.label,
        progress,
        detail: detail || "",
        timestamp: Date.now()
      });
    };
  }

  function failedResult(stage, message, input, warnings) {
    const filename = input && typeof input === "object" ? input.name || input.filename || "" : "";
    const allWarnings = dedupeWarnings(warnings.concat(makeWarning(stage.toUpperCase(), message)));

    return {
      version: VERSION,
      stage,
      status: "failed",
      fiche: ficheGenerator && typeof ficheGenerator.generateFallbackFiche === "function"
        ? ficheGenerator.generateFallbackFiche("", filename, allWarnings)
        : null,
      extraction: null,
      detection: null,
      routing: null,
      identity: null,
      parserOutput: null,
      duplicate: null,
      warnings: allWarnings,
      error: message,
      timing: {}
    };
  }

  function stageError(stage, error) {
    error.stage = stage;
    return error;
  }

  function looksLikeExtraction(input) {
    return Boolean(input && typeof input === "object" && (input.normalizedText || input.text || input.rawText) && (input.extractionMethod || input.sourceUnits || input.filename));
  }

  function normalizeExtraction(input, options) {
    const text = input.normalizedText || input.text || input.rawText || "";
    return {
      version: input.version || null,
      filename: input.filename || options.filename || "",
      size: input.size || text.length,
      extension: input.extension || "",
      mimeType: input.mimeType || "",
      format: input.format || "text/plain",
      extractionMethod: input.extractionMethod || "pre-extracted",
      rawText: input.rawText || text,
      normalizedText: text,
      text,
      sourceUnits: Array.isArray(input.sourceUnits) ? input.sourceUnits : [],
      warnings: normalizeWarnings(input.warnings),
      stats: input.stats || {}
    };
  }

  function normalizeParserType(type) {
    const clean = String(type || "unknown").toLowerCase().trim();
    if (clean === "judgement") return "judgment";
    if (clean === "eu-regulation") return "regulation";
    if (clean === "eu-directive") return "directive";
    return clean || "unknown";
  }

  function labelForType(type) {
    const labels = {
      constitution: "Constitution",
      regulation: "EU Regulation",
      directive: "EU Directive",
      treaty: "Treaty",
      statute: "Statute / Act",
      judgment: "Judgment / Decision",
      contract: "Contract / Agreement",
      unknown: "Legal Document"
    };
    return labels[type] || labels.unknown;
  }

  function normalizeWarnings(warnings) {
    return (Array.isArray(warnings) ? warnings : warnings ? [warnings] : []).map(warning => {
      if (typeof warning === "string") return makeWarning("WARNING", warning);
      return {
        code: warning.code || "WARNING",
        message: warning.message || String(warning),
        details: warning.details || warning.meta || null
      };
    });
  }

  function dedupeWarnings(warnings) {
    const seen = new Set();
    const unique = [];

    for (const warning of normalizeWarnings(warnings)) {
      const key = `${warning.code}|${warning.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(warning);
    }

    return unique;
  }

  function makeWarning(code, message, details = null) {
    return { code, message, details };
  }

  function normalizeComparable(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function stringSimilarity(a, b) {
    const wordsA = new Set(String(a || "").split(/\s+/).filter(word => word.length > 2));
    const wordsB = new Set(String(b || "").split(/\s+/).filter(word => word.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection += 1;
    }

    return intersection / Math.max(wordsA.size, wordsB.size);
  }

  return {
    VERSION,
    STAGES,
    process,
    reclassify,
    routeParser,
    checkDependencies,
    checkDuplicates
  };
});
