/* ═══════════════════════════════════════════════════════════════
     ATLAS – INGESTION PIPELINE – Text extractor 
   ═══════════════════════════════════════════════════════════════ */

/**
 * Browser-side V1 extractor for uploaded legal source files.
 
 ═══════  Responsibilities: ═══════
 * - read supported file types
 * - preserve source truth
 * - produce normalized text for downstream parsing
 * - expose source units when the format gives us structure
 *

 ═══════  Non-Responsibilities: ═══════
 * - legal structure parsing
 * - concept detection
 * - relationship building
 * - legal reasoning
 
 * Supported V1 formats:
 * - TXT
 * - HTML / HTM
 * - PDF interface stub for future PDF.js or backend extraction
 */

// UMD-style wrapper: works in a browser script tag and in Node/CommonJS tests.
(function initAtlasExtractor(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ATLAS_Extractor = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasExtractor() {
  "use strict";

// Version the extractor contract so downstream modules can detect changes.
  const VERSION = "1.1.0";

// Browser extraction should stay bounded. Larger files belong to a backend.
  const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
  const SUPPORTED_EXTENSIONS = new Set(["txt", "html", "htm", "pdf"]);

// Extension support is intentionally narrow in V1.
  const FORMAT_BY_EXTENSION = {
    txt: "text/plain",
    html: "text/html",
    htm: "text/html",
    pdf: "application/pdf"
  };

// Remove executable/non-text browser artifacts from HTML sources.
  const REMOVABLE_HTML_SELECTORS = [
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "iframe"
  ];

// Tags that usually mark legal/source text blocks or layout blocks.
  const STRUCTURAL_TAGS = new Set([
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "BLOCKQUOTE",
    "BR",
    "CAPTION",
    "DD",
    "DETAILS",
    "DIV",
    "DL",
    "DT",
    "FIGCAPTION",
    "FIGURE",
    "FOOTER",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HEADER",
    "HR",
    "LI",
    "MAIN",
    "OL",
    "P",
    "PRE",
    "SECTION",
    "TABLE",
    "TBODY",
    "TD",
    "TFOOT",
    "TH",
    "THEAD",
    "TR",
    "UL"
  ]);

  const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

  /**
   * Extract a file into an ATLAS source payload.
   *
   * @param {File|Blob} file
   * @param {object} [options]
   * @param {number} [options.maxBytes]
   * @returns {Promise<AtlasExtractionResult>}
   */
  async function extract(file, options = {}) {
    const startedAt = Date.now();
    const warnings = [];
    const fileInfo = getFileInfo(file);

    validateFile(file, fileInfo, options);

    let payload;

// Route extraction by extension. Detector.js can become smarter later,
// but extractor V1 keeps format routing simple and explicit.
    switch (fileInfo.extension) {
      case "txt":
        payload = await extractTXT(file, fileInfo, warnings);
        break;
      case "html":
      case "htm":
        payload = await extractHTML(file, fileInfo, warnings);
        break;
      case "pdf":
        payload = await extractPDF(file, fileInfo, warnings);
        break;
      default:
        throw unsupportedFormatError(fileInfo.extension);
    }

// rawText is the extraction as produced by the adapter.
// normalizedText is the parser-friendly copy.
    
    const rawText = payload.rawText || "";
    const normalizedText = normalizeText(rawText);
    const sourceUnits = Array.isArray(payload.sourceUnits) ? payload.sourceUnits : [];

    if (!normalizedText) {
      warnings.push({
        code: "EMPTY_TEXT",
        message: "No meaningful text was extracted from the file."
      });
    }

    return {
      version: VERSION,
      filename: fileInfo.filename,
      size: fileInfo.size,
      extension: fileInfo.extension,
      mimeType: fileInfo.mimeType,
      format: FORMAT_BY_EXTENSION[fileInfo.extension],
      extractionMethod: payload.extractionMethod,
      rawText,
      normalizedText,
      text: normalizedText,
      sourceUnits,
      warnings,
      stats: buildStats(rawText, normalizedText, sourceUnits, startedAt)
    };
  }

  async function extractTXT(file, fileInfo, warnings) {
    const rawText = await readAsText(file);
    const sourceUnits = textToSourceUnits(rawText, fileInfo);

    if (sourceUnits.length === 0) {
      warnings.push({
        code: "TXT_NO_BLOCKS",
        message: "TXT file was read, but no paragraph-like text blocks were found."
      });
    }

    return {
      extractionMethod: "browser-text",
      rawText,
      sourceUnits
    };
  }


  /**
                                               * TXT extraction is simple, but we still convert the text into source units
                                               * so downstream modules do not depend on one huge wall of text.
*/
  async function extractHTML(file, fileInfo, warnings) {
    const html = await readAsText(file);

    if (typeof DOMParser === "undefined") {
      throw new Error("HTML extraction requires a browser environment with DOMParser.");
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const parseError = doc.querySelector("parsererror");

    if (parseError) {
      warnings.push({
        code: "HTML_PARSE_WARNING",
        message: "HTML parser reported a parse warning. Extraction will continue."
      });
    }

// Remove code/media artifacts, but do not remove legal source containers.
    for (const selector of REMOVABLE_HTML_SELECTORS) {
      doc.querySelectorAll(selector).forEach(element => element.remove());
    }

    const body = doc.body || doc.documentElement;
    if (!body) {
      return {
        extractionMethod: "browser-domparser",
        rawText: "",
        sourceUnits: []
      };
    }

    const sourceUnits = htmlToSourceUnits(body, fileInfo);
    const rawText = sourceUnits.map(unit => unit.text).join("\n\n");

    if (sourceUnits.length === 0) {
      warnings.push({
        code: "HTML_NO_BLOCKS",
        message: "HTML file was parsed, but no text-bearing structural blocks were found."
      });
    }

    return {
      extractionMethod: "browser-domparser",
      rawText,
      sourceUnits
    };
  }

/**
   * PDF is intentionally an adapter boundary in V1.
   *
   * Browser MVP later: PDF.js.
   * Production/backend later: layout-aware extractor such as MinerU or
   * OpenDataLoader PDF, returning pages, blocks, bounding boxes, and warnings.
   */
  async function extractPDF(file, fileInfo, warnings) {
    warnings.push({
      code: "PDF_NOT_IMPLEMENTED",
      message: "PDF extraction is reserved for the PDF.js adapter or backend extraction service."
    });

    throw new Error(
      "PDF extraction is not available in ATLAS browser V1. " +
      "Use official HTML or TXT for now. Future adapters should return page, block, and bounding-box metadata."
    );
  }
  
/**
 * Convert HTML into source units.
 *
 * A source unit is a traceable raw block. Parser.js will later turn these
 * raw blocks into legal nodes such as chapter, article, paragraph, point.
*/
  function htmlToSourceUnits(rootElement, fileInfo) {
    const units = [];
    let order = 0;

    function addUnit(element, text, explicitType) {
      const cleaned = normalizeInlineWhitespace(text);
      if (!cleaned) return;

      order += 1;
      units.push({
        id: `raw-${String(order).padStart(5, "0")}`,
        order,
        type: explicitType || inferHtmlUnitType(element),
        text: cleaned,
        source: {
          filename: fileInfo.filename,
          format: "text/html",
          htmlId: element.id || null,
          tagName: element.tagName ? element.tagName.toLowerCase() : null,
          className: typeof element.className === "string" ? element.className || null : null,
          pageNumber: null
        }
      });
    }

    function walk(element) {
      if (!element || element.nodeType !== 1) return;

      const tagName = element.tagName;

// Headings are self-contained structural hints.
      if (HEADING_TAGS.has(tagName)) {
        addUnit(element, element.textContent, "heading");
        return;
      }

// Lists often express legal points, obligations, or criteria.
      if (tagName === "LI") {
        addUnit(element, element.textContent, "list-item");
        return;
      }

// EUR-Lex and many official sources use tables for recitals/numbering.
      if (tagName === "TR") {
        const cells = Array.from(element.children)
          .filter(child => child.tagName === "TD" || child.tagName === "TH")
          .map(child => normalizeInlineWhitespace(child.textContent))
          .filter(Boolean);

        if (cells.length > 0) {
          addUnit(element, cells.join(" | "), "table-row");
          return;
        }
      }

// Paragraph-like units are the most important raw material for parser.js.
      if (tagName === "P" || tagName === "PRE" || tagName === "CAPTION") {
        addUnit(element, element.textContent, tagName === "CAPTION" ? "caption" : "paragraph");
        return;
      }

      for (const child of element.children) {
        walk(child);
      }

// Last-resort capture for empty-container structural tags with text.
      if (element.children.length === 0 && STRUCTURAL_TAGS.has(tagName)) {
        addUnit(element, element.textContent, inferHtmlUnitType(element));
      }
    }

    walk(rootElement);
    return dedupeAdjacentUnits(units);
  }

/**
* Convert plain text into source units by paragraph-like spacing.
*/
  function textToSourceUnits(text, fileInfo) {
    return normalizeText(text)
      .split(/\n{2,}/)
      .map(part => normalizeInlineWhitespace(part))
      .filter(Boolean)
      .map((part, index) => ({
        id: `raw-${String(index + 1).padStart(5, "0")}`,
        order: index + 1,
        type: inferTextUnitType(part),
        text: part,
        source: {
          filename: fileInfo.filename,
          format: "text/plain",
          htmlId: null,
          tagName: null,
          className: null,
          pageNumber: null
        }
      }));
  }

  function dedupeAdjacentUnits(units) {
    const result = [];
    for (const unit of units) {
      const previous = result[result.length - 1];
      if (previous && previous.text === unit.text && previous.type === unit.type) {
        continue;
      }
      result.push(unit);
    }
    return result.map((unit, index) => ({
      ...unit,
      id: `raw-${String(index + 1).padStart(5, "0")}`,
      order: index + 1
    }));
  }

  function inferHtmlUnitType(element) {
    const tagName = element.tagName;
    if (HEADING_TAGS.has(tagName)) return "heading";
    if (tagName === "LI") return "list-item";
    if (tagName === "TR") return "table-row";
    if (tagName === "CAPTION") return "caption";
    if (tagName === "P") return "paragraph";
    return "block";
  }

  function inferTextUnitType(text) {
    if (/^(chapter|title|section)\b/i.test(text)) return "heading";
    if (/^article\s+\d+/i.test(text)) return "heading";
    if (/^\(?\d+\)?\s+/.test(text)) return "paragraph";
    return "block";
  }

  function getFileInfo(file) {
    const filename = typeof file.name === "string" && file.name.trim()
      ? file.name.trim()
      : "untitled";
    const extension = getExtension(filename);

    return {
      filename,
      extension,
      size: Number(file.size || 0),
      mimeType: typeof file.type === "string" ? file.type || null : null
    };
  }

  function getExtension(filename) {
    const cleanName = filename.split(/[?#]/)[0];
    const lastDot = cleanName.lastIndexOf(".");
    if (lastDot <= 0 || lastDot === cleanName.length - 1) return "";
    return cleanName.slice(lastDot + 1).toLowerCase();
  }

  function validateFile(file, fileInfo, options) {
    if (!file) {
      throw new Error("No file provided to ATLAS extractor.");
    }

    if (!SUPPORTED_EXTENSIONS.has(fileInfo.extension)) {
      throw unsupportedFormatError(fileInfo.extension);
    }

    const maxBytes = Number(options.maxBytes || DEFAULT_MAX_BYTES);
    if (fileInfo.size > maxBytes) {
      throw new Error(
        `File is too large for browser extraction (${formatBytes(fileInfo.size)}). ` +
        `Maximum allowed size is ${formatBytes(maxBytes)}.`
      );
    }
  }

  function unsupportedFormatError(extension) {
    const label = extension ? `.${extension}` : "unknown";
    return new Error(`Unsupported file format: ${label}. Accepted: .txt, .html, .htm, .pdf`);
  }

  function readAsText(file, encoding = "UTF-8") {
    if (typeof FileReader === "undefined") {
      return readBlobTextFallback(file);
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file as text."));
      reader.readAsText(file, encoding);
    });
  }

  async function readBlobTextFallback(file) {
    if (typeof file.text === "function") {
      return file.text();
    }
    throw new Error("This environment cannot read File/Blob text.");
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\u00A0/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .split("\n")
      .map(line => normalizeInlineWhitespace(line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeInlineWhitespace(text) {
    return String(text || "")
      .replace(/\t/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .trim();
  }

  function buildStats(rawText, normalizedText, sourceUnits, startedAt) {
    const words = normalizedText ? normalizedText.split(/\s+/).filter(Boolean).length : 0;
    return {
      rawCharacters: rawText.length,
      normalizedCharacters: normalizedText.length,
      words,
      sourceUnits: sourceUnits.length,
      durationMs: Date.now() - startedAt
    };
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function preview(text, length = 500) {
    const value = String(text || "");
    if (value.length <= length) return value;
    return `${value.slice(0, length)}...`;
  }

  return {
    VERSION,
    extract,
    normalizeText,
    preview,
    supportedExtensions: Array.from(SUPPORTED_EXTENSIONS)
  };
});

/**
 * @typedef {object} AtlasExtractionResult
 * @property {string} version
 * @property {string} filename
 * @property {number} size
 * @property {string} extension
 * @property {string|null} mimeType
 * @property {string} format
 * @property {string} extractionMethod
 * @property {string} rawText
 * @property {string} normalizedText
 * @property {string} text
 * @property {Array<object>} sourceUnits
 * @property {Array<{code: string, message: string}>} warnings
 * @property {object} stats
 */

