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
    deleting = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "삭제 중…";

    try {
      if (remote) {
        const { data: deletedRows, error: deleteError } = await state.supabase
          .from("growth_entries")
          .delete()
          .eq("id", id)
          .eq("household_id", state.household.id)
          .select("id");

        if (deleteError) throw deleteError;

        const deleted = (deletedRows || []).some((row) => String(row.id) === String(id));
        if (!deleted) {
          const { data: existing, error: verifyError } = await state.supabase
            .from("growth_entries")
            .select("id")
            .eq("id", id)
            .eq("household_id", state.household.id)
            .maybeSingle();
          if (verifyError) throw verifyError;
          if (existing) throw new Error("Growth entry deletion was not applied");
        }

        if (target?.photoPaths?.length) {
          const { error: photoError } = await state.supabase.storage
            .from(GROWTH_PHOTO_BUCKET)
            .remove(target.photoPaths);
          if (photoError) console.warn("성장 기록 사진 정리 실패", photoError);
        }

        const { data: refreshedRows, error: refreshError } = await state.supabase
          .from("growth_entries")
          .select("*")
          .eq("household_id", state.household.id)
          .order("entry_date", { ascending: false });

        if (refreshError) {
          state.growthEntries = state.growthEntries.filter((entry) => String(entry.id) !== String(id));
        } else {
          state.growthEntries = (refreshedRows || []).map(fromGrowthRemote);
          await hydrateGrowthPhotoUrls(state.growthEntries);
        }
      } else {
        state.growthEntries = state.growthEntries.filter((entry) => String(entry.id) !== String(id));
        localStorage.setItem(GROWTH_STORAGE_KEY, JSON.stringify(state.growthEntries));
      }

      resetGrowthPhotoDraft();
      document.querySelector("#growthDialog")?.close();
      renderGrowth();
      toast("성장 기록을 삭제했고 새로고침에도 반영돼요");
    } catch (error) {
      console.error("성장 기록 삭제 실패", error);
      toast("삭제가 DB에 반영되지 않았어요. 다시 시도해 주세요");
    } finally {
      deleting = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = "삭제";
    }
  }, true);
})();
