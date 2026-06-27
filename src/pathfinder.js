const { activationExtraScore } = require("./score");

function roundTime(value) {
  return Number(value.toFixed(5));
}

function upperBoundEventTime(events, time) {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (events[mid].time <= time + 0.000001) low = mid + 1;
    else high = mid;
  }
  return low;
}

function lowerBoundEventTime(events, time) {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (events[mid].time < time - 0.000001) low = mid + 1;
    else high = mid;
  }
  return low;
}

function firstPhraseAfterTime(phrases, startIndex, time) {
  let index = startIndex;
  while (index < phrases.length && phrases[index].end <= time + 0.000001) {
    index += 1;
  }
  return index;
}

function lostPhrasesForActivation(phrases, nextPhraseIndex, startTime, endTime) {
  const lost = [];
  let index = nextPhraseIndex;
  while (index < phrases.length) {
    const phrase = phrases[index];
    if (phrase.start > endTime + 0.000001) break;
    if (phrase.end >= startTime - 0.000001) {
      lost.push(phrase);
    }
    index += 1;
  }
  return lost;
}

function firstPhraseIndexAfterLost(phrases, nextPhraseIndex, lostPhrases) {
  if (lostPhrases.length === 0) return nextPhraseIndex;
  return lostPhrases[lostPhrases.length - 1].phraseIndex + 1;
}

function timingForSpAmount(amount, config) {
  const timing = config.spTimings?.[amount] ?? {};
  const duration = timing.duration ?? config.spDurations?.[amount];

  return {
    duration,
    squeezeWindowSeconds: config.enableSqueeze
      ? timing.squeezeWindowSeconds ?? config.squeezeWindowSeconds ?? 0
      : 0,
    forceWindowSeconds: config.enableSqueeze
      ? timing.forceWindowSeconds ?? config.forceWindowSeconds ?? 0
      : 0,
    calibrated: timing.calibrated === true,
    source: timing.source ?? "uncalibrated",
  };
}

function activationTimingVariants(amount, config) {
  const timing = timingForSpAmount(amount, config);
  if (!timing.duration) return [];

  const hasWindow =
    timing.squeezeWindowSeconds > 0 || timing.forceWindowSeconds > 0;
  if (!hasWindow || config.includePlainActivationVariant === false) {
    return [{ ...timing, variant: "plain" }];
  }

  const variants = [
    {
      ...timing,
      squeezeWindowSeconds: 0,
      forceWindowSeconds: 0,
      variant: "plain",
    },
  ];

  if (timing.forceWindowSeconds > 0) {
    variants.push({
      ...timing,
      squeezeWindowSeconds: 0,
      variant: "force",
    });
  }

  if (timing.squeezeWindowSeconds > 0) {
    variants.push({
      ...timing,
      squeezeWindowSeconds: 0,
      forceWindowSeconds: 0,
      activationOffsetSeconds: -timing.squeezeWindowSeconds,
      variant: "pre",
    });

    variants.push({
      ...timing,
      forceWindowSeconds: 0,
      variant: "squeeze",
    });
  }

  if (timing.squeezeWindowSeconds > 0 && timing.forceWindowSeconds > 0) {
    variants.push({
      ...timing,
      variant: "max",
    });
  }

  return variants;
}

