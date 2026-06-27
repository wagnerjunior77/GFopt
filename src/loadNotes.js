const fs = require("fs");
const path = require("path");

function parseNumber(value, field, index) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid ${field} at note ${index}: ${JSON.stringify(value)}`);
  }
  return number;
}

function parseTrack(value, index) {
  const track = Number.parseInt(value, 10);
  if (!Number.isInteger(track)) {
    throw new Error(`Invalid track at note ${index}: ${JSON.stringify(value)}`);
  }
  return track;
}

function parseSpecial(value) {
  return value === true || value === 1 || value === "1";
}

function normalizeNotes(parsed, sourceName = "input") {
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${sourceName} to contain a JSON array`);
  }

  return parsed.map((note, index) => ({
    noteIndex: index,
    time: parseNumber(note.time, "time", index),
    duration: parseNumber(note.duration ?? 0, "duration", index),
    track: parseTrack(note.track, index),
    special: parseSpecial(note.special),
  }));
}

function loadNotes(inputFile) {
  const absolutePath = path.resolve(inputFile);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(raw);

  return normalizeNotes(parsed, absolutePath);
}

module.exports = { loadNotes, normalizeNotes };
