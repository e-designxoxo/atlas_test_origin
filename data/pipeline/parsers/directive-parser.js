/**
 * ATLAS Ingestion Pipeline - Statute Parser
 *
 * Parses statutes and legislative acts into structured, source-grounded legal
 * data.
 *
 * Statute-specific priorities:
 * - detect enactment clause
 * - use sections/articles as core units depending on jurisdiction
 * - preserve parts, divisions, schedules, subsections, and paragraphs
 * - extract short title, act number, jurisdiction, and commencement signals
 */

(function initAtlasStatuteParser(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./_core.js"));
    return;
  }

  if (!root.ATLAS_ParserCore) {
    throw new Error("[statute-parser] ATLAS_ParserCore must be loaded before this module.");
  }

  const parser = factory(root.ATLAS_ParserCore);
  root.ATLAS_DirectiveParser = parser;
  if (root.window) root.window.ATLAS_DirectiveParser = parser;

})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasStatuteParser(CORE) {
  "use strict";

  const VERSION = "1.0.0";
  const DOCUMENT_TYPE = "statute";
  const MIN_CORE_UNIT_COUNT_WARNING = 2;

  const STRUCTURAL_PATTERNS = {
    en: [
      CORE.pattern("part-en", /\b(?:Part|PART)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "PART", match => match[1]),
      CORE.pattern("schedule-en", /\b(?:Schedule|SCHEDULE)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "SCHEDULE", match => match[1], { isAnnex: true }),
      CORE.pattern("division-en", /\b(?:Division|DIVISION)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 1, "DIV", match => match[1]),
      CORE.pattern("section-en", /\b(?:Section|SECTION)\s+(\d+[A-Za-z]?(?:\.\d+)?)\b[\s.\-—:]*([^]*)?$/i, 2, "SEC", match => match[1]),
      CORE.pattern("section-number-en", /^\s*(\d+[A-Za-z]?(?:\.\d+)?)\.\s+(.+)$/i, 2, "SEC", match => match[1]),
      CORE.pattern("subsection-en", /^\s*\((\d{1,3}[a-z]?)\)\s+(.+)$/i, 3, "SUBSEC", match => match[1]),
      CORE.pattern("paragraph-en", /^\s*\(([a-z])\)\s+(.+)$/i, 4, "PARA", match => match[1]),
      CORE.pattern("subparagraph-en", /^\s*\(([ivxlcdm]+)\)\s+(.+)$/i, 5, "SUBPARA", match => match[1])
    ],
    fr: [
      CORE.pattern("part-fr", /\b(?:Partie|PARTIE)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "PART", match => match[1]),
      CORE.pattern("title-fr", /\b(?:Titre|TITRE)\s+([IVXLCDM]+|\d+)(?:er|ère|eme|ème)?\b[\s.\-—:]*([^]*)?$/i, 1, "TITLE", match => match[1]),
      CORE.pattern("chapter-fr", /\b(?:Chapitre|CHAPITRE)\s+([IVXLCDM]+|\d+)(?:er|ère|eme|ème)?\b[\s.\-—:]*([^]*)?$/i, 1, "CH", match => match[1]),
      CORE.pattern("article-fr", /\b(?:Article|ARTICLE|Art\.?)\s+(\d{1,4}(?:er|ère|eme|ème)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater))?)\b[\s.\-—:]*([^]*)?$/i, 2, "ART", match => match[1]),
      CORE.pattern("section-fr", /\b(?:Section|SECTION)\s+(\d+[A-Za-z]?)\b[\s.\-—:]*([^]*)?$/i, 2, "SEC", match => match[1]),
      CORE.pattern("annex-fr", /\b(?:Annexe|ANNEXE)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "ANNEX", match => match[1], { isAnnex: true })
    ],
    de: [
      CORE.pattern("part-de", /\b(?:Teil|TEIL)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "PART", match => match[1]),
      CORE.pattern("section-de", /\b(?:Abschnitt|ABSCHNITT)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 1, "SEC", match => match[1]),
      CORE.pattern("paragraph-de", /\b(?:§|Paragraph|PARAGRAPH)\s*(\d+[A-Za-z]?(?:\s*[A-Za-z])?)\b[\s.\-—:]*([^]*)?$/i, 2, "SEC", match => match[1]),
      CORE.pattern("subsection-de", /^\s*\((\d{1,3}[a-z]?)\)\s+(.+)$/i, 3, "SUBSEC", match => match[1])
    ],
    es: [
      CORE.pattern("title-es", /\b(?:Título|Titulo|TITULO)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 1, "TITLE", match => match[1]),
      CORE.pattern("chapter-es", /\b(?:Capítulo|Capitulo|CAPITULO)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 1, "CH", match => match[1]),
      CORE.pattern("article-es", /\b(?:Artículo|Articulo|ARTICULO|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:°|º)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b[\s.\-—:]*([^]*)?$/i, 2, "ART", match => match[1]),
      CORE.pattern("annex-es", /\b(?:Anexo|ANEXO)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "ANNEX", match => match[1], { isAnnex: true })
    ]
  };

  const ENACTMENT_MARKERS = {
    en: [/\bBe\s+it\s+enacted\s+by\b/i, /\bENACTED\s+by\b/i],
    fr: [/\bEst\s+promulguée\b/i, /\bL'?Assemblée\s+nationale\s+a\s+adopté\b/i],
    de: [/\bhat\s+(?:der\s+)?Bundestag\s+(?:das\s+)?folgende\s+Gesetz\s+beschlossen\b/i, /\bverkündet\b/i],
    es: [/\bLas\s+Cortes\s+Generales\s+han\s+aprobado\b/i, /\bse\s+promulga\b/i]
  };

  const STATUTE_REFERENCE_PATTERNS = {
    en: [
      CORE.referencePattern(/\b(?:section|Section|s\.|ss\.)\s*(\d+[A-Za-z]?(?:\.\d+)?)\b/i, "SEC", "section-reference"),
      CORE.referencePattern(/\b(?:subsection|Subsection|sub-s\.)\s*\(?(\d{1,3}[a-z]?)\)?\b/i, "SUBSEC", "subsection-reference"),
      CORE.referencePattern(/\b(?:schedule|Schedule|Sch\.?)\s+([IVXLCDM]+|\d+|[A-Z])\b/i, "SCHEDULE", "schedule-reference"),
      CORE.referencePattern(/\b(?:part|Part|Pt\.?)\s+([IVXLCDM]+|\d+)\b/i, "PART", "part-reference"),
      CORE.referencePattern(/\b(?:paragraph|para\.?)\s+\(?([ivxlcdm]+|\d+[A-Za-z]?)\)?\b/i, "PARA", "paragraph-reference")
    ],
    fr: [
      CORE.referencePattern(/\b(?:article|Article|Art\.?)\s+(\d{1,4}(?:er)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b/i, "ART", "article-reference"),
      CORE.referencePattern(/\b(?:section|Section)\s+(\d+[A-Za-z]?)\b/i, "SEC", "section-reference"),
      CORE.referencePattern(/\b(?:annexe|Annexe)\s+([IVXLCDM]+|\d+)\b/i, "ANNEX", "annex-reference")
    ],
    de: [
      CORE.referencePattern(/\b(?:§|Paragraph|Abschnitt)\s*(\d+[A-Za-z]?(?:\s*[A-Za-z])?)\b/i, "SEC", "section-reference"),
      CORE.referencePattern(/\b(?:Absatz|Abs\.?)\s*\(?(\d{1,3}[a-z]?)\)?\b/i, "SUBSEC", "subsection-reference")
    ],
    es: [
      CORE.referencePattern(/\b(?:artículo|articulo|Artículo|Articulo|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:°|º)?)\b/i, "ART", "article-reference")
    ]
  };

  function parse(input, options = {}) {
    const startedAt = Date.now();
    const normalized = CORE.normalizeInput(input);
    const language = CORE.getLanguage(options.language || options.detection?.language || "en");
    const warnings = [];
    const text = normalized.normalizedText;

    if (!text || text.length < 50) {
      warnings.push(CORE.makeWarning("EMPTY_TEXT", "Document text is too short for meaningful statute parsing.", { textLength: text.length }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const enactment = detectEnactmentClause(text, language);
    const rawElements = discoverStructure(text, language, normalized.sourceUnits, enactment?.endPosition || 0);

    if (rawElements.length === 0) {
      warnings.push(CORE.makeWarning("NO_STRUCTURE", "No statute sections, articles, parts, divisions, or schedules were detected.", { textLength: text.length, language }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const elements = CORE.extractContent(text, rawElements);
    const coreUnits = elements.filter(element => ["SEC", "ART"].includes(element.type) && !element.isEmpty);
    const hierarchyElements = elements.filter(element => !["SEC", "ART"].includes(element.type) || element.isEmpty);
    const allElements = enactment ? [enactment, ...elements] : elements;
    const references = CORE.scanCrossReferences(
      allElements,
      language,
      STATUTE_REFERENCE_PATTERNS[language] || STATUTE_REFERENCE_PATTERNS.en,
      { allowedSourceTypes: ["ENACTMENT", "SEC", "ART", "SUBSEC", "PARA", "SCHEDULE", "ANNEX"], skipNestedContent: true }
    );
    const metadata = extractMetadata(text, language, normalized.filename);
    const commencement = detectCommencement(elements, text);
    const amendments = detectAmendmentSignals(elements);

    if (coreUnits.length < MIN_CORE_UNIT_COUNT_WARNING) {
      warnings.push(CORE.makeWarning("LOW_CORE_UNIT_COUNT", `Only ${coreUnits.length} core section/article unit(s) were parsed. Source may be incomplete, OCR-damaged, or not a statute.`));
    }

    return {
      version: VERSION,
      documentType: DOCUMENT_TYPE,
      filename: normalized.filename || "",
      metadata,
      enactment,
      preamble: enactment,
      articles: coreUnits,
      hierarchyElements,
      elements,
      hierarchyTree: CORE.buildHierarchyTree(elements),
      references,
      commencement,
      amendments,
      warnings,
      stats: {
        totalArticles: coreUnits.length,
        totalElements: elements.length,
        totalReferences: references.length,
        resolvedReferences: references.filter(reference => reference.resolved).length,
        hasPreamble: Boolean(enactment),
        hasEnactmentClause: Boolean(enactment),
        scheduleCount: elements.filter(element => ["SCHEDULE", "ANNEX"].includes(element.type)).length,
        amendmentCount: amendments.length,
        language,
        durationMs: Date.now() - startedAt
      }
    };
  }

  function discoverStructure(text, language, sourceUnits = [], searchStart = 0) {
    const patterns = STRUCTURAL_PATTERNS[language] || STRUCTURAL_PATTERNS.en;
    const fullText = String(text || "");
    const searchText = fullText.slice(searchStart);
    const lines = searchText.split("\n");
    const elements = [];
    let position = searchStart;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const trimmed = lines[lineIndex].trim();

      if (trimmed) {
        for (const structurePattern of patterns) {
          const match = trimmed.match(structurePattern.regex);
          if (!match || match.index > 8) continue;

          const identifier = structurePattern.extract(match);
          if (!identifier) continue;

          const normalizedId = CORE.normalizeNumber(identifier, language);
          const canonicalId = CORE.canonicalId(structurePattern.prefix, normalizedId);
          const sourceUnit = CORE.findSourceUnitForHeading(trimmed, sourceUnits);

          elements.push({
            id: canonicalId,
            canonicalId,
            type: structurePattern.prefix,
            prefix: structurePattern.prefix,
            level: structurePattern.level,
            identifier: String(identifier).trim(),
            normalizedId,
            sortKey: CORE.sortKey(structurePattern.prefix, normalizedId),
            position,
            endPosition: null,
            lineIndex,
            heading: trimmed,
            shortTitle: extractHeadingTitle(trimmed, identifier),
            content: "",
            isAnnex: Boolean(structurePattern.isAnnex),
            isAmendment: /amend|repeal|modif|abrog/i.test(trimmed),
            isEmpty: true,
            source: CORE.sourceAnchorFromUnit(sourceUnit)
          });

          break;
        }
      }

      position += lines[lineIndex].length + 1;
    }

    return CORE.dedupeBy(elements.sort((a, b) => a.position - b.position), element => `${element.canonicalId}|${element.position}`);
  }

  function detectEnactmentClause(text, language) {
    const markers = ENACTMENT_MARKERS[language] || ENACTMENT_MARKERS.en;
    const firstBlock = String(text || "").slice(0, 3000);

    for (const marker of markers) {
      const match = firstBlock.match(marker);
      if (!match) continue;

      const end = findFirstBodyPosition(text);
      return {
        id: "ENACTMENT",
        canonicalId: "ENACTMENT",
        type: "ENACTMENT",
        level: -1,
        heading: "Enactment Clause",
        content: CORE.extractRegion(text, 0, end),
        position: 0,
        endPosition: end,
        matched: match[0],
        isEmpty: false
      };
    }

    return null;
  }

  function findFirstBodyPosition(text) {
    const match = text.match(/\b(?:Part|PART|Section|SECTION|Schedule|SCHEDULE|Article|ARTICLE)\s+([IVXLCDM]+|\d+)/);
    return match ? match.index : Math.min(1500, text.length);
  }

  function extractMetadata(text, language, filename) {
    const firstBlock = String(text || "").split("\n").slice(0, 35).join("\n");
    const lines = firstBlock.split("\n");
    let title = CORE.titleFromFilename(filename);
    let shortTitle = null;
    let jurisdiction = null;
    let adoptionDate = null;
    let actNumber = null;

    const shortTitleMatch = String(text || "").match(/\bThis\s+Act\s+may\s+be\s+cited\s+as\s+(?:the\s+)?(.+?)(?:\.|\n)/i);
    if (shortTitleMatch) {
      shortTitle = shortTitleMatch[1].trim();
      title = shortTitle;
    }

    const actNumberMatch = firstBlock.match(/\b(?:Act\s+No\.?\s*\d+\s+of\s+\d{4}|Public\s+Law\s+\d{2,3}[-–]\d{1,4})\b/i);
    if (actNumberMatch) actNumber = actNumberMatch[0];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 10 || trimmed.length > 220) continue;
      if (/\b(Act|Statute|Law|Code|Bill)\b/i.test(trimmed) || trimmed === trimmed.toUpperCase()) {
        title = title || trimmed;
        break;
      }
    }

    const jurisdictionPatterns = [
      [/\b(?:United\s+Kingdom|UK|Parliament\s+of\s+the\s+United\s+Kingdom)\b/i, "United Kingdom"],
      [/\b(?:United\s+States|Congress|USC|U\.S\.C\.|Public\s+Law)\b/i, "United States"],
      [/\b(?:Canada|Parliament\s+of\s+Canada)\b/i, "Canada"],
      [/\b(?:Australia|Commonwealth\s+of\s+Australia)\b/i, "Australia"],
      [/\b(?:France|République\s+française|Assemblée\s+nationale|Sénat)\b/i, "France"],
      [/\b(?:Germany|Deutschland|Bundestag|Bundesrepublik)\b/i, "Germany"]
    ];

    const jurisdictionMatch = jurisdictionPatterns.find(([regex]) => regex.test(firstBlock));
    if (jurisdictionMatch) jurisdiction = jurisdictionMatch[1];

    const dateMatch = firstBlock.match(/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i) ||
      firstBlock.match(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/);
    if (dateMatch) adoptionDate = dateMatch[0];

    return {
      title: title || "Untitled Statute",
      shortTitle,
      jurisdiction,
      adoptionDate,
      actNumber,
      language,
      sourceFilename: filename || null
    };
  }

  function detectCommencement(elements, text) {
    const candidates = elements.filter(element =>
      /\b(commencement|coming\s+into\s+force|comes\s+into\s+force|enters\s+into\s+force)\b/i.test(`${element.heading}\n${element.content}`)
    );

    return candidates.map(element => ({
      canonicalId: element.canonicalId,
      heading: element.heading,
      position: element.position,
      context: CORE.preview(element.content || CORE.extractContext(text, element.position, element.heading, 180), 260)
    }));
  }

  function detectAmendmentSignals(elements) {
    return elements
      .filter(element => /\b(amend|repeal|substituted|inserted|omitted|modif|abrog)\b/i.test(`${element.heading}\n${element.content}`))
      .map(element => ({
        canonicalId: element.canonicalId,
        heading: element.heading,
        position: element.position,
        detectedBy: "keyword"
      }));
  }

  function extractHeadingTitle(heading, identifier) {
    const escaped = CORE.escapeRegex(String(identifier || ""));
    const regex = new RegExp(`^(?:PART|Part|SCHEDULE|Schedule|DIVISION|Division|SECTION|Section|ARTICLE|Article|§)\\s*${escaped}\\s*[.\\-—:]*\\s*`, "i");
    const title = String(heading || "").replace(regex, "").trim();
    return title || null;
  }

  function summarize(parsed) {
    const parts = [];
    if (parsed.metadata.title) parts.push(parsed.metadata.title);
    if (parsed.metadata.actNumber) parts.push(parsed.metadata.actNumber);
    parts.push(`${parsed.stats.totalArticles} core unit(s)`);
    if (parsed.stats.hasEnactmentClause) parts.push("enactment clause detected");
    if (parsed.commencement.length > 0) parts.push(`${parsed.commencement.length} commencement signal(s)`);
    return parts.join(" · ");
  }

  return {
    VERSION,
    DOCUMENT_TYPE,
    STRUCTURAL_PATTERNS,
    STATUTE_REFERENCE_PATTERNS,
    parse,
    summarize,
    discoverStructure,
    detectEnactmentClause,
    extractMetadata,
    detectCommencement,
    detectAmendmentSignals
  };
});
