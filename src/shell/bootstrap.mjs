// Execute as an external, same-origin classic script before upstream Allure.
window.allureReportData = {};
window.allureReportDataReady = false;
window.allureReportOptions = {
  id: "awesome",
  reportName: "Allure Static Only",
  logo: "",
  reportLanguage: "en",
  theme: "auto",
  createdAt: Date.now(),
  reportUuid: "00000000-0000-4000-8000-000000000001",
  allureVersion: "3.21.0",
  cacheKey: "m1",
  layout: "split",
  defaultSection: "",
  groupBy: ["parentSuite", "suite", "subSuite"],
  sections: ["charts", "timeline", "metrics"],
};
window.allure = window.allure || {};
