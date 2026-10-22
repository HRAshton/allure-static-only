import { allureResultsConverter } from "../converters/allure-results.ts";
import { defineConverters } from "../sdk/index.ts";

/**
 * Build-time extension manifest.
 *
 * Trusted downstream projects add converter imports and register them here.
 * This module is compiled into the static browser bundle; no runtime plugin
 * installation, evaluation of uploaded JavaScript, or processing server exists.
 */
export default defineConverters({
  converters: [allureResultsConverter],
});
