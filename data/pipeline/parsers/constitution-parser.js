/**
 * ATLAS Ingestion Pipeline - Constitution Parser
 *
 * Parses constitutional documents into structured, source-grounded legal data.
 *
 * Depends on: parsers/_core.js
 *
 * Design contract:
 * - only constitution-specific logic lives here
 * - shared mechanics come from ATLAS_ParserCore
 * - every structural element keeps source position and, when possible, source
 *   unit provenance from extractor.js
 */

(function initAtlasConstitutionParser(root, factory) {
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = factory(require("./_core.js"));
    return;
  }

  if (!root.ATLAS_ParserCore) {
    throw new Error("[constitution-parser] ATLAS_ParserCore must be loaded before this module.");
  }

  root.ATLAS_ConstitutionParser = factory(root.ATLAS_ParserCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasConstitutionParser(CORE) {
  "use strict";

  const VERSION = "1.1.0";
  const DOCUMENT_TYPE = "constitution";
  const MIN_ARTICLE_COUNT_WARNING = 3;

  const STRUCTURAL_PATTERNS = {
    en: [
      CORE.pattern("preamble-en", /\b(Preamble)\b/i, -1, "PREAMBLE", () => "PREAMBLE"),
      CORE.pattern("part-en", /\b(Part|PART)\s+([IVXLCDM]+|\d+)\b\.?/i, 0, "PART", match => match[2]),
      CORE.pattern("schedule-en", /\b(Schedule|SCHEDULE)\s+([IVXLCDM]+|\d+)\b\.?/i, 0, "SCHEDULE", match => match[2], { isAnnex: true }),
      CORE.pattern("amendment-en", /\b(Amendment|AMENDMENT)\s+([IVXLCDM]+|\d+)\b\.?/i, 0, "AMEND", match => match[2], { isAmendment: true }),
      CORE.pattern("title-en", /\b(Title|TITLE)\s+([IVXLCDM]+|\d+)\b\.?/i, 1, "TITLE", match => match[2]),
      CORE.pattern("chapter-en", /\b(Chapter|CHAPTER)\s+([IVXLCDM]+|\d+)\b\.?/i, 2, "CH", match => match[2]),
      CORE.pattern("section-en", /\b(Section|SECTION)\s+(\d+[A-Za-z]?)\b\.?/i, 3, "SEC", match => match[2]),
      CORE.pattern("article-en", /\b(Article|ARTICLE)\s+([IVXLCDM]+|\d{1,4}[A-Za-z]?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\b\.?/i, 4, "ART", match => match[2]),
      CORE.pattern("clause-en", /\b(Clause|CLAUSE)\s+(\d+[A-Za-z]?)\b\.?/i, 5, "CL", match => match[2])
    ],
    fr: [
      CORE.pattern("preamble-fr", /\b(Préambule|Preambule)\b/i, -1, "PREAMBLE", () => "PREAMBLE"),
      CORE.pattern("partie-fr", /\b(Partie|PARTIE)\s+([IVXLCDM]+|\d+)\b\.?/i, 0, "PART", match => match[2]),
      CORE.pattern("titre-fr", /\b(Titre|TITRE)\s+([IVXLCDM]+|\d+)(?:er|ère|eme|ème)?\b\.?/i, 1, "TITLE", match => match[2]),
      CORE.pattern("chapitre-fr", /\b(Chapitre|CHAPITRE)\s+([IVXLCDM]+|\d+)(?:er|ère|eme|ème)?\b\.?/i, 2, "CH", match => match[2]),
      CORE.pattern("section-fr", /\b(Section|SECTION)\s+(\d+[A-Za-z]?)\b\.?/i, 3, "SEC", match => match[2]),
      CORE.pattern("article-fr", /\b(Article|ARTICLE|Art\.?)\s+(\d{1,4}(?:er|ère|eme|ème)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\b\.?/i, 4, "ART", match => match[2])
    ],
    de: [
      CORE.pattern("preamble-de", /\b(Präambel|Praambel)\b/i, -1, "PREAMBLE", () => "PREAMBLE"),
      CORE.pattern("title-de", /\b(Titel|TITEL)\s+([IVXLCDM]+|\d+)\b\.?/i, 1, "TITLE", match => match[2]),
      CORE.pattern("chapter-de", /\b(Kapitel|KAPITEL)\s+([IVXLCDM]+|\d+)\b\.?/i, 2, "CH", match => match[2]),
      CORE.pattern("section-de", /\b(Abschnitt|ABSCHNITT)\s+([IVXLCDM]+|\d+)\b\.?/i, 3, "SEC", match => match[2]),
      CORE.pattern("article-de", /\b(Artikel|ARTIKEL|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b\.?/i, 4, "ART", match => match[2])
    ],
    es: [
      CORE.pattern("preamble-es", /\b(Preámbulo|Preambulo)\b/i, -1, "PREAMBLE", () => "PREAMBLE"),
      CORE.pattern("part-es", /\b(Parte|PARTE)\s+([IVXLCDM]+|\d+)\b\.?/i, 0, "PART", match => match[2]),
      CORE.pattern("title-es", /\b(Título|Titulo|TITULO)\s+([IVXLCDM]+|\d+)\b\.?/i, 1, "TITLE", match => match[2]),
      CORE.pattern("chapter-es", /\b(Capítulo|Capitulo|CAPITULO)\s+([IVXLCDM]+|\d+)\b\.?/i, 2, "CH", match => match[2]),
      CORE.pattern("section-es", /\b(Sección|Seccion|SECCION)\s+(\d+[A-Za-z]?)\b\.?/i, 3, "SEC", match => match[2]),
      CORE.pattern("article-es", /\b(Artículo|Articulo|ARTICULO|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:°|º)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b\.?/i, 4, "ART", match => match[2])
    ]
  };

  const PREAMBLE_INDICATORS = {
    en: ["preamble", "we the people", "in the name of", "ordain and establish", "do ordain", "hereby adopt", "have adopted", "establish this constitution", "recognizing", "affirming", "proclaim", "declare", "solemnly", "fundamental rights", "human dignity"],
    fr: ["préambule", "preambule", "au nom du", "proclame", "déclare", "le peuple", "la nation", "adopté", "solennellement", "droits de l'homme", "libertés fondamentales", "dignité humaine"],
    de: ["präambel", "praambel", "im namen", "verabschiedet", "verkündet", "das volk", "die nation", "grundgesetz", "verfassung", "menschenwürde", "grundrechte"],
    es: ["preámbulo", "preambulo", "en el nombre", "proclama", "declara", "el pueblo", "la nación", "adoptado", "solemnemente", "derechos fundamentales", "dignidad humana"]
  };

  const AMENDMENT_INDICATORS = {
    en: ["amendment", "amended by", "constitutional law", "constitutional amendment", "revised by", "modification", "revision"],
    fr: ["amendement", "modification", "révision", "loi constitutionnelle", "modifié par", "révisé par", "abrogé"],
    de: ["änderung", "änderungsgesetz", "verfassungsänderung", "geändert", "novelle", "revision", "aufgehoben"],
    es: ["enmienda", "modificación", "revisión", "reforma constitucional", "modificado por", "derogado"]
  };

  const CONSTITUTION_REFERENCE_PATTERNS = {
    en: [
      CORE.referencePattern(/\b(?:pursuant\s+to|under|according\s+to|provided\s+in|referred\s+to\s+in)\s+(?:Amendment|AMENDMENT)\s+([IVXLCDM]+|\d+)\b/i, "AMEND", "amendment-reference")
    ],
    fr: [],
    de: [],
    es: []
  };

  function parse(input, options = {}) {
    const startedAt = Date.now();
    const normalized = CORE.normalizeInput(input);
    const language = CORE.getLanguage(options.language || options.detection?.language || "en");
    const warnings = [];
    const text = normalized.normalizedText;

    if (!text || text.length < 50) {
      warnings.push(CORE.makeWarning("EMPTY_TEXT", "Document text is too short for meaningful constitution parsing.", { textLength: text.length }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const rawElements = discoverStructure(text, language, normalized.sourceUnits);

    if (rawElements.length === 0) {
      warnings.push(CORE.makeWarning("NO_STRUCTURE", "No constitutional structure elements were detected.", { textLength: text.length, language }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const elements = CORE.extractContent(text, rawElements);
    const preamble = detectPreamble(text, elements, language);
    const allElements = preamble ? [preamble, ...elements] : elements;
    const references = CORE.scanCrossReferences(
      allElements,
      language,
      CONSTITUTION_REFERENCE_PATTERNS[language] || CONSTITUTION_REFERENCE_PATTERNS.en,
      { allowedSourceTypes: ["ART", "SEC", "CL"], skipNestedContent: true }
    );
    const amendments = detectAmendments(text, elements, language);
    const metadata = extractMetadata(text, language, normalized.filename);
    const articles = elements.filter(element => element.type === "ART" && !element.isEmpty);
    const hierarchyElements = elements.filter(element => element.type !== "ART" || element.isEmpty);

    if (articles.length < MIN_ARTICLE_COUNT_WARNING) {
      warnings.push(CORE.makeWarning("LOW_ARTICLE_COUNT", `Only ${articles.length} article(s) were parsed. Source may be incomplete, OCR-damaged, or not a constitution.`));
    }

    return {
      version: VERSION,
      documentType: DOCUMENT_TYPE,
      filename: normalized.filename || "",
      metadata,
      preamble,
      articles,
      hierarchyElements,
      elements,
      hierarchyTree: CORE.buildHierarchyTree(elements),
      references,
      amendments,
      warnings,
      stats: {
        totalArticles: articles.length,
        totalElements: elements.length,
        totalReferences: references.length,
        resolvedReferences: references.filter(reference => reference.resolved).length,
        hasPreamble: Boolean(preamble),
        amendmentCount: amendments.length,
        language,
        durationMs: Date.now() - startedAt
      }
    };
  }

  function discoverStructure(text, language, sourceUnits = []) {
    const patterns = STRUCTURAL_PATTERNS[language] || STRUCTURAL_PATTERNS.en;
    const lines = String(text || "").split("\n");
    const elements = [];
    let position = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const trimmed = line.trim();

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
            level: getEffectiveLevel(structurePattern, identifier),
            identifier: String(identifier).trim(),
            normalizedId,
            sortKey: CORE.sortKey(structurePattern.prefix, normalizedId),
            position,
            endPosition: null,
            lineIndex,
            heading: trimmed,
            content: "",
            isAnnex: Boolean(structurePattern.isAnnex),
            isAmendment: Boolean(structurePattern.isAmendment),
            isEmpty: true,
            source: CORE.sourceAnchorFromUnit(sourceUnit)
          });

          break;
        }
      }

      position += line.length + 1;
    }

    return dedupeStructure(elements.sort((a, b) => a.position - b.position));
  }

  function getEffectiveLevel(structurePattern, identifier) {
    if (structurePattern.prefix === "ART" && /^[IVXLCDM]+$/i.test(String(identifier || ""))) {
      return 1;
    }

    return structurePattern.level;
  }

  function dedupeStructure(elements) {
    const result = [];

    for (const element of elements) {
      const previous = result[result.length - 1];

      if (previous && previous.lineIndex === element.lineIndex) {
        if (element.level > previous.level || (element.type === "PREAMBLE" && previous.type !== "PREAMBLE")) {
          result[result.length - 1] = element;
        }
        continue;
      }

      const duplicate = result.find(existing =>
        existing.canonicalId === element.canonicalId &&
        Math.abs(existing.position - element.position) < 25
      );

      if (!duplicate) result.push(element);
    }

    return result;
  }

  function detectPreamble(text, structureElements, language) {
    const indicators = PREAMBLE_INDICATORS[language] || PREAMBLE_INDICATORS.en;
    const firstBody = structureElements.find(element => element.level >= 0 && !element.isAnnex && !element.isAmendment);
    const preambleEnd = firstBody ? firstBody.position : Math.min(3000, text.length);
    const content = CORE.extractRegion(text, 0, preambleEnd);

    if (content.length < 50) return null;

    const lowerContent = content.toLowerCase();
    const matched = indicators.filter(indicator => lowerContent.includes(indicator.toLowerCase()));
    if (matched.length === 0 && content.length < 500) return null;

    return {
      id: "PREAMBLE",
      canonicalId: "PREAMBLE",
      type: "PREAMBLE",
      level: -1,
      heading: CORE.extractFirstLine(content, 180) || "Preamble",
      content,
      position: 0,
      endPosition: preambleEnd,
      indicators: matched,
      confidence: Math.min(95, 45 + Math.min(matched.length, 5) * 10 + (content.length > 500 ? 10 : 0))
    };
  }

  function extractMetadata(text, language, filename) {
    const fullText = String(text || "");
    const firstLines = fullText.split("\n").slice(0, 20);
    const firstBlock = firstLines.join("\n");
    const canonical = detectCanonicalConstitution(fullText);

    if (canonical) {
      return {
        ...canonical,
        language,
        sourceFilename: filename || null
      };
    }

    return {
      title: detectTitle(firstLines) || CORE.titleFromFilename(filename) || "Untitled Constitution",
      jurisdiction: detectJurisdiction(firstBlock),
      adoptionDate: detectDate(firstBlock),
      language,
      sourceFilename: filename || null
    };
  }

  function detectCanonicalConstitution(text) {
    const sample = String(text || "").slice(0, 24000);

    if (isUsConstitutionCanonicalText(sample)) {
      return {
        title: "Constitution of the United States",
        shortTitle: "U.S. Constitution",
        jurisdiction: "United States",
        authority: "Constituent authority",
        adoptionDate: "17 September 1787",
        dateForce: "21 June 1788",
        status: "In force, as amended",
        reference: "US-CONST"
      };
    }

    if (/\bConstitution\s+du\s+4\s+octobre\s+1958\b/i.test(sample)) {
      return {
        title: "Constitution du 4 octobre 1958",
        shortTitle: "Constitution française",
        jurisdiction: "France",
        authority: "Constituent authority",
        adoptionDate: "4 octobre 1958",
        status: "In force, as amended",
        reference: "FR-CONST-1958"
      };
    }

    return null;
  }

  function isUsConstitutionCanonicalText(sample) {
    const text = String(sample || "");
    const hasFullPreamble = /\bWe\s+the\s+People\s+of\s+the\s+United\s+States\b/i.test(text);
    const hasPreambleTail = /\bsecure\s+the\s+Blessings\s+of\s+Liberty\b/i.test(text) &&
      /\bordain\s+and\s+establish\s+this\s+Constitution\s+for\s+the\s+United\b/i.test(text);
    const hasInstitutionalArticles = /\bArticle\s+I\b/i.test(text) &&
      /\bArticle\s+II\b/i.test(text) &&
      /\bArticle\s+III\b/i.test(text);
    const hasBillOfRights = /\bAmendment\s+I\b/i.test(text) &&
      /\bAmendment\s+II\b/i.test(text) &&
      /\bAmendment\s+III\b/i.test(text);

    return (hasFullPreamble || hasPreambleTail) &&
      /\bConstitution\b/i.test(text) &&
      /\bUnited\s+States(?:\s+of\s+America)?\b/i.test(text) &&
      (hasInstitutionalArticles || hasBillOfRights);
  }

  function detectTitle(lines) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 10 || trimmed.length > 220) continue;
      if (/^(Article|Section|Part|Chapter|Title|Titre|Chapitre|Artículo|Artikel)\b/i.test(trimmed)) continue;
      if (looksLikeConstitutionPreambleFragment(trimmed)) continue;

      const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, "");
      const uppercase = trimmed.replace(/[^A-ZÀ-Ý]/g, "");
      const upperRatio = uppercase.length / Math.max(letters.length, 1);

      if (upperRatio > 0.45 || /constitution|grundgesetz|constitución/i.test(trimmed)) return trimmed;
    }

    return null;
  }

  function looksLikeConstitutionPreambleFragment(text) {
    return /\b(?:we\s+the\s+people|in\s+order\s+to|more\s+perfect\s+union|establish\s+justice|domestic\s+tranquility|common\s+defence|general\s+welfare|blessings\s+of\s+liberty|do\s+ordain|establish\s+this\s+constitution)\b/i.test(String(text || ""));
  }

  function detectJurisdiction(text) {
    const patterns = [
      [/\b(France|République\s+française|French)\b/i, "France"],
      [/\b(United\s+States|United\s+States\s+of\s+America|America)\b/i, "United States"],
      [/\b(Germany|Deutschland|Bundesrepublik\s+Deutschland)\b/i, "Germany"],
      [/\b(Spain|España|Reino\s+de\s+España)\b/i, "Spain"],
      [/\b(India|Republic\s+of\s+India|Bharat)\b/i, "India"],
      [/\b(Canada|Canadian)\b/i, "Canada"],
      [/\b(Australia|Commonwealth\s+of\s+Australia)\b/i, "Australia"]
    ];

    const match = patterns.find(([regex]) => regex.test(text));
    return match ? match[1] : null;
  }

  function detectDate(text) {
    const patterns = [
      /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,
      /\b\d{1,2}\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}\b/i,
      /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/,
      /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/
    ];

    for (const regex of patterns) {
      const match = text.match(regex);
      if (match) return match[0];
    }

    return null;
  }

  function detectAmendments(text, elements, language) {
    const indicators = AMENDMENT_INDICATORS[language] || AMENDMENT_INDICATORS.en;
    const amendments = elements
      .filter(element => element.isAmendment)
      .map(element => ({
        id: element.canonicalId,
        canonicalId: element.canonicalId,
        type: "AMENDMENT",
        heading: element.heading,
        position: element.position,
        detectedBy: "structure"
      }));

    const lines = String(text || "").split("\n");
    let position = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      const lower = line.toLowerCase();
      const matched = indicators.filter(indicator => lower.includes(indicator.toLowerCase()));

      if (matched.length > 0 && CORE.looksLikeHeading(line)) {
        const duplicate = amendments.some(amendment => Math.abs(amendment.position - position) < 120);
        if (!duplicate) {
          amendments.push({
            id: `AMENDMENT-${String(amendments.length + 1).padStart(4, "0")}`,
            canonicalId: null,
            type: "AMENDMENT",
            heading: line,
            position,
            detectedBy: "keyword",
            indicators: matched
          });
        }
      }

      position += lines[index].length + 1;
    }

    return amendments;
  }

  function summarize(parsed) {
    const parts = [];
    if (parsed.metadata.title) parts.push(parsed.metadata.title);
    if (parsed.metadata.jurisdiction) parts.push(`Jurisdiction: ${parsed.metadata.jurisdiction}`);
    parts.push(`${parsed.stats.totalArticles} article(s)`);
    if (parsed.stats.hasPreamble) parts.push("preamble detected");
    if (parsed.stats.amendmentCount > 0) parts.push(`${parsed.stats.amendmentCount} amendment marker(s)`);
    parts.push(`${parsed.stats.totalReferences} cross-reference(s)`);
    parts.push(`language: ${parsed.stats.language}`);
    return parts.join(" · ");
  }

  return {
    VERSION,
    DOCUMENT_TYPE,
    STRUCTURAL_PATTERNS,
    PREAMBLE_INDICATORS,
    AMENDMENT_INDICATORS,
    parse,
    summarize,
    discoverStructure,
    detectPreamble,
    extractMetadata,
    detectAmendments
  };
});
