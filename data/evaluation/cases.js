module.exports = [
  {
    id: "fr-court-decision",
    fixture: "fixtures/judgments/fr-court-decision.txt",
    filename: "DTA_2504467_20260723.txt",
    expectedType: "judgment",
    expectedRoute: "judgment",
    minConfidence: 70,
    minProvisions: 3
  },
  {
    id: "fr-constitution",
    fixture: "fixtures/constitutions/fr-constitution.txt",
    filename: "constitution-fr-1958.txt",
    expectedType: "constitution",
    expectedRoute: "constitution",
    minConfidence: 70,
    minProvisions: 4
  }
];
