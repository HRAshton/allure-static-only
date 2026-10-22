/** Browser-only drag/drop and picker port. */
export function bindBrowserImportEvents({ dropTarget, inputs, onFiles, onError }) {
  const dispatchFiles = (selected) => {
    if (!selected || selected.length === 0) {
      return;
    }
    const files = Array.from(selected);
    Promise.resolve()
      .then(() => onFiles(files))
      .catch(onError);
  };

  const onDragOver = (event) => {
    if (event.dataTransfer?.types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (event) => {
    event.preventDefault();
    dispatchFiles(event.dataTransfer?.files);
  };
  const onChange = (event) => {
    dispatchFiles(event.currentTarget.files);
  };
  const onKeyDown = (event) => {
    if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
      event.preventDefault();
      inputs.at(-1)?.click();
    }
  };

  dropTarget.addEventListener("dragover", onDragOver);
  dropTarget.addEventListener("keydown", onKeyDown);
  dropTarget.addEventListener("drop", onDrop);
  for (const input of inputs) {
    input.addEventListener("change", onChange);
  }
  return () => {
    dropTarget.removeEventListener("dragover", onDragOver);
    dropTarget.removeEventListener("drop", onDrop);
    dropTarget.removeEventListener("keydown", onKeyDown);
    for (const input of inputs) {
      input.removeEventListener("change", onChange);
    }
  };
}
