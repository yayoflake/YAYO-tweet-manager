// src/selectedPanel.js
// 우측 선택 패널 관련 상태·함수 모음
// state, dom, MY_HANDLE, getPageItems, updateCounts 는 app.js의 전역 변수를 참조

const PANEL_PAGE_SIZE = 30;
let _panelObserver = null;
let _panelOrder = [];      // state.selectedOrder를 검색 필터 적용한 표시 순서 배열
let _panelChildSet = new Set(); // 직전 항목이 직접 부모인 타래 자식 ID 집합
let _panelHeadOffset = 0; // _panelOrder 내 현재 렌더링 시작 인덱스 (역방향 무한스크롤)
let _panelSearchQuery = "";
let _dragSrcId = null;
let _dragGhost = null;
let _dropTargetId = null;
let _dropPosStr = "after";
let _autoScrollRAF = null;
let _autoScrollDir = 0;

function _updatePanelScrollClass() {
  if (!dom.rightPanel) return;
  const hasScroll = dom.rightPanel.scrollHeight > dom.rightPanel.clientHeight;
  dom.rightPanel.classList.toggle("has-scroll", hasScroll);
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
    dom.rightPanel.scrollTop += dir * 8;
    _autoScrollRAF = requestAnimationFrame(step);
  }
  _autoScrollRAF = requestAnimationFrame(step);
}

function _handleDragEdgeScroll(clientY) {
  if (!dom.rightPanel) return;
  const r = dom.rightPanel.getBoundingClientRect();
  const edge = 50;
  const dir = clientY < r.top + edge ? -1 : clientY > r.bottom - edge ? 1 : 0;
  if (dir !== _autoScrollDir) {
    if (dir !== 0) _startAutoScroll(dir);
    else _stopAutoScroll();
  }
}

function _showPanelEmpty() {
  const empty = document.createElement("div");
  empty.className = "muted";
  empty.style.cssText = "padding: 16px 12px;";
  empty.textContent = "선택된 트윗이 없습니다.";
  dom.selectedList.appendChild(empty);
}

function _addTopSentinel() {
  const sentinel = document.createElement("div");
  sentinel.className = "panelSentinel";
  sentinel.style.cssText = "height: 1px;";
  dom.selectedList.insertBefore(sentinel, dom.selectedList.firstChild);
  _panelObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) _appendPanelCardsTop();
  }, { root: dom.rightPanel, threshold: 0 });
  _panelObserver.observe(sentinel);
}

function _appendPanelCardsTop() {
  if (_panelHeadOffset <= 0) return;
  if (_panelObserver) { _panelObserver.disconnect(); _panelObserver = null; }
  const sentinel = dom.selectedList.querySelector(".panelSentinel");
  if (sentinel) sentinel.remove();

  const newHead = Math.max(0, _panelHeadOffset - PANEL_PAGE_SIZE);
  const frag = document.createDocumentFragment();
  for (let i = newHead; i < _panelHeadOffset; i++) {
    const id = _panelOrder[i];
    const t = state.tweetById.get(id);
    if (t) frag.appendChild(_buildPanelCard(t, {
      isReply: isThreadReply(t, MY_HANDLE),
      isChild: _panelChildSet.has(id),
      index: i + 1,
    }));
  }
  const prevScrollHeight = dom.rightPanel.scrollHeight;
  const prevScrollTop = dom.rightPanel.scrollTop;
  _panelHeadOffset = newHead;
  dom.selectedList.insertBefore(frag, dom.selectedList.firstChild);
  dom.rightPanel.scrollTop = prevScrollTop + (dom.rightPanel.scrollHeight - prevScrollHeight);
  if (_panelHeadOffset > 0) _addTopSentinel();
  _updatePanelScrollClass();
}

function _syncSelectedCountDisplay() {
  const n = state.selectedIds.size;
  if (dom.selectedCount) dom.selectedCount.textContent = `선택된 트윗 (${n}개)`;
  if (dom.rightPanelToggleCount) dom.rightPanelToggleCount.textContent = n > 0 ? `${n}개` : "선택";
  if (dom.emToolbarCount) dom.emToolbarCount.textContent = n;
}

