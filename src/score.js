function comboMultiplierForCombo(combo, config) {
  const thresholds = config.comboThresholds;
  if (combo >= thresholds.x4) return Math.min(4, config.maxMultiplier);
  if (combo >= thresholds.x3) return Math.min(3, config.maxMultiplier);
  if (combo >= thresholds.x2) return Math.min(2, config.maxMultiplier);
  return 1;
}

function sustainMultiplierForComboCount(comboCount, config) {
  const thresholds = config.sustainComboThresholds ?? config.comboThresholds;
  if (comboCount >= thresholds.x4) return Math.min(4, config.maxMultiplier);
  if (comboCount >= thresholds.x3) return Math.min(3, config.maxMultiplier);
  if (comboCount >= thresholds.x2) return Math.min(2, config.maxMultiplier);
  return 1;
}

function roundScore(value) {
  return Number(value.toFixed(5));
}

function headScoreForCombo(combo, config) {
  const multiplier = comboMultiplierForCombo(combo, config);
  return config.headScoreByMultiplier[multiplier];
}

function spHeadScoreForCombo(combo, config) {
  return headScoreForCombo(combo, config) * config.spScoreMultiplier;
}

function sustainTickCountForDuration(duration, config) {
  if (duration <= config.sustainMinDurationSeconds) return 0;
  return Math.round(
    (duration - config.sustainMinDurationSeconds) /
      config.sustainTickIntervalSeconds +
      1
  );
}

function sustainTickScoreForCombo(combo, config) {
  const multiplier = comboMultiplierForCombo(combo, config);
  return config.sustainTickScoreByMultiplier[multiplier];
}

function spSustainTickScoreForCombo(combo, config) {
  const multiplier = comboMultiplierForCombo(combo, config);
  return config.spSustainTickScoreByMultiplier[multiplier];
}

function sustainTickScoreForComboCount(comboCount, config) {
  const multiplier = sustainMultiplierForComboCount(comboCount, config);
  return config.sustainTickScoreByMultiplier[multiplier];
}

function spSustainTickScoreForComboCount(comboCount, config) {
  const multiplier = sustainMultiplierForComboCount(comboCount, config);
  return config.spSustainTickScoreByMultiplier[multiplier];
}

function buildSustainTicks(note, combo, config) {
  const count = sustainTickCountForDuration(note.duration, config);
  if (count === 0) return [];

  const firstTickTime = note.time + config.sustainMinDurationSeconds;
  const lastTickTime = note.time + note.duration;
  const step =
    count > 1 ? (lastTickTime - firstTickTime) / (count - 1) : 0;
  return Array.from({ length: count }, (_, tickIndex) => ({
    tickIndex,
    time: roundScore(firstTickTime + step * tickIndex),
    comboAtTick: combo,
    normalScore: 0,
    spScore: 0,
    extraScoreFromSP: 0,
  }));
}

function comboCountAtTime(events, time) {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (events[mid].time <= time + 0.000001) low = mid + 1;
    else high = mid;
  }

  return events[Math.max(0, low - 1)]?.comboEnd ?? 0;
}

function assignSustainTickScores(events, config) {
  for (const event of events) {
    for (const sustainNote of event.sustainNotes) {
      for (const tick of sustainNote.ticks) {
        const comboAtTick = comboCountAtTime(events, tick.time);
        const normalScore = sustainTickScoreForComboCount(comboAtTick, config);
        const spScore = spSustainTickScoreForComboCount(comboAtTick, config);
        tick.comboAtTick = comboAtTick;
        tick.normalScore = normalScore;
        tick.spScore = spScore;
        tick.extraScoreFromSP = roundScore(spScore - normalScore);
      }
    }
    event.sustainScore = eventSustainScore(event);
    event.comboScore = eventComboScore(event, config);
  }

  return events;
}

function eventHeadScore(event, config) {
  let score = 0;
  for (let combo = event.comboStart; combo <= event.comboEnd; combo += 1) {
    score += headScoreForCombo(combo, config);
  }
  return roundScore(score);
}

function eventSpHeadScore(event, config) {
  let score = 0;
  for (let combo = event.comboStart; combo <= event.comboEnd; combo += 1) {
    score += spHeadScoreForCombo(combo, config);
  }
  return roundScore(score);
}

function eventSustainScore(event) {
  return roundScore(
    event.sustainNotes.reduce(
      (total, note) =>
        total +
        note.ticks.reduce((noteTotal, tick) => noteTotal + tick.normalScore, 0),
      0
    )
  );
}

function eventComboScore(event, config) {
  return roundScore(eventHeadScore(event, config) + eventSustainScore(event));
}

