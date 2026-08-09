import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const featureFile = await readFile(new URL("../features/cookiebuddy.feature", import.meta.url), "utf8");

test("Gherkin acceptance scenarios cover the main product flows", () => {
  for (const scenario of [
    "Scan the visited page",
    "Use the DPO contact from the visited page privacy policy",
    "Run a delta check with an automatic opt-out",
    "Run a delta check after manual opt-out",
    "Flag non-essential activity after opt-out",
    "Compare the all-opted-out state with banner services",
    "Export the detailed delta report",
    "Prepare delta findings for email"
  ]) {
    assert.ok(featureFile.includes(`Scenario: ${scenario}`), `missing Gherkin scenario: ${scenario}`);
  }
});