// _panelChildSet 재계산 (DOM 변경 없음, 카드 생성 전에 호출)
function _recomputePanelChildSet() {
  _panelChildSet = new Set();
  for (let i = 1; i < _panelOrder.length; i++) {
    const t = state.tweetById.get(_panelOrder[i]);
    if (!t) continue;
    const parentId = String(t.in_reply_to_status_id_str || "");
    if (parentId && parentId === _panelOrder[i - 1]) _panelChildSet.add(_panelOrder[i]);
  }
}

// _panelChildSet 재계산 + 기존 DOM 카드 클래스 동기화 (증분 변경 후 호출)
function _syncPanelThreadClasses() {
  _recomputePanelChildSet();
  if (!dom.selectedList) return;
  dom.selectedList.querySelectorAll(".selectedCard").forEach(card => {
    card.classList.toggle("panelThreadChild", _panelChildSet.has(card.dataset.tweetId));
  });
}

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
    targetNode = elUnder.closest(".selectedCard");
  }

  if (targetNode && targetNode.dataset.tweetId && targetNode.dataset.tweetId !== _dragSrcId) {
    const rect = targetNode.getBoundingClientRect();
    _dropPosStr = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    _dropTargetId = targetNode.dataset.tweetId;

    dom.selectedList.querySelectorAll(".dropIndicator").forEach(el => el.remove());
    const indicator = document.createElement("div");
    indicator.className = "dropIndicator";
    targetNode.parentNode.insertBefore(indicator, _dropPosStr === "before" ? targetNode : targetNode.nextSibling);
  }
}

function _handlePointerUp(e) {
  if (!_dragSrcId) return;
  const srcCard = dom.selectedList.querySelector(`.selectedCard[data-tweet-id="${_dragSrcId}"]`);
  if (srcCard) {
    srcCard.classList.remove("dragging");
    if (srcCard.hasPointerCapture(e.pointerId)) srcCard.releasePointerCapture(e.pointerId);
  }
  if (_dragGhost) { _dragGhost.remove(); _dragGhost = null; }
  dom.selectedList.querySelectorAll(".dropIndicator").forEach(el => el.remove());
  _stopAutoScroll();

  if (_dropTargetId && _dropTargetId !== _dragSrcId) {
    const dropPos = _dropPosStr;
    const srcOrdIdx = state.selectedOrder.indexOf(_dragSrcId);
    if (srcOrdIdx >= 0) state.selectedOrder.splice(srcOrdIdx, 1);
    const tgtOrdIdx = state.selectedOrder.indexOf(_dropTargetId);
    state.selectedOrder.splice(dropPos === "before" ? tgtOrdIdx : tgtOrdIdx + 1, 0, _dragSrcId);

    const srcPanelIdx = _panelOrder.indexOf(_dragSrcId);
    if (srcPanelIdx >= 0) _panelOrder.splice(srcPanelIdx, 1);
    const tgtPanelIdx = _panelOrder.indexOf(_dropTargetId);
    _panelOrder.splice(dropPos === "before" ? tgtPanelIdx : tgtPanelIdx + 1, 0, _dragSrcId);

    if (srcCard) {
      const targetCard = dom.selectedList.querySelector(`.selectedCard[data-tweet-id="${_dropTargetId}"]`);
      if (targetCard) {
        targetCard.parentNode.insertBefore(srcCard, dropPos === "before" ? targetCard : targetCard.nextSibling);
      }
    }
    _syncPanelThreadClasses();
    window.saveSelectedState();
  }
  _dragSrcId = null;
  _dropTargetId = null;
}

document.addEventListener("pointermove", _handlePointerMove);
document.addEventListener("pointerup", _handlePointerUp);
document.addEventListener("pointercancel", _handlePointerUp);

