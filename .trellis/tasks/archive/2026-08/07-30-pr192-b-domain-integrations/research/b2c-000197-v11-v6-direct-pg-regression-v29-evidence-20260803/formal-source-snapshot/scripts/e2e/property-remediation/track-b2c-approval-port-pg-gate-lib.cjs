"use strict";

const APPROVAL_PORT_PG_REQUIRED_TEST_NAMES = Object.freeze([
  "requires the forward-fixed active partial unique predicate",
  "recovers every real dependent 23505 and proves caller commit or rollback",
  "fails unknown 23505 and unknown DB errors closed with usable caller manager",
  "keeps writes invisible before caller commit and removes them on caller rollback",
  "enforces terminal monotonicity before INSERT under the caller-held source lock",
  "serializes two post-terminal intents with the caller-held source lock",
  "resolves client-key, business-intent and active-source races and preserves manager usability"
]);

function parseTapSummary(output, { expectedTests, expectedNames }) {
  const count = (label) => {
    const matches = [...output.matchAll(new RegExp(`^# ${label} (\\d+)$`, "gmu"))];
    if (matches.length !== 1) {
      throw new Error(`TAP output must contain one unambiguous ${label} summary`);
    }
    return Number(matches[0][1]);
  };
  const planMatches = [...output.matchAll(/^1\.\.(\d+)$/gmu)];
  if (planMatches.length !== 1) {
    throw new Error("TAP output must contain one unambiguous top-level plan");
  }
  const result = {
    plan: Number(planMatches[0][1]),
    tests: count("tests"),
    suites: count("suites"),
    pass: count("pass"),
    fail: count("fail"),
    cancelled: count("cancelled"),
    skipped: count("skipped"),
    todo: count("todo")
  };
  if (result.plan !== expectedTests || result.tests !== expectedTests
    || result.suites !== 0 || result.pass !== expectedTests || result.fail !== 0
    || result.cancelled !== 0 || result.skipped !== 0 || result.todo !== 0) {
    throw new Error(`TAP exact-count contract failed: ${JSON.stringify(result)}`);
  }
  const actualNames = [...output.matchAll(/^# Subtest: (.+)$/gmu)].map((match) => match[1]);
  if (actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])) {
    throw new Error(`TAP required-name contract failed: ${JSON.stringify(actualNames)}`);
  }
  return { ...result, names: [...actualNames] };
}

module.exports = { APPROVAL_PORT_PG_REQUIRED_TEST_NAMES, parseTapSummary };
