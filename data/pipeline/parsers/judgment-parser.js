/**
 * ATLAS Ingestion Pipeline - Judgment Parser
 *
 * Parses judicial decisions, tribunal rulings, court judgments, and arbitral
 * awards into structured, source-grounded legal data.
 *
 * Judgment-specific priorities:
 * - extract case header, court, case number, parties, and judgment date
 * - preserve section headings and numbered paragraphs
 * - identify disposition / holding / order signals
 * - detect separate opinions without treating them as majority reasoning
 * - preserve citations and references for source-grounded analysis
 */

(function initAtlasJudgmentParser(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./_core.js"));
    return;
  }

  if (!root.ATLAS_ParserCore) {
    throw new Error("[judgment-parser] ATLAS_ParserCore must be loaded before this module.");
  }

  root.ATLAS_JudgmentParser = factory(root.ATLAS_ParserCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasJudgmentParser(CORE) {
  "use strict";

  const VERSION = "1.0.0";
  const DOCUMENT_TYPE = "judgment";
  const MIN_PARAGRAPH_COUNT_WARNING = 2;

  const STRUCTURAL_PATTERNS = {
    en: [
      CORE.pattern("section-en", /^\s*(Facts|Background|Procedural\s+History|Legal\s+Context|Issues|Questions?\s+Presented|Reasoning|Analysis|Discussion|Findings|Conclusion|Disposition|Holding|Order|Costs)\s*$/i, 0, "SECT", match => match[1]),
      CORE.pattern("paragraph-bracket-en", /^\s*\[(\d{1,4})\]\s+(.+)$/i, 2, "PARA", match => match[1]),
      CORE.pattern("paragraph-number-en", /^\s*(\d{1,4})\.\s+(.+)$/i, 2, "PARA", match => match[1]),
      CORE.pattern("subpara-en", /^\s*\(([a-z]|[ivxlcdm]+)\)\s+(.+)$/i, 3, "SUBPARA", match => match[1])
    ],
    fr: [
      CORE.pattern("section-fr", /^\s*(Faits|Contexte|Procédure|Procedure|Moyens|Motifs|Dispositif|Dépens|Depens)\s*$/i, 0, "SECT", match => match[1]),
      CORE.pattern("paragraph-bracket-fr", /^\s*\[(\d{1,4})\]\s+(.+)$/i, 2, "PARA", match => match[1]),
      CORE.pattern("paragraph-number-fr", /^\s*(\d{1,4})\.\s+(.+)$/i, 2, "PARA", match => match[1])
    ],
    de: [
      CORE.pattern("section-de", /^\s*(Sachverhalt|Tatbestand|Entscheidungsgründe|Entscheidungsgruende|Gründe|Gruende|Tenor|Kosten)\s*$/i, 0, "SECT", match => match[1]),
      CORE.pattern("paragraph-bracket-de", /^\s*\[(\d{1,4})\]\s+(.+)$/i, 2, "PARA", match => match[1]),
      CORE.pattern("paragraph-number-de", /^\s*(\d{1,4})\.\s+(.+)$/i, 2, "PARA", match => match[1])
    ],
    es: [
      CORE.pattern("section-es", /^\s*(Hechos|Antecedentes|Fundamentos|Considerandos|Fallo|Costas)\s*$/i, 0, "SECT", match => match[1]),
      CORE.pattern("paragraph-bracket-es", /^\s*\[(\d{1,4})\]\s+(.+)$/i, 2, "PARA", match => match[1]),
      CORE.pattern("paragraph-number-es", /^\s*(\d{1,4})\.\s+(.+)$/i, 2, "PARA", match => match[1])
    ]
  };

  const HEADER_PATTERNS = {
    en: [/\b(?:JUDGMENT|JUDGEMENT|ORDER|DECISION|RULING|OPINION)\s+(?:OF\s+)?(?:THE\s+)?(?:COURT|TRIBUNAL|CHAMBER)\b/i, /\b(?:v\.|vs\.|versus)\b/i],
    fr: [/\b(?:ARRÊT|ARRET|JUGEMENT|ORDONNANCE|DÉCISION|DECISION)\s+(?:DE\s+LA\s+)?(?:COUR|TRIBUNAL|CHAMBRE)\b/i, /\b(?:c\.|c\/|contre)\b/i],
    de: [/\b(?:URTEIL|BESCHLUSS|ENTSCHEIDUNG)\s+(?:DES|DER)\s+(?:GERICHTS|GERICHTSHOFS|KAMMER)\b/i, /\b(?:gegen|g\.|\.\/\.)\b/i],
    es: [/\b(?:SENTENCIA|AUTO|DECISIÓN|DECISION)\s+(?:DEL|DE\s+LA)\s+(?:TRIBUNAL|CORTE|SALA)\b/i, /\b(?:c\.|c\/|contra)\b/i]
  };

  const JUDGMENT_REFERENCE_PATTERNS = {
    en: [
      CORE.referencePattern(/\b(?:paragraph|para\.?)\s+\[?(\d{1,4})\]?\b/i, "PARA", "paragraph-reference"),
      CORE.referencePattern(/\b(?:Case|CASE)\s+(?:No\.?|C-)?(\d+\/\d+\s*(?:P)?)\b/i, "CASE", "case-reference"),
      CORE.referencePattern(/\b(?:Article|ARTICLE)\s+([IVXLCDM]+|\d{1,4}[A-Za-z]?)\b/i, "ART", "article-reference")
    ],
    fr: [
      CORE.referencePattern(/\b(?:point|paragraphe)\s+\[?(\d{1,4})\]?\b/i, "PARA", "paragraph-reference"),
      CORE.referencePattern(/\b(?:affaire|Affaire)\s+(C-?\d+\/\d+)\b/i, "CASE", "case-reference")
    ],
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
      warnings.push(CORE.makeWarning("EMPTY_TEXT", "Document text is too short for meaningful judgment parsing.", { textLength: text.length }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const header = detectCaseHeader(text, language);
    const rawElements = discoverStructure(text, language, normalized.sourceUnits);

    if (rawElements.length === 0) {
      warnings.push(CORE.makeWarning("NO_STRUCTURE", "No judgment sections or numbered paragraphs were detected.", { textLength: text.length, language }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const elements = hydrateInlineParagraphContent(CORE.extractContent(text, rawElements, { emptyThreshold: 5 }));
    const paragraphs = elements.filter(element => element.type === "PARA" && !element.isEmpty);
    const hierarchyElements = elements.filter(element => element.type !== "PARA" || element.isEmpty);
    const separateOpinions = detectSeparateOpinions(text, language);
    const disposition = detectDisposition(text, elements, language);
    const metadata = extractMetadata(text, language, normalized.filename, header);
    const allElements = header ? [header, ...elements] : elements;
    const references = CORE.scanCrossReferences(
      allElements,
      language,
      JUDGMENT_REFERENCE_PATTERNS[language] || JUDGMENT_REFERENCE_PATTERNS.en,
      { allowedSourceTypes: ["HEADER", "SECT", "PARA", "SUBPARA"], skipNestedContent: false }
    );

    if (paragraphs.length < MIN_PARAGRAPH_COUNT_WARNING) {
      warnings.push(CORE.makeWarning("LOW_PARAGRAPH_COUNT", `Only ${paragraphs.length} numbered paragraph(s) were parsed. Source may be incomplete, OCR-damaged, or not a judgment.`));
    }
    if (!metadata.court && !metadata.caseNumber) {
      warnings.push(CORE.makeWarning("WEAK_CASE_METADATA", "No clear court or case number was detected."));
    }

    return {
      version: VERSION,
      documentType: DOCUMENT_TYPE,
      filename: normalized.filename || "",
      metadata,
      header,
      preamble: header,
      articles: paragraphs,
      hierarchyElements,
      elements,
      hierarchyTree: CORE.buildHierarchyTree(elements),
      references,
      disposition,
      separateOpinions,
      amendments: [],
      warnings,
      stats: {
        totalArticles: paragraphs.length,
        totalElements: elements.length,
        totalReferences: references.length,
        resolvedReferences: references.filter(reference => reference.resolved).length,
        hasPreamble: Boolean(header),
        hasHeader: Boolean(header),
        hasDisposition: Boolean(disposition),
        separateOpinionCount: separateOpinions.length,
        amendmentCount: 0,
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
      const trimmed = lines[lineIndex].trim();
      if (trimmed) {
        for (const structurePattern of patterns) {
          const match = trimmed.match(structurePattern.regex);
          if (!match) continue;
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
            shortTitle: match[2] ? match[2].trim() : null,
            inlineText: match[2] ? match[2].trim() : "",
            content: "",
            isAnnex: false,
            isAmendment: false,
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

  function detectCaseHeader(text, language) {
    const firstBlock = String(text || "").slice(0, 5000);
    const score = (HEADER_PATTERNS[language] || HEADER_PATTERNS.en).filter(regex => regex.test(firstBlock)).length;
    if (score === 0) return null;

    const endMatch = text.match(/\b(?:Facts|Background|Procedural\s+History|The\s+facts|Introduction|Faits|Motifs|Hechos|Sachverhalt)\b/i) ||
      text.match(/^\s*\[?\d{1,4}\]?\s+/m);
    const end = endMatch ? endMatch.index : Math.min(3000, text.length);
    const content = CORE.extractRegion(text, 0, end);

    return {
      id: "HEADER",
      canonicalId: "HEADER",
      type: "HEADER",
      level: -1,
      heading: "Case Header",
      content,
      position: 0,
      endPosition: end,
      caseReference: extractCaseNumber(firstBlock),
      isEmpty: content.length < 20,
      score
    };
  }

  function detectParties(text, language) {
    const firstBlock = String(text || "").slice(0, 5000);
    const patterns = {
      en: [/\b([A-Z][A-Za-z0-9\s,.&'-]+?)\s+(?:v\.?|vs\.?|versus)\s+([A-Z][A-Za-z0-9\s,.&'-]+?)\b(?:\n|$)/i],
      fr: [/\b([A-Z][A-Za-z0-9\s,.&'-]+?)\s+(?:c\.?|c\/|contre)\s+([A-Z][A-Za-z0-9\s,.&'-]+?)\b(?:\n|$)/i]
    };

    for (const regex of patterns[language] || patterns.en) {
      const match = firstBlock.match(regex);
      if (match) {
        return {
          detected: true,
          applicant: cleanParty(match[1]),
          respondent: cleanParty(match[2]),
          matchText: match[0].trim()
        };
      }
    }

    const applicant = firstBlock.match(/\b(?:Applicant|Appellant|Claimant|Plaintiff|Petitioner)\s*:\s*(.+?)(?:\n|$)/i);
    const respondent = firstBlock.match(/\b(?:Respondent|Defendant|Appellee)\s*:\s*(.+?)(?:\n|$)/i);
    if (applicant || respondent) {
      return {
        detected: true,
        applicant: applicant ? cleanParty(applicant[1]) : null,
        respondent: respondent ? cleanParty(respondent[1]) : null,
        matchText: null
      };
    }

    return { detected: false, applicant: null, respondent: null, matchText: null };
  }

  function detectSeparateOpinions(text, language) {
    const patterns = {
      en: [
        { regex: /\b(?:dissenting|Dissenting)\s+(?:opinion|Opinion)\b/g, type: "dissenting" },
        { regex: /\b(?:concurring|Concurring)\s+(?:opinion|Opinion)\b/g, type: "concurring" },
        { regex: /\b(?:separate|Separate)\s+(?:opinion|Opinion)\b/g, type: "separate" },
        { regex: /\bopinion\s+of\s+(?:Judge|Justice|Advocate\s+General)\b/gi, type: "other" }
      ],
      fr: [
        { regex: /\bopinion\s+dissidente\b/gi, type: "dissenting" },
        { regex: /\bopinion\s+concordante\b/gi, type: "concurring" },
        { regex: /\b(?:opinion\s+séparée|opinion\s+separee|conclusions\s+de\s+l'?Avocat\s+Général)\b/gi, type: "other" }
      ]
    };

    const opinions = [];
    for (const { regex, type } of patterns[language] || patterns.en) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        opinions.push({ type, heading: match[0], position: match.index });
        if (match[0].length === 0) regex.lastIndex += 1;
      }
    }
    return opinions;
  }

  function detectDisposition(text, elements, language) {
    const dispositionRegex = {
      en: /\b(?:For\s+these\s+reasons|The\s+Court\s+(?:orders|holds|declares)|It\s+is\s+ordered|appeal\s+is\s+(?:allowed|dismissed)|claim\s+is\s+(?:allowed|dismissed))\b/i,
      fr: /\b(?:Par\s+ces\s+motifs|La\s+Cour\s+(?:déclare|ordonne)|rejette|annule)\b/i,
      de: /\b(?:Aus\s+diesen\s+Gründen|Tenor|Die\s+Klage\s+wird)\b/i,
      es: /\b(?:Por\s+estos\s+motivos|Fallo|El\s+Tribunal\s+(?:declara|ordena))\b/i
    };

    const regex = dispositionRegex[language] || dispositionRegex.en;
    const element = elements.find(candidate => regex.test(`${candidate.heading}\n${candidate.content}`));
    if (element) {
      return {
        canonicalId: element.canonicalId,
        heading: element.heading,
        position: element.position,
        context: CORE.preview(`${element.heading} ${element.content}`, 500)
      };
    }

    const match = text.match(regex);
    if (!match) return null;
    return {
      canonicalId: null,
      heading: match[0],
      position: match.index,
      context: CORE.extractContext(text, match.index, match[0], 220)
    };
  }

  function extractMetadata(text, language, filename, header = null) {
    const firstBlock = String(text || "").split("\n").slice(0, 45).join("\n");
    const court = extractCourt(firstBlock);
    const caseNumber = header?.caseReference || extractCaseNumber(firstBlock);
    const judgmentDate = extractDate(firstBlock);
    const parties = detectParties(text, language);
    const title = buildCaseTitle(parties, court, filename);

    return {
      title,
      court,
      caseNumber,
      judgmentDate,
      adoptionDate: judgmentDate,
      parties,
      language,
      sourceFilename: filename || null
    };
  }

  function extractCourt(text) {
    const patterns = [
      /\bJUDGMENT\s+OF\s+THE\s+(COURT|TRIBUNAL|CHAMBER)\b/i,
      /\b(Court\s+of\s+(?:Justice|Appeal|First\s+Instance|Cassation)|Supreme\s+Court|Constitutional\s+Court|High\s+Court|District\s+Court|European\s+Court\s+of\s+(?:Justice|Human\s+Rights)|International\s+Court\s+of\s+Justice|Arbitral\s+Tribunal)\b/i,
      /\b(Cour\s+(?:de\s+(?:justice|cassation)|d'appel|européenne)|Conseil\s+d'État|Conseil\s+constitutionnel)\b/i,
      /\b(Bundesgerichtshof|Bundesverfassungsgericht|Oberlandesgericht|Landgericht|Amtsgericht)\b/i,
      /\b(Tribunal\s+(?:Supremo|Constitucional|de\s+Justicia)|Corte\s+(?:Suprema|Constitucional))\b/i
    ];
    const match = patterns.map(regex => text.match(regex)).find(Boolean);
    return match ? match[0].replace(/\s+/g, " ").trim() : null;
  }

  function extractCaseNumber(text) {
    const patterns = [
      /\b(?:Case|CASE)\s+(?:No\.?\s*)?(C-?\d+\/\d+(?:\s*P)?)\b/i,
      /\b\[?\d{4}\]?\s+(?:UKSC|UKHL|UKPC|EWCA|EWHC)\s+\d+\b/i,
      /\b(?:No\.?|Nr\.?|n°)\s*\d[\d/\-.]+\b/i
    ];
    const match = patterns.map(regex => text.match(regex)).find(Boolean);
    return match ? match[0].replace(/\s+/g, " ").trim() : null;
  }

  function extractDate(text) {
    const match = text.match(/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i) ||
      text.match(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/);
    return match ? match[0] : null;
  }

  function buildCaseTitle(parties, court, filename) {
    if (parties.detected && parties.applicant && parties.respondent) return `${parties.applicant} v ${parties.respondent}`;
    return court || CORE.titleFromFilename(filename) || "Untitled Judgment";
  }

  function cleanParty(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/,$/, "")
      .trim();
  }

  function hydrateInlineParagraphContent(elements) {
    return elements.map(element => {
      if (!["PARA", "SUBPARA"].includes(element.type) || !element.inlineText) return element;

      const content = element.content
        ? `${element.inlineText}\n${element.content}`.trim()
        : element.inlineText;

      return {
        ...element,
        content,
        charLength: content.length,
        wordCount: CORE.countWords(content),
        isEmpty: content.length < 5
      };
    });
  }

  function summarize(parsed) {
    const parts = [];
    if (parsed.metadata.title) parts.push(parsed.metadata.title);
    if (parsed.metadata.court) parts.push(parsed.metadata.court);
    if (parsed.metadata.caseNumber) parts.push(parsed.metadata.caseNumber);
    parts.push(`${parsed.stats.totalArticles} paragraph(s)`);
    if (parsed.stats.hasDisposition) parts.push("disposition detected");
    if (parsed.stats.separateOpinionCount > 0) parts.push(`${parsed.stats.separateOpinionCount} separate opinion(s)`);
    return parts.join(" · ");
  }

  return {
    VERSION,
    DOCUMENT_TYPE,
    STRUCTURAL_PATTERNS,
    JUDGMENT_REFERENCE_PATTERNS,
    parse,
    summarize,
    discoverStructure,
    detectCaseHeader,
    detectParties,
    detectSeparateOpinions,
    detectDisposition,
    extractMetadata
  };
});