function _buildPanelCard(t, { isReply = false, isChild = false, index = null } = {}) {
  const id = String(t.id || t.id_str || "");
  const d = getDerived(t, MY_HANDLE);

  const card = document.createElement("div");
  card.className = "selectedCard";
  if (isChild) card.classList.add("panelThreadChild");
  card.dataset.tweetId = id;

  card.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button") || e.target.closest("a") || e.target.closest("video") || e.target.closest("input") || e.target.closest(".tagClickable") || e.target.closest(".clickableId") || e.target.closest(".clickableDate") || e.target.closest(".copyTweetBtn") || e.target.closest(".metric-link")) return;
    if (e.button !== 0) return;
    e.preventDefault();
    card.setPointerCapture(e.pointerId);

    _dragSrcId = id;
    card.classList.add("dragging");

    _dragGhost = document.createElement("div");
    _dragGhost.className = "dragGhost";
    const textPrefix = (d.cleanedText || "").replace(/\s+/g, " ").trim().slice(0, 30);
    _dragGhost.textContent = textPrefix ? textPrefix + "..." : "(본문 없음)";
    document.body.appendChild(_dragGhost);
    _dragGhost.style.position = "fixed";
    _dragGhost.style.left = e.clientX + 10 + "px";
    _dragGhost.style.top = e.clientY + 10 + "px";
    _dragGhost.style.zIndex = "9999";
    _dragGhost.style.pointerEvents = "none";
  });

  // 헤더
  const header = document.createElement("div");
  header.className = "selectedCardHeader";

  header.appendChild(buildDateLine(t, isReply, index));

  const removeBtn = document.createElement("button");
  removeBtn.className = "selectedCardRemove";
  removeBtn.textContent = "×";
  removeBtn.title = "선택 해제";
  removeBtn.addEventListener("click", () => {
    state.selectedIds.delete(id);
    const oidx = state.selectedOrder.indexOf(id);
    if (oidx >= 0) state.selectedOrder.splice(oidx, 1);
    const pidx = _panelOrder.indexOf(id);
    if (pidx >= 0) _panelOrder.splice(pidx, 1);
    const trEl = dom.tbody.querySelector(`tr[data-tweet-id="${id}"]`);
    if (trEl) trEl.classList.remove("tweetSelected");
    card.remove();
    _syncPanelThreadClasses();
    _syncSelectedCountDisplay();
    _updatePanelScrollClass();
    window.saveSelectedState();
    if (state.selectedIds.size === 0) {
      if (_panelObserver) { _panelObserver.disconnect(); _panelObserver = null; }
      _showPanelEmpty();
    }
    const { items } = getPageItems();
    updateCounts(items);
  });
  header.appendChild(removeBtn);
  card.appendChild(header);

  // 본문·미디어(소형)·지표·ID (공통 함수)
  const { textEl, mediaEl, metricsEl, idEl } = buildTweetBody(t, d, { mediaSize: "small" });
  card.appendChild(textEl);
  if (mediaEl) card.appendChild(mediaEl);
  if (metricsEl) card.appendChild(metricsEl);
  card.appendChild(idEl);

  return card;
}

function _addCardToPanel(id) {
  const t = state.tweetById.get(id);
  if (!t) return;
  _syncSelectedCountDisplay();
  const q = _panelSearchQuery.toLowerCase().trim();
  if (q) {
    const d = getDerived(t, MY_HANDLE);
    if (id.toLowerCase() !== q && !(d.cleanedText || "").toLowerCase().includes(q)) return;
  }
  const emptyMsg = dom.selectedList.querySelector(".muted");
  if (emptyMsg) emptyMsg.remove();
  _panelOrder.push(id);
  dom.selectedList.appendChild(_buildPanelCard(t, {
    isReply: isThreadReply(t, MY_HANDLE),
    index: _panelOrder.length
  }));
  _syncPanelThreadClasses();
  requestAnimationFrame(() => {
    if (dom.rightPanel) {
      dom.rightPanel.scrollTop = dom.rightPanel.scrollHeight;
      _updatePanelScrollClass();
    }
  });
}

function _removeCardFromPanel(id) {
  _syncSelectedCountDisplay();
  const pidx = _panelOrder.indexOf(id);
  if (pidx >= 0) {
    _panelOrder.splice(pidx, 1);
    if (pidx < _panelHeadOffset) _panelHeadOffset = Math.max(0, _panelHeadOffset - 1);
  }
  const card = dom.selectedList.querySelector(`.selectedCard[data-tweet-id="${id}"]`);
  if (card) card.remove();
  _syncPanelThreadClasses();
  _updatePanelScrollClass();
  if (state.selectedIds.size === 0) {
    if (_panelObserver) { _panelObserver.disconnect(); _panelObserver = null; }
    _showPanelEmpty();
  }
}

