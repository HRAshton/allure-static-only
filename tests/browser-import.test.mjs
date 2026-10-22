import assert from "node:assert/strict";
import test from "node:test";

import { bindBrowserImportEvents } from "../src/shell/browser-import.mjs";

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) {
        listeners.delete(type);
      }
    },
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
    hasListener(type) {
      return listeners.has(type);
    },
  };
}

test("Enter and Space open the file picker; repeated and unrelated keys do not", () => {
  const dropTarget = eventTarget();
  const directory = eventTarget();
  let pickerClicks = 0;
  const files = { ...eventTarget(), click: () => { pickerClicks += 1; } };
  const unbind = bindBrowserImportEvents({
    dropTarget,
    inputs: [directory, files],
    onFiles: () => {},
    onError: (error) => { throw error; },
  });
  let prevented = 0;
  for (const key of ["Enter", " ", "x"]) {
    dropTarget.dispatch("keydown", {
      key,
      repeat: false,
      preventDefault() { prevented += 1; },
    });
  }
  dropTarget.dispatch("keydown", {
    key: "Enter",
    repeat: true,
    preventDefault() { prevented += 1; },
  });
  assert.equal(pickerClicks, 2);
  assert.equal(prevented, 2);
  unbind();
  assert.equal(dropTarget.hasListener("keydown"), false);
  dropTarget.dispatch("keydown", { key: "Enter", repeat: false, preventDefault() {} });
  assert.equal(pickerClicks, 2);
});
