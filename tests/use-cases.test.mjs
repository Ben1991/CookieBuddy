import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const featureFile = await readFile(new URL("../features/cookiebuddy.feature", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

function extractUseCaseIds(source) {
  return Array.from(source.matchAll(/@UC-(\d{2})\b/g), (match) => `UC-${match[1]}`);
}

function extractScenarioNames(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("Scenario:") || line.startsWith("Scenario Outline:"))
    .map((line) => line.replace(/^Scenario(?: Outline)?:\s*/, ""));
}

test("every acceptance scenario has a unique UC id", () => {
  const ids = extractUseCaseIds(featureFile);
  const scenarios = extractScenarioNames(featureFile);

  assert.equal(ids.length, scenarios.length, "every Scenario / Scenario Outline must have exactly one @UC-xx tag");
  assert.equal(new Set(ids).size, ids.length, "@UC-xx tags must be unique");
});

test("README documents every Gherkin use case", () => {
  for (const id of extractUseCaseIds(featureFile)) {
    assert.ok(readme.includes(`| ${id} `), `README use-case table is missing ${id}`);
  }
});

test("acceptance contract includes mandatory safety invariants", () => {
  for (const invariant of [
    "incomplete or unsupported checks can never produce a positive green verdict",
    "a successful DOM click alone is not treated as successful rejection",
    "cookie values are not stored or exported by default",
    "query parameter values and fragments are excluded by default",
    "does not claim complete tracking detection",
    "the task is not complete while any affected contract artifact is stale"
  ]) {
    assert.ok(featureFile.includes(invariant), `missing acceptance invariant: ${invariant}`);
  }
});
