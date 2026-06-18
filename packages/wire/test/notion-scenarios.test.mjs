import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDiffScenario,
  assertRoundTripScenario,
  assertSyncScenario,
  notionDiffScenarios,
  notionRoundTripScenarios,
  notionScenarios,
  notionSyncScenarios,
} from "./support/notion-scenarios.mjs";

test("Notion scenario support contains 105 named scenarios", () => {
  assert.equal(notionScenarios.length, 105);
  assert.equal(new Set(notionScenarios.map((scenario) => scenario.name)).size, 105);
  assert.equal(notionRoundTripScenarios.length, 72);
  assert.equal(notionDiffScenarios.length, 20);
  assert.equal(notionSyncScenarios.length, 13);
});

for (const scenario of notionRoundTripScenarios) {
  test(`Notion scenario ${scenario.name}`, () => {
    assertRoundTripScenario(scenario);
  });
}

for (const scenario of notionDiffScenarios) {
  test(`Notion scenario ${scenario.name}`, () => {
    assertDiffScenario(scenario);
  });
}

for (const scenario of notionSyncScenarios) {
  test(`Notion scenario ${scenario.name}`, async () => {
    await assertSyncScenario(scenario);
  });
}
