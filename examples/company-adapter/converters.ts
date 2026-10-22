import { allureResultsConverter } from "../converters/allure-results.ts";
import { ctrfJsonConverter } from "../converters/ctrf-json.ts";
import { junitXmlConverter } from "../converters/junit-xml.ts";
import { companyResultsConverter } from "../extensions/company-results.ts";
import { defineConverters } from "../sdk/index.ts";

/** Trusted, external build overlay. No changes to the upstream Allure UI. */
export default defineConverters({
  apiVersion: 1,
  converters: [
    allureResultsConverter,
    junitXmlConverter,
    ctrfJsonConverter,
    companyResultsConverter,
  ],
});
