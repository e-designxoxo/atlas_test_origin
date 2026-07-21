const ATLAS_SEED = {
  document: {
    id: "gdpr-2016-679",
    title: "Regulation (EU) 2016/679",
    shortTitle: "GDPR",
    subtitle: "General Data Protection Regulation",
    jurisdiction: "European Union",
    date: "27 April 2016",
    source: "EUR-Lex CELEX:32016R0679",
    status: "Foundation corpus"
  },
  chapters: [
    { id: "chapter-1", label: "Chapter I", title: "General provisions", articles: ["art-1", "art-2", "art-3", "art-4"] },
    { id: "chapter-2", label: "Chapter II", title: "Principles", articles: ["art-5", "art-6", "art-7", "art-8", "art-9", "art-10", "art-11"] },
    { id: "chapter-3", label: "Chapter III", title: "Rights of the data subject", articles: ["art-12", "art-13", "art-14", "art-15", "art-17", "art-20", "art-22"] },
    { id: "chapter-5", label: "Chapter V", title: "Transfers to third countries", articles: ["art-44", "art-45", "art-46", "art-49"] },
    { id: "chapter-8", label: "Chapter VIII", title: "Remedies, liability and penalties", articles: ["art-77", "art-82", "art-83"] }
  ],
  articles: [
    {
      id: "art-1",
      number: "Article 1",
      title: "Subject-matter and objectives",
      chapter: "Chapter I",
      text: "This Regulation lays down rules relating to the protection of natural persons with regard to the processing of personal data and rules relating to the free movement of personal data. It protects fundamental rights and freedoms of natural persons and in particular their right to the protection of personal data.",
      concepts: ["personal data", "fundamental rights", "free movement"],
      studyPrompt: "What are the two objectives GDPR balances?"
    },
    {
      id: "art-3",
      number: "Article 3",
      title: "Territorial scope",
      chapter: "Chapter I",
      text: "This Regulation applies to processing in the context of an establishment of a controller or processor in the Union, regardless of whether the processing takes place in the Union. It can also apply to controllers or processors outside the Union when offering goods or services to data subjects in the Union or monitoring their behaviour.",
      concepts: ["territorial scope", "controller", "processor", "Union"],
      studyPrompt: "Why can GDPR affect businesses outside the EU?"
    },
    {
      id: "art-4",
      number: "Article 4",
      title: "Definitions",
      chapter: "Chapter I",
      text: "Article 4 defines core GDPR terms including personal data, processing, controller, processor, consent, recipient, third party, profiling, pseudonymisation, and supervisory authority.",
      concepts: ["definitions", "personal data", "controller", "processor", "consent"],
      studyPrompt: "Which definitions are operational roles and which are protected interests?"
    },
    {
      id: "art-5",
      number: "Article 5",
      title: "Principles relating to processing of personal data",
      chapter: "Chapter II",
      text: "Personal data shall be processed lawfully, fairly and transparently; collected for specified, explicit and legitimate purposes; adequate, relevant and limited to what is necessary; accurate; kept no longer than necessary; and processed securely. The controller is responsible for, and must be able to demonstrate, compliance.",
      concepts: ["lawfulness", "transparency", "purpose limitation", "data minimisation", "accountability"],
      studyPrompt: "Why is accountability more than a paperwork requirement?"
    },
    {
      id: "art-6",
      number: "Article 6",
      title: "Lawfulness of processing",
      chapter: "Chapter II",
      text: "Processing is lawful only if at least one legal basis applies, such as consent, contract necessity, legal obligation, vital interests, public task, or legitimate interests, subject to the conditions in the article.",
      concepts: ["legal basis", "consent", "contract", "legitimate interests"],
      studyPrompt: "Which legal basis is weakest if the user has little real choice?"
    },
    {
      id: "art-9",
      number: "Article 9",
      title: "Special categories of personal data",
      chapter: "Chapter II",
      text: "Processing personal data revealing racial or ethnic origin, political opinions, religious beliefs, trade union membership, genetic data, biometric data, health data, or sex life or sexual orientation is prohibited unless a listed exception applies.",
      concepts: ["special category data", "health data", "biometric data", "exceptions"],
      studyPrompt: "Why does GDPR treat some data as more sensitive?"
    },
    {
      id: "art-12",
      number: "Article 12",
      title: "Transparent information, communication and modalities",
      chapter: "Chapter III",
      text: "Controllers must provide information and communications relating to data subject rights in a concise, transparent, intelligible and easily accessible form, using clear and plain language.",
      concepts: ["transparency", "data subject rights", "clear language"],
      studyPrompt: "How does this article connect legal compliance to UX writing?"
    },
    {
      id: "art-15",
      number: "Article 15",
      title: "Right of access by the data subject",
      chapter: "Chapter III",
      text: "The data subject has the right to obtain confirmation whether personal data concerning them are being processed and access to that data and related information such as purposes, categories, recipients, retention period, rights, and safeguards for transfers.",
      concepts: ["access right", "data subject", "recipients", "retention"],
      studyPrompt: "What information must a person receive to understand how their data is used?"
    },
    {
      id: "art-17",
      number: "Article 17",
      title: "Right to erasure",
      chapter: "Chapter III",
      text: "The data subject has the right to obtain erasure of personal data in listed circumstances, including when data is no longer necessary, consent is withdrawn, objection succeeds, processing was unlawful, erasure is legally required, or data was collected from a child in relation to information society services.",
      concepts: ["erasure", "withdrawal of consent", "unlawful processing"],
      studyPrompt: "Why is the right to erasure conditional rather than absolute?"
    },
    {
      id: "art-44",
      number: "Article 44",
      title: "General principle for transfers",
      chapter: "Chapter V",
      text: "Transfers of personal data to a third country or international organisation may take place only if the controller and processor comply with the conditions in Chapter V, ensuring that the level of protection guaranteed by GDPR is not undermined.",
      concepts: ["international transfer", "third country", "adequate protection"],
      studyPrompt: "Why do international transfers matter for trade and business students?"
    },
    {
      id: "art-82",
      number: "Article 82",
      title: "Right to compensation and liability",
      chapter: "Chapter VIII",
      text: "Any person who has suffered material or non-material damage as a result of an infringement has the right to receive compensation from the controller or processor for the damage suffered.",
      concepts: ["liability", "compensation", "controller", "processor"],
      studyPrompt: "How does liability change business risk?"
    },
    {
      id: "art-83",
      number: "Article 83",
      title: "General conditions for imposing administrative fines",
      chapter: "Chapter VIII",
      text: "Administrative fines must be effective, proportionate and dissuasive. Supervisory authorities consider factors such as nature, gravity, duration, intentional or negligent character, mitigation, responsibility, previous infringements, cooperation, affected data categories, and notification.",
      concepts: ["administrative fines", "supervisory authority", "proportionality", "risk"],
      studyPrompt: "What factors make a GDPR infringement more serious?"
    }
  ],
  concepts: [
    { label: "personal data", description: "Information relating to an identified or identifiable natural person.", articles: ["art-1", "art-4", "art-5", "art-9", "art-15", "art-44"] },
    { label: "controller", description: "The actor deciding purposes and means of processing.", articles: ["art-3", "art-4", "art-5", "art-6", "art-82"] },
    { label: "processor", description: "The actor processing personal data on behalf of a controller.", articles: ["art-3", "art-4", "art-82"] },
    { label: "consent", description: "A legal basis that depends on real, informed, specific choice.", articles: ["art-4", "art-6", "art-17"] },
    { label: "international transfer", description: "Movement of personal data to a third country or international organisation.", articles: ["art-44"] },
    { label: "accountability", description: "The controller must comply and demonstrate compliance.", articles: ["art-5", "art-83"] }
  ]
};

