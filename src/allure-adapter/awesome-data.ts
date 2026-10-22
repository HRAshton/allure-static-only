import type {
  ReportAttachment,
  ReportStep,
  TestCase,
  TestReport,
  TestStatus,
} from "../domain/report.ts";

export interface AwesomeBinaryFile {
  readonly targetPath: string;
  readonly sourcePath: string;
}

export interface AwesomePayload {
  readonly documents: Readonly<Record<string, unknown>>;
  readonly binaries: readonly AwesomeBinaryFile[];
}

type StatusStatistic = { total: number } & Partial<Record<TestStatus, number>>;

function statistic(tests: readonly TestCase[]): StatusStatistic {
  const result: StatusStatistic = { total: tests.length };
  for (const test of tests) {
    result[test.status] = (result[test.status] ?? 0) + 1;
  }
  return result;
}

function groupedLabels(labels: TestCase["labels"]): Record<string, readonly string[]> {
  return Object.fromEntries(Object.entries(labels).map(([key, values]) => [key, [...values]]));
}

function labelItems(labels: TestCase["labels"]): Array<{ name: string; value: string }> {
  return Object.entries(labels).flatMap(([name, values]) =>
    values.map((value) => ({ name, value })),
  );
}

export function awesomeReportData(report: TestReport): AwesomePayload {
  const docs: Record<string, unknown> = Object.create(null);
  const binaries: AwesomeBinaryFile[] = [];
  let attachmentNumber = 0;

  const attachmentStep = ({ name, sourcePath, mimeType }: ReportAttachment) => {
    const lastName = sourcePath.split("/").at(-1) ?? "";
    const extension = /\.[a-z0-9]{1,12}$/i.exec(lastName)?.[0] ?? "";
    const id = `attachment-${attachmentNumber++}`;
    const safeMime = ["image/png", "image/jpeg", "image/webp", "text/plain", "application/json"];
    const contentType =
      mimeType && safeMime.includes(mimeType) ? mimeType : "application/octet-stream";
    binaries.push({ targetPath: `data/attachments/${id}${extension}`, sourcePath });
    return {
      type: "attachment",
      link: {
        id,
        name,
        originalFileName: lastName,
        ext: extension,
        contentType,
        used: true,
        missed: false,
      },
    };
  };

  const convertStep = (step: ReportStep): Record<string, unknown> => ({
    type: "step",
    name: step.name,
    status: step.status,
    parameters: [],
    ...(step.durationMs === undefined ? {} : { duration: step.durationMs }),
    steps: [...step.steps.map(convertStep), ...step.attachments.map(attachmentStep)],
  });

  const bySuite = new Map<string, Array<{ test: TestCase; id: string }>>();
  const allTests = report.tests.map((test, index) => ({ test, id: `test-${index}`, index }));
  const attempts = new Map<string, typeof allTests>();
  for (const item of allTests) {
    const key = item.test.historyId ? `history:${item.test.historyId}` : `uuid:${item.test.id}`;
    const group = attempts.get(key) ?? [];
    group.push(item);
    attempts.set(key, group);
  }
  const retriesById = new Map<string, string[]>();
  const retryIds = new Set<string>();
  for (const group of attempts.values()) {
    const ordered = [...group].sort(
      (a, b) => (a.test.startMs ?? a.index) - (b.test.startMs ?? b.index) || a.index - b.index,
    );
    const latest = ordered.at(-1);
    if (!latest) {
      continue;
    }
    const previousIds = ordered.slice(0, -1).map(({ id }) => id);
    retriesById.set(latest.id, previousIds);
    for (const id of previousIds) {
      retryIds.add(id);
    }
  }
  const visibleTests = allTests.filter(({ id }) => !retryIds.has(id));
  for (const { test, id, index } of allTests) {
    if (!retryIds.has(id)) {
      const suite = test.labels.suite?.[0] ?? "Imported results";
      const list = bySuite.get(suite) ?? [];
      list.push({ test, id });
      bySuite.set(suite, list);
    }

    docs[`data/test-results/${id}.json`] = {
      id,
      name: test.name,
      fullName: test.fullName ?? test.name,
      status: test.status,
      ...(test.startMs === undefined ? {} : { start: test.startMs }),
      ...(test.stopMs === undefined ? {} : { stop: test.stopMs }),
      ...(test.durationMs === undefined ? {} : { duration: test.durationMs }),
      ...(test.message === undefined ? {} : { error: { message: test.message } }),
      errors: test.message ? [{ message: test.message }] : [],
      labels: labelItems(test.labels),
      groupedLabels: groupedLabels(test.labels),
      parameters: [],
      links: [],
      steps: test.steps.map(convertStep),
      attachments: test.attachments.map(attachmentStep),
      setup: [],
      teardown: [],
      history: [],
      retries: [],
      retriesCount: 0,
      retry: false,
      isRetry: retryIds.has(id),
      retriesStatusChange: false,
      flaky: false,
      muted: false,
      known: false,
      breadcrumbs: [],
      testCaseHash: null,
      parametersHash: "",
      environmentHash: null,
      retryHash: test.historyId ?? null,
      environment: "default",
      order: index + 1,
    };
  }

  for (const [latestId, previousIds] of retriesById) {
    const current = docs[`data/test-results/${latestId}.json`] as Record<string, unknown>;
    const previous = previousIds.map(
      (id) => docs[`data/test-results/${id}.json`] as Record<string, unknown>,
    );
    current.retries = previous;
    current.retriesCount = previous.length;
    current.retry = previous.length > 0;
    current.retriesStatusChange = previous.some((item) => item.status !== current.status);
    current.flaky =
      current.status === "passed" &&
      previous.some((item) => item.status === "failed" || item.status === "broken");
  }

  const leavesById: Record<string, unknown> = Object.create(null);
  const groupsById: Record<string, unknown> = Object.create(null);
  const groups: string[] = [];
  for (const [index, [suite, tests]] of [...bySuite].entries()) {
    const groupId = `suite-${index}`;
    groups.push(groupId);
    groupsById[groupId] = {
      nodeId: groupId,
      name: suite,
      statistic: statistic(tests.map(({ test }) => test)),
      groups: [],
      leaves: tests.map(({ id }) => id),
    };
    for (const [indexInSuite, { test, id }] of tests.entries()) {
      leavesById[id] = {
        nodeId: id,
        id,
        name: test.name,
        status: test.status,
        ...(test.durationMs === undefined ? {} : { duration: test.durationMs }),
        groupOrder: indexInSuite + 1,
        flaky: false,
        retry: (retriesById.get(id)?.length ?? 0) > 0,
        retriesCount: retriesById.get(id)?.length ?? 0,
        retriesStatusChange:
          (docs[`data/test-results/${id}.json`] as Record<string, unknown>).retriesStatusChange ===
          true,
      };
    }
  }

  const tree = { root: { groups, leaves: [] }, leavesById, groupsById };
  const stats = statistic(visibleTests.map(({ test }) => test));
  const ids = visibleTests.map(({ id }) => id);
  docs["widgets/statistic.json"] = stats;
  docs["widgets/default/statistic.json"] = stats;
  docs["widgets/tree.json"] = tree;
  docs["widgets/default/tree.json"] = tree;
  docs["widgets/nav.json"] = ids;
  docs["widgets/default/nav.json"] = ids;
  docs["widgets/environments.json"] = [{ id: "default", name: "Default" }];
  docs["widgets/allure_environment.json"] = [];
  docs["widgets/globals.json"] = { errors: [], attachments: [] };
  docs["widgets/quality-gate.json"] = { default: [] };
  docs["widgets/categories.json"] = { roots: [] };
  docs["widgets/default/categories.json"] = { roots: [] };
  docs["widgets/resolution-categories.json"] = { groups: [] };
  docs["widgets/default/resolution-categories.json"] = { groups: [] };
  docs["widgets/variables.json"] = [];
  docs["widgets/default/variables.json"] = [];
  docs["widgets/tree-filters.json"] = { tags: [], categories: [] };
  return { documents: docs, binaries };
}
