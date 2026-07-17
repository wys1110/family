(() => {
  const dialog = document.querySelector("#growthDialog");
  const form = document.querySelector("#growthForm");
  const categorySelect = document.querySelector("#growthCategory");
  if (!dialog || !form || !categorySelect || dialog.dataset.simpleLayoutBound === "true") return;

  dialog.dataset.simpleLayoutBound = "true";

  const routineCategories = new Set(["수유·이유식", "수면", "기저귀"]);
  const categoryLabels = {
    "수유·이유식": "수유",
    "수면": "수면",
    "기저귀": "기저귀",
    "건강·병원": "건강",
    "성장": "성장 측정",
    "첫 순간": "첫 순간",
    "놀이": "놀이",
    "기타": "성장",
  };

  const titleLabel = document.querySelector("#growthEntryTitle")?.closest("label");
  const categoryLabel = categorySelect.closest("label");
  const noteLabel = document.querySelector("#growthNote")?.closest("label");
  const photoFieldset = form.querySelector(".photo-fieldset");
  const whenRow = form.querySelector(".growth-when-row");

  titleLabel?.classList.add("growth-title-field");
  categoryLabel?.classList.add("growth-category-field");
  noteLabel?.classList.add("growth-optional-field", "growth-note-field");
  photoFieldset?.classList.add("growth-optional-field");
  whenRow?.classList.add("growth-primary-row");

  const optionalToggle = document.createElement("button");
  optionalToggle.type = "button";
  optionalToggle.className = "growth-optional-toggle";
  optionalToggle.setAttribute("aria-expanded", "false");
  optionalToggle.innerHTML = '<span>메모·사진 추가</span><i aria-hidden="true">＋</i>';
  noteLabel?.before(optionalToggle);

  const optionalHasContent = () => Boolean(
    document.querySelector("#growthNote")?.value.trim()
    || document.querySelector("#growthPhotoPreview")?.childElementCount
  );

  const setOptionalOpen = (open) => {
    dialog.classList.toggle("show-growth-optional", open);
    optionalToggle.setAttribute("aria-expanded", String(open));
    optionalToggle.querySelector("span").textContent = open ? "메모·사진 닫기" : "메모·사진 추가";
    optionalToggle.querySelector("i").textContent = open ? "−" : "＋";
  };

  const applySimpleLayout = () => {
    const category = categorySelect.value;
    const routine = routineCategories.has(category);
    const editing = Boolean(document.querySelector("#growthId")?.value);

    dialog.classList.toggle("routine-growth-record", routine);
    dialog.classList.toggle("general-growth-record", !routine);
    dialog.dataset.simpleCategory = category;

    optionalToggle.hidden = !routine;
    if (routine) {
      const label = categoryLabels[category] || "성장";
      const heading = document.querySelector("#growthDialogTitle");
      if (heading) heading.textContent = `${label} 기록 ${editing ? "수정" : "추가"}`;
      setOptionalOpen(optionalHasContent());
    } else {
      setOptionalOpen(true);
    }
  };

  optionalToggle.addEventListener("click", () => {
    setOptionalOpen(!dialog.classList.contains("show-growth-optional"));
  });

  categorySelect.addEventListener("change", () => requestAnimationFrame(applySimpleLayout));
  dialog.addEventListener("close", () => setOptionalOpen(false));

  if (typeof openGrowthDialog === "function" && !openGrowthDialog.__simpleLayoutWrapped) {
    const originalOpenGrowthDialog = openGrowthDialog;
    const simpleOpenGrowthDialog = function simpleOpenGrowthDialog() {
      const result = originalOpenGrowthDialog.apply(this, arguments);
      requestAnimationFrame(applySimpleLayout);
      return result;
    };
    simpleOpenGrowthDialog.__simpleLayoutWrapped = true;
    openGrowthDialog = simpleOpenGrowthDialog;
  }

  if (typeof syncGrowthFields === "function" && !syncGrowthFields.__simpleLayoutWrapped) {
    const originalSyncGrowthFields = syncGrowthFields;
    const simpleSyncGrowthFields = function simpleSyncGrowthFields() {
      const result = originalSyncGrowthFields.apply(this, arguments);
      requestAnimationFrame(applySimpleLayout);
      return result;
    };
    simpleSyncGrowthFields.__simpleLayoutWrapped = true;
    syncGrowthFields = simpleSyncGrowthFields;
  }
})();
