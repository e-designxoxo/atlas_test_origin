/**
 * ATLAS Ingestion Pipeline - Parser Core
 *
 * Shared infrastructure for all document-type parsers.
 *
 * Pipeline position:
 *
 *   extractor.js -> document-detector.js -> parser.js -> parsers/* -> fiche-generator.js
 *
 * This module is not a parser. It is the common toolkit used by parsers for
 * constitutions, regulations, directives, treaties, statutes, judgments,
 * contracts, and unknown legal documents.
 *
 * Design contract:
 * - keep document-specific legal assumptions out of this file
 * - preserve source traceability from extractor.js
 * - normalize legal identifiers consistently across document types
 * - return stable structures that can later support search, notes, citations,
 *   concept matching, relationship building, and machine-learning layers
 */

(function initAtlasParserCore(root, factory) {
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = factory();
    return;
  }

  root.ATLAS_ParserCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasParserCore() {
  "use strict";

  const VERSION = "1.1.0";
  const DEFAULT_LANGUAGE = "en";

  const BIS_SUFFIXES = {
    bis: "BIS",
    ter: "TER",
    quater: "QUATER",
    quinquies: "QUINQUIES",
    sexies: "SEXIES",
    septies: "SEPTIES",
    octies: "OCTIES",
    novies: "NOVIES",
    decies: "DECIES"
  };

  const LANGUAGE_DATA = {
    en: {
      ordinalWords: {
        first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
        sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
        eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
        sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20
      },
      ordinalSuffixes: ["st", "nd", "rd", "th"],
      articlePrefixes: ["article", "art.", "art"]
    },
    fr: {
      ordinalWords: {
        premier: 1, premiere: 1, "première": 1,
        deuxieme: 2, "deuxième": 2, second: 2, seconde: 2,
        troisieme: 3, "troisième": 3, quatrieme: 4, "quatrième": 4,
        cinquieme: 5, "cinquième": 5, sixieme: 6, "sixième": 6,
        septieme: 7, "septième": 7, huitieme: 8, "huitième": 8,
        neuvieme: 9, "neuvième": 9, dixieme: 10, "dixième": 10,
        onzieme: 11, "onzième": 11, douzieme: 12, "douzième": 12,
        treizieme: 13, "treizième": 13, quatorzieme: 14, "quatorzième": 14,
        quinzieme: 15, "quinzième": 15, seizieme: 16, "seizième": 16,
        vingtieme: 20, "vingtième": 20
      },
      ordinalSuffixes: ["er", "ere", "ère", "eme", "ème", "e"],
      articlePrefixes: ["article", "art.", "art"]
    },
    de: {
      ordinalWords: {
        erste: 1, zweite: 2, dritte: 3, vierte: 4, funfte: 5, "fünfte": 5,
        sechste: 6, siebte: 7, achte: 8, neunte: 9, zehnte: 10,
        elfte: 11, zwolfte: 12, "zwölfte": 12, dreizehnte: 13,
        vierzehnte: 14, funfzehnte: 15, "fünfzehnte": 15,
        sechzehnte: 16, siebzehnte: 17, achtzehnte: 18, neunzehnte: 19,
        zwanzigste: 20
      },
      ordinalSuffixes: ["te", "ste"],
      articlePrefixes: ["artikel", "art."]
    },
    es: {
      ordinalWords: {
        primero: 1, primera: 1, segundo: 2, segunda: 2,
        tercero: 3, tercera: 3, cuarto: 4, cuarta: 4,
        quinto: 5, quinta: 5, sexto: 6, sexta: 6,
        septimo: 7, "séptimo": 7, septima: 7, "séptima": 7,
        octavo: 8, octava: 8, noveno: 9, novena: 9,
        decimo: 10, "décimo": 10, decima: 10, "décima": 10
      },
      ordinalSuffixes: ["°", "º"],
      articlePrefixes: ["articulo", "artículo", "art."]
    }
  };

  const SHARED_REFERENCE_PATTERNS = {
    en: [
      referencePattern(/\b(?:Article|ARTICLE|Art\.?)\s+([IVXLCDM]+|\d{1,4}[A-Za-z]?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\b/i, "ART", "article-reference"),
      referencePattern(/\b(?:Section|SECTION|Sec\.?|§)\s*(\d+[A-Za-z]?(?:\.\d+)?)\b/i, "SEC", "section-reference"),
      referencePattern(/\b(?:Chapter|CHAPTER|Ch\.?)\s+([IVXLCDM]+|\d+)\b/i, "CH", "chapter-reference"),
      referencePattern(/\b(?:Title|TITLE|Tit\.?)\s+([IVXLCDM]+|\d+)\b/i, "TITLE", "title-reference"),
      referencePattern(/\b(?:Part|PART|Pt\.?)\s+([IVXLCDM]+|\d+)\b/i, "PART", "part-reference"),
      referencePattern(/\b(?:paragraph|paragraphs?|para\.?|¶)\s*(\d+[A-Za-z]?)\b/i, "PARA", "paragraph-reference"),
      referencePattern(/\b(?:clause|clauses?|cl\.?)\s+(\d+[A-Za-z]?)\b/i, "CL", "clause-reference"),
      referencePattern(/\b(?:schedule|schedules?|sch\.?)\s+([IVXLCDM]+|\d+)\b/i, "SCHEDULE", "schedule-reference")
    ],
    fr: [
      referencePattern(/\b(?:article|Article|Art\.?)\s+(\d{1,4}(?:er)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\b/i, "ART", "article-reference"),
      referencePattern(/\b(?:titre|Titre)\s+([IVXLCDM]+|\d+)(?:er)?\b/i, "TITLE", "title-reference"),
      referencePattern(/\b(?:chapitre|Chapitre)\s+([IVXLCDM]+|\d+)(?:er)?\b/i, "CH", "chapter-reference"),
      referencePattern(/\b(?:section|Section)\s+(\d+[A-Za-z]?)\b/i, "SEC", "section-reference"),
      referencePattern(/\b(?:alinéa|alinea|alinéas|alineas)\s+(\d+[A-Za-z]?)\b/i, "PARA", "paragraph-reference")
    ],
    de: [
      referencePattern(/\b(?:Artikel|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b/i, "ART", "article-reference"),
      referencePattern(/\b(?:Abschnitt)\s+([IVXLCDM]+|\d+)\b/i, "SEC", "section-reference"),
      referencePattern(/\b(?:Absatz|Abs\.?|Absätze|Absaetze)\s+(\d+[A-Za-z]?)\b/i, "PARA", "paragraph-reference"),
      referencePattern(/\b(?:Satz)\s+(\d+)\b/i, "SENTENCE", "sentence-reference")
    ],
    es: [
      referencePattern(/\b(?:artículo|articulo|Artículo|Articulo|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:°|º)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b/i, "ART", "article-reference"),
      referencePattern(/\b(?:título|titulo|Título|Titulo)\s+([IVXLCDM]+|\d+)\b/i, "TITLE", "title-reference"),
      referencePattern(/\b(?:capítulo|capitulo|Capítulo|Capitulo)\s+([IVXLCDM]+|\d+)\b/i, "CH", "chapter-reference"),
      referencePattern(/\b(?:sección|seccion|Sección|Seccion)\s+(\d+[A-Za-z]?)\b/i, "SEC", "section-reference"),
      referencePattern(/\b(?:apartado|apartados?)\s+(\d+[A-Za-z]?)\b/i, "PARA", "paragraph-reference")
    ]
  };

  function normalizeInput(input) {
    if (typeof input === "string") {
      return {
        text: normalizeText(input),
        rawText: input,
        normalizedText: normalizeText(input),
        filename: "",
        sourceUnits: [],
        format: "text"
      };
    }

    if (input && typeof input === "object") {
      const text = input.normalizedText || input.text || input.rawText || "";
      return {
        text: normalizeText(text),
        rawText: input.rawText || input.text || text,
        normalizedText: normalizeText(text),
        filename: input.filename || "",
        sourceUnits: Array.isArray(input.sourceUnits) ? input.sourceUnits : [],
        format: input.format || null,
        extractionMethod: input.extractionMethod || null,
        stats: input.stats || null
      };
    }

    return {
      text: "",
      rawText: "",
      normalizedText: "",
      filename: "",
      sourceUnits: [],
      format: null,
      extractionMethod: null,
      stats: null
    };
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\u00A0/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getLanguage(language, supportedLanguages = Object.keys(LANGUAGE_DATA)) {
    return supportedLanguages.includes(language) ? language : DEFAULT_LANGUAGE;
  }

  function getLanguageData(language) {
    return LANGUAGE_DATA[getLanguage(language)] || LANGUAGE_DATA[DEFAULT_LANGUAGE];
  }

  function normalizeNumber(raw, languageOrOptions = DEFAULT_LANGUAGE) {
    if (raw === null || raw === undefined || raw === "") return "0000";

    const options = typeof languageOrOptions === "string"
      ? { language: languageOrOptions }
      : { ...languageOrOptions };
    const languageData = getLanguageData(options.language || DEFAULT_LANGUAGE);
    const ordinalWords = {
      ...languageData.ordinalWords,
      ...(options.ordinalWords || {})
    };
    let cleaned = String(raw).trim();

    cleaned = cleaned.replace(/[.,;:]+$/g, "");
    cleaned = stripOrdinalSuffix(cleaned, languageData.ordinalSuffixes);

    const bisMatch = cleaned.match(/^(\d+)\s*(bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)$/i);
    if (bisMatch) {
      const suffix = BIS_SUFFIXES[bisMatch[2].toLowerCase()];
      return `${normalizeSingleNumber(bisMatch[1], ordinalWords)}-${suffix}`;
    }

    if (/[-–—]/.test(cleaned)) {
      return cleaned
        .split(/[-–—]/)
        .map(part => normalizeSingleNumber(part, ordinalWords))
        .join("-");
    }

    return normalizeSingleNumber(cleaned, ordinalWords);
  }

  function normalizeSingleNumber(raw, ordinalWords = LANGUAGE_DATA.en.ordinalWords) {
    const value = String(raw || "").trim();
    if (!value) return "0000";

    const lower = value.toLowerCase();
    if (ordinalWords[lower] !== undefined) {
      return String(ordinalWords[lower]).padStart(4, "0");
    }

    const alpha = value.match(/^(\d+)([A-Za-z])$/);
    if (alpha) {
      return `${String(Number(alpha[1])).padStart(4, "0")}${alpha[2].toLowerCase()}`;
    }

    if (/^\d+$/.test(value)) {
      return String(Number(value)).padStart(4, "0");
    }

    if (isRomanNumeral(value)) {
      const roman = romanToInt(value);
      if (roman !== null) return String(roman).padStart(4, "0");
    }

    return value.toUpperCase();
  }

  function romanToInt(raw) {
    const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    const text = String(raw || "").toUpperCase();
    let total = 0;
    let previous = 0;

    for (let index = text.length - 1; index >= 0; index -= 1) {
      const current = values[text[index]];
      if (!current) return null;

      if (current < previous) {
        total -= current;
      } else {
        total += current;
        previous = current;
      }
    }

    return total > 0 && total <= 4000 ? total : null;
  }

  function isRomanNumeral(raw) {
    const text = String(raw || "").toUpperCase().trim();
    if (!/^[IVXLCDM]+$/.test(text)) return false;
    return /^(M{0,4})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(text);
  }

  function canonicalId(prefix, normalizedNumber) {
    if (prefix === "PREAMBLE") return "PREAMBLE";
    if (!prefix || !normalizedNumber) return "UNKNOWN";
    return `${prefix}-${normalizedNumber}`;
  }

  function sortKey(prefix, normalizedNumber) {
    if (!normalizedNumber) return `${prefix}-0000`;
    return `${prefix}-${String(normalizedNumber)
      .replace(/BIS$/, "0998")
      .replace(/TER$/, "0999")
      .replace(/QUATER$/, "1000")
      .replace(/QUINQUIES$/, "1001")
      .replace(/SEXIES$/, "1002")
      .replace(/SEPTIES$/, "1003")
      .replace(/OCTIES$/, "1004")
      .replace(/NOVIES$/, "1005")
      .replace(/DECIES$/, "1006")}`;
  }

  function parseCanonicalId(id) {
    if (!id || typeof id !== "string") return null;
    if (id === "PREAMBLE") {
      return {
        prefix: "PREAMBLE",
        normalizedNumber: "PREAMBLE",
        baseNumber: "PREAMBLE",
        suffix: null
      };
    }

    const parts = id.split("-");
    if (parts.length < 2) return null;

    const suffixes = Object.values(BIS_SUFFIXES);
    const last = parts[parts.length - 1];
    const hasSuffix = suffixes.includes(last);
    const numberParts = parts.slice(1);

    return {
      prefix: parts[0],
      normalizedNumber: numberParts.join("-"),
      baseNumber: hasSuffix ? numberParts.slice(0, -1).join("-") : numberParts.join("-"),
      suffix: hasSuffix ? last : null
    };
  }

  function pattern(id, regex, level, prefix, extract, flags = {}) {
    return {
      id,
      regex,
      level,
      prefix,
      extract,
      ...flags
    };
  }

  function referencePattern(regex, targetPrefix, referenceType) {
    return {
      regex,
      targetPrefix,
      referenceType
    };
  }

  function extractContent(text, elements, options = {}) {
    if (!Array.isArray(elements) || elements.length === 0) return [];

    const fullText = String(text || "");
    const emptyThreshold = options.emptyThreshold || 20;

    return elements.map((element, index) => {
      const headingLength = element.heading ? element.heading.length : 0;
      const start = Number(element.position || 0) + headingLength;
      const end = findElementEnd(fullText.length, elements, index);
      const rawContent = normalizeText(fullText.slice(start, end));

      return {
        ...element,
        content: rawContent,
        endPosition: end,
        charLength: rawContent.length,
        wordCount: countWords(rawContent),
        isEmpty: rawContent.length < emptyThreshold,
        index
      };
    });
  }

  function findElementEnd(textLength, elements, index) {
    const current = elements[index];

    for (let nextIndex = index + 1; nextIndex < elements.length; nextIndex += 1) {
      const next = elements[nextIndex];
      if (next.level <= current.level && next.level >= 0) return next.position;
      if (current.type === next.type && current.level === next.level) return next.position;
    }

    return textLength;
  }

  function extractRegion(text, startPosition = 0, endPosition = null) {
    const fullText = String(text || "");
    const start = Math.max(0, Number(startPosition || 0));
    const end = endPosition === null ? fullText.length : Math.min(fullText.length, Number(endPosition));
    return normalizeText(fullText.slice(start, end));
  }

  function scanCrossReferences(elements, language = DEFAULT_LANGUAGE, additionalPatterns = [], options = {}) {
    if (!Array.isArray(elements) || elements.length === 0) return [];

    const patterns = getSharedReferencePatterns(language).concat(additionalPatterns || []);
    const knownIds = new Set(elements.map(element => element.canonicalId).filter(Boolean));
    const references = [];

    for (const element of elements) {
      if (!element.content || element.isEmpty) continue;
      if (options.allowedSourceTypes && !options.allowedSourceTypes.includes(element.type)) continue;
      if (options.skipNestedContent && hasNestedStructuralContent(element, elements)) continue;

      for (const refPattern of patterns) {
        const regex = cloneRegex(refPattern.regex);
        let match;

        while ((match = regex.exec(element.content)) !== null) {
          const targetIdentifier = match[1] || match[2];
          if (!targetIdentifier) continue;

          const normalizedTarget = normalizeNumber(targetIdentifier, language);
          const targetCanonicalId = canonicalId(refPattern.targetPrefix, normalizedTarget);
          if (targetCanonicalId === element.canonicalId) continue;

          references.push({
            sourceId: element.canonicalId,
            sourceType: element.type,
            sourceHeading: element.heading || null,
            targetIdentifier: targetIdentifier.trim(),
            targetPrefix: refPattern.targetPrefix,
            normalizedTarget,
            targetCanonicalId,
            resolved: knownIds.has(targetCanonicalId),
            targetExists: knownIds.has(targetCanonicalId),
            referenceType: refPattern.referenceType,
            context: extractContext(element.content, match.index, match[0], options.contextRadius || 80),
            position: Number(element.position || 0) + match.index
          });

          if (match[0].length === 0) regex.lastIndex += 1;
        }
      }
    }

    return dedupeBy(references, reference =>
      `${reference.sourceId}|${reference.targetCanonicalId}|${reference.position}`
    );
  }

  function getSharedReferencePatterns(language = DEFAULT_LANGUAGE) {
    const selected = SHARED_REFERENCE_PATTERNS[getLanguage(language)] || SHARED_REFERENCE_PATTERNS[DEFAULT_LANGUAGE];
    return selected.map(item => ({ ...item }));
  }

  function hasNestedStructuralContent(element, elements) {
    return elements.some(candidate =>
      candidate.position > element.position &&
      candidate.position < element.endPosition &&
      candidate.level > element.level
    );
  }

  function buildHierarchyTree(elements) {
    if (!Array.isArray(elements) || elements.length === 0) return [];

    const root = [];
    const stack = [{ level: -2, children: root }];

    for (const element of elements) {
      const node = {
        ...element,
        children: []
      };

      while (stack.length > 1 && stack[stack.length - 1].level >= element.level) {
        stack.pop();
      }

      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }

    return root;
  }

  function flattenTree(tree, depth = 0) {
    const result = [];

    for (const node of tree || []) {
      const { children, ...rest } = node;
      result.push({
        ...rest,
        depth,
        childCount: Array.isArray(children) ? children.length : 0
      });

      if (Array.isArray(children) && children.length > 0) {
        result.push(...flattenTree(children, depth + 1));
      }
    }

    return result;
  }

  function findSourceUnitForHeading(heading, sourceUnits) {
    if (!heading || !Array.isArray(sourceUnits) || sourceUnits.length === 0) return null;

    const normalizedHeading = normalizeText(heading).toLowerCase();
    return sourceUnits.find(unit => {
      const text = normalizeText(unit.text || "").toLowerCase();
      return text === normalizedHeading || text.startsWith(normalizedHeading);
    }) || null;
  }

  function sourceAnchorFromUnit(sourceUnit) {
    if (!sourceUnit) {
      return {
        sourceUnitId: null,
        filename: null,
        htmlId: null,
        pageNumber: null
      };
    }

    return {
      sourceUnitId: sourceUnit.id || null,
      filename: sourceUnit.source?.filename || null,
      htmlId: sourceUnit.source?.htmlId || null,
      pageNumber: sourceUnit.source?.pageNumber || null
    };
  }

  function titleFromFilename(filename) {
    if (!filename) return null;
    return filename
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function extractHeadingFromContent(content, fallback) {
    return extractFirstLine(content, 180) || fallback;
  }

  function extractFirstLine(text, maxLength = 200) {
    const lines = String(text || "").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 3 && trimmed.length <= maxLength) return trimmed;
    }
    return null;
  }

  function looksLikeHeading(line) {
    if (!line || line.length > 180) return false;
    if (/^\d+[.)]\s+/.test(line)) return true;

    const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (!letters) return false;

    const uppercase = line.replace(/[^A-ZÀ-Ý]/g, "");
    return uppercase.length / letters.length > 0.45;
  }

  function countWords(text) {
    return String(text || "").split(/\s+/).filter(Boolean).length;
  }

  function preview(text, maxLength = 300) {
    const value = String(text || "").trim();
    if (value.length <= maxLength) return value;

    const truncated = value.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > maxLength * 0.7) return `${truncated.slice(0, lastSpace)}...`;
    return `${truncated}...`;
  }

  function makeWarning(code, message, details = {}) {
    return {
      code,
      message,
      ...details
    };
  }

  function createEmptyParseResult(options = {}) {
    const startedAt = options.startedAt || Date.now();
    const language = options.language || DEFAULT_LANGUAGE;

    return {
      version: options.version || VERSION,
      documentType: options.documentType || "unknown",
      filename: options.filename || "",
      metadata: {
        title: options.title || "Untitled Legal Document",
        jurisdiction: options.jurisdiction || null,
        adoptionDate: options.adoptionDate || null,
        language,
        sourceFilename: options.filename || null
      },
      preamble: null,
      articles: [],
      hierarchyElements: [],
      elements: [],
      hierarchyTree: [],
      references: [],
      amendments: [],
      warnings: options.warnings || [],
      stats: {
        totalArticles: 0,
        totalElements: 0,
        totalReferences: 0,
        resolvedReferences: 0,
        hasPreamble: false,
        amendmentCount: 0,
        language,
        durationMs: Date.now() - startedAt
      }
    };
  }

  function stripOrdinalSuffix(value, suffixes = []) {
    if (!suffixes.length) return value;
    const escaped = suffixes.map(escapeRegex).join("|");
    return value.replace(new RegExp(`^(\\d+)\\s*(?:${escaped})$`, "i"), "$1");
  }

  function cloneRegex(regex) {
    const flags = new Set((regex.flags || "").split(""));
    flags.add("g");
    return new RegExp(regex.source, Array.from(flags).join(""));
  }

  function extractContext(text, position, matchText, radius = 80) {
    const start = Math.max(0, position - radius);
    const end = Math.min(String(text || "").length, position + String(matchText || "").length + radius);
    return String(text || "").slice(start, end).replace(/\s+/g, " ").trim();
  }

  function dedupeBy(items, keyFactory) {
    const seen = new Set();
    return (items || []).filter(item => {
      const key = keyFactory(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  return {
    VERSION,
    DEFAULT_LANGUAGE,
    BIS_SUFFIXES,
    LANGUAGE_DATA,
    SHARED_REFERENCE_PATTERNS,
    normalizeInput,
    normalizeText,
    getLanguage,
    getLanguageData,
    normalizeNumber,
    normalizeSingleNumber,
    romanToInt,
    isRomanNumeral,
    canonicalId,
    sortKey,
    parseCanonicalId,
    pattern,
    referencePattern,
    extractContent,
    findElementEnd,
    extractRegion,
    scanCrossReferences,
    getSharedReferencePatterns,
    hasNestedStructuralContent,
    buildHierarchyTree,
    flattenTree,
    findSourceUnitForHeading,
    sourceAnchorFromUnit,
    titleFromFilename,
    extractHeadingFromContent,
    extractFirstLine,
    looksLikeHeading,
    countWords,
    wordCount: countWords,
    preview,
    makeWarning,
    createEmptyParseResult,
    cloneRegex,
    extractContext,
    dedupeBy,
    escapeRegex
  };
});
