// src/export/emViewer.js
// exportManager.js에서 분리된 우측 뷰어 렌더링 및 드래그앤드롭 로직
//
// [가상 스크롤 전략]
// managerItems 배열이 수천 개일 수 있으므로 전부 DOM에 올리지 않고,
// _renderStart ~ _renderOffset 범위만 렌더링한 뒤 IntersectionObserver로
// 상하 Sentinel 감지 시 페이지를 추가/제거하는 "무한 스크롤" 방식 사용.
//
// window._em 프록시를 통해 exportManager의 공유 상태에 접근

window._emViewer = {
    /**
     * 뷰어 모듈 초기화. exportManager.js의 DOMContentLoaded 내부에서 호출.
     * @param {Object} ctx - 컨텍스트 객체 (클로저 변수 참조)
     */
    init: function (ctx) {
        const emViewer = ctx.emViewer;
        const _em = window._em;

        let _dragSrcId = null;
        let _dragGhost = null;
        let _dropTargetIndex = null;
        let _dropPosStr = "after";
        let _autoScrollRAF = null;
        let _autoScrollDir = 0;
        let _viewerTopObserver = null;
        let _viewerObserver = null;
        let _renderOffset = 0;
        let _renderStart = 0;
        let _isJumping = false;
        const VIEWER_PAGE_SIZE = 50;

        // 다른 모듈에서 접근할 수 있도록 프록시 등록
        Object.defineProperty(_em, '_renderOffset', { get: () => _renderOffset, set: v => { _renderOffset = v; }, configurable: true });
        Object.defineProperty(_em, '_renderStart', { get: () => _renderStart, set: v => { _renderStart = v; }, configurable: true });
        Object.defineProperty(_em, '_isJumping', { get: () => _isJumping, set: v => { _isJumping = v; }, configurable: true });

        function _updateViewerScrollClass() {
            if (!emViewer) return;
            const hasScroll = emViewer.scrollHeight > emViewer.clientHeight;
            emViewer.classList.toggle('has-scroll', hasScroll);
        }

        function _stopAutoScroll() {
            if (_autoScrollRAF) { cancelAnimationFrame(_autoScrollRAF); _autoScrollRAF = null; }
            _autoScrollDir = 0;
        }

        function _startAutoScroll(dir) {
            _autoScrollDir = dir;
            if (_autoScrollRAF) cancelAnimationFrame(_autoScrollRAF);
            function step() {
                if (!_dragSrcId) { _stopAutoScroll(); return; }
                if (emViewer) emViewer.scrollTop += dir * 14;
                _autoScrollRAF = requestAnimationFrame(step);
            }
            _autoScrollRAF = requestAnimationFrame(step);
        }

        function _handleDragEdgeScroll(clientY) {
            if (!emViewer) return;
            const r = emViewer.getBoundingClientRect();
            const edge = 75;
            const dir = clientY < r.top + edge ? -1 : clientY > r.bottom - edge ? 1 : 0;
            if (dir !== _autoScrollDir) {
                if (dir !== 0) _startAutoScroll(dir);
                else _stopAutoScroll();
            }
        }

        // ── 드래그앤드롭 시퀀스 ──────────────────────────────
        // 1. pointerdown (buildNodeForItem 내) → _dragSrcId 세팅, ghost 생성
        // 2. pointermove (_handlePointerMove) → ghost 이동, 드롭 위치 계산,
        //    dropIndicator 표시, 뷰어 가장자리 자동스크롤
        // 3. pointerup (_handlePointerUp) → moveDivider 호출, 정리
        function _handlePointerMove(e) {
            if (!_dragSrcId) return;
            if (_dragGhost) {
                _dragGhost.style.left = e.clientX + 10 + "px";
                _dragGhost.style.top = e.clientY + 10 + "px";
            }

            _handleDragEdgeScroll(e.clientY);

            const elUnder = document.elementFromPoint(e.clientX, e.clientY);
            let targetNode = null;
            if (elUnder) {
                targetNode = elUnder.closest(".selectedCard, .em-divider");
            }

            if (targetNode && targetNode.dataset.managerIndex !== undefined) {
                const index = parseInt(targetNode.dataset.managerIndex, 10);
                const targetId = targetNode.dataset.itemId;

                if (targetId !== _dragSrcId) {
                    const rect = targetNode.getBoundingClientRect();
                    _dropPosStr = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                    _dropTargetIndex = index;

                    emViewer.querySelectorAll(".dropIndicator").forEach(el => el.remove());
                    const indicator = document.createElement("div");
                    indicator.className = "dropIndicator";
                    targetNode.parentNode.insertBefore(indicator, _dropPosStr === "before" ? targetNode : targetNode.nextSibling);
                }
            }
        }

        function _handlePointerUp(e) {
            if (!_dragSrcId) return;

            const srcBlock = emViewer.querySelector(`.em-divider[data-item-id="${_dragSrcId}"]`);
            if (srcBlock) {
                srcBlock.classList.remove("dragging");
                if (srcBlock.hasPointerCapture(e.pointerId)) srcBlock.releasePointerCapture(e.pointerId);
            }

            if (_dragGhost) { _dragGhost.remove(); _dragGhost = null; }
            emViewer.querySelectorAll(".dropIndicator").forEach(el => el.remove());
            _stopAutoScroll();

            if (_dropTargetIndex !== null) {
                moveDivider(_dragSrcId, _dropTargetIndex, _dropPosStr);
            }

            _dragSrcId = null;
            _dropTargetIndex = null;
        }

        document.addEventListener("pointermove", _handlePointerMove);
        document.addEventListener("pointerup", _handlePointerUp);
        document.addEventListener("pointercancel", _handlePointerUp);

        /**
         * managerItem 하나를 DOM 노드로 변환.
         * @param {Object} item - { type: 'tweet', tweetId } 또는 { type: 'divider', id }
         * @param {number} index - managerItems 배열 내 인덱스 (data-manager-index로 설정)
         * @returns {HTMLElement|null} 생성된 DOM 노드 (트윗 못 찾으면 null)
         */
        function buildNodeForItem(item, index) {
            let el;
            if (item.type === 'tweet') {
                const tweetData = window.globalTweets ? window.globalTweets.find(t => t.id === item.tweetId) : null;
                const t = tweetData || window.state.tweetById.get(item.tweetId);
                if (!t) return null;

                const card = document.createElement('div');
                card.className = 'selectedCard';
                // 읽기 전용으로 트윗 자체는 드래그 불가
                card.style.cursor = 'default';
                card.dataset.managerIndex = index;
                card.dataset.itemId = item.tweetId;

                const d = window.getDerived ? window.getDerived(t, window.MY_HANDLE) : {};
                const isReply = window.isThreadReply ? window.isThreadReply(t, window.MY_HANDLE) : false;

                const header = document.createElement("div");
                header.className = "selectedCardHeader";
                if (window.buildDateLine) {
                    // 물리적 인덱스 대신 사전 계산된 displayIndex 사용
                    header.appendChild(window.buildDateLine(t, isReply, item.displayIndex));
                }
                card.appendChild(header);

                if (window.buildTweetBody) {
                    const { textEl, mediaEl, metricsEl, idEl } = window.buildTweetBody(t, d, { mediaSize: "small" });
                    card.appendChild(textEl);
                    if (mediaEl) card.appendChild(mediaEl);
                    if (metricsEl) card.appendChild(metricsEl);
                    card.appendChild(idEl);
                } else {
                    card.textContent = t.full_text || '내용 없음';
                }

                el = card;
            } else if (item.type === 'divider') {
                const block = document.createElement('div');
                block.className = 'em-divider';
                block.dataset.dividerId = item.id;
                block.dataset.itemId = item.id;
                block.dataset.managerIndex = index;

                block.innerHTML = `
                <div class="emDividerLine"></div>
                <div class="emDividerContent">
                    <span>분할선</span>
                    <button class="emDividerRemoveBtn" title="분할선 삭제">×</button>
                </div>
            `;

                const removeBtn = block.querySelector('.emDividerRemoveBtn');
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeDivider(item.id);
                });

                block.addEventListener("pointerdown", (e) => {
                    if (e.target.closest("button")) return;
                    if (e.button !== 0) return;
                    e.preventDefault();
                    block.setPointerCapture(e.pointerId);

                    _dragSrcId = item.id;
                    block.classList.add("dragging");

                    _dragGhost = document.createElement("div");
                    _dragGhost.className = "dragGhost";
                    _dragGhost.textContent = "분할선";
                    _dragGhost.style.position = "fixed";
                    _dragGhost.style.left = e.clientX + 10 + "px";
                    _dragGhost.style.top = e.clientY + 10 + "px";
                    _dragGhost.style.zIndex = "9999";
                    _dragGhost.style.pointerEvents = "none";
                    document.body.appendChild(_dragGhost);
                });

                el = block;
            }
            return el;
        }

        /**
         * 뷰어 상단 Sentinel (1px 높이의 투명 요소) 삽입.
         * IntersectionObserver가 이 요소의 가시성을 감지하면 _prependViewerPrevPage를
         * 호출하여 이전 페이지의 아이템을 DOM 상단에 추가한다.
         */
        function _addViewerTopSentinel() {
            if (_viewerTopObserver) { _viewerTopObserver.disconnect(); _viewerTopObserver = null; }
            const oldSentinel = emViewer.querySelector('.viewerTopSentinel');
            if (oldSentinel) oldSentinel.remove();

            const sentinel = document.createElement("div");
            sentinel.className = "viewerTopSentinel";
            sentinel.style.cssText = "height: 1px; flex-shrink: 0;";
            emViewer.insertBefore(sentinel, emViewer.firstChild);

            _viewerTopObserver = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && !_isJumping) _prependViewerPrevPage();
            }, { root: emViewer, threshold: 0 });
            _viewerTopObserver.observe(sentinel);
        }

        function _prependViewerPrevPage() {
            if (_renderStart <= 0) return;
            if (_viewerTopObserver) { _viewerTopObserver.disconnect(); _viewerTopObserver = null; }
            const sentinel = emViewer.querySelector(".viewerTopSentinel");
            if (sentinel) sentinel.remove();

            const managerItems = _em.managerItems;
            const newStart = Math.max(0, _renderStart - VIEWER_PAGE_SIZE);
            const frag = document.createDocumentFragment();

            for (let i = newStart; i < _renderStart; i++) {
                const el = buildNodeForItem(managerItems[i], i);
                if (el) frag.appendChild(el);
            }

            const prevScrollHeight = emViewer.scrollHeight;
            const prevScrollTop = emViewer.scrollTop;

            _renderStart = newStart;
            emViewer.insertBefore(frag, emViewer.firstChild);

            // Restore scroll position so content doesn't abruptly shift down
            emViewer.scrollTop = prevScrollTop + (emViewer.scrollHeight - prevScrollHeight);

            updateThreadClassesInDOM();

            // 돔 인덱스 속성 동기화
            Array.from(emViewer.children).forEach((node, idx) => {
                if (!node.classList.contains('viewerTopSentinel') && !node.classList.contains('viewerSentinel')) {
                    node.dataset.managerIndex = _renderStart + idx - (emViewer.querySelector('.viewerTopSentinel') ? 1 : 0);
                }
            });

            if (_renderStart > 0) {
                _addViewerTopSentinel();
            }
            _updateViewerScrollClass();
        }

        /**
         * 뷰어 하단 Sentinel 삽입. 가시성 감지 시 _appendViewerNextPage 호출.
         */
        function _addViewerSentinel() {
            if (_viewerObserver) { _viewerObserver.disconnect(); _viewerObserver = null; }
            const oldSentinel = emViewer.querySelector('.viewerSentinel');
            if (oldSentinel) oldSentinel.remove();

            const sentinel = document.createElement("div");
            sentinel.className = "viewerSentinel";
            sentinel.style.cssText = "height: 1px; flex-shrink: 0;";
            emViewer.appendChild(sentinel);

            _viewerObserver = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && !_isJumping) _appendViewerNextPage();
            }, { root: emViewer, threshold: 0 });
            _viewerObserver.observe(sentinel);
        }

        function _appendViewerNextPage() {
            const managerItems = _em.managerItems;
            if (_renderOffset >= managerItems.length) return;
            if (_viewerObserver) { _viewerObserver.disconnect(); _viewerObserver = null; }
            const sentinel = emViewer.querySelector(".viewerSentinel");
            if (sentinel) sentinel.remove();

            const end = Math.min(managerItems.length, _renderOffset + VIEWER_PAGE_SIZE);
            const frag = document.createDocumentFragment();

            for (let i = _renderOffset; i < end; i++) {
                const el = buildNodeForItem(managerItems[i], i);
                if (el) frag.appendChild(el);
            }

            _renderOffset = end;
            emViewer.appendChild(frag);

            updateThreadClassesInDOM();

            if (_renderOffset < managerItems.length) {
                _addViewerSentinel();
            }
            _updateViewerScrollClass();
        }

        /**
         * 타래(in_reply_to) 관계를 기반으로 DOM 노드에 panelThreadChild 클래스를 토글.
         * 자기 답글 트윗은 들여쓰기 + 파란 보더로 시각적으로 구분된다.
         */
        function updateThreadClassesInDOM() {
            const managerItems = _em.managerItems;
            const childSet = new Set();
            let prevTweetId = null;
            managerItems.forEach(item => {
                if (item.type === 'tweet') {
                    const t = (window.state.tweetById ? window.state.tweetById.get(item.tweetId) : null) || (window.globalTweets ? window.globalTweets.find(tw => tw.id === item.tweetId) : null);
                    if (t) {
                        const parentId = String(t.in_reply_to_status_id_str || "");
                        if (parentId && parentId === prevTweetId) {
                            childSet.add(item.tweetId);
                        }
                        prevTweetId = item.tweetId;
                    } else {
                        prevTweetId = null;
                    }
                } else if (item.type === 'divider') {
                    // 분할선 로직 무시
                }
            });

            Array.from(emViewer.children).forEach((node) => {
                if (node.classList.contains('selectedCard')) {
                    const tid = node.dataset.itemId;
                    node.classList.toggle('panelThreadChild', childSet.has(tid));
                }
            });
        }

        /**
         * 뷰어를 (재)렌더링.
         * @param {boolean} resetScroll - true면 DOM 초기화 + 스크롤 0으로 리셋, false면 인덱스만 재동기화
         * @param {number} startIndex - resetScroll=true일 때 렌더링 시작 위치 (기본 0)
         */
        function renderViewer(resetScroll = true, startIndex = 0) {
            const managerItems = _em.managerItems;
            if (resetScroll) {
                emViewer.innerHTML = '';

                // startIndex가 주어지면 거기서부터 렌더링 시작. 아니면 0(초기화)
                _renderStart = startIndex;
                _renderOffset = Math.min(managerItems.length, _renderStart + VIEWER_PAGE_SIZE);

                const frag = document.createDocumentFragment();
                for (let i = _renderStart; i < _renderOffset; i++) {
                    const el = buildNodeForItem(managerItems[i], i);
                    if (el) frag.appendChild(el);
                }
                emViewer.appendChild(frag);

                if (_renderStart > 0) {
                    _addViewerTopSentinel();
                }

                if (_renderOffset < managerItems.length) {
                    _addViewerSentinel();
                }
                if (resetScroll) emViewer.scrollTop = 0;
            } else {
                // DOM 구조 재동기화: 보이는 요소들의 managerIndex만 갱신
                Array.from(emViewer.children).forEach((node, idx) => {
                    if (!node.classList.contains('viewerSentinel') && !node.classList.contains('viewerTopSentinel')) {
                        node.dataset.managerIndex = _renderStart + idx - (emViewer.querySelector('.viewerTopSentinel') ? 1 : 0);
                    }
                });
            }
            updateThreadClassesInDOM();
            _updateViewerScrollClass();
        }

        /**
         * 분할선을 드래그앤드롭으로 이동한 뒤 배열과 DOM을 동기화.
         * @param {string} dividerId - 이동 대상 분할선 ID
         * @param {number} targetIndex - 드롭 위치의 managerIndex
         * @param {string} posStr - "before" 또는 "after" (드롭 위치 기준 삽입 방향)
         */
        function moveDivider(dividerId, targetIndex, posStr) {
            const managerItems = _em.managerItems;
            // managerItems에서 인덱스 찾기
            const srcArrIdx = managerItems.findIndex(i => i.id === dividerId);
            if (srcArrIdx < 0) return;

            let tgtArrIdx = srcArrIdx;
            const targetNode = emViewer.querySelector(`[data-manager-index="${targetIndex}"]`);
            if (targetNode) {
                const tgtItemId = targetNode.dataset.itemId;
                tgtArrIdx = managerItems.findIndex(i => (i.id === tgtItemId || i.tweetId === tgtItemId));
            }

            if (tgtArrIdx < 0) return;

            // 배열 업데이트
            const [movedItem] = managerItems.splice(srcArrIdx, 1);
            let newTargetIndex = managerItems.findIndex(i => (i.id === (targetNode ? targetNode.dataset.itemId : "") || i.tweetId === (targetNode ? targetNode.dataset.itemId : "")));
            if (newTargetIndex < 0) newTargetIndex = tgtArrIdx > srcArrIdx ? tgtArrIdx - 1 : tgtArrIdx;
            managerItems.splice(posStr === "before" ? newTargetIndex : newTargetIndex + 1, 0, movedItem);

            // DOM 업데이트
            const srcNode = emViewer.querySelector(`.em-divider[data-item-id="${dividerId}"]`);
            if (srcNode && targetNode) {
                targetNode.parentNode.insertBefore(srcNode, posStr === "before" ? targetNode : targetNode.nextSibling);
            }

            if (_em.fn.updateManagerIndices) _em.fn.updateManagerIndices();
            renderViewer(false);
            if (_em.fn.renderChunkNavigation) _em.fn.renderChunkNavigation();
            if (_em.fn.debouncedSaveDraft) _em.fn.debouncedSaveDraft();
        }

        function removeDivider(id) {
            const node = emViewer.querySelector(`.em-divider[data-item-id="${id}"]`);
            if (node) node.remove();

            _em.managerItems = _em.managerItems.filter(item => item.id !== id);
            if (_em.fn.updateManagerIndices) _em.fn.updateManagerIndices();
            renderViewer(false);
            if (_em.fn.renderChunkNavigation) _em.fn.renderChunkNavigation();
            if (_em.fn.debouncedSaveDraft) _em.fn.debouncedSaveDraft();
        }

        // 외부에서 호출할 수 있도록 함수 노출
        return {
            buildNodeForItem,
            renderViewer,
            updateThreadClassesInDOM,
            moveDivider,
            removeDivider,
            _updateViewerScrollClass,
            _appendViewerNextPage,
            _prependViewerPrevPage,
        };
    }
};
