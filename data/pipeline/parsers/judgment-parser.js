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
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = factory(require("./parser-core.js"));
    return;
  }

  if (!root.ATLAS_ParserCore) {
    throw new Error("[judgment-parser] ATLAS_ParserCore must be loaded before this module.");
  }

  root.ATLAS_JudgmentParser = factory(root.ATLAS_ParserCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasJudgmentParser(CORE) {
  "use strict";

  const VERSION = "1.2.0";
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
      CORE.pattern("section-fr", /^\s*((?:Faits(?:\s+et\s+proc[ée]dure)?|Expos[ée]\s+du\s+litige|Rappel\s+des\s+faits|Contexte|Proc[ée]dure|Moyens|Pr[ée]tentions(?:\s+des\s+parties)?|Discussion|Motivation|Motifs(?:\s+de\s+la\s+d[ée]cision)?|Sur\s+ce|Dispositif|Par\s+ces\s+motifs|D[ée]pens))\s*[:,]?\s*$/i, 0, "SECT", match => match[1]),
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
    fr: [
      /\b(?:ARRÊT|ARRET|JUGEMENT|ORDONNANCE|DÉCISION|DECISION)\s+(?:DE\s+LA\s+)?(?:COUR|TRIBUNAL|CHAMBRE)\b/i,
      /\bCour\s+de\s+cassation\s*[-,]\s*(?:Assembl[ée]e\s+pl[ée]ni[èe]re|Chambre\s+mixte|[^\n,]{2,80}chambre)\b/i,
      /\b(?:c\.|c\/|contre)\b/i
    ],
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
    const metadata = extractMetadata(text, language, normalized.filename, header, normalized.sourceUnits);

    if (rawElements.length === 0) {
      warnings.push(CORE.makeWarning("NO_STRUCTURE", "No judgment sections or numbered paragraphs were detected.", { textLength: text.length, language }));
      return {
        ...CORE.createEmptyParseResult({
          startedAt,
          version: VERSION,
          documentType: DOCUMENT_TYPE,
          filename: normalized.filename,
          language,
          title: metadata.title,
          jurisdiction: metadata.jurisdiction,
          adoptionDate: metadata.judgmentDate,
          warnings
        }),
        metadata,
        header,
        preamble: header,
        disposition: detectDisposition(text, [], language),
        analysis: buildJudgmentAnalysis(text, language, metadata, [])
      };
    }

    const hydratedElements = addJudgmentLinkBacks(
      hydrateInlineElementContent(CORE.extractContent(text, rawElements, { emptyThreshold: 5 }))
    );
    const supplementaryMaterials = hydratedElements.filter(element => element.type === "SOURCE_ANALYSIS");
    const elements = hydratedElements
      .filter(element => element.type !== "SOURCE_ANALYSIS")
      .map(formatSemanticElementForDisplay)
      .map(preserveMeaningfulStructuralHeading);
    const provisions = elements.filter(element => !element.isEmpty);
    const paragraphs = provisions.filter(element => element.type === "PARA");
    const hierarchyElements = elements.filter(element => element.type !== "PARA" || element.isEmpty);
    const separateOpinions = detectSeparateOpinions(text, language);
    const disposition = detectDisposition(text, elements, language);
    const analysis = buildJudgmentAnalysis(text, language, metadata, elements);
    const allElements = header ? [header, ...elements] : elements;
    const references = CORE.scanCrossReferences(
      allElements,
      language,
      JUDGMENT_REFERENCE_PATTERNS[language] || JUDGMENT_REFERENCE_PATTERNS.en,
      { allowedSourceTypes: ["HEADER", "SECT", "PARA", "SUBPARA"], skipNestedContent: false }
    );
    const citations = extractCitations(text, elements, language);
    const relations = buildJudgmentRelations(elements, references, citations, disposition, separateOpinions);

    if (paragraphs.length < MIN_PARAGRAPH_COUNT_WARNING && provisions.length < MIN_PARAGRAPH_COUNT_WARNING) {
      warnings.push(CORE.makeWarning("LOW_PARAGRAPH_COUNT", `Only ${paragraphs.length} numbered paragraph(s) were parsed. Source may be incomplete, OCR-damaged, or not a judgment.`));
    }
    if (!metadata.court && !metadata.caseNumber) {
      warnings.push(CORE.makeWarning("WEAK_CASE_METADATA", "No clear court or case number was detected."));
    }
    if (!disposition) {
      warnings.push(CORE.makeWarning("NO_DISPOSITION_DETECTED", "No clear holding, order, or disposition signal was detected."));
    }

    return {
      version: VERSION,
      documentType: DOCUMENT_TYPE,
      filename: normalized.filename || "",
      metadata,
      header,
      preamble: header,
      articles: provisions,
      hierarchyElements,
      elements,
      hierarchyTree: CORE.buildHierarchyTree(elements),
      references,
      citations,
      relations,
      disposition,
      analysis,
      supplementaryMaterials,
      separateOpinions,
      amendments: [],
      warnings,
      stats: {
        totalArticles: provisions.length,
        totalElements: elements.length,
        totalReferences: references.length,
        resolvedReferences: references.filter(reference => reference.resolved).length,
        citationCount: citations.length,
        relationCount: relations.length,
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
            sectionRole: structurePattern.prefix === "SECT" ? classifySectionRole(identifier) : null,
            parentSectionId: null,
            parentSectionRole: null,
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

    if (language === "fr") {
      elements.push(...discoverFrenchJudgmentBlocks(text, sourceUnits));
    }

    return CORE.dedupeBy(elements.sort((a, b) => a.position - b.position), element => `${element.canonicalId}|${element.position}`);
  }

  /**
   * French supreme-court decisions often use prose markers instead of
   * numbered paragraphs. Keep the marker and the following text in distinct,
   * source-positioned blocks so the fiche can expose the legal sequence.
   */
  function discoverFrenchJudgmentBlocks(text, sourceUnits = []) {
    const definitions = [
      { id: "ISSUES", type: "ISSUE", role: "issues", regex: /(?:^|\n)(Sur\s+(?:les?|la)\s+[^\n:]{2,180}(?:moyens?|branches?)[^\n:]*\s*:)/gi },
      { id: "CLAIMS", type: "CLAIMS", role: "claims", regex: /(?:^|\n)(Attendu\s+que\s+[^\n]*?fait\s+grief\s+[^\n]*?(?:alors,\s+selon\s+le\s+moyen\s*:|alors\s+que))/gi },
      { id: "REASONING-1", type: "REASONING", role: "reasoning", regex: /(?:^|\n)(Mais\s+attendu(?:,\s*d['’]abord,?|\s+que))/gi },
      { id: "REASONING-2", type: "REASONING", role: "reasoning", regex: /(?:^|\n)(Attendu,?\s+ensuite,?\s+que)/gi },
      { id: "CONCLUSION", type: "CONCLUSION", role: "holding", regex: /(?:^|\n)(D['’]où\s+il\s+suit\s+que)/gi },
      { id: "DISPOSITION", type: "DISPOSITION", role: "disposition", regex: /(?:^|\n)(PAR\s+CES\s+MOTIFS\b[^:\n]*\s*:)/gi },
      { id: "ORDER", type: "ORDER", role: "order", regex: /(?:^|\n)((?:REJETTE|CASSE(?:\s+ET\s+ANNULE)?|ANNULE|DIT\s+N['’]Y\s+AVOIR\s+LIEU)[^\n.]*(?:\.|$))/gim },
      { id: "SOURCE-ANALYSIS", type: "SOURCE_ANALYSIS", role: "source-analysis", regex: /(?:^|\n)(Analyse)\s*(?=\n|$)/gi }
    ];
    const found = [];

    for (const definition of definitions) {
      let match;
      let occurrence = 0;
      while ((match = definition.regex.exec(text)) !== null) {
        occurrence += 1;
        const heading = match[1].trim();
        const position = match.index + match[0].indexOf(match[1]);
        const sourceUnit = findSourceUnitAtPosition(sourceUnits, position, heading);
        const suffix = occurrence > 1 ? `-${occurrence}` : "";
        const canonicalId = `${definition.id}${suffix}`;

        found.push({
          id: canonicalId,
          canonicalId,
          type: definition.type,
          prefix: definition.type,
          level: 0,
          identifier: canonicalId,
          normalizedId: canonicalId,
          sortKey: `${String(position).padStart(10, "0")}-${canonicalId}`,
          position,
          endPosition: null,
          lineIndex: lineIndexAt(text, position),
          heading,
          shortTitle: labelForJudgmentRole(definition.role, occurrence),
          inlineText: "",
          sectionRole: definition.role,
          relationRole: definition.role,
          parentSectionId: null,
          parentSectionRole: null,
          content: "",
          isAnnex: false,
          isAmendment: false,
          isEmpty: true,
          source: {
            ...CORE.sourceAnchorFromUnit(sourceUnit),
            position,
            lineIndex: lineIndexAt(text, position),
            quote: heading
          }
        });

        if (match[0].length === 0) definition.regex.lastIndex += 1;
      }
    }

    return found;
  }

  function detectCaseHeader(text, language) {
    const firstBlock = String(text || "").slice(0, 5000);
    const score = (HEADER_PATTERNS[language] || HEADER_PATTERNS.en).filter(regex => regex.test(firstBlock)).length;
    if (score === 0) return null;

    const endMatch = text.match(/\b(?:Facts|Background|Procedural\s+History|The\s+facts|Introduction|Faits(?:\s+et\s+proc[ée]dure)?|Expos[ée]\s+du\s+litige|Rappel\s+des\s+faits|Motifs(?:\s+de\s+la\s+d[ée]cision)?|Sur\s+ce|Par\s+ces\s+motifs|Hechos|Sachverhalt)\b/i) ||
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

  function extractMetadata(text, language, filename, header = null, sourceUnits = []) {
    const firstBlock = String(text || "").split("\n").slice(0, 45).join("\n");
    const court = extractCourt(firstBlock);
    const caseNumber = header?.caseReference || extractCaseNumber(firstBlock);
    const judgmentDate = extractDate(firstBlock);
    const parties = detectParties(text, language);
    const formation = language === "fr" ? extractFrenchFormation(firstBlock) : null;
    const publicationStatus = language === "fr" ? extractFrenchPublicationStatus(firstBlock) : null;
    const reporterCitation = language === "fr" ? extractFrenchReporterCitation(text) : null;
    const outcome = language === "fr" ? extractFrenchOutcome(text) : null;
    const appealedDecision = language === "fr" ? extractFrenchAppealedDecision(firstBlock) : null;
    const judgmentParties = language === "fr" ? extractFrenchParties(text, parties) : parties;
    const title = buildCaseTitle(judgmentParties, court, filename, { formation, judgmentDate, caseNumber });
    const metadataProvenance = buildMetadataProvenance(text, sourceUnits, {
      title,
      court,
      formation,
      caseNumber,
      judgmentDate,
      publicationStatus,
      reporterCitation,
      outcome,
      appealedDecision
    });

    return {
      title,
      shortTitle: caseNumber && court ? `${court} ${caseNumber}` : title,
      court,
      authority: court,
      formation,
      caseNumber,
      reference: caseNumber,
      judgmentDate,
      adoptionDate: judgmentDate,
      decisionDate: judgmentDate,
      publicationStatus,
      reporterCitation,
      outcome,
      appealedDecision,
      lowerCourt: appealedDecision?.court || null,
      lowerCourtDecisionDate: appealedDecision?.date || null,
      parties: judgmentParties,
      jurisdiction: court && /Cour\s+de\s+cassation/i.test(court) ? "France" : null,
      field: inferFrenchJudgmentField(text, language),
      metadataProvenance,
      language,
      sourceFilename: filename || null
    };
  }

  function extractCourt(text) {
    const patterns = [
      /\bJUDGMENT\s+OF\s+THE\s+(COURT|TRIBUNAL|CHAMBER)\b/i,
      /\b(Court\s+of\s+(?:Justice|Appeal|First\s+Instance|Cassation)|Supreme\s+Court|Constitutional\s+Court|High\s+Court|District\s+Court|European\s+Court\s+of\s+(?:Justice|Human\s+Rights)|International\s+Court\s+of\s+Justice|Arbitral\s+Tribunal)\b/i,
      /\b(Cour\s+(?:de\s+(?:justice|cassation)|d'appel|administrative\s+d'appel|européenne)|Conseil\s+d['’]État|Conseil\s+d['’]Etat|Conseil\s+constitutionnel|Tribunal\s+(?:judiciaire|administratif|de\s+commerce|correctionnel))\b/i,
      /\b(Bundesgerichtshof|Bundesverfassungsgericht|Oberlandesgericht|Landgericht|Amtsgericht)\b/i,
      /\b(Tribunal\s+(?:Supremo|Constitucional|de\s+Justicia)|Corte\s+(?:Suprema|Constitucional))\b/i
    ];
    const match = patterns.map(regex => text.match(regex)).find(Boolean);
    if (!match) return null;
    const court = match[0].replace(/\s+/g, " ").trim();
    if (/^Cour\s+de\s+cassation$/i.test(court)) return "Cour de cassation";
    return court;
  }

  function extractCaseNumber(text) {
    const patterns = [
      /\b(?:Case|CASE)\s+(?:No\.?\s*)?(C-?\d+\/\d+(?:\s*P)?)\b/i,
      /\b\[?\d{4}\]?\s+(?:UKSC|UKHL|UKPC|EWCA|EWHC)\s+\d+\b/i,
      /\b(?:N[°º]?\s*RG|RG\s*n[°º]?|N[°º]?\s*Portalis|R[ée]pertoire\s+g[ée]n[ée]ral|Minute\s+n[°º]?|Dossier\s+n[°º]?)\s*[:\-]?\s*[A-Z0-9\/\-. ]{4,}\b/i,
      /\bN[°º]\s+de\s+pourvoi\s*:\s*([0-9]{2,4}-[0-9]{2}\.[0-9]{3})\b/i,
      /\b(?:pourvoi\s+)?n[°º]\s*([0-9]{2,4}-[0-9]{2}\.[0-9]{3})\b/i,
      /\b([0-9]{2,4}-[0-9]{2}\.[0-9]{3})\b/,
      /\bDTA\s*\d{4,}\s*\d{8}\b/i,
      /\b(?:No\.?|Nr\.?|n°)\s*\d[\d/\-.]+\b/i
    ];
    const match = patterns.map(regex => text.match(regex)).find(Boolean);
    if (!match) return null;
    return String(match[1] || match[0])
      .replace(/^N[°º]\s+de\s+pourvoi\s*:\s*/i, "")
      .replace(/^(?:pourvoi\s+)?n[°º]\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractDate(text) {
    const match = text.match(/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i) ||
      text.match(/\b\d{1,2}\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\s+\d{4}\b/i) ||
      text.match(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/);
    return match ? match[0] : null;
  }

  function buildCaseTitle(parties, court, filename, details = {}) {
    if (court && details.caseNumber) {
      const reference = /^\d{2,4}-\d{2}\.\d{3}$/.test(details.caseNumber)
        ? `pourvoi n° ${details.caseNumber}`
        : details.caseNumber;
      return [court, details.formation, details.judgmentDate, reference].filter(Boolean).join(" - ");
    }
    if (parties.detected && parties.applicant && parties.respondent) return `${parties.applicant} v ${parties.respondent}`;
    return court || CORE.titleFromFilename(filename) || "Untitled Judgment";
  }

  function cleanParty(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/,$/, "")
      .trim();
  }

  function hydrateInlineElementContent(elements) {
    return elements.map(element => {
      if (!element.inlineText) return element;

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

  function extractFrenchFormation(text) {
    const match = String(text || "").match(/\b(Assembl[ée]e\s+pl[ée]ni[èe]re|Chambre\s+mixte|Premi[èe]re\s+chambre\s+civile|Deuxi[èe]me\s+chambre\s+civile|Troisi[èe]me\s+chambre\s+civile|Chambre\s+commerciale|Chambre\s+sociale|Chambre\s+criminelle)\b/i);
    return match ? sentenceCase(match[1]) : null;
  }

  function extractFrenchPublicationStatus(text) {
    const match = String(text || "").match(/\b(Publi[ée]\s+au\s+bulletin|Non\s+publi[ée]\s+au\s+bulletin|In[ée]dit)\b/i);
    return match ? sentenceCase(match[1]).replace(/^Publiée/i, "Publié") : null;
  }

  function extractFrenchReporterCitation(text) {
    const match = String(text || "").match(/(?:^|\n)(Bulletin\s+\d{4}[^\n]+)/i);
    return match ? match[1].trim() : null;
  }

  function extractFrenchOutcome(text) {
    const explicit = String(text || "").match(/(?:^|\n)Solution\s*:\s*([^\n.]+)\.?/i);
    if (explicit) return sentenceCase(explicit[1].trim());
    const operative = String(text || "").match(/(?:^|\n)\s*(REJETTE|CASSE(?:\s+ET\s+ANNULE)?|ANNULE)\b/i);
    return operative ? sentenceCase(operative[1]) : null;
  }

  function extractFrenchAppealedDecision(text) {
    const match = String(text || "").match(/D[ée]cision\s+attaqu[ée]e\s*:\s*([^,\n]+),\s*(\d{4}-\d{2}-\d{2})(?:,\s*du\s*([^\n]+))?/i);
    if (!match) return null;
    return {
      court: match[1].trim(),
      date: (match[3] || match[2]).trim(),
      isoDate: match[2],
      sourceText: match[0].trim()
    };
  }

  function extractFrenchParties(text, fallback) {
    const applicantMatch = String(text || "").match(/Attendu\s+que\s+(.{2,100}?)\s+fait\s+grief\b/i);
    const respondentMatch = String(text || "").match(/d[ée]cision\s+de\s+la\s+(.{3,140}?)\s+ayant\s+refus[ée](?=\s|[,.])/i);
    return {
      detected: Boolean(applicantMatch || respondentMatch || fallback?.detected),
      applicant: applicantMatch ? cleanParty(applicantMatch[1]) : fallback?.applicant || null,
      respondent: respondentMatch ? cleanParty(respondentMatch[1]) : fallback?.respondent || null,
      matchText: applicantMatch ? applicantMatch[0].trim() : fallback?.matchText || null
    };
  }

  function inferFrenchJudgmentField(text, language) {
    if (language !== "fr") return null;
    const sample = String(text || "");
    const constitutional = /valeur\s+constitutionnelle|article\s+77\s+de\s+la\s+Constitution/i.test(sample);
    const international = /engagements?\s+internationaux|Pacte\s+international|Convention\s+europ[ée]enne/i.test(sample);
    if (constitutional && international) return "Constitutional and international law";
    if (constitutional) return "Constitutional law";
    if (international) return "International law";
    return null;
  }

  function buildJudgmentAnalysis(text, language, metadata, elements) {
    if (language !== "fr") return { claims: [], reasoning: [], authorities: [] };
    const claims = extractNumberedClaims(text);
    const reasoning = (elements || [])
      .filter(element => ["REASONING", "CONCLUSION"].includes(element.type) && !element.isEmpty)
      .map(element => ({
        id: element.canonicalId,
        role: element.sectionRole,
        text: element.content,
        source: element.source
      }));
    const authorities = extractFrenchAuthorities(text);
    const facts = extractFrenchCaseNarrative(text);
    const issueCandidate = /supr[ée]matie\s+conf[ée]r[ée]e\s+aux\s+engagements\s+internationaux[\s\S]{0,180}dispositions?\s+de\s+valeur\s+constitutionnelle/i.test(text)
      ? {
          text: "Whether international commitments prevail in the French domestic legal order over provisions of constitutional value.",
          status: "rule-derived-candidate",
          confidence: 0.86,
          basis: "Reasoning states that treaty supremacy does not apply to provisions of constitutional value."
        }
      : null;

    return {
      proceduralHistory: metadata.appealedDecision,
      parties: metadata.parties,
      facts,
      claims,
      issueCandidate,
      reasoning,
      holding: reasoning.find(item => item.role === "holding") || null,
      outcome: metadata.outcome,
      authorities
    };
  }

  function extractFrenchCaseNarrative(text) {
    const match = String(text || "").match(/Attendu\s+que\s+([\s\S]*?)(?=\s*,?\s*alors,\s+selon\s+le\s+moyen\s*:)/i);
    if (!match) return null;
    const position = match.index;
    const narrative = `Attendu que ${CORE.normalizeText(match[1])}`;
    return {
      text: narrative,
      position,
      endPosition: position + match[0].length,
      source: {
        position,
        quote: CORE.preview(narrative, 220)
      }
    };
  }

  function extractNumberedClaims(text) {
    const marker = /alors,\s+selon\s+le\s+moyen\s*:/i.exec(text);
    if (!marker) return [];
    const endMatch = /\n\s*(?:Mais\s+attendu|Attendu,?\s+ensuite|D['’]où\s+il\s+suit|PAR\s+CES\s+MOTIFS)/i.exec(text.slice(marker.index + marker[0].length));
    const start = marker.index + marker[0].length;
    const end = endMatch ? start + endMatch.index : text.length;
    const region = text.slice(start, end);
    const regex = /(\d+)°\s+([\s\S]*?)(?=\s*;\s*\d+°|$)/g;
    const claims = [];
    let match;
    while ((match = regex.exec(region)) !== null) {
      const claimText = CORE.normalizeText(match[2]).replace(/\s*;\s*$/, "");
      const position = start + match.index;
      claims.push({
        id: `CLAIM-${match[1]}`,
        number: Number(match[1]),
        text: claimText,
        position,
        endPosition: position + match[0].length,
        source: { position, quote: `${match[1]}° ${CORE.preview(claimText, 160)}` }
      });
    }
    return claims;
  }

  function extractFrenchAuthorities(text) {
    const patterns = [
      { type: "constitutional-provision", regex: /\barticle\s+77\s+de\s+la\s+Constitution\b/gi },
      { type: "constitutional-agreement", regex: /\baccord\s+de\s+Noum[ée]a\b/gi },
      { type: "statutory-provision", regex: /\barticle\s+188\s+de\s+la\s+loi\s+organique(?:\s+n[°º]\s*99-209)?\s+du\s+19\s+mars\s+1999\b/gi },
      { type: "treaty", regex: /\bPacte\s+international\s+relatif\s+aux\s+droits\s+civils\s+et\s+politiques\b/gi },
      { type: "treaty", regex: /\bConvention\s+europ[ée]enne\s+de\s+sauvegarde\s+des\s+droits\s+de\s+l['’]homme\s+et\s+des\s+libert[ée]s\s+fondamentales\b/gi },
      { type: "eu-treaty", regex: /\btrait[ée]\s+de\s+l['’]Union\s+europ[ée]enne\b/gi }
    ];
    const authorities = [];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        authorities.push({ type: pattern.type, citation: match[0], position: match.index });
        if (match[0].length === 0) pattern.regex.lastIndex += 1;
      }
    }
    return CORE.dedupeBy(authorities, item => `${item.type}|${item.citation.toLowerCase()}`);
  }

  function buildMetadataProvenance(text, sourceUnits, values) {
    const provenance = {};
    const sourceValues = {
      court: values.court,
      formation: values.formation,
      caseNumber: values.caseNumber,
      judgmentDate: values.judgmentDate,
      publicationStatus: values.publicationStatus,
      reporterCitation: values.reporterCitation,
      outcome: values.outcome,
      lowerCourt: values.appealedDecision?.sourceText
    };
    for (const [field, value] of Object.entries(sourceValues)) {
      if (!value) continue;
      const position = findValuePosition(text, value, field);
      const sourceUnit = findSourceUnitAtPosition(sourceUnits, position, value);
      provenance[field] = {
        method: "parser-rule",
        position,
        source: {
          ...CORE.sourceAnchorFromUnit(sourceUnit),
          position,
          quote: CORE.extractContext(text, position, value, 80)
        }
      };
    }
    provenance.title = {
      method: "composed-from-canonical-fields",
      fields: ["court", "formation", "judgmentDate", "caseNumber"]
    };
    return provenance;
  }

  function findValuePosition(text, value, field) {
    if (field === "lowerCourt" && value) return Math.max(0, text.indexOf(value));
    const direct = String(text || "").toLocaleLowerCase("fr").indexOf(String(value || "").toLocaleLowerCase("fr"));
    if (direct >= 0) return direct;
    if (field === "caseNumber") {
      const match = String(text || "").match(/N[°º]\s+de\s+pourvoi\s*:\s*([0-9.-]+)/i);
      return match ? match.index : 0;
    }
    return 0;
  }

  function findSourceUnitAtPosition(sourceUnits, position, heading = "") {
    if (!Array.isArray(sourceUnits) || sourceUnits.length === 0) return null;
    const byRange = sourceUnits.find(unit => {
      const start = unit.source?.position ?? unit.position;
      const end = unit.source?.endPosition ?? unit.endPosition;
      return Number.isFinite(start) && Number.isFinite(end) && position >= start && position <= end;
    });
    return byRange || CORE.findSourceUnitForHeading(heading, sourceUnits);
  }

  function lineIndexAt(text, position) {
    return String(text || "").slice(0, Math.max(0, position)).split("\n").length - 1;
  }

  function labelForJudgmentRole(role, occurrence) {
    const labels = {
      issues: "Grounds raised",
      claims: "Applicant's claims",
      reasoning: `Court reasoning${occurrence > 1 ? ` ${occurrence}` : ""}`,
      holding: "Holding",
      disposition: "Disposition",
      order: "Operative order"
    };
    return labels[role] || sentenceCase(role);
  }

  function sentenceCase(value) {
    const text = String(value || "").trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : null;
  }

  function preserveMeaningfulStructuralHeading(element) {
    if (!element.isEmpty) return element;
    if (!["ISSUE", "DISPOSITION", "ORDER"].includes(element.type)) return element;
    return {
      ...element,
      isEmpty: false,
      charLength: 0,
      wordCount: 0
    };
  }

  function formatSemanticElementForDisplay(element) {
    const semanticTypes = new Set(["ISSUE", "CLAIMS", "REASONING", "CONCLUSION", "DISPOSITION", "ORDER"]);
    if (!semanticTypes.has(element.type)) return element;
    const sourceMarker = element.heading;
    const content = [sourceMarker, element.content].filter(Boolean).join(" ").trim();
    return {
      ...element,
      heading: element.shortTitle || sourceMarker,
      sourceMarker,
      content,
      charLength: content.length,
      wordCount: CORE.countWords(content),
      isEmpty: content.length < 5
    };
  }

  function addJudgmentLinkBacks(elements) {
    let currentSection = null;

    return elements.map(element => {
      if (element.type === "SECT") {
        currentSection = element;
        return {
          ...element,
          relationRole: element.sectionRole || classifySectionRole(element.identifier)
        };
      }

      if (["PARA", "SUBPARA"].includes(element.type) && currentSection) {
        return {
          ...element,
          parentSectionId: currentSection.canonicalId,
          parentSectionRole: currentSection.sectionRole || classifySectionRole(currentSection.identifier)
        };
      }

      return element;
    });
  }

  function classifySectionRole(value) {
    const text = String(value || "").toLowerCase();
    if (/fact|background|procedural|history|faits|contexte|sachverhalt|hechos|antecedentes/.test(text)) return "facts";
    if (/legal\s+context|law|droit|recht/.test(text)) return "legal-context";
    if (/issue|question|moyen/.test(text)) return "issues";
    if (/reason|analysis|discussion|finding|motif|gründe|gruende|fundamento|considerando/.test(text)) return "reasoning";
    if (/conclusion|disposition|holding|order|costs|dispositif|dépens|depens|tenor|fallo|costas/.test(text)) return "disposition";
    return "section";
  }

  function extractCitations(text, elements, language) {
    const citationPatterns = [
      { regex: /\b(?:Case|CASE)\s+(?:No\.?\s*)?(C-?\d+\/\d+(?:\s*P)?)\b/g, type: "case-citation" },
      { regex: /\b\[\d{4}\]\s+(?:UKSC|UKHL|UKPC|EWCA|EWHC|USSC|SCC)\s+\d+\b/g, type: "neutral-citation" },
      { regex: /\b\d+\s+(?:U\.S\.|F\.?\s?Supp\.?|F\.?\s?\d+d|S\.Ct\.)\s+\d+\b/g, type: "reporter-citation" },
      { regex: /\b(?:Regulation|Directive)\s+\(?(?:EU|EC|EEC)?\)?\s*(?:No\.?\s*)?\d{4}\/\d{1,4}\/?(?:EU|EC|EEC)?\b/gi, type: "eu-law-citation" },
      { regex: /\b(?:Article|ARTICLE|Art\.?)\s+\d{1,4}[A-Za-z]?\b/g, type: "legal-provision-citation" }
    ];

    const citations = [];

    for (const pattern of citationPatterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const sourceElement = findElementAtPosition(elements, match.index);
        citations.push({
          id: `CITE-${String(citations.length + 1).padStart(4, "0")}`,
          type: pattern.type,
          text: match[0].replace(/\s+/g, " ").trim(),
          position: match.index,
          sourceId: sourceElement ? sourceElement.canonicalId : null,
          sourceType: sourceElement ? sourceElement.type : null,
          sectionRole: sourceElement ? sourceElement.parentSectionRole || sourceElement.sectionRole || null : null,
          context: CORE.extractContext(text, match.index, match[0], 120)
        });

        if (match[0].length === 0) pattern.regex.lastIndex += 1;
      }
    }

    return CORE.dedupeBy(citations, citation => `${citation.type}|${citation.text}|${citation.position}`);
  }

  function findElementAtPosition(elements, position) {
    const candidates = elements.filter(element =>
      typeof element.position === "number" &&
      typeof element.endPosition === "number" &&
      position >= element.position &&
      position <= element.endPosition
    );

    candidates.sort((a, b) => {
      const spanA = a.endPosition - a.position;
      const spanB = b.endPosition - b.position;
      if (spanA !== spanB) return spanA - spanB;
      return b.level - a.level;
    });

    return candidates[0] || null;
  }

  function buildJudgmentRelations(elements, references, citations, disposition, separateOpinions) {
    const relations = [];
    const paragraphByRole = new Map();

    for (const element of elements) {
      if (!["PARA", "SUBPARA"].includes(element.type) || element.isEmpty) continue;
      const role = element.parentSectionRole || "unclassified";
      if (!paragraphByRole.has(role)) paragraphByRole.set(role, []);
      paragraphByRole.get(role).push(element);
    }

    addRoleRelations(relations, "issues", "reasoning", paragraphByRole, "issue-reasoning-link");
    addRoleRelations(relations, "reasoning", "disposition", paragraphByRole, "reasoning-disposition-link");
    addRoleRelations(relations, "facts", "reasoning", paragraphByRole, "facts-reasoning-link");

    for (const reference of references) {
      relations.push({
        type: "internal-reference",
        sourceId: reference.sourceId,
        targetId: reference.targetCanonicalId,
        resolved: reference.resolved,
        referenceType: reference.referenceType,
        context: reference.context
      });
    }

    for (const citation of citations) {
      relations.push({
        type: "citation-link",
        sourceId: citation.sourceId,
        targetText: citation.text,
        citationType: citation.type,
        context: citation.context
      });
    }

    if (disposition) {
      relations.push({
        type: "document-disposition",
        sourceId: disposition.canonicalId,
        targetId: "JUDGMENT_OUTCOME",
        context: disposition.context
      });
    }

    for (const opinion of separateOpinions) {
      const sourceElement = findElementAtPosition(elements, opinion.position);
      relations.push({
        type: "separate-opinion-marker",
        sourceId: sourceElement ? sourceElement.canonicalId : null,
        opinionType: opinion.type,
        heading: opinion.heading,
        position: opinion.position
      });
    }

    return relations;
  }

  function addRoleRelations(relations, sourceRole, targetRole, paragraphByRole, type) {
    const sources = paragraphByRole.get(sourceRole) || [];
    const targets = paragraphByRole.get(targetRole) || [];
    if (sources.length === 0 || targets.length === 0) return;

    relations.push({
      type,
      sourceRole,
      targetRole,
      sourceIds: sources.map(element => element.canonicalId),
      targetIds: targets.map(element => element.canonicalId),
      confidence: "structural"
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
    if (parsed.stats.citationCount > 0) parts.push(`${parsed.stats.citationCount} citation(s)`);
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
    extractCitations,
    buildJudgmentRelations,
    extractMetadata
  };
});
