// src/export/emChunkNav.js
// exportManager.js에서 분리된 좌측 청크 내비게이션 렌더링 및 스크롤 추적 로직
//
// [청크 내비게이션 구조]
// managerItems에서 divider 기준으로 청크를 계산하고, 각 청크를 버튼으로 표시.
// 버튼 클릭 시 Step에 따라 다르게 동작:
//   Step 1: 뷰어에서 해당 분할선 위치로 스크롤 이동
//   Step 2/3: renderStep2/renderStep3 호출
//
// window._em 프록시를 통해 공유 상태에 접근

window._emChunkNav = {
    /**
     * 청크 내비게이션 모듈 초기화. exportManager.js의 DOMContentLoaded 내부에서 호출.
     * @param {Object} ctx - 컨텍스트 객체
     */
    init: function (ctx) {
        const emViewer = ctx.emViewer;
        const emChunkList = ctx.emChunkList;
        const _em = window._em;

        let _scrollTrackerTimeout = null;
        let _scrollAnchorRAF = null;

        /** 청크 내비 버튼 리스트 렌더링. divider 기준으로 청크를 나누고 각각 버튼 생성. */
        function renderChunkNavigation() {
            emChunkList.innerHTML = '';

            const managerItems = _em.managerItems;
            const step = _em.step;

            let chunks = [];
            let currentChunkCount = 0;
            let dividerIndexForChunk = -1;

            managerItems.forEach((item, index) => {
                if (item.type === 'tweet') {
                    currentChunkCount++;
                } else if (item.type === 'divider') {
                    if (currentChunkCount > 0) {
                        chunks.push({ count: currentChunkCount, targetIndex: dividerIndexForChunk });
                    }
                    currentChunkCount = 0;
                    dividerIndexForChunk = index; // 다음 청크의 시작 지점인 분할선 인덱스
                }
            });
            if (currentChunkCount > 0 || chunks.length === 0) {
                chunks.push({ count: currentChunkCount, targetIndex: dividerIndexForChunk });
            }

            // currentChunkIndex가 범위를 벗어난 경우 0으로 클램핑 (구분선 전체 삭제 등으로 청크 수가 줄었을 때)
            const currentChunkIndex = Math.max(0, Math.min(_em.currentChunkIndex, chunks.length - 1));
            if (currentChunkIndex !== _em.currentChunkIndex) {
                _em.currentChunkIndex = currentChunkIndex;
            }

            chunks.forEach((chunk, i) => {
                const btn = document.createElement('button');
                btn.className = 'em-chunk-btn';
                if (i === currentChunkIndex) btn.classList.add('active');

                const isCompleted = (step === 3 && window._chunkExportFlags && window._chunkExportFlags[i]);
                if (isCompleted) btn.classList.add('completed');
                btn.innerHTML = `<span>게시글 ${i + 1}</span> <span ${isCompleted ? 'style="color: #34a853; font-weight: bold;"' : 'class="em-chunk-count"'}>${isCompleted ? '✔' : chunk.count + '개'}</span>`;

                btn.addEventListener('click', () => {
                    _em.currentChunkIndex = i;
                    emChunkList.querySelectorAll('.em-chunk-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    if (_em.step === 2) {
                        if (_em.fn.renderStep2) _em.fn.renderStep2();
                        return;
                    }
                    if (_em.step === 3) {
                        if (_em.fn.renderStep3) _em.fn.renderStep3();
                        return;
                    }

                    // step === 1: 스크롤 대상 요소 찾기 (분할선 혹은 맨 위)
                    let targetEl = null;
                    let targetManagerIndex = chunk.targetIndex !== -1 ? chunk.targetIndex : 0;

                    targetEl = emViewer.querySelector(`[data-manager-index="${targetManagerIndex}"]`);

                    if (!targetEl) {
                        let distance = 0;
                        let direction = 'down';

                        if (targetManagerIndex >= _em._renderOffset) {
                            distance = targetManagerIndex - _em._renderOffset;
                            direction = 'down';
                        } else if (targetManagerIndex < _em._renderStart) {
                            distance = _em._renderStart - targetManagerIndex;
                            direction = 'up';
                        }

                        if (distance < 500) {
                            // 거리가 500개 미만이면 사이를 모두 렌더링하고 스무스 스크롤 (원래 무한 스크롤 느낌 보존)
                            const _appendViewerNextPage = _em.fn._appendViewerNextPage || (() => { });
                            const _prependViewerPrevPage = _em.fn._prependViewerPrevPage || (() => { });
                            while (!targetEl) {
                                if (direction === 'down' && _em._renderOffset < managerItems.length) {
                                    _appendViewerNextPage();
                                } else if (direction === 'up' && _em._renderStart > 0) {
                                    _prependViewerPrevPage();
                                } else {
                                    break; // 안전 장치
                                }
                                targetEl = emViewer.querySelector(`[data-manager-index="${targetManagerIndex}"]`);
                            }
                        } else {
                            // 거리가 500개 이상으로 너무 멀면 어색한 흰색 공간 대신, 
                            // 현재 시점의 바로 다음(혹은 이전) 방향에 있는 실제 트윗 약 100개를 몰래 깔아두고 거기로 쾌속 질주 스크롤을 시뮬레이션함
                            const FAKE_TWEET_COUNT = 100;
                            const frag = document.createDocumentFragment();
                            const buildNodeForItem = _em.fn.buildNodeForItem || (() => null);
                            const renderViewer = _em.fn.renderViewer || (() => { });

                            let fakeTargetEl = null;

                            if (direction === 'down') {
                                // 아래로 갈 땐 현재 오프셋 밑으로 100개를 임시로 더 그림
                                const endIdx = Math.min(managerItems.length, _em._renderOffset + FAKE_TWEET_COUNT);
                                for (let j = _em._renderOffset; j < endIdx; j++) {
                                    const el = buildNodeForItem(managerItems[j], j);
                                    if (el) {
                                        el.classList.add('em-fake-scroll-item');
                                        frag.appendChild(el);
                                    }
                                }
                                emViewer.appendChild(frag);

                                // 깔아둔 트윗 중 마지막 요소(가장 밑)를 향해 풀악셀 스크롤
                                const fakeNodes = emViewer.querySelectorAll('.em-fake-scroll-item');
                                if (fakeNodes.length > 0) {
                                    fakeTargetEl = fakeNodes[fakeNodes.length - 1];
                                }
                            } else {
                                // 위로 갈 땐 현재 시작점 위로 100개를 임시로 더 그림
                                const startIdx = Math.max(0, _em._renderStart - FAKE_TWEET_COUNT);
                                for (let j = startIdx; j < _em._renderStart; j++) {
                                    const el = buildNodeForItem(managerItems[j], j);
                                    if (el) {
                                        el.classList.add('em-fake-scroll-item');
                                        frag.appendChild(el);
                                    }
                                }
                                const oldScrollHeight = emViewer.scrollHeight;
                                const oldScrollTop = emViewer.scrollTop;
                                emViewer.insertBefore(frag, emViewer.firstChild);
                                emViewer.scrollTop = oldScrollTop + (emViewer.scrollHeight - oldScrollHeight);

                                // 깔아둔 트윗 중 첫 번째 요소(가장 위)를 향해 풀악셀 스크롤
                                const fakeNodes = emViewer.querySelectorAll('.em-fake-scroll-item');
                                if (fakeNodes.length > 0) {
                                    fakeTargetEl = fakeNodes[0];
                                }
                            }

                            if (fakeTargetEl) {
                                // 1. 진짜 트윗들을 스치는듯한 "가짜 질주 스크롤" 애니메이션 시작
                                _em._isJumping = true;
                                if (_scrollTrackerTimeout) clearTimeout(_scrollTrackerTimeout);
                                if (_scrollAnchorRAF) cancelAnimationFrame(_scrollAnchorRAF);

                                fakeTargetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

                                // 2. 가속도가 최고조에 달했을 타이밍(약 600ms 뒤)에 화면을 "진짜 도착지"로 강제 컷오프(순간이동 + 스냅) 
                                _scrollTrackerTimeout = setTimeout(() => {
                                    // 임시로 깔았던 트윗 청소하고, 진짜 목적지로 렌더링 세팅
                                    renderViewer(true, targetManagerIndex);

                                    const realTargetEl = emViewer.querySelector(`[data-manager-index="${targetManagerIndex}"]`);
                                    if (realTargetEl) {
                                        // 스무스를 제거하고 즉각 점프 후, 흔들리지 않게 1초간 강제 앵커링 스냅 발동
                                        _trackScrollToTarget(realTargetEl, null, true);
                                    } else {
                                        _em._isJumping = false;
                                    }
                                }, 600);
                            } else {
                                // 임시 트윗 렌더링 실패 시 즉시 진짜 목적지로 이동
                                renderViewer(true, targetManagerIndex);
                                const realTargetEl = emViewer.querySelector(`[data-manager-index="${targetManagerIndex}"]`);
                                if (realTargetEl) _trackScrollToTarget(realTargetEl, null, true);
                            }

                            return;
                        }
                    }

                    if (targetEl) {
                        _trackScrollToTarget(targetEl);
                    }
                });

                emChunkList.appendChild(btn);
            });
        }

        /**
         * 목표 요소로 스크롤 이동 후 위치 고정.
         * @param {HTMLElement} targetEl - 스크롤 대상 DOM 요소
         * @param {Function|null} onFinishCallback - 완료 콜백
         * @param {boolean} isInstant - true: 즉시 점프, false: smooth 스크롤 후 앵커링
         */
        function _trackScrollToTarget(targetEl, onFinishCallback = null, isInstant = false) {
            if (_scrollTrackerTimeout) clearTimeout(_scrollTrackerTimeout);
            if (_scrollAnchorRAF) cancelAnimationFrame(_scrollAnchorRAF);

            _em._isJumping = true;

            if (isInstant) {
                // 즉시 컷하고 바로 앵커링 스냅 돌입
                targetEl.scrollIntoView({ behavior: 'auto', block: 'start' });
                startAnchoring(targetEl, onFinishCallback);
            } else {
                // 1. 부드러운 스크롤 출발
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

                // 2. 가속도 애니메이션이 거의 끝날 즈음(800ms 후)부터 "강제 앵커링" 루프 시작
                _scrollTrackerTimeout = setTimeout(() => {
                    startAnchoring(targetEl, onFinishCallback);
                }, 800);
            }
        }

        /**
         * RAF 루프로 목표 요소를 뷰어 최상단에 1.2초간 강제 고정.
         * smooth scroll 후 발생하는 바운스/흔들림을 억제한다.
         */
        function startAnchoring(targetEl, onFinishCallback) {
            const anchorStartTime = Date.now();
            const DURATION = 1200; // 1.2초 동안 멱살 잡고 버팀

            function anchorStep() {
                if (!emViewer.contains(targetEl)) {
                    _em._isJumping = false;
                    if (onFinishCallback) onFinishCallback();
                    return;
                }

                const elapsed = Date.now() - anchorStartTime;
                if (elapsed > DURATION) {
                    _em._isJumping = false;
                    if (onFinishCallback) onFinishCallback();
                    return; // 앵커링 추적 종료, 일반 모드 복구
                }

                // 목표 요소가 뷰어 최상단(오프셋 0)에서 얼마나 벗어났는지 측정하여 매 프레임마다 강제 교정
                const viewerRect = emViewer.getBoundingClientRect();
                const targetRect = targetEl.getBoundingClientRect();
                const diff = targetRect.top - viewerRect.top;

                if (Math.abs(diff) > 0) {
                    emViewer.scrollTop += diff;
                }

                _scrollAnchorRAF = requestAnimationFrame(anchorStep);
            }

            _scrollAnchorRAF = requestAnimationFrame(anchorStep);
        }

        // 외부에서 호출할 수 있도록 함수 노출
        return {
            renderChunkNavigation,
        };
    }
};
