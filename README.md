# ATLAS

ATLAS is a student-first legal and regulatory knowledge workspace for international trade, business law, international law, and domestic law study.

The first version is intentionally narrow: one trustworthy document workspace that helps students read, search, annotate, and understand legal texts with visible sources. ATLAS should feel less like a chatbot and more like a professional research desk built around structured knowledge.

## V1 Promise

Students can open a regulation, navigate its structure, understand key articles in multiple reading modes, keep notes, and see concepts connected to exact source text.

## First Corpus

- Regulation (EU) 2016/679, General Data Protection Regulation
- Source format: EUR-Lex HTML and PDF
- Initial use: structure, navigation, article study, concept map prototype

## Product Principles

- Truth before AI
- Source references over unsupported answers
- Relationships before loose summaries
- Study workflows before enterprise complexity
- One excellent document experience before many mediocre imports

## Current Prototype

Open `index.html` in a browser. The prototype is static and dependency-free so it can be published with GitHub Pages.

The root page is now the ATLAS workspace dashboard. The GDPR reader lives under `documents/gdpr.html`.

## Repository Structure

```txt
docs/
  VISION.md
  ROADMAP.md
  DATA_MODEL.md
assets/
  main_logo.png
documents/
  gdpr.html
samples/
  gdpr/
    seed.js
index.html
seed.js
```

## Next Engineering Milestone

Convert the static prototype into a real application with:

- persistent notes
- structured document ingestion
- article-level search
- citation-aware explanations
- imported legal document storage
