const { GF_ENGINE } = require("./config");
const { detectSpecialPhrases } = require("./detectSpecialPhrases");
const { groupNotes } = require("./groupNotes");
const { normalizeNotes } = require("./loadNotes");
const { findBestPath } = require("./pathfinder");
const { buildSummary } = require("./index");

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function analyzeNotes(rawNotes, configOverrides = {}) {
  const config = {
    ...cloneConfig(GF_ENGINE),
    ...configOverrides,
  };
  const notes = normalizeNotes(rawNotes, "browser chart notes");
  const grouped = groupNotes(notes, config);
  const phrases = detectSpecialPhrases(grouped, config);
  const pathResult = findBestPath(grouped, phrases, config);
  const summary = buildSummary(notes, grouped, phrases, pathResult, config);

  return {
    summary,
    activations: pathResult.activations,
    phraseCount: phrases.length,
    eventCount: grouped.length,
  };
}

module.exports = { analyzeNotes };
