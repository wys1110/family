(() => {
  const button = document.querySelector("#deleteGrowthButton");
  if (!button || button.dataset.growthDeleteSyncBound === "true") return;

  button.dataset.growthDeleteSyncBound = "true";
  let deleting = false;

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const id = document.querySelector("#growthId")?.value;
    if (!id || deleting || !window.confirm("이 성장 기록을 삭제할까요?")) return;

    const target = state.growthEntries.find((entry) => String(entry.id) === String(id));
    const remote = Boolean(state.supabase && state.session && state.household?.id);
    const supabase = state.supabase;
    const userId = state.session?.user?.id;
    const householdId = state.household?.id;
    const isCurrent = () => state.supabase === supabase
      && state.session?.user?.id === userId && state.household?.id === householdId;
    const withAuthRecovery = (operation) => window.FAMILY_AUTH_API.withRecovery(operation, {
      supabase, userId, isCurrent,
    });
    const returnPosition = typeof growthDialogReturnPosition === "undefined" ? null : growthDialogReturnPosition;
    let committed = false;
    deleting = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "삭제 중…";

    try {
      if (remote) {
        const { data: deletedRows, error: deleteError } = await withAuthRecovery(() => supabase
          .from("growth_entries")
          .delete()
          .eq("id", id)
          .eq("household_id", householdId)
          .select("id"));

        if (!isCurrent()) return;
        if (deleteError) throw deleteError;

        const deleted = (deletedRows || []).some((row) => String(row.id) === String(id));
        if (!deleted) {
          const { data: existing, error: verifyError } = await withAuthRecovery(() => supabase
            .from("growth_entries")
            .select("id")
            .eq("id", id)
            .eq("household_id", householdId)
            .maybeSingle());
          if (!isCurrent()) return;
          if (verifyError) throw verifyError;
          if (existing) throw new Error("Growth entry deletion was not applied");
        }

        committed = true;
      }
      if (!isCurrent()) return;
      const remaining = state.growthEntries.filter((entry) => String(entry.id) !== String(id));
      if (!remote) localStorage.setItem(GROWTH_STORAGE_KEY, JSON.stringify(remaining));
      committed = true;
      state.growthEntries = remaining;

      if (document.querySelector("#growthId")?.value === id) {
        resetGrowthPhotoDraft();
        document.querySelector("#growthDialog")?.close();
      }
      renderGrowth();
      if (typeof restoreGrowthPosition === "function") restoreGrowthPosition(returnPosition);
      window.dispatchEvent(new CustomEvent('family:growth-entry-deleted', {
        detail: { babyId: target?.babyId || null, deletedAt: new Date().toISOString() },
      }));
      toast("성장 기록을 삭제했어요");
      // Storage cleanup is best-effort after the database deletion is committed.
      if (remote && target?.photoPaths?.length && isCurrent()) {
        try {
          const { error } = await withAuthRecovery(() => supabase.storage.from(GROWTH_PHOTO_BUCKET).remove(window.FAMILY_DATA.photoStoragePaths(target.photoPaths)));
          if (error) console.warn("성장 기록 사진 정리 실패", error);
        } catch (error) { console.warn("성장 기록 사진 정리 실패", error); }
      }
    } catch (error) {
      console.error("성장 기록 삭제 실패", error);
      if (isCurrent()) toast(committed
        ? "기록은 삭제됐어요. 화면을 새로고침해 주세요."
        : "기록을 삭제하지 못했어요. 다시 시도해 주세요");
    } finally {
      deleting = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = "삭제";
    }
  }, true);
})();
