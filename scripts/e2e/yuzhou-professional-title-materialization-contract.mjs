import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLegacyProfessionalTitleDictionary,
  LegacyProfessionalTitleMaterializationError,
  materializeLegacyProfessionalTitle,
} from "../hr-cutover/legacy-professional-title-materialization.mjs";

test("materializes an assignment code as a professional title and never as a position", () => {
  const dictionary = buildLegacyProfessionalTitleDictionary([
    { assignment: "T1", assignmentname: "Reviewed title" },
  ]);
  assert.deepEqual(materializeLegacyProfessionalTitle(" T1 ", dictionary), {
    legacyProfessionalTitleCode: "T1",
    technicalTitle: "Reviewed title",
  });
  assert.deepEqual(materializeLegacyProfessionalTitle(null, dictionary), {
    legacyProfessionalTitleCode: null,
    technicalTitle: null,
  });
});

test("fails closed for missing, duplicate, malformed, or unknown dictionary data", () => {
  assert.throws(() => buildLegacyProfessionalTitleDictionary([{ assignment: "T1", assignmentname: "One" }, { assignment: "T1", assignmentname: "Two" }]), error => error instanceof LegacyProfessionalTitleMaterializationError && error.code === "LEGACY_PROFESSIONAL_TITLE_DICTIONARY_DUPLICATE");
  assert.throws(() => buildLegacyProfessionalTitleDictionary([{ assignment: "T1", assignmentname: null }]), error => error.code === "LEGACY_PROFESSIONAL_TITLE_DICTIONARY_INVALID");
  assert.throws(() => buildLegacyProfessionalTitleDictionary([{ assignment: "T1", assignmentname: "One", position: "forbidden" }]), error => error.code === "LEGACY_PROFESSIONAL_TITLE_DICTIONARY_INVALID");
  assert.throws(() => materializeLegacyProfessionalTitle("T2", new Map([["T1", "One"]])), error => error.code === "LEGACY_PROFESSIONAL_TITLE_UNKNOWN_CODE");
});
