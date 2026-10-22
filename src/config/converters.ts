import { allureResultsConverter } from "../converters/allure-results.ts";
import { junitXmlConverter } from "../converters/junit-xml.ts";
import { defineConverters } from "../sdk/index.ts";

/**
 * Build-time registration entry point.
 * Add trusted imports and include them in the converters array.
 * See docs/PUBLIC-CONVERTER-API.md.
 */
export default defineConverters({
  apiVersion: 1,
  converters: [allureResultsConverter, junitXmlConverter],
});
