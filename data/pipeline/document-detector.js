/**
 * ATLAS Ingestion Pipeline - Document Detector
 *
 * V1 document-type classifier for legal source text.
 *
 * The detector sits after extractor.js and before parser.js:
 *
 *   extractor.js -> document-detector.js -> parser.js
 *
 * Its job is not to parse the document. Its job is to decide which parser
 * should be used, and to explain that decision with matched signals.
 *
 * Prime directive:
 * - prefer "unknown" over a confident wrong classification.
 */

(function initAtlasDocumentDetector(root, factory) {
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = factory();
    return;
  }

  const detector = factory();
  root.ATLAS_DocumentDetector = detector;
  if (root.window) root.window.ATLAS_DocumentDetector = detector;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasDocumentDetector() {
  "use strict";

  const VERSION = "1.0.0";

  // Decision thresholds. These are intentionally conservative for legal work.
  const MIN_AUTO_SCORE = 42;
  const MIN_AUTO_CONFIDENCE = 62;
  const MIN_AUTO_GAP = 12;
  const SAMPLE_LIMIT = 120000;

  const FALLBACK_TYPE = {
    type: "unknown",
    label: "Unknown Document Type",
    parser: "generic-parser.js",
    color: "#636885",
    icon: "document"
  };

  /**
   * Declarative signal registry.
   *
   * Add document knowledge here, not in the scanner/scorer engine. This keeps
   * legal knowledge separate from detection mechanics.
   */
  const DOCUMENT_TYPES = [
    {
      type: "constitution",
      label: "Constitution",
      parser: "constitution-parser.js",
      color: "#7A6AAA",
      icon: "institution",
      signals: [
        signal("us_constitution_preamble", 55, {
          en: /\bWe\s+the\s+People\s+of\s+the\s+United\s+States\b/i,
          position: "early",
          description: "US Constitution preamble opening"
        }),
        signal("named_constitution_en", 48, {
          en: /\bConstitution\s+of\s+(the\s+)?[A-Z][A-Za-z .'-]{2,80}\b/i,
          position: "early",
          description: "Named constitution title"
        }),
        signal("french_constitution_exact", 55, {
          fr: /\bConstitution\s+du\s+4\s+octobre\s+1958\b/i,
          position: "early",
          description: "French Constitution exact title"
        }),
        signal("french_constitution_title", 44, {
          fr: /\bConstitution\s+(de\s+la\s+République\s+française|française)\b/i,
          position: "early",
          description: "French constitution title"
        }),
        signal("grundgesetz_exact", 52, {
          de: /\bGrundgesetz\s+(für\s+die\s+Bundesrepublik\s+Deutschland|vom\s+23\.\s+Mai\s+1949)\b/i,
          position: "early",
          description: "German Basic Law exact title"
        }),
        signal("spanish_constitution_exact", 50, {
          es: /\bConstitución\s+Española\s+(de\s+1978|del\s+27\s+de\s+diciembre)\b/i,
          position: "early",
          description: "Spanish Constitution exact title"
        }),
        signal("sovereignty_language", 22, {
          multi: [
            /\bsovereign(ty)?\s+(of\s+the\s+)?(people|nation|state)\b/i,
            /\bsouveraineté\s+(nationale|du\s+peuple)\b/i,
            /\bStaatsgewalt\s+(geht\s+)?vom\s+Volke\b/i,
            /\bsoberanía\s+(nacional|del\s+pueblo)\b/i
          ],
          position: "early",
          description: "Sovereignty declaration"
        }),
        signal("fundamental_rights", 18, {
          multi: [
            /\bfundamental\s+(rights?|freedoms?|liberties)\b/i,
            /\bdroits?\s+fondamentaux\b/i,
            /\bGrundrechte\b/i,
            /\bderechos?\s+fundamentales\b/i
          ],
          position: "anywhere",
          description: "Fundamental rights language"
        }),
        signal("article_numbering_constitution", 10, {
          multi: [
            /\bArticle\s+\d{1,3}(er)?\b/gi,
            /\bArtikel\s+\d{1,3}\b/gi,
            /\bArtículo\s+\d{1,3}\b/gi
          ],
          minMatches: 5,
          position: "body",
          description: "Multiple article-numbered provisions"
        }),
        antiSignal("anti_eu_regulation", -42, {
          multi: [
            /\bRegulation\s+\(EU\)\s+\d{4}\/\d{1,4}\b/i,
            /\bRèglement\s+\(UE\)\s+\d{4}\/\d{1,4}\b/i
          ],
          position: "anywhere",
          description: "ANTI: EU regulation reference"
        }),
        antiSignal("anti_contract_recital", -35, {
          en: /\b(WHEREAS|NOW\s+THEREFORE|IN\s+WITNESS\s+WHEREOF)\b/i,
          position: "anywhere",
          description: "ANTI: contract recital/execution language"
        })
      ]
    },
    {
      type: "regulation",
      label: "EU Regulation",
      parser: "regulation-parser.js",
      color: "#636885",
      icon: "regulation",
      signals: [
        signal("eu_regulation_reference", 58, {
          multi: [
            /\bRegulation\s+\(EU\)\s+\d{4}\/\d{1,4}\b/i,
            /\bRèglement\s+\(UE\)\s+\d{4}\/\d{1,4}\b/i
          ],
          position: "early",
          description: "EU regulation reference number"
        }),
        signal("eu_regulation_no_reference", 48, {
          en: /\bRegulation\s+\(EU\)\s+No\.?\s+\d{1,4}\/\d{4}\b/i,
          position: "early",
          description: "EU regulation 'No YYYY/NNNN' reference"
        }),
        signal("eu_legislative_bodies", 26, {
          multi: [
            /\bEuropean\s+Parliament\s+and\s+(of\s+)?the\s+Council\b/i,
            /\bParlement\s+européen\s+et\s+(du\s+)?Conseil\b/i
          ],
          position: "early",
          description: "EU Parliament and Council enacting bodies"
        }),
        signal("direct_applicability", 34, {
          en: /\bbinding\s+in\s+its\s+entirety\s+and\s+directly\s+applicable\b/i,
          position: "late",
          description: "Direct applicability formula"
        }),
        signal("official_journal", 14, {
          multi: [
            /\bOfficial\s+Journal\s+of\s+the\s+European\s+Union\b/i,
            /\bJournal\s+officiel\s+de\s+l'Union\s+européenne\b/i
          ],
          position: "early",
          description: "Official Journal reference"
        }),
        signal("whereas_recitals", 12, {
          multi: [
            /\bWhereas\s*:?/gi,
            /\bconsidérant\s+ce\s+qui\s+suit\b/i
          ],
          minMatches: 1,
          position: "early",
          description: "EU recital opening"
        }),
        signal("article_numbering_regulation", 10, {
          multi: [/\bArticle\s+\d{1,3}\b/gi],
          minMatches: 5,
          position: "body",
          description: "Multiple article-numbered provisions"
        }),
        antiSignal("anti_directive_transposition", -34, {
          en: /\b(transpos(e|ing|ition|ed)|Member\s+States\s+shall\s+bring\s+into\s+force)\b/i,
          position: "anywhere",
          description: "ANTI: directive transposition language"
        })
      ]
    },
    {
      type: "directive",
      label: "EU Directive",
      parser: "directive-parser.js",
      color: "#447F80",
      icon: "directive",
      signals: [
        signal("eu_directive_reference", 58, {
          multi: [
            /\bDirective\s+\(EU\)\s+\d{4}\/\d{1,4}\b/i,
            /\bDirective\s+\d{4}\/\d{1,4}\/EU\b/i,
            /\bDirective\s+\d{4}\/\d{1,4}\/UE\b/i
          ],
          position: "early",
          description: "EU directive reference number"
        }),
        signal("member_states_shall", 28, {
          en: /\bMember\s+States\s+shall\b/i,
          position: "body",
          description: "Directive-style Member States obligation"
        }),
        signal("transposition_language", 30, {
          en: /\b(transpos(e|ing|ition|ed)|bring\s+into\s+force\s+the\s+laws,\s+regulations\s+and\s+administrative\s+provisions)\b/i,
          position: "anywhere",
          description: "Transposition language"
        }),
        signal("eu_legislative_bodies_directive", 22, {
          en: /\bEuropean\s+Parliament\s+and\s+(of\s+)?the\s+Council\b/i,
          position: "early",
          description: "EU Parliament and Council enacting bodies"
        }),
        signal("article_numbering_directive", 8, {
          en: /\bArticle\s+\d{1,3}\b/gi,
          minMatches: 5,
          position: "body",
          description: "Multiple article-numbered provisions"
        }),
        antiSignal("anti_regulation_reference", -42, {
          en: /\bRegulation\s+\(EU\)\s+\d{4}\/\d{1,4}\b/i,
          position: "anywhere",
          description: "ANTI: EU regulation reference"
        })
      ]
    },
    {
      type: "treaty",
      label: "Treaty / International Agreement",
      parser: "treaty-parser.js",
      color: "#8B6BAE",
      icon: "treaty",
      signals: [
        signal("named_treaty", 52, {
          en: /\bTreaty\s+(on|of)\s+(the\s+)?[A-Z][A-Za-z .'-]{3,90}\b/i,
          position: "early",
          description: "Named treaty"
        }),
        signal("vclt_reference", 48, {
          en: /\bVienna\s+Convention\s+on\s+the\s+Law\s+of\s+Treaties\b/i,
          position: "anywhere",
          description: "Vienna Convention reference"
        }),
        signal("contracting_parties", 28, {
          en: /\bcontracting\s+(parties|states?|governments?)\b/i,
          position: "anywhere",
          description: "Contracting parties language"
        }),
        signal("ratification_accession", 22, {
          en: /\b(ratify|ratification|accede|accession|depositary)\b/i,
          position: "anywhere",
          description: "Treaty ratification/accession language"
        }),
        signal("treaty_closing_formula", 24, {
          en: /\bin\s+witness\s+whereof\b/i,
          position: "late",
          description: "Treaty closing formula"
        })
      ]
    },
    {
      type: "statute",
      label: "Statute / Act",
      parser: "statute-parser.js",
      color: "#C4935A",
      icon: "statute",
      signals: [
        signal("enactment_clause", 50, {
          en: /\bBe\s+it\s+enacted\s+by\b/i,
          position: "early",
          description: "Enactment clause"
        }),
        signal("public_law_number", 48, {
          en: /\bPublic\s+Law\s+\d{2,3}[-–]\d{1,4}\b/i,
          position: "early",
          description: "US Public Law number"
        }),
        signal("act_title_formula", 26, {
          en: /\bAn\s+Act\s+(to|for|relating\s+to|concerning|amending)\b/i,
          position: "early",
          description: "Act title formula"
        }),
        signal("statutory_structure", 14, {
          en: /\b(section|subsection|paragraph|subparagraph|clause)\s+\d+[A-Z]?\b/gi,
          minMatches: 5,
          position: "body",
          description: "Statutory subdivision structure"
        }),
        signal("amend_repeal_language", 12, {
          en: /\b(repeal|amend|insert|substitute)\w*\s+(the\s+)?(Act|section|subsection)\b/i,
          position: "body",
          description: "Legislative amendment language"
        })
      ]
    },
    {
      type: "judgment",
      label: "Judgment / Court Decision",
      parser: "judgment-parser.js",
      color: "#C84B4B",
      icon: "judgment",
      signals: [
        signal("ecj_case_reference", 50, {
          en: /\b(Case\s+)?C-\d+\/\d+\b/i,
          position: "early",
          description: "Court of Justice case reference"
        }),
        signal("uk_neutral_citation", 48, {
          en: /\b\[?\d{4}\]?\s+(UKSC|UKHL|UKPC|EWCA|EWHC)\s+\d+\b/i,
          position: "early",
          description: "UK neutral citation"
        }),
        signal("us_case_citation", 42, {
          en: /\b\d+\s+(F\.\s*)?(Supp\.|F\.|U\.S\.)\s*\d+\b/i,
          position: "early",
          description: "US case citation"
        }),
        signal("french_court_name", 46, {
          fr: /\b(?:Cour\s+d'appel|Cour\s+de\s+cassation|Conseil\s+d['’]Etat|Conseil\s+constitutionnel|Tribunal\s+judiciaire|Tribunal\s+administratif|Cour\s+administrative\s+d'appel)\b/i,
          position: "early",
          description: "French court name"
        }),
        signal("french_decision_heading", 42, {
          fr: /\b(?:ARR[ÊE]T|JUGEMENT|ORDONNANCE|D[ÉE]CISION)\s+(?:DU|DU\s+\d{1,2}|DE\s+LA|DE\s+L['’])?/i,
          position: "early",
          description: "French judgment or decision heading"
        }),
        signal("french_case_number", 24, {
          fr: /\b(?:N[°º]\s*RG|RG\s*n[°º]?|N[°º]\s*Portalis|DTA)\s*[:\-]?\s*[A-Z0-9\/\-. ]{4,}\b/i,
          position: "early",
          description: "French court case or docket number"
        }),
        signal("french_reasons_disposition", 28, {
          fr: /\b(?:MOTIFS\s+DE\s+LA\s+D[ÉE]CISION|PAR\s+CES\s+MOTIFS|FAITS\s+ET\s+PROC[ÉE]DURE)\b/i,
          position: "anywhere",
          description: "French decision structure heading"
        }),
        signal("party_roles", 20, {
          en: /\b(plaintiff|defendant|appellant|respondent|applicant|claimant|petitioner)\b/gi,
          minMatches: 2,
          position: "anywhere",
          description: "Multiple litigation party roles"
        }),
        signal("court_reasoning_language", 24, {
          en: /\b(the\s+)?(court|tribunal|chamber)\s+(held|found|ruled|concluded|determined|considered|observed)\b/i,
          position: "body",
          description: "Judicial reasoning language"
        })
      ]
    },
    {
      type: "contract",
      label: "Contract / Agreement",
      parser: "contract-parser.js",
      color: "#4A9B6A",
      icon: "contract",
      signals: [
        signal("contract_recital", 45, {
          en: /\b(WHEREAS|WITNESSETH|NOW\s+THEREFORE)\b/i,
          position: "early",
          description: "Traditional contract recital language"
        }),
        signal("contract_execution", 45, {
          en: /\bIN\s+WITNESS\s+WHEREOF\b/i,
          position: "late",
          description: "Contract execution block"
        }),
        signal("party_structure", 28, {
          en: /\b(Party|Parties)\s+(of|to)\s+(the|this)\s+(First|Second|Third|Fourth|Agreement)\b/i,
          position: "anywhere",
          description: "Named parties structure"
        }),
        signal("boilerplate_terms", 22, {
          en: /\b(hereinafter|hereto|herein|hereby|hereunder|hereof|thereto|therein|thereby|thereunder|thereof)\b/gi,
          minMatches: 3,
          position: "anywhere",
          description: "Multiple contract boilerplate terms"
        }),
        signal("contract_clauses", 18, {
          en: /\b(governing\s+law|jurisdiction|arbitration|force\s+majeure|confidentiality|severability|entire\s+agreement)\b/i,
          position: "body",
          description: "Standard contract clause language"
        }),
        antiSignal("anti_legislation_articles", -28, {
          en: /\bArticle\s+\d{1,3}\b/gi,
          minMatches: 10,
          position: "body",
          description: "ANTI: extensive legislation-style article structure"
        })
      ]
    }
  ];

  /**
   * Main public detection API.
   *
   * Accepts:
   * - extractor result: { text, normalizedText, filename, sourceUnits }
   * - raw string text
   */
  function detect(input, options = {}) {
    const startedAt = Date.now();
    const normalizedInput = normalizeInput(input, options);
    const normalizedText = normalizeText(normalizedInput.text).slice(0, options.sampleLimit || SAMPLE_LIMIT);
    const language = detectLanguage(normalizedText);
    const warnings = [];

    if (!normalizedText) {
      warnings.push({
        code: "NO_TEXT",
        message: "No text was provided for document detection."
      });
      return buildUnknownResult(normalizedInput, language, warnings, startedAt);
    }

    const textSignals = scanSignals(normalizedText, language);
    const filenameSignals = scanFilenameSignals(normalizedInput.filename);
    const allSignals = textSignals.concat(filenameSignals);
    const scoredGroups = scoreMatches(allSignals);
    const decision = decide(scoredGroups, warnings);

    return {
      version: VERSION,
      type: decision.type,
      label: decision.label,
      parser: decision.parser,
      confidence: decision.confidence,
      decision: decision.decision,
      score: decision.score,
      gap: decision.gap,
      language,
      filename: normalizedInput.filename,
      textLength: normalizedText.length,
      signals: decision.signals,
      allScores: decision.allScores,
      warnings,
      color: decision.color,
      icon: decision.icon,
      stats: {
        signalCount: allSignals.length,
        durationMs: Date.now() - startedAt
      }
    };
  }

  function normalizeInput(input, options) {
    if (typeof input === "string") {
      return {
        text: input,
        filename: options.filename || "",
        sourceUnits: []
      };
    }

    if (input && typeof input === "object") {
      return {
        text: input.normalizedText || input.text || input.rawText || "",
        filename: input.filename || options.filename || "",
        sourceUnits: Array.isArray(input.sourceUnits) ? input.sourceUnits : []
      };
    }

    return {
      text: "",
      filename: options.filename || "",
      sourceUnits: []
    };
  }

  /**
   * Detection normalizer. This is separate from extractor normalization because
   * detector matching benefits from OCR and ligature cleanup.
   */
  function normalizeText(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\u00A0/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\uFB00/g, "ff")
      .replace(/\uFB01/g, "fi")
      .replace(/\uFB02/g, "fl")
      .replace(/\uFB03/g, "ffi")
      .replace(/\uFB04/g, "ffl")
      .replace(/[\u2018\u2019\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201F]/g, "\"")
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/\bArtic1e\b/g, "Article")
      .replace(/\bArticIe\b/g, "Article")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function detectLanguage(text) {
    const sample = ` ${String(text || "").slice(0, 6000).toLowerCase()} `;
    const markers = {
      en: [" the ", " of ", " and ", " shall ", " this ", " with ", " which ", " rights ", " article "],
      fr: [" le ", " la ", " les ", " des ", " est ", " une ", " dans ", " pour ", " avec ", " article "],
      de: [" der ", " die ", " das ", " und ", " ist ", " von ", " mit ", " für ", " nicht ", " artikel "],
      es: [" el ", " la ", " los ", " las ", " del ", " una ", " que ", " por ", " con ", " artículo "]
    };

    const scores = Object.entries(markers).map(([language, terms]) => ({
      language,
      score: terms.reduce((total, term) => total + countOccurrences(sample, term), 0)
    })).sort((a, b) => b.score - a.score);

    if (scores.length === 0 || scores[0].score === 0) return "unknown";
    if (scores[1] && scores[0].score - scores[1].score <= 1) return "unknown";
    return scores[0].language;
  }

  function scanSignals(text, language) {
    const textLength = text.length;
    const earlyThreshold = Math.max(1, Math.floor(textLength * 0.2));
    const lateThreshold = Math.floor(textLength * 0.8);
    const matches = [];

    for (const documentType of DOCUMENT_TYPES) {
      for (const documentSignal of documentType.signals) {
        const patterns = resolvePatterns(documentSignal, language);
        if (patterns.length === 0) continue;

        const matchBundle = matchSignalPatterns({
          text,
          textLength,
          earlyThreshold,
          lateThreshold,
          documentType,
          documentSignal,
          patterns
        });

        if (matchBundle) matches.push(matchBundle);
      }
    }

    return matches;
  }

  function matchSignalPatterns(args) {
    const positions = [];
    const contexts = [];
    let totalMatches = 0;

    for (const pattern of args.patterns) {
      const regex = cloneRegexForScanning(pattern);
      let match;

      while ((match = regex.exec(args.text)) !== null) {
        const position = match.index;
        const positionCategory = getPositionCategory(
          position,
          args.earlyThreshold,
          args.lateThreshold
        );

        if (!positionAllowed(args.documentSignal.position, positionCategory)) {
          if (match[0].length === 0) regex.lastIndex += 1;
          continue;
        }

        totalMatches += 1;
        positions.push(position);
        if (contexts.length < 3) {
          contexts.push(extractContext(args.text, position, match[0]));
        }

        if (match[0].length === 0) regex.lastIndex += 1;
      }
    }

    if (totalMatches < (args.documentSignal.minMatches || 1)) return null;

    return {
      id: args.documentSignal.id,
      docType: args.documentType.type,
      docLabel: args.documentType.label,
      description: args.documentSignal.description,
      weight: args.documentSignal.weight,
      polarity: args.documentSignal.weight < 0 ? "negative" : "positive",
      matchCount: totalMatches,
      positions,
      contexts
    };
  }

  function resolvePatterns(documentSignal, language) {
    if (language && language !== "unknown" && documentSignal[language]) {
      return asArray(documentSignal[language]);
    }

    if (documentSignal.multi) return asArray(documentSignal.multi);
    if (documentSignal.en) return asArray(documentSignal.en);
    if (documentSignal.fr) return asArray(documentSignal.fr);
    if (documentSignal.de) return asArray(documentSignal.de);
    if (documentSignal.es) return asArray(documentSignal.es);

    return [];
  }

  function cloneRegexForScanning(pattern) {
    const flags = new Set((pattern.flags || "").split(""));
    flags.add("g");
    return new RegExp(pattern.source, Array.from(flags).join(""));
  }

  function getPositionCategory(position, earlyThreshold, lateThreshold) {
    if (position < earlyThreshold) return "early";
    if (position >= lateThreshold) return "late";
    return "body";
  }

  function positionAllowed(requiredPosition, actualPosition) {
    if (!requiredPosition || requiredPosition === "anywhere") return true;
    return requiredPosition === actualPosition;
  }

  function extractContext(text, position, matchedText) {
    const start = Math.max(0, position - 80);
    const end = Math.min(text.length, position + matchedText.length + 80);
    return text.slice(start, end).replace(/\s+/g, " ").trim();
  }

  function scanFilenameSignals(filename) {
    const value = String(filename || "").toLowerCase();
    if (!value) return [];

    const hints = [
      ["constitution", "constitution"],
      ["regulation", "regulation"],
      ["directive", "directive"],
      ["treaty", "treaty"],
      ["agreement", "contract"],
      ["contract", "contract"],
      ["judgment", "judgment"],
      ["decision", "judgment"],
      ["act", "statute"],
      ["statute", "statute"]
    ];

    for (const [needle, docType] of hints) {
      if (!value.includes(needle)) continue;
      const def = getTypeDefinition(docType);
      if (!def) continue;
      return [{
        id: "filename_hint",
        docType: def.type,
        docLabel: def.label,
        description: `Filename contains "${needle}"`,
        weight: 8,
        polarity: "positive",
        matchCount: 1,
        positions: [0],
        contexts: [filename]
      }];
    }

    return [];
  }

  function scoreMatches(matches) {
    const grouped = new Map();

    for (const match of matches) {
      if (!grouped.has(match.docType)) {
        grouped.set(match.docType, {
          type: match.docType,
          label: match.docLabel,
          matches: [],
          positiveScore: 0,
          negativeScore: 0,
          adjustedScore: 0
        });
      }

      const group = grouped.get(match.docType);
      group.matches.push(match);
      if (match.weight >= 0) group.positiveScore += match.weight;
      else group.negativeScore += Math.abs(match.weight);
    }

    for (const group of grouped.values()) {
      const positives = group.matches.filter(match => match.weight > 0);
      const hasDefinitive = positives.some(match => match.weight >= 45);
      const strongCount = positives.filter(match => match.weight >= 20).length;
      const moderateCount = positives.filter(match => match.weight > 0 && match.weight < 20).length;

      let adjusted = group.positiveScore;

      if (hasDefinitive && strongCount >= 2) adjusted += 12;
      if (!hasDefinitive && strongCount >= 3) adjusted += 10;
      if (moderateCount >= 4) adjusted += 8;

      adjusted -= group.negativeScore * 1.4;
      group.adjustedScore = Math.max(0, adjusted);
    }

    return Array.from(grouped.values())
      .sort((a, b) => b.adjustedScore - a.adjustedScore);
  }

  function decide(scoredGroups, warnings) {
    const viable = scoredGroups.filter(group => group.adjustedScore > 0);
    const allScores = viable.map(group => ({
      type: group.type,
      label: group.label,
      score: round(group.adjustedScore)
    }));

    if (viable.length === 0) {
      warnings.push({
        code: "NO_SIGNALS",
        message: "No document-type signals matched the provided text."
      });
      return unknownDecision(allScores);
    }

    const best = viable[0];
    const runnerUp = viable[1] || { adjustedScore: 0, type: "none" };
    const gap = best.adjustedScore - runnerUp.adjustedScore;
    const confidence = calculateConfidence(best.adjustedScore, gap, best.matches);
    const typeDefinition = getTypeDefinition(best.type) || FALLBACK_TYPE;

    const autoAccept = best.adjustedScore >= MIN_AUTO_SCORE &&
      confidence >= MIN_AUTO_CONFIDENCE &&
      gap >= MIN_AUTO_GAP;

    if (!autoAccept) {
      warnings.push({
        code: "LOW_CONFIDENCE_DETECTION",
        message: "Detector found signals, but score/gap/confidence are not strong enough for automatic classification."
      });
    }

    if (!autoAccept) {
      return {
        ...unknownDecision(allScores),
        decision: "needs-review",
        candidate: best.type,
        confidence,
        score: round(best.adjustedScore),
        gap: round(gap),
        signals: best.matches.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
      };
    }

    return {
      type: typeDefinition.type,
      label: typeDefinition.label,
      parser: typeDefinition.parser,
      confidence,
      decision: "auto",
      score: round(best.adjustedScore),
      gap: round(gap),
      signals: best.matches.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
      allScores,
      color: typeDefinition.color,
      icon: typeDefinition.icon
    };
  }

  function calculateConfidence(score, gap, matches) {
    const positiveMatches = matches.filter(match => match.weight > 0);
    const negativeMatches = matches.filter(match => match.weight < 0);
    const hasDefinitive = positiveMatches.some(match => match.weight >= 45);

    let confidence = 20;
    confidence += Math.min(score, 90) * 0.55;
    confidence += Math.min(Math.max(gap, 0), 50) * 0.35;
    confidence += Math.min(positiveMatches.length, 6) * 3;
    if (hasDefinitive) confidence += 8;
    confidence -= negativeMatches.length * 8;

    return Math.max(0, Math.min(96, Math.round(confidence)));
  }

  function unknownDecision(allScores) {
    return {
      type: FALLBACK_TYPE.type,
      label: FALLBACK_TYPE.label,
      parser: FALLBACK_TYPE.parser,
      confidence: 0,
      decision: "unknown",
      score: 0,
      gap: 0,
      signals: [],
      allScores,
      color: FALLBACK_TYPE.color,
      icon: FALLBACK_TYPE.icon
    };
  }

  function buildUnknownResult(input, language, warnings, startedAt) {
    return {
      version: VERSION,
      ...unknownDecision([]),
      language,
      filename: input.filename,
      textLength: 0,
      warnings,
      stats: {
        signalCount: 0,
        durationMs: Date.now() - startedAt
      }
    };
  }

  function getParserForType(type) {
    return (getTypeDefinition(type) || FALLBACK_TYPE).parser;
  }

  function getRegisteredTypes() {
    return DOCUMENT_TYPES.map(documentType => ({
      type: documentType.type,
      label: documentType.label,
      parser: documentType.parser,
      color: documentType.color,
      icon: documentType.icon,
      signalCount: documentType.signals.length
    }));
  }

  function getTypeDefinition(type) {
    return DOCUMENT_TYPES.find(documentType => documentType.type === type);
  }

  function signal(id, weight, config) {
    return {
      id,
      weight,
      ...config
    };
  }

  function antiSignal(id, weight, config) {
    return signal(id, Math.min(-1, weight), config);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [value];
  }

  function countOccurrences(text, term) {
    let index = 0;
    let count = 0;
    while ((index = text.indexOf(term, index)) !== -1) {
      count += 1;
      index += term.length;
    }
    return count;
  }

  function round(value) {
    return Math.round(value);
  }

  return {
    VERSION,
    detect,
    detectLanguage,
    normalizeText,
    getParserForType,
    getRegisteredTypes
  };
});