function renderSelectedPanel() {
  if (!dom.selectedList) return;
  if (_panelObserver) { _panelObserver.disconnect(); _panelObserver = null; }

  const count = state.selectedIds.size;
  _syncSelectedCountDisplay();
  dom.selectedList.innerHTML = "";

  if (count === 0) {
    _panelOrder = [];
    _panelHeadOffset = 0;
    _showPanelEmpty();
    return;
  }

  // 검색 필터 적용
  const q = _panelSearchQuery.toLowerCase().trim();
  if (q) {
    _panelOrder = state.selectedOrder.filter(id => {
      if (id.toLowerCase() === q) return true;
      const t = state.tweetById.get(id);
      if (!t) return false;
      const d = getDerived(t, MY_HANDLE);
      return (d.cleanedText || "").toLowerCase().includes(q);
    });
  } else {
    _panelOrder = [...state.selectedOrder];
  }

  if (_panelOrder.length === 0) {
    _panelHeadOffset = 0;
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.style.cssText = "padding: 16px 12px;";
    empty.textContent = "검색 결과가 없습니다.";
    dom.selectedList.appendChild(empty);
    return;
  }

  // 역방향 무한스크롤: 최신(하단) PANEL_PAGE_SIZE개만 먼저 렌더링
  _panelHeadOffset = Math.max(0, _panelOrder.length - PANEL_PAGE_SIZE);
  if (_panelHeadOffset > 0) _addTopSentinel();

  // 패널 내 타래 자식 계산 (직전 항목이 직접 부모인 경우)
  _recomputePanelChildSet();

  const frag = document.createDocumentFragment();
  for (let i = _panelHeadOffset; i < _panelOrder.length; i++) {
    const id = _panelOrder[i];
    const t = state.tweetById.get(id);
    if (t) frag.appendChild(_buildPanelCard(t, {
      isReply: isThreadReply(t, MY_HANDLE),
      isChild: _panelChildSet.has(id),
      index: i + 1,
    }));
  }
  dom.selectedList.appendChild(frag);
  requestAnimationFrame(() => {
    if (dom.rightPanel) {
      dom.rightPanel.scrollTop = dom.rightPanel.scrollHeight;
      _updatePanelScrollClass();
    }
  });
}

// 패널 검색 이벤트 (DOM 준비 후 즉시 등록)
(function () {
  const ps = document.getElementById("panelSearch");
  if (ps) {
    ps.addEventListener("input", () => {
      _panelSearchQuery = ps.value;
      renderSelectedPanel();
    });
  }
})();

// 선택 패널 정렬 이벤트
(function () {
  const btn = document.getElementById("sortApplyBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    if (state.selectedOrder.length === 0) return;

    const field = (document.querySelector('input[name="sortField"]:checked') || {}).value || "date";
    const dir = (document.querySelector('input[name="sortDir"]:checked') || {}).value || "desc";

    const tweets = state.selectedOrder
      .map(id => state.tweetById.get(id))
      .filter(Boolean);

    const sign = dir === "asc" ? 1 : -1;
    tweets.sort((a, b) => {
      let va, vb;
      if (field === "rt") {
        va = normalizeCount(a.retweet_count);
        vb = normalizeCount(b.retweet_count);
      } else if (field === "fav") {
        va = normalizeCount(a.favorite_count);
        vb = normalizeCount(b.favorite_count);
      } else {
        va = Date.parse(a.created_at || "") || 0;
        vb = Date.parse(b.created_at || "") || 0;
      }
      return sign * (va - vb);
    });

    state.selectedOrder = tweets.map(t => String(t.id || t.id_str || "")).filter(Boolean);
    window.saveSelectedState();
    renderSelectedPanel();
  });
})();

// 타래로 묶기 이벤트
(function () {
  const btn = document.getElementById("threadGroupBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (state.selectedOrder.length === 0) return;
    const tweets = state.selectedOrder.map(id => state.tweetById.get(id)).filter(Boolean);
    state.selectedOrder = threadSort(tweets).map(t => String(t.id || t.id_str || "")).filter(Boolean);
    window.saveSelectedState();
    renderSelectedPanel();
  });
})();
