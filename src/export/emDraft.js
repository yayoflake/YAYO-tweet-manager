// src/export/emDraft.js
// exportManager.js에서 분리된 임시저장(초안) 로직
// window._em 을 통해 exportManager의 공유 상태에 접근

document.addEventListener('DOMContentLoaded', () => {
    const _em = window._em;
    if (!_em) return;

    const DRAFT_STORAGE_KEY = 'yayo_export_manager_draft';

    function saveExportManagerDraft() {
        const draftData = {
            step: _em.step,
            managerItems: _em.managerItems,
            currentChunkIndex: _em.currentChunkIndex,
            // 트윗 정합성 체크용 (현재 선택된 트윗 ID 목록)
            selectedOrder: window.state.selectedOrder || [],
            settings: {
                format: document.querySelector('input[name="emFormat"]:checked')?.value,
                style: document.querySelector('input[name="emStylePreset"]:checked')?.value,
                incDate: document.getElementById('emIncDate')?.checked,
                incRt: document.getElementById('emIncRt')?.checked,
                incFav: document.getElementById('emIncFav')?.checked,
                incLink: document.getElementById('emIncLink')?.checked,
                incIntro: document.getElementById('emIncIntro')?.checked,
                incUserId: document.getElementById('emIncUserId')?.checked,
                incTime: document.getElementById('emIncTime')?.checked,
                incMedia: document.getElementById('emIncMedia')?.checked,
                imgResize: document.getElementById('emImgResize')?.checked,
                imgMaxWidth: document.getElementById('emImgMaxWidth')?.value,
                autoSplitCount: document.getElementById('emAutoSplitCount')?.value,
                autoSplitIgnoreThread: document.getElementById('emAutoSplitIgnoreThread')?.checked
            },
            timestamp: Date.now()
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
        updateRestoreDraftButtonVisibility();
    }

    // Debounced save (상태 변경 시 자동 저장)
    let _saveTimer = null;
    function debouncedSaveDraft() {
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(saveExportManagerDraft, 200); // 500ms -> 200ms로 단축
    }

    function checkDraftValidity(draftData) {
        if (!draftData || !draftData.selectedOrder || !draftData.managerItems) return false;

        // 현재 선택 상태와 저장된 ID 목록이 일치하는지 확인
        const currentOrder = window.state.selectedOrder || [];
        if (draftData.selectedOrder.length !== currentOrder.length) return false;

        for (let i = 0; i < currentOrder.length; i++) {
            if (currentOrder[i] !== draftData.selectedOrder[i]) return false;
        }
        return true;
    }

    function restoreExportManagerDraft() {
        const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (!raw) return;

        try {
            const draftData = JSON.parse(raw);
            if (!checkDraftValidity(draftData)) {
                console.warn('Draft invalid: Tweet selection mismatch.');
                return;
            }

            // 상태 복원
            _em.step = draftData.step || 1;
            _em.managerItems = draftData.managerItems || [];
            _em.currentChunkIndex = draftData.currentChunkIndex || 0;

            // UI 설정값 복원
            if (draftData.settings) {
                const s = draftData.settings;
                const fmt = document.querySelector(`input[name="emFormat"][value="${s.format}"]`);
                if (fmt) fmt.checked = true;
                const sty = document.querySelector(`input[name="emStylePreset"][value="${s.style}"]`);
                if (sty) sty.checked = true;

                const emIncDate = document.getElementById('emIncDate');
                const emIncRt = document.getElementById('emIncRt');
                const emIncFav = document.getElementById('emIncFav');
                const emIncLink = document.getElementById('emIncLink');
                const emIncIntro = document.getElementById('emIncIntro');
                const emIncUserId = document.getElementById('emIncUserId');
                const emIncTime = document.getElementById('emIncTime');
                const emIncMedia = document.getElementById('emIncMedia');
                const emImgResize = document.getElementById('emImgResize');
                const emImgMaxWidth = document.getElementById('emImgMaxWidth');
                const emAutoSplitCountInput = document.getElementById('emAutoSplitCount');
                const emAutoSplitIgnoreThreadChk = document.getElementById('emAutoSplitIgnoreThread');

                if (emIncDate) emIncDate.checked = s.incDate;
                if (emIncRt) emIncRt.checked = s.incRt;
                if (emIncFav) emIncFav.checked = s.incFav;
                if (emIncLink) emIncLink.checked = s.incLink;
                if (emIncIntro) emIncIntro.checked = s.incIntro;
                if (emIncUserId) emIncUserId.checked = s.incUserId;
                if (emIncTime) emIncTime.checked = s.incTime;
                if (emIncMedia) emIncMedia.checked = s.incMedia;
                if (emImgResize) emImgResize.checked = s.imgResize;
                if (emImgMaxWidth) {
                    emImgMaxWidth.value = s.imgMaxWidth;
                    emImgMaxWidth.disabled = !s.imgResize;
                }
                if (emAutoSplitCountInput) emAutoSplitCountInput.value = s.autoSplitCount;
                if (emAutoSplitIgnoreThreadChk) emAutoSplitIgnoreThreadChk.checked = s.autoSplitIgnoreThread;
            }

            _em.fn.updateManagerIndices();
            _em.fn.openExportManager(true); // 복구 시에는 초기화 건너뛰고 바로 열기

            if (_em.step === 1) _em.fn.renderStep1();
            else if (_em.step === 2) _em.fn.renderStep2();
            else if (_em.step === 3) _em.fn.renderStep3();

            _em.fn.showToast('✔ 임시저장된 작업 내용을 불러왔습니다.');
        } catch (e) {
            console.error('Failed to restore draft:', e);
        }
    }

    function updateRestoreDraftButtonVisibility() {
        const restoreDraftBtn = document.getElementById('restoreDraftBtn');
        if (!restoreDraftBtn) return;

        // 절대로 부모(export-tool-group)의 display를 건드리지 않음
        const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (raw) {
            try {
                const draftData = JSON.parse(raw);
                if (checkDraftValidity(draftData)) {
                    restoreDraftBtn.style.display = 'flex';
                    return;
                }
            } catch (e) { }
        }
        restoreDraftBtn.style.display = 'none';
    }

    // 복원 버튼 이벤트 등록
    const restoreDraftBtn = document.getElementById('restoreDraftBtn');
    if (restoreDraftBtn) {
        restoreDraftBtn.addEventListener('click', () => {
            restoreExportManagerDraft();
        });
    }

    // exportManager.js에서 사용할 수 있도록 함수 노출
    _em.fn.debouncedSaveDraft = debouncedSaveDraft;
    _em.fn.updateRestoreDraftButtonVisibility = updateRestoreDraftButtonVisibility;

    // 초기 버튼 노출 상태 갱신
    updateRestoreDraftButtonVisibility();

    // app.js에서 호출하는 전역 노출 갱신
    if (window.managerStep1Obj) {
        window.managerStep1Obj.updateRestoreDraftButtonVisibility = updateRestoreDraftButtonVisibility;
    }
});