function timingVariantsForAnchor(amount, anchor, config) {
  const variants = activationTimingVariants(amount, config);
  if (anchor.type !== "sustain" && !anchor.postPhraseEnd) return variants;

  const byKey = new Map();
  for (const timing of variants) {
    const forceWindowSeconds = timing.forceWindowSeconds;
    const variant = forceWindowSeconds > 0 ? "force" : "plain";
    const key = `${variant}|${forceWindowSeconds}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        ...timing,
        squeezeWindowSeconds: 0,
        forceWindowSeconds,
        variant,
      });
    }
  }
  return [...byKey.values()];
}

function sustainAnchorsForEvent(event) {
  const anchorsByTime = new Map();
  for (const note of event.sustainNotes) {
    for (const tick of note.ticks) {
      const key = tick.time.toFixed(5);
      const anchor = anchorsByTime.get(key) ?? {
        type: "sustain",
        time: tick.time,
        eventIndex: event.eventIndex,
        comboStart: note.combo,
        comboEnd: note.combo,
        tracks: [],
      };

      anchor.comboStart = Math.min(anchor.comboStart, note.combo);
      anchor.comboEnd = Math.max(anchor.comboEnd, note.combo);
      anchor.tracks.push(note.track);
      anchorsByTime.set(key, anchor);
    }
  }

  return [...anchorsByTime.values()].map((anchor) => ({
    ...anchor,
    tracks: [...new Set(anchor.tracks)].sort((a, b) => a - b),
  }));
}

function activationAnchorsForEvent(event, config) {
  const anchors = [
    {
      type: "head",
      time: event.time,
      eventIndex: event.eventIndex,
      comboStart: event.comboStart,
      comboEnd: event.comboEnd,
      tracks: event.tracks,
    },
  ];

  if (config.includeSustainActivationAnchors !== false) {
    anchors.push(...sustainAnchorsForEvent(event));
  }

  return anchors;
}

function isPostPhraseEndAnchor(events, phrases, phraseIndex, anchor) {
  if (phraseIndex <= 0 || anchor.type !== "head") return false;

  const previousPhrase = phrases[phraseIndex - 1];
  if (!previousPhrase) return false;

  return (
    Math.abs(anchor.time - previousPhrase.end) < 0.000001 &&
    anchor.eventIndex === lowerBoundEventTime(events, previousPhrase.end)
  );
}

function allowedSpAmounts(bar, config) {
  if (bar < config.minActivation) return [];

  if (config.activationUsesFullBar) {
    return timingForSpAmount(bar, config).duration ? [bar] : [];
  }

  return [2, 3, 4].filter(
    (amount) => amount <= bar && timingForSpAmount(amount, config).duration
  );
}

function buildActivation(
  events,
  phrases,
  startEventIndex,
  nextPhraseIndex,
  bar,
  amount,
  timing,
  config,
  anchor = null
) {
  const anchorEvent = events[startEventIndex];
  const activationAnchor =
    anchor ??
    {
      type: "head",
      time: anchorEvent.time,
      eventIndex: anchorEvent.eventIndex,
      comboStart: anchorEvent.comboStart,
      comboEnd: anchorEvent.comboEnd,
      tracks: anchorEvent.tracks,
    };
  const startSqueeze = timing.squeezeWindowSeconds;
  const endForce = timing.forceWindowSeconds;
  const activationOffset = timing.activationOffsetSeconds ?? startSqueeze;

  const activateAtTime = activationAnchor.time + activationOffset;
  const activeUntil = activateAtTime + timing.duration;
  const coverageStart = activateAtTime - startSqueeze;
  const coverageEnd = activeUntil + endForce;
  const firstCoveredIndex = lowerBoundEventTime(events, coverageStart);
  const endExclusive = upperBoundEventTime(events, coverageEnd);
  const coveredEvents = events.slice(firstCoveredIndex, endExclusive);
  const headEvents =
    activationAnchor.postPhraseEnd && activationAnchor.type === "head"
      ? coveredEvents.filter(
          (event) => event.eventIndex !== activationAnchor.eventIndex
        )
      : coveredEvents;
  const coveredGemCount = headEvents.reduce(
    (total, event) => total + event.gemCount,
    0
  );
  const score = activationExtraScore(
    events,
    headEvents,
    config,
    coverageStart,
    coverageEnd
  );
  const lostPhrases = config.gainSpWhileActive
    ? []
    : lostPhrasesForActivation(phrases, nextPhraseIndex, coverageStart, coverageEnd);
  const firstCoveredEvent = headEvents[0] ?? coveredEvents[0] ?? anchorEvent;
  const lastCoveredEvent =
    headEvents[headEvents.length - 1] ??
    coveredEvents[coveredEvents.length - 1] ??
    anchorEvent;
  const activationEndSlackSeconds =
    endForce > 0 ? Math.max(0, coverageEnd - lastCoveredEvent.time) : null;
  const maxSqueezeSlackToleranceSeconds =
    config.maxSqueezeSlackToleranceSeconds ?? 0.011;
  const requiresMaxSqueeze =
    timing.variant === "max" &&
    startSqueeze > 0 &&
    endForce > 0 &&
    activationEndSlackSeconds != null &&
    activationEndSlackSeconds <= maxSqueezeSlackToleranceSeconds;

  return {
    activation: {
      spAmountUsed: amount,
      barBefore: bar,
      barAfter: bar - amount,
      activateAtTime: roundTime(activateAtTime),
      activateAtCombo: activationAnchor.comboStart,
      activateAtComboEnd: activationAnchor.comboEnd,
      activationAnchorType: activationAnchor.type,
      activationAnchorTracks: activationAnchor.tracks,
      postPhraseEndActivation: activationAnchor.postPhraseEnd === true,
      firstCoveredTime: roundTime(firstCoveredEvent.time),
      firstCoveredCombo: firstCoveredEvent.comboStart,
      activeUntilTime: roundTime(activeUntil),
      forcedEndWindowUntilTime: roundTime(coverageEnd),
      endAtCombo: lastCoveredEvent.comboEnd,
      lastCoveredTime: roundTime(lastCoveredEvent.time),
      coveredGemCount,
      coveredEventsCount: headEvents.length,
      coveredBaseScore: score.coveredBaseScore,
      coveredComboScore: score.coveredComboScore,
      coveredHeadScore: score.coveredHeadScore,
      coveredSustainScore: score.coveredSustainScore,
      coveredSustainTickCount: score.coveredSustainTickCount,
      extraHeadScoreFromSP: score.extraHeadScoreFromSP,
      extraSustainScoreFromSP: score.extraSustainScoreFromSP,
      extraScoreFromSP: score.extraScoreFromSP,
      spTimingCalibrated: timing.calibrated,
      spTimingSource: timing.source,
      activationTimingVariant: timing.variant,
      activationEndSlackSeconds:
        activationEndSlackSeconds == null
          ? null
          : roundTime(activationEndSlackSeconds),
      requiresMaxSqueeze,
      lostSpecialPhrases: lostPhrases.map((phrase) => ({
        phraseId: phrase.phraseId,
        start: roundTime(phrase.start),
        end: roundTime(phrase.end),
        startCombo: phrase.startCombo,
        endCombo: phrase.endCombo,
      })),
      ...(startSqueeze > 0
        ? {
            usesSqueeze: true,
            squeezeOffsetSeconds: startSqueeze,
          }
        : {}),
      ...(activationOffset < 0
        ? {
            usesPreActivation: true,
            preActivationOffsetSeconds: Math.abs(activationOffset),
          }
        : {}),
      ...(endForce > 0
        ? {
            usesForcedEnd: true,
            usesForcedPhrase: true,
            forcedPhraseOffsetSeconds: endForce,
          }
        : {}),
    },
    nextEventIndex: endExclusive,
    nextPhraseIndex: firstPhraseIndexAfterLost(
      phrases,
      nextPhraseIndex,
      lostPhrases
    ),
    gain: score.extraScoreFromSP,
  };
}

function activationStrictnessScore(activation) {
  let score = 0;
  if (activation.requiresMaxSqueeze) score += 100;
  if (activation.activationTimingVariant === "max") score += 10;
  if (activation.usesForcedEnd) score += 2;
  if (activation.usesSqueeze) score += 1;
  if (activation.usesPreActivation) score += 1;
  return score;
}

function compareActivationLists(candidateActivations, currentActivations) {
  if (candidateActivations.length !== currentActivations.length) {
    return currentActivations.length - candidateActivations.length;
  }

  const candidateStrictness = candidateActivations.reduce(
    (total, activation) => total + activationStrictnessScore(activation),
    0
  );
  const currentStrictness = currentActivations.reduce(
    (total, activation) => total + activationStrictnessScore(activation),
    0
  );
  if (candidateStrictness !== currentStrictness) {
    return currentStrictness - candidateStrictness;
  }

  for (
    let index = candidateActivations.length - 1;
    index >= 0;
    index -= 1
  ) {
    const candidate = candidateActivations[index];
    const current = currentActivations[index];
    if (candidate.endAtCombo !== current.endAtCombo) {
      return candidate.endAtCombo - current.endAtCombo;
    }
    if (candidate.activateAtCombo !== current.activateAtCombo) {
      return candidate.activateAtCombo - current.activateAtCombo;
    }
  }

  return 0;
}

function isBetter(candidate, current) {
  if (!current) return true;
  if (candidate.gain > current.gain + 0.000001) return true;
  if (candidate.gain < current.gain - 0.000001) return false;
  return compareActivationLists(candidate.activations, current.activations) > 0;
}

function findBestPath(events, phrases, config) {
  const memo = new Map();

  function solve(nextPhraseIndex, bar, eventIndex) {
    const normalizedPhraseIndex = firstPhraseAfterTime(
      phrases,
      nextPhraseIndex,
      events[eventIndex - 1]?.time ?? -Infinity
    );
    const key = `${normalizedPhraseIndex}|${bar}|${eventIndex}`;
    const cached = memo.get(key);
    if (cached) return cached;

    let best = { gain: 0, activations: [] };

    if (normalizedPhraseIndex < phrases.length) {
      const phrase = phrases[normalizedPhraseIndex];
      const phraseEndEventIndex = config.allowPhraseEndActivation
        ? lowerBoundEventTime(events, phrase.end)
        : upperBoundEventTime(events, phrase.end);
      const nextEventIndex = Math.max(eventIndex, phraseEndEventIndex);
      const waitResult = solve(
        normalizedPhraseIndex + 1,
        Math.min(config.maxBar, bar + config.phraseGain),
        nextEventIndex
      );
      if (isBetter(waitResult, best)) best = waitResult;
    }

    const amounts = allowedSpAmounts(bar, config);
    if (amounts.length > 0 && eventIndex < events.length) {
      const nextPhrase = phrases[normalizedPhraseIndex];
      const activationBoundary = nextPhrase ? nextPhrase.end : Infinity;
      const earliestActivationTime =
        normalizedPhraseIndex > 0
          ? phrases[normalizedPhraseIndex - 1].end
          : -Infinity;

      for (
        let startEventIndex = eventIndex;
        startEventIndex < events.length &&
        events[startEventIndex].time <= activationBoundary + 0.000001;
        startEventIndex += 1
      ) {
        for (const amount of amounts) {
          for (const anchor of activationAnchorsForEvent(
            events[startEventIndex],
            config
          )) {
            if (anchor.time > activationBoundary + 0.000001) continue;
            const activationAnchor = {
              ...anchor,
              postPhraseEnd: isPostPhraseEndAnchor(
                events,
                phrases,
                normalizedPhraseIndex,
                anchor
              ),
            };

            for (const timing of timingVariantsForAnchor(
              amount,
              activationAnchor,
              config
            )) {
              const candidate = buildActivation(
                events,
                phrases,
                startEventIndex,
                normalizedPhraseIndex,
                bar,
                amount,
                timing,
                config,
                activationAnchor
              );
              if (
                candidate.activation.activateAtTime <
                earliestActivationTime - 0.000001
              ) {
                continue;
              }
              const after = solve(
                candidate.nextPhraseIndex,
                candidate.activation.barAfter,
                candidate.nextEventIndex
              );
              const combined = {
                gain: candidate.gain + after.gain,
                activations: [candidate.activation, ...after.activations],
              };
              if (isBetter(combined, best)) best = combined;
            }
          }
        }
      }
    }

    memo.set(key, best);
    return best;
  }

  const result = solve(0, 0, 0);
  result.activations = result.activations.map((activation, index) => ({
    activationIndex: index + 1,
    ...activation,
  }));
  result.memoStates = memo.size;
  return result;
}

module.exports = {
  activationTimingVariants,
  findBestPath,
  roundTime,
  timingForSpAmount,
};
