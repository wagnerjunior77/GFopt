const {
  assignSustainTickScores,
  buildSustainTicks,
  eventBaseGemScore,
  eventComboScore,
  eventHeadScore,
  eventSpHeadScore,
  eventSustainScore,
} = require("./score");

function sameTime(a, b) {
  return Math.abs(a - b) < 0.000001;
}

function buildGroup(notes, eventIndex, comboStart, config) {
  const tracks = notes.map((note) => note.track).sort((a, b) => a - b);
  const durations = notes.map((note) => note.duration);
  const specialTracks = notes
    .filter((note) => note.special)
    .map((note) => note.track)
    .sort((a, b) => a - b);
  const specialEnd = notes
    .filter((note) => note.special)
    .reduce(
      (latest, note) => Math.max(latest, note.time + note.duration),
      notes[0].time
    );
  const gemCount = notes.length;
  const sustainNotes = notes
    .map((note, index) => {
      const combo = comboStart + index;
      const ticks = buildSustainTicks(note, combo, config);
      return {
        noteIndex: note.noteIndex,
        track: note.track,
        combo,
        start: note.time,
        duration: note.duration,
        end: note.time + note.duration,
        tickCount: ticks.length,
        ticks,
      };
    })
    .filter((note) => note.tickCount > 0);

  const event = {
    eventIndex,
    time: notes[0].time,
    tracks,
    durations,
    gemCount,
    hasSpecial: specialTracks.length > 0,
    specialGemCount: specialTracks.length,
    specialTracks,
    specialEnd,
    sustainNotes,
    sustainGemCount: sustainNotes.length,
    sustainTickCount: sustainNotes.reduce(
      (total, note) => total + note.tickCount,
      0
    ),
    comboStart,
    comboEnd: comboStart + gemCount - 1,
    sourceNoteIndexes: notes.map((note) => note.noteIndex),
  };

  event.baseGemScore = eventBaseGemScore(event, config);
  event.headScore = eventHeadScore(event, config);
  event.spHeadScore = eventSpHeadScore(event, config);
  event.sustainScore = eventSustainScore(event);
  event.comboScore = eventComboScore(event, config);

  return event;
}

function groupNotes(notes, config) {
  const sorted = [...notes].sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.track - b.track;
  });

  const groups = [];
  let pending = [];
  let combo = 1;

  for (const note of sorted) {
    if (pending.length > 0 && !sameTime(pending[0].time, note.time)) {
      const group = buildGroup(pending, groups.length, combo, config);
      groups.push(group);
      combo = group.comboEnd + 1;
      pending = [];
    }
    pending.push(note);
  }

  if (pending.length > 0) {
    const group = buildGroup(pending, groups.length, combo, config);
    groups.push(group);
  }

  return assignSustainTickScores(groups, config);
}

module.exports = { groupNotes };
