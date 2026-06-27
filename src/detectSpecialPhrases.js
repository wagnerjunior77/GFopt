function phraseFromEvents(events, phraseIndex) {
  const first = events[0];
  const last = events[events.length - 1];

  return {
    phraseId: phraseIndex + 1,
    phraseIndex,
    start: first.time,
    end: last.time,
    startCombo: first.comboStart,
    endCombo: last.comboEnd,
    eventIndexes: events.map((event) => event.eventIndex),
    notes: events.length,
    gemCount: events.reduce((total, event) => total + event.specialGemCount, 0),
  };
}

function detectSpecialPhrases(events, config) {
  const phrases = [];
  let current = [];
  let lastSpecialEnd = null;

  for (const event of events) {
    if (!event.hasSpecial) {
      if (current.length > 0 && event.time > lastSpecialEnd + 0.000001) {
        phrases.push(phraseFromEvents(current, phrases.length));
        current = [];
        lastSpecialEnd = null;
      }
      continue;
    }

    const startsNewPhrase =
      current.length === 0 ||
      event.time - lastSpecialEnd > config.phraseGapSeconds;

    if (startsNewPhrase && current.length > 0) {
      phrases.push(phraseFromEvents(current, phrases.length));
      current = [];
    }

    current.push(event);
    lastSpecialEnd = Math.max(lastSpecialEnd ?? event.time, event.specialEnd);
  }

  if (current.length > 0) {
    phrases.push(phraseFromEvents(current, phrases.length));
  }

  return phrases;
}

module.exports = { detectSpecialPhrases };