function eventBaseGemScore(event, config) {
  return eventHeadScore(event, config);
}

function coveredSustainForActivation(allEvents, coverageStart, coverageEnd) {
  const coveredTicks = [];

  for (const event of allEvents) {
    for (const sustainNote of event.sustainNotes) {
      const headCovered =
        event.time >= coverageStart - 0.000001 &&
        event.time <= coverageEnd + 0.000001;
      const firstEnhancedTickIndex = headCovered
        ? 0
        : sustainNote.ticks.findIndex(
            (tick) =>
              tick.time >= coverageStart - 0.000001 &&
              tick.time <= coverageEnd + 0.000001
          );

      if (firstEnhancedTickIndex === -1) continue;

      for (
        let index = firstEnhancedTickIndex;
        index < sustainNote.ticks.length;
        index += 1
      ) {
        const tick = sustainNote.ticks[index];
        coveredTicks.push({
          eventIndex: event.eventIndex,
          noteIndex: sustainNote.noteIndex,
          track: sustainNote.track,
          combo: sustainNote.combo,
          time: tick.time,
          normalScore: tick.normalScore,
          spScore: tick.spScore,
          extraScoreFromSP: tick.extraScoreFromSP,
        });
      }
    }
  }

  return coveredTicks;
}

function activationExtraScore(allEvents, headEvents, config, coverageStart, coverageEnd) {
  const coveredHeadScore = headEvents.reduce(
    (total, event) => total + event.headScore,
    0
  );
  const coveredHeadSpScore = headEvents.reduce(
    (total, event) => total + event.spHeadScore,
    0
  );
  const coveredSustainTicks = coveredSustainForActivation(
    allEvents,
    coverageStart,
    coverageEnd
  );
  const coveredSustainScore = coveredSustainTicks.reduce(
    (total, tick) => total + tick.normalScore,
    0
  );
  const extraSustainScoreFromSP = coveredSustainTicks.reduce(
    (total, tick) => total + tick.extraScoreFromSP,
    0
  );
  const realExtraScore =
    coveredHeadSpScore -
    coveredHeadScore +
    extraSustainScoreFromSP;

  if (config.spExtraScoreMode === "baseGem") {
    const legacy = headEvents.reduce(
      (total, event) => total + event.gemCount * config.baseGemScore,
      0
    );
    return {
      coveredBaseScore: legacy,
      coveredComboScore: legacy,
      coveredHeadScore,
      coveredSustainScore: roundScore(coveredSustainScore),
      coveredSustainTickCount: coveredSustainTicks.length,
      extraHeadScoreFromSP: legacy,
      extraSustainScoreFromSP: 0,
      extraScoreFromSP: legacy,
    };
  }

  if (config.spExtraScoreMode === "comboMultiplier") {
    const legacy = headEvents.reduce(
      (total, event) => total + event.headScore,
      0
    );
    return {
      coveredBaseScore: roundScore(legacy + coveredSustainScore),
      coveredComboScore: roundScore(legacy + coveredSustainScore),
      coveredHeadScore: roundScore(coveredHeadScore),
      coveredSustainScore: roundScore(coveredSustainScore),
      coveredSustainTickCount: coveredSustainTicks.length,
      extraHeadScoreFromSP: roundScore(legacy),
      extraSustainScoreFromSP: 0,
      extraScoreFromSP: roundScore(legacy),
    };
  }

  return {
    coveredBaseScore: roundScore(coveredHeadScore + coveredSustainScore),
    coveredComboScore: roundScore(coveredHeadScore + coveredSustainScore),
    coveredHeadScore: roundScore(coveredHeadScore),
    coveredSustainScore: roundScore(coveredSustainScore),
    coveredSustainTickCount: coveredSustainTicks.length,
    extraHeadScoreFromSP: roundScore(coveredHeadSpScore - coveredHeadScore),
    extraSustainScoreFromSP: roundScore(extraSustainScoreFromSP),
    extraScoreFromSP: roundScore(realExtraScore),
  };
}

module.exports = {
  activationExtraScore,
  assignSustainTickScores,
  buildSustainTicks,
  comboCountAtTime,
  comboMultiplierForCombo,
  eventBaseGemScore,
  eventComboScore,
  eventHeadScore,
  eventSpHeadScore,
  eventSustainScore,
  headScoreForCombo,
  roundScore,
  spHeadScoreForCombo,
  spSustainTickScoreForComboCount,
  spSustainTickScoreForCombo,
  sustainMultiplierForComboCount,
  sustainTickCountForDuration,
  sustainTickScoreForComboCount,
  sustainTickScoreForCombo,
};
