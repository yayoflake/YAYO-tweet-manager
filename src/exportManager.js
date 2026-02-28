// exportManager.js
// 내보내기 매니저 중앙 컨트롤러
//
// [모듈 아키텍처]
// 이 파일은 DOM 참조, 내부 상태, 공유 프록시(window._em)를 설정하고,
// 분리된 4개 모듈을 초기화하는 역할을 담당:
//   1. emViewer.js   — 뷰어 렌더링 + 드래그앤드롭 (가상 스크롤)
//   2. emChunkNav.js — 청크 내비게이션 + 스크롤 콰속질주
//   3. emStep3.js    — Step 2/3 렌더링 (미리보기/내보내기)
//   4. emDraft.js    — 임시저장/복원 (독립 DOMContentLoaded)
//
// [스크립트 로딩 순서] (index.html)
// emViewer.js → emChunkNav.js → emStep3.js → exportManager.js → emDraft.js

document.addEventListener('DOMContentLoaded', () => {
    const exportManagerBtn = document.getElementById('exportManagerBtn');
    const exportManagerOverlay = document.getElementById('exportManagerOverlay');
    const exportManagerCloseBtn = document.getElementById('exportManagerCloseBtn');

    const emViewer = document.getElementById('emViewer');
    const emChunkList = document.getElementById('emChunkList');
    const emAddDividerBtn = document.getElementById('emAddDividerBtn');
    const emNextBtn = document.getElementById('emNextBtn');
    const emPrevBtn = document.getElementById('emPrevBtn');

    // Step 1 / Step 2 / Step 3 Wrappers
    const emStep1Left = document.getElementById('emStep1Left');
    const emStep2Left = document.getElementById('emStep2Left');
    const emStep3Left = document.getElementById('emStep3Left');

    const emStep1Right = document.getElementById('emStep1Right');
    const emStep2Right = document.getElementById('emStep2Right');
    const emStep3Right = document.getElementById('emStep3Right');

    const emModalTitle = document.getElementById('emModalTitle');
    const emDescription = document.getElementById('emDescription');
    const emChunkListTitle = document.getElementById('emChunkListTitle');

    // Step 2 Controls
    const emFormatRadios = document.querySelectorAll('input[name="emFormat"]');
    const emStyleRadios = document.querySelectorAll('input[name="emStylePreset"]');
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
    const emPreviewViewer = document.getElementById('emPreviewViewer');

    const emAutoSplitCountInput = document.getElementById('emAutoSplitCount');
    const emAutoSplitIgnoreThreadChk = document.getElementById('emAutoSplitIgnoreThread');
    const emAutoSplitBtn = document.getElementById('emAutoSplitBtn');
    const emRemoveAllDividersBtn = document.getElementById('emRemoveAllDividersBtn');

    const emStep3FormatText = document.getElementById('emStep3FormatText');
    const emStep3DataText = document.getElementById('emStep3DataText');

    // 내부 상태
    let step = 1; // 현재 1단계
    let managerItems = []; // { type: 'tweet', data: ... } or { type: 'divider', id: ... }
    let currentChunkIndex = 0; // 선택된 청크 인덱스
    let emStep3PasteValues = {}; // 청크별 치환자 입력값 캐시

    const DEFAULT_SPLIT_COUNT = 40;

    // ── 공유 상태 프록시 ────────────────────────────────────
    // 다른 모듈(emDraft.js, emViewer.js 등)이 window._em을 통해
    // 이 파일의 내부 변수에 접근할 수 있도록 defineProperty로
    // getter/setter 프록시를 등록. fn 객체에는 모듈간 호출 함수를 등록한다.
    window._em = { fn: {} };
    Object.defineProperty(window._em, 'step', { get: () => step, set: v => { step = v; }, configurable: true });
    Object.defineProperty(window._em, 'managerItems', { get: () => managerItems, set: v => { managerItems = v; }, configurable: true });
    Object.defineProperty(window._em, 'currentChunkIndex', { get: () => currentChunkIndex, set: v => { currentChunkIndex = v; }, configurable: true });
    Object.defineProperty(window._em, 'emStep3PasteValues', { get: () => emStep3PasteValues, set: v => { emStep3PasteValues = v; }, configurable: true });

    // ── 모듈 초기화 (순서 중요: emViewer → emChunkNav → emSteps) ────
    // 각 모듈의 init은 필요한 DOM 참조를 컨텍스트로 받아 클로저에 캡처한 뒤,
    // 외부에서 호출할 함수들을 반환하는 팩토리 패턴 사용.
    const _viewer = window._emViewer.init({ emViewer });
    const buildNodeForItem = _viewer.buildNodeForItem;
    const renderViewer = _viewer.renderViewer;
    const removeDivider = _viewer.removeDivider;
    const _updateViewerScrollClass = _viewer._updateViewerScrollClass;
    const _appendViewerNextPage = _viewer._appendViewerNextPage;
    const _prependViewerPrevPage = _viewer._prependViewerPrevPage;

    const _chunkNav = window._emChunkNav.init({ emViewer, emChunkList });
    const renderChunkNavigation = _chunkNav.renderChunkNavigation;

    // Step2/Step3 모듈 초기화 (export/emStep3.js)
    const _steps = window._emSteps.init({
        emPreviewViewer, emStep3Right,
        emIncDate, emIncRt, emIncFav, emIncLink, emIncIntro, emIncUserId, emIncTime, emIncMedia,
        emImgResize, emImgMaxWidth, emStep3FormatText, emStep3DataText
    });
    const getChunks = _steps.getChunks;
    const getChunkTweets = _steps.getChunkTweets;
    const renderStep2 = _steps.renderStep2;
    const renderStep3 = _steps.renderStep3;

    emAutoSplitCountInput.value = DEFAULT_SPLIT_COUNT;

    // 매니저 아이템들에 물리적 순서와 상관없는 '트윗 전용 순번' 부여
    function updateManagerIndices() {
        let tweetCount = 0;
        managerItems.forEach(item => {
            if (item.type === 'tweet') {
                tweetCount++;
                item.displayIndex = tweetCount;
            } else {
                delete item.displayIndex;
            }
        });
    }

    // 선택 패널에서 트윗이 변동될 때 버튼 활성화 상태 갱신은 selectedPanel.js 쪽 혹은 app.js에서 
    // updateSelectionCounts() 등에서 함께 처리됨 (기존 exportBtn과 비슷하게)

    exportManagerBtn.addEventListener('click', () => {
        openExportManager();
    });

    exportManagerCloseBtn.addEventListener('click', () => {
        closeExportManager();
    });

    // 오버레이(배경) 클릭 시 닫기
    exportManagerOverlay.addEventListener('click', (e) => {
        if (e.target === exportManagerOverlay) {
            closeExportManager();
            return;
        }

        // 섹션 타이틀 접기/펼치기 이벤트 위임
        const title = e.target.closest('.em-section-title');
        if (title) {
            const box = title.closest('.em-section-box');
            if (box) box.classList.toggle('collapsed');
        }
    });

    // --- 임시저장(초안) 로직은 export/emDraft.js 참조 ---
    // debouncedSaveDraft, updateRestoreDraftButtonVisibility는 emDraft.js에서 window._em.fn에 등록됨
    function debouncedSaveDraft() {
        if (window._em.fn.debouncedSaveDraft) window._em.fn.debouncedSaveDraft();
    }
    function updateRestoreDraftButtonVisibility() {
        if (window._em.fn.updateRestoreDraftButtonVisibility) window._em.fn.updateRestoreDraftButtonVisibility();
    }

    function openExportManager(isRestoring = false) {
        if (!isRestoring) {
            step = 1;
            currentChunkIndex = 0; // 새로 열 때는 항상 첫 번째 청크(게시글 1)로 초기화
            initStep1();
        }
        updateStepUI();
        exportManagerOverlay.classList.add('show');
    }

    function closeExportManager() {
        exportManagerOverlay.classList.remove('show');
    }

    function updateStepUI() {
        if (step === 1) {
            emModalTitle.textContent = "내보내기 매니저 (1/3: 분할 모드)";
            emDescription.innerHTML = "선택한 트윗 모음을 여러 개의 글로 나누어 내보낼 수 있습니다.<br>자동 분할을 이용하거나, 분할선을 마우스로 드래그해서 위치를 변경해 보세요.";

            emStep1Left.style.display = 'block';
            emStep2Left.style.display = 'none';
            emStep3Left.style.display = 'none';

            emStep1Right.style.display = 'flex';
            emStep2Right.style.display = 'none';
            emStep3Right.style.display = 'none';

            if (emChunkListTitle) emChunkListTitle.textContent = "리스트";

            emPrevBtn.style.display = 'none';
            emNextBtn.style.display = 'inline-block';
            emNextBtn.textContent = '다음 단계 (포맷 설정) →';
        } else if (step === 2) {
            emModalTitle.textContent = "내보내기 매니저 (2/3: 미리보기 및 포맷 설정)";
            emDescription.innerHTML = "출력될 데이터의 포맷과 포함할 내용을 설정합니다.<br>좌측 목록을 클릭하면 우측에서 최종 결과물을 미리 볼 수 있습니다.";

            emStep1Left.style.display = 'none';
            emStep2Left.style.display = 'block';
            emStep3Left.style.display = 'none';

            emStep1Right.style.display = 'none';
            emStep2Right.style.display = 'flex';
            emStep3Right.style.display = 'none';

            if (emChunkListTitle) emChunkListTitle.textContent = "리스트";

            emPrevBtn.style.display = 'inline-block';
            emPrevBtn.textContent = '← 이전 단계 (분할 모드)';
            emNextBtn.style.display = 'inline-block';
            emNextBtn.textContent = '다음 단계 (내보내기) →';

            // 2단계 진입 시 현재 포맷에 따라 미디어 옵션 활성화 여부 결정
            const currentFormat = (document.querySelector('input[name="emFormat"]:checked') || {}).value;
            const isTextFormat = (currentFormat === 'text');
            const mediaSettings = [emIncMedia, emImgResize, emImgMaxWidth].filter(Boolean);
            mediaSettings.forEach(el => {
                el.disabled = isTextFormat;
                const parent = el.closest('.em-section-row') || el.parentElement;
                if (isTextFormat) {
                    parent.style.opacity = '0.5';
                    parent.style.pointerEvents = 'none';
                } else {
                    parent.style.opacity = '1';
                    parent.style.pointerEvents = 'auto';
                }
            });
        } else if (step === 3) {
            emModalTitle.textContent = "내보내기 매니저 (3/3: 내보내기 모드)";
            emDescription.innerHTML = "최종 결과물을 복사하거나 파일로 저장합니다.<br>각 게시글의 내보내기 과정을 순차적으로 완료해 주세요.";

            emStep1Left.style.display = 'none';
            emStep2Left.style.display = 'none';
            emStep3Left.style.display = 'block';

            emStep1Right.style.display = 'none';
            emStep2Right.style.display = 'none';
            emStep3Right.style.display = 'flex';

            if (emChunkListTitle) emChunkListTitle.textContent = "리스트";

            emPrevBtn.style.display = 'inline-block';
            emPrevBtn.textContent = '← 이전 단계 (미리보기 및 포맷 설정)';
            emNextBtn.style.display = 'inline-block';
            emNextBtn.textContent = '내보내기 완료 (닫기)';
        }
    }

    emNextBtn.addEventListener('click', () => {
        if (step === 1) {
            // 성능 경고: 트윗이 너무 많은 청크가 있는지 확인
            const chunks = getChunks();
            const hasLargeChunk = chunks.some(c => c.length >= 500);

            if (hasLargeChunk) {
                const confirmed = confirm("하나의 게시글에 트윗이 너무 많이(500개 이상) 포함되어 있습니다.\n이대로 진행하면 미리보기 렌더링 중 브라우저가 느려지거나 멈출 수 있습니다.\n\n계속하시겠습니까?");
                if (!confirmed) return;
            }

            step = 2;
            updateStepUI();
            renderStep2();
        } else if (step === 2) {
            step = 3;
            updateStepUI();
            renderStep3();
        } else if (step === 3) {
            closeExportManager(); // 3단계 종료 시 전체 오버레이 닫기
        }
        debouncedSaveDraft();
    });

    // 포맷/스타일/데이터 포함 여부 변경 시 즉시 미리보기 갱신
    const emHtmlStyleBox = document.getElementById('emHtmlStyleBox');
    const emMdStyleBox = document.getElementById('emMdStyleBox');
    const emMdStyleRadios = document.querySelectorAll('input[name="emMdStylePreset"]');

    [emFormatRadios, emStyleRadios, emMdStyleRadios].forEach(radios => {
        radios.forEach(r => {
            r.addEventListener('change', () => {
                // 포맷 변경 시 스타일 박스 토글
                if (r.name === 'emFormat') {
                    const format = r.value;
                    const isHtmlOrPdf = (format === 'html' || format === 'pdf');
                    const isMarkdown = (format === 'markdown');
                    const isText = (format === 'text');

                    if (emHtmlStyleBox) emHtmlStyleBox.style.display = (isHtmlOrPdf ? 'block' : 'none');
                    if (emMdStyleBox) emMdStyleBox.style.display = (isMarkdown ? 'block' : 'none');

                    // TXT 포맷일 경우 이미지 관련 옵션들 비활성화
                    const mediaSettings = [emIncMedia, emImgResize, emImgMaxWidth].filter(Boolean);
                    mediaSettings.forEach(el => {
                        el.disabled = isText;
                        const parent = el.closest('.em-section-row') || el.parentElement;
                        if (isText) {
                            parent.style.opacity = '0.5';
                            parent.style.pointerEvents = 'none';
                        } else {
                            parent.style.opacity = '1';
                            parent.style.pointerEvents = 'auto';
                        }
                    });
                }

                if (step === 2) renderStep2();
                debouncedSaveDraft();
            });
        });
    });

    function syncMediaOptions() {
        if (!emIncMedia) return;
        const isMediaOn = emIncMedia.checked;
        if (emImgResize) {
            emImgResize.disabled = !isMediaOn;
            if (emImgMaxWidth) {
                emImgMaxWidth.disabled = !isMediaOn || !emImgResize.checked;
            }
        }
    }

    [emIncDate, emIncRt, emIncFav, emIncLink, emIncIntro, emIncUserId, emIncTime, emIncMedia, emImgResize].forEach(chk => {
        if (chk) {
            chk.addEventListener('change', () => {
                syncMediaOptions();
                if (step === 2) renderStep2();
                debouncedSaveDraft();
            });
        }
    });

    if (emImgMaxWidth) {
        emImgMaxWidth.addEventListener('input', () => {
            if (step === 2) renderStep2();
            debouncedSaveDraft();
        });
    }

    // 초기 상태 반영
    syncMediaOptions();

    emPrevBtn.addEventListener('click', () => {
        if (step === 2) {
            step = 1;
            updateStepUI();
            renderStep1();
        } else if (step === 3) {
            step = 2;
            updateStepUI();
            renderStep2();
        }
        debouncedSaveDraft();
    });

    // 1단계: 분할 모드 초기화
    function initStep1() {
        applyAutoSplit();
    }

    function applyAutoSplit() {
        managerItems = [];
        const sourceIds = Array.from(window.state.selectedOrder || []);
        const countLimit = parseInt(emAutoSplitCountInput.value, 10) || DEFAULT_SPLIT_COUNT;
        const ignoreThread = emAutoSplitIgnoreThreadChk.checked;

        let chunkSize = 0;
        let prevTweetId = null;

        sourceIds.forEach((id, index) => {
            // 트윗 객체 찾기 (선택된 트윗 중)
            let t = (window.state.tweetById ? window.state.tweetById.get(id) : null) || (window.globalTweets ? window.globalTweets.find(tw => tw.id === id) : null);

            let isChild = false;
            if (t) {
                const parentId = String(t.in_reply_to_status_id_str || "");
                if (parentId && parentId === prevTweetId) {
                    isChild = true;
                }
            }

            // 컷 조건 검사
            if (chunkSize >= countLimit) {
                // 타래를 무시하거나, 혹은 앞 트윗과 타래로 이어져있지 않을 때(즉 새로운 타래/일반 트윗일 때) 절단!
                if (ignoreThread || !isChild) {
                    managerItems.push({
                        type: 'divider',
                        id: 'div-' + Date.now() + '-' + index
                    });
                    chunkSize = 0; // 초기화
                }
            }

            managerItems.push({ type: 'tweet', tweetId: id });
            chunkSize++;
            prevTweetId = id;
        });

        updateManagerIndices();
        renderStep1();
        debouncedSaveDraft();
    }

    emAutoSplitBtn.addEventListener('click', applyAutoSplit);

    emRemoveAllDividersBtn.addEventListener('click', () => {
        emViewer.querySelectorAll('.em-divider').forEach(n => n.remove());
        managerItems = managerItems.filter(item => item.type !== 'divider');
        updateManagerIndices();
        renderViewer(false);
        renderStep1();
        _updateViewerScrollClass();
        debouncedSaveDraft();
    });

    function renderStep1() {
        renderChunkNavigation();
        renderViewer(true);
    }

    // --- Step2/Step3은 emStep3.js, 뷰어는 emViewer.js, 청크 내비는 emChunkNav.js 참조 ---

    // 비침입형(Non-intrusive) 토스트 알림 함수
    function showToast(msg, duration = 2000) {
        let toast = document.getElementById('emToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'emToast';
            toast.className = 'em-toast';
            document.body.appendChild(toast);
        }

        toast.classList.remove('show');
        setTimeout(() => {
            toast.textContent = msg;
            toast.classList.add('show');
        }, 10);

        if (window._toastTimer) clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }


    emAddDividerBtn.addEventListener('click', () => {
        // 현재 화면에서 가장 잘 보이는 요소의 인덱스를 찾아 그 앞에 삽입
        const cards = Array.from(emViewer.children).filter(c => !c.classList.contains('viewerSentinel'));
        let insertNode = null;
        let visibleInsertIndex = 0;

        if (cards.length > 0) {
            const viewerRect = emViewer.getBoundingClientRect();
            const viewCenterY = viewerRect.top + viewerRect.height / 2;

            let closestDist = Infinity;

            cards.forEach((card, idx) => {
                const rect = card.getBoundingClientRect();
                const cardCenterY = rect.top + rect.height / 2;
                const dist = Math.abs(cardCenterY - viewCenterY);
                if (dist < closestDist) {
                    closestDist = dist;
                    visibleInsertIndex = idx;
                    insertNode = card;
                }
            });
        }

        const newDiv = { type: 'divider', id: 'div-' + Date.now() + '-manual' };
        let arrayInsertIndex = managerItems.length;

        if (insertNode) {
            const targetItemId = insertNode.dataset.itemId;
            const foundIdx = managerItems.findIndex(i => (i.id === targetItemId || i.tweetId === targetItemId));
            if (foundIdx !== -1) arrayInsertIndex = foundIdx;
        }

        managerItems.splice(arrayInsertIndex, 0, newDiv);

        const block = buildNodeForItem(newDiv, -1);
        if (insertNode) {
            emViewer.insertBefore(block, insertNode);
        } else {
            const sentinel = emViewer.querySelector('.viewerSentinel');
            if (sentinel) emViewer.insertBefore(block, sentinel);
            else emViewer.appendChild(block);
        }
        window._em._renderOffset++;

        updateManagerIndices();
        renderViewer(false);
        renderChunkNavigation();
        debouncedSaveDraft();
    });

    window._em.fn.updateManagerIndices = updateManagerIndices;
    window._em.fn.openExportManager = openExportManager;
    window._em.fn.renderStep1 = renderStep1;
    window._em.fn.renderStep2 = renderStep2;
    window._em.fn.renderStep3 = renderStep3;
    window._em.fn.showToast = showToast;
    window._em.fn.renderChunkNavigation = renderChunkNavigation;
    window._em.fn.renderViewer = renderViewer;
    window._em.fn.buildNodeForItem = buildNodeForItem;
    window._em.fn.removeDivider = removeDivider;
    window._em.fn._appendViewerNextPage = _appendViewerNextPage;
    window._em.fn._prependViewerPrevPage = _prependViewerPrevPage;
    window._em.fn.getChunks = getChunks;
    window._em.fn.getChunkTweets = getChunkTweets;

    // 전역 노출 유틸리티 (app.js에서 참조)
    window.managerStep1Obj = {
        init: initStep1,
        updateRestoreDraftButtonVisibility: updateRestoreDraftButtonVisibility
    };

    // ── HTML 변환기 이벤트 바인딩 (개인이 사용하는 도구) ──
    const convertBtn = document.getElementById('convertBtn');
    const converterInput = document.getElementById('converterInput');
    if (convertBtn && converterInput) {
        convertBtn.addEventListener('click', () => {
            const sourceHtml = converterInput.value.trim();
            if (!sourceHtml) {
                showToast('⚠ 변환할 HTML을 입력해 주세요.');
                return;
            }
            if (window.htmlConverter) {
                const result = window.htmlConverter.convert(sourceHtml);
                if (window.tryCopyToClipboard) {
                    window.tryCopyToClipboard(result);
                    showToast('✔ 변환 및 클립보드 복사 완료!');
                } else {
                    console.log(result);
                    showToast('✔ 변환 완료 (콘솔 확인)');
                }
            }
        });
    }
});
