// src/app.js
if (document.fonts && document.fonts.load) {
  document.fonts.load('1em Noto Sans KR');
}

let MY_HANDLE = "";
window.MY_HANDLE = MY_HANDLE;
const PAGE_SIZE = 30;

const dom = {
  status: el("status"),
  reloadBtn: el("reloadBtn"),

  keyword: el("keyword"),
  excludeRetweets: el("excludeRetweets"),
  excludeMentions: el("excludeMentions"),
  clearBtn: el("clearBtn"),

  minRT: el("minRT"),
  minFav: el("minFav"),

  selectAllPageBtn: el("selectAllPageBtn"),
  selectAllFilteredBtn: el("selectAllFilteredBtn"),
  clearSelBtn: el("clearSelBtn"),
  exportBtn: el("exportBtn"),
  exportManagerBtn: el("exportManagerBtn"),

  prevPageBtn: el("prevPageBtn"),
  nextPageBtn: el("nextPageBtn"),
  pageInfo: el("pageInfo"),
  pageSelect: el("pageSelect"),

  // bottom pager (index.html에 추가한 것)
  prevPageBtnBottom: el("prevPageBtnBottom"),
  nextPageBtnBottom: el("nextPageBtnBottom"),
  pageInfoBottom: el("pageInfoBottom"),
  pageSelectBottom: el("pageSelectBottom"),

  counts: el("counts"),
  tbody: el("tbody"),
  error: el("error"),

  threadGroup: el("threadGroup"),
  filterTagQuoteMine: el("filterTagQuoteMine"),
  filterTagQuoteOther: el("filterTagQuoteOther"),
  filterTagAnon: el("filterTagAnon"),
  filterTagNormal: el("filterTagNormal"),
  filterTagExternalLink: el("filterTagExternalLink"),
  filterMediaVideo: el("filterMediaVideo"),
  filterMediaPhoto: el("filterMediaPhoto"),
  filterMediaYoutube: el("filterMediaYoutube"),
  showQuotePreview: el("showQuotePreview"),
  showReplyPreview: el("showReplyPreview"),
  dateFrom: el("dateFrom"),
  dateTo: el("dateTo"),
  dateExact: el("dateExact"),
  selectedCount: el("selectedCount"),
  selectedList: el("selectedList"),
  rightPanel: el("rightPanel"),
  panelSearch: el("panelSearch"),
  rightPanelToggleCount: el("rightPanelToggleCount"),
  emToolbarCount: el("emToolbarCount"),
};

const state = {
  allTweets: [],
  tweetById: new Map(), // 인용 미리보기용
  filtered: [],
  selectedIds: new Set(),
  selectedOrder: [], // 선택 순서 배열 (표시 순서 = 선택 순서)
  currentPage: 1,
  totalPages: 1,
  pageBreaks: [0, 0], // 타래 인식 페이지 경계 인덱스 배열 ([0, end_p1, end_p2, ...])
  threadChildIds: new Set(), // 부모가 결과 안에 있는 타래 자식 트윗 ID
};

window.state = state; // exportManager 등 다른 모듈에서 참조할 수 있도록 전역 노출

window.saveSelectedState = function saveSelectedState() {
  localStorage.setItem("yayo_tweet_selected", JSON.stringify(state.selectedOrder));
};

window.restoreSelectedState = function restoreSelectedState() {
  state.selectedIds.clear();
  state.selectedOrder = [];
  try {
    const saved = localStorage.getItem("yayo_tweet_selected");
    if (saved) {
      const arr = JSON.parse(saved);
      if (Array.isArray(arr)) {
        for (const id of arr) {
          if (state.tweetById.has(id)) {
            state.selectedIds.add(id);
            state.selectedOrder.push(id);
          }
        }
      }
    }
  } catch (e) { }
};

function _debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function _renderFiltered() { state.currentPage = 1; render(); }
const _renderFilteredDebounced = _debounce(_renderFiltered, 400);

function toYMD(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function tweetYMD(createdAt) {
  const t = Date.parse(createdAt || "");
  if (!t) return "";
  return toYMD(new Date(t));
}

function setError(msg) {
  dom.error.textContent = msg || "";
}

function setPagerDisabled(disabled) {
  dom.prevPageBtn.disabled = disabled;
  dom.nextPageBtn.disabled = disabled;
  dom.pageSelect.disabled = disabled;

  dom.prevPageBtnBottom.disabled = disabled;
  dom.nextPageBtnBottom.disabled = disabled;
  dom.pageSelectBottom.disabled = disabled;
}

function enableControls(enabled) {
  dom.clearBtn.disabled = !enabled;

  if (dom.selectAllPageBtn) dom.selectAllPageBtn.disabled = !enabled;
  dom.selectAllFilteredBtn.disabled = !enabled;
  dom.clearSelBtn.disabled = !enabled;
  dom.exportBtn.disabled = !enabled || state.selectedIds.size === 0;
  dom.exportManagerBtn.disabled = !enabled || state.selectedIds.size === 0;

  dom.reloadBtn.disabled = !enabled;

  setPagerDisabled(!enabled);
}

// 타래(자기 답글) 트윗들을 부모 바로 뒤에 연속 배치
function threadSort(tweets) {
  if (!MY_HANDLE) return tweets;

  const filteredIds = new Set();
  for (const t of tweets) {
    const id = String(t.id || t.id_str || "");
    if (id) filteredIds.add(id);
  }

  // parentId -> [자식 트윗들] (날짜 오름차순)
  const childrenMap = new Map();
  for (const t of tweets) {
    if (!isThreadReply(t, MY_HANDLE)) continue;
    const parentId = String(t.in_reply_to_status_id_str || "");
    if (!parentId || !filteredIds.has(parentId)) continue;
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId).push(t);
  }
  for (const [, children] of childrenMap) {
    children.sort((a, b) => (Date.parse(a.created_at || "") || 0) - (Date.parse(b.created_at || "") || 0));
  }

  // 앵커 트윗: 타래 답글이 아니거나, 부모가 결과 안에 없는 것
  const anchors = tweets.filter(t => {
    if (!isThreadReply(t, MY_HANDLE)) return true;
    const parentId = String(t.in_reply_to_status_id_str || "");
    return !parentId || !filteredIds.has(parentId);
  });

  const result = [];
  const visited = new Set();

  function insertWithChildren(t) {
    const id = String(t.id || t.id_str || "");
    if (visited.has(id)) return;
    visited.add(id);
    result.push(t);
    for (const child of (childrenMap.get(id) || [])) {
      insertWithChildren(child);
    }
  }

  for (const anchor of anchors) insertWithChildren(anchor);

  return result;
}

// 타래를 끊지 않는 페이지 경계 계산
// 짧은 타래(꼬리 ≤ THREAD_OVERFLOW_MAX)는 현재 페이지에 수용
// 긴 타래는 루트 앞에서 잘라 루트가 다음 페이지 첫 항목이 되도록 함
const THREAD_OVERFLOW_MAX = 6;

function computePageBreaks(filtered, threadChildIds) {
  if (filtered.length === 0) return [0];
  const breaks = [0];
  let pageStart = 0;
  while (pageStart < filtered.length) {
    let pageEnd = Math.min(pageStart + PAGE_SIZE, filtered.length);
    if (pageEnd < filtered.length) {
      const id = String(filtered[pageEnd].id || filtered[pageEnd].id_str || "");
      if (threadChildIds.has(id)) {
        // 페이지 경계가 타래 자식 중간에 걸림
        // 남은 꼬리(경계 이후 연속 자식) 수 계산
        let tail = 0, j = pageEnd;
        while (j < filtered.length && threadChildIds.has(String(filtered[j].id || filtered[j].id_str || ""))) {
          tail++; j++;
        }
        if (tail <= THREAD_OVERFLOW_MAX) {
          pageEnd = j; // 짧은 꼬리 → 현재 페이지에 포함해 연장
        } else {
          // 긴 타래 → 타래 루트 앞에서 자름
          let rootIdx = pageEnd - 1;
          while (rootIdx > pageStart && threadChildIds.has(String(filtered[rootIdx].id || filtered[rootIdx].id_str || ""))) {
            rootIdx--;
          }
          // rootIdx가 타래 루트 (threadChildIds에 없음)
          if (rootIdx > pageStart) {
            pageEnd = rootIdx; // 루트 앞에서 잘라 루트가 다음 페이지 시작
          }
          // rootIdx === pageStart → 페이지 전체가 거대 타래, PAGE_SIZE로 자름
        }
      }
    }
    breaks.push(pageEnd);
    pageStart = pageEnd;
  }
  return breaks;
}

function applyFilter() {
  const qStr = dom.keyword.value.trim().toLowerCase();
  const terms = qStr.split(/\s+/).filter(Boolean);
  const includeTerms = [];
  const excludeTerms = [];
  for (const term of terms) {
    if (term.startsWith("-") && term.length > 1) {
      excludeTerms.push(term.slice(1));
    } else {
      includeTerms.push(term);
    }
  }
  state.highlightTerms = includeTerms;

  const minRT = clampInt(dom.minRT.value, 0);
  const minFav = clampInt(dom.minFav.value, 0);

  const from = String(dom.dateFrom.value || "").trim();      // YYYY-MM-DD or ""
  const to = String(dom.dateTo.value || "").trim();          // YYYY-MM-DD or ""
  const exact = String(dom.dateExact.value || "").trim();    // YYYY-MM-DD or ""

  const mediaFilter = (document.querySelector('input[name="mediaFilter"]:checked') || {}).value || "all";

  state.filtered = state.allTweets.filter(t => {
    if (!dom.excludeRetweets.checked && isRetweetByText(t.full_text)) return false;
    if (dom.excludeMentions && !dom.excludeMentions.checked && isMentionToOther(t.full_text, MY_HANDLE)) return false;

    const rt = normalizeCount(t.retweet_count);
    const fav = normalizeCount(t.favorite_count);
    if (rt < minRT) return false;
    if (fav < minFav) return false;

    // 날짜 필터 (특정일이 있으면 시작일/종료일 무시)
    if (exact) {
      const ymd = tweetYMD(t.created_at);
      if (!ymd || ymd !== exact) return false;
    } else if (from || to) {
      const ymd = tweetYMD(t.created_at);
      if (!ymd) return false;
      if (from && ymd < from) return false;
      if (to && ymd > to) return false;
    }

    const d = getDerived(t, MY_HANDLE);
    const hasYouTubeTag = d.tags.some(tag => tag.label === "유튜브");

    // 미디어 필터 (radio) - 유튜브도 미디어로 취급
    if (mediaFilter === "hasMedia" && !d.isMedia && !hasYouTubeTag) return false;
    if (mediaFilter === "textOnly" && (d.isMedia || hasYouTubeTag)) return false;
    if (mediaFilter === "mediaOnly") {
      const embeddedMediaOnly = d.isMedia && (d.cleanedText || "").trim().length === 0;
      const youtubeOnlyText = hasYouTubeTag && !(d.cleanedText || "").replace(/https?:\/\/\S+/g, "").trim();
      if (!embeddedMediaOnly && !youtubeOnlyText) return false;
    }

    // 미디어 종류 필터 (동영상/사진/유튜브) 통합
    if (d.isMedia || hasYouTubeTag) {
      const showVideo = dom.filterMediaVideo && dom.filterMediaVideo.checked;
      const showPhoto = dom.filterMediaPhoto && dom.filterMediaPhoto.checked;
      const showYoutube = !dom.filterMediaYoutube || dom.filterMediaYoutube.checked;
      if (!(showVideo && showPhoto && showYoutube)) {
        const mediaEntities = getMediaEntities(t);
        const hasVideo = mediaEntities.some(m => m.type === "video" || m.type === "animated_gif");
        const hasPhoto = mediaEntities.some(m => m.type === "photo");
        const allowed =
          (showVideo && hasVideo) ||
          (showPhoto && hasPhoto) ||
          (showYoutube && hasYouTubeTag);
        if (!allowed) return false;
      }
    }

    // 태그 필터: 전부 체크 = 필터 없음, 일부만 체크 = 체크된 카테고리에 속하는 트윗만 표시
    const hasExternalLink = (d.cleanedText || "").toLowerCase().includes("http");
    const allTagsChecked =
      dom.filterTagQuoteMine.checked &&
      dom.filterTagQuoteOther.checked &&
      dom.filterTagAnon.checked &&
      (dom.filterTagNormal ? dom.filterTagNormal.checked : true) &&
      (dom.filterTagExternalLink ? dom.filterTagExternalLink.checked : true);
    if (!allTagsChecked) {
      const hasQuoteMine = d.tags.some(tag => tag.label === "내 트윗 인용");
      const hasQuoteOther = d.tags.some(tag => tag.label === "남의 트윗 인용");
      const hasAnon = d.tags.some(tag => tag.label === "익명 질문");
      const isNormal = !hasQuoteMine && !hasQuoteOther && !hasAnon;
      const matches =
        (dom.filterTagQuoteMine.checked && hasQuoteMine) ||
        (dom.filterTagQuoteOther.checked && hasQuoteOther) ||
        (dom.filterTagAnon.checked && hasAnon) ||
        (dom.filterTagNormal && dom.filterTagNormal.checked && isNormal) ||
        (dom.filterTagExternalLink && dom.filterTagExternalLink.checked && hasExternalLink);
      if (!matches) return false;
    }

    // 검색어: 본문 또는 트윗 ID
    if (terms.length === 0) return true;

    const id = String(t.id || t.id_str || "").toLowerCase();
    if (terms.length === 1 && id === qStr) return true;

    const text = String(d.cleanedText || "").toLowerCase();
    for (const inc of includeTerms) {
      if (!text.includes(inc)) return false;
    }
    for (const exc of excludeTerms) {
      if (text.includes(exc)) return false;
    }
    return true;
  });

  state.threadChildIds = new Set();
  if (!dom.threadGroup || dom.threadGroup.checked) {
    state.filtered = threadSort(state.filtered);

    // 부모가 결과 안에 있는 타래 자식 트윗 ID (들여쓰기 판단용)
    const filteredIdSet = new Set(state.filtered.map(t => String(t.id || t.id_str || "")));
    for (const t of state.filtered) {
      if (!isThreadReply(t, MY_HANDLE)) continue;
      const parentId = String(t.in_reply_to_status_id_str || "");
      if (parentId && filteredIdSet.has(parentId)) {
        state.threadChildIds.add(String(t.id || t.id_str || ""));
      }
    }
  }

  state.pageBreaks = computePageBreaks(state.filtered, state.threadChildIds);
  state.totalPages = Math.max(1, state.pageBreaks.length - 1);
  state.currentPage = Math.min(Math.max(1, state.currentPage), state.totalPages);
  rebuildPageSelect();
}

function rebuildPageSelect() {
  const rebuild = (selectEl) => {
    selectEl.innerHTML = "";
    for (let p = 1; p <= state.totalPages; p++) {
      const opt = document.createElement("option");
      opt.value = String(p);
      const startIdx = state.pageBreaks[p - 1] + 1;
      const endIdx = state.pageBreaks[p] ?? state.filtered.length;
      opt.textContent = `${p} / ${state.totalPages} (${startIdx}-${endIdx})`;
      if (p === state.currentPage) opt.selected = true;
      selectEl.appendChild(opt);
    }
    selectEl.disabled = state.filtered.length === 0;
  };

  rebuild(dom.pageSelect);
  rebuild(dom.pageSelectBottom);
}

function getPageItems() {
  const start = state.pageBreaks[state.currentPage - 1] ?? 0;
  const end = state.pageBreaks[state.currentPage] ?? state.filtered.length;
  return { start, end, items: state.filtered.slice(start, end) };
}

function updatePager(start, end) {
  const prevDisabled = state.currentPage <= 1;
  const nextDisabled = state.currentPage >= state.totalPages;

  dom.prevPageBtn.disabled = prevDisabled;
  dom.nextPageBtn.disabled = nextDisabled;

  dom.prevPageBtnBottom.disabled = prevDisabled;
  dom.nextPageBtnBottom.disabled = nextDisabled;

  const sNo = state.filtered.length === 0 ? 0 : start + 1;
  const eNo = state.filtered.length === 0 ? 0 : end;

  const text = `${state.currentPage} / ${state.totalPages} (${sNo}-${eNo})`;
  dom.pageInfo.textContent = text;
  dom.pageInfoBottom.textContent = text;

  dom.pageSelect.value = String(state.currentPage);
  dom.pageSelectBottom.value = String(state.currentPage);
}

function updateCounts(pageItems) {
  const total = state.allTweets.length;
  const shown = state.filtered.length;

  let selectedOnPage = 0;
  for (const t of pageItems) {
    const id = String(t.id || t.id_str || "");
    if (state.selectedIds.has(id)) selectedOnPage++;
  }

  dom.counts.textContent =
    `전체 ${total} - 검색결과 ${shown} - 현재페이지 선택 ${selectedOnPage} - 선택(전체) ${state.selectedIds.size}`;

  dom.exportBtn.disabled = state.selectedIds.size === 0;
  dom.exportManagerBtn.disabled = state.selectedIds.size === 0;
  if (dom.emToolbarCount) dom.emToolbarCount.textContent = state.selectedIds.size;

  if (dom.selectAllPageBtn) {
    const pageTotal = pageItems.length;
    const allSel = pageTotal > 0 && selectedOnPage === pageTotal;
    dom.selectAllPageBtn.textContent = allSel ? `현재 페이지 전체 해제` : `현재 페이지 전체 선택`;
  }

  dom.selectAllFilteredBtn.textContent = `검색 결과 전체 선택 - ${shown}개`;

  // 초안 버튼 유효성 재검사 (선택된 트윗 목록이 바뀌면 초안 버튼 노출 여부도 바뀌어야 함)
  if (window.managerStep1Obj && window.managerStep1Obj.updateRestoreDraftButtonVisibility) {
    window.managerStep1Obj.updateRestoreDraftButtonVisibility();
  }
}

// ── 선택 패널 함수는 selectedPanel.js 참조 ──────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────

function render() {
  applyFilter();

  const { start, end, items } = getPageItems();

  renderTable({
    tbody: dom.tbody,
    tweetsOnPage: items,
    selectedIds: state.selectedIds,
    myHandle: MY_HANDLE,
    tweetById: state.tweetById,
    threadChildIds: state.threadChildIds,
    showQuotePreview: !dom.showQuotePreview || dom.showQuotePreview.checked,
    showReplyPreview: !dom.showReplyPreview || dom.showReplyPreview.checked,
    onToggleSelect: (id, checked) => {
      if (checked) {
        if (!state.selectedIds.has(id)) {
          state.selectedIds.add(id);
          state.selectedOrder.push(id);
          window.saveSelectedState();
          updateCounts(items);
          _addCardToPanel(id);
        }
      } else {
        if (state.selectedIds.has(id)) {
          state.selectedIds.delete(id);
          const oidx = state.selectedOrder.indexOf(id);
          if (oidx >= 0) state.selectedOrder.splice(oidx, 1);
          window.saveSelectedState();
          updateCounts(items);
          _removeCardFromPanel(id);
        }
      }
    },
  });

  updatePager(start, end);
  updateCounts(items);
  renderSelectedPanel();
}

// ── 티스토리 내보내기 함수는 tistoryExport.js 참조 ──────────────────────────

async function loadData() {
  setError("");
  dom.status.textContent = "불러오는 중...";

  state.selectedIds.clear();
  state.selectedOrder = [];
  state.allTweets = [];
  state.filtered = [];
  state.tweetById = new Map();
  state.threadChildIds = new Set();
  state.currentPage = 1;
  state.totalPages = 1;

  try {
    const onProgress = (current, total) => {
      const cStr = typeof current === 'number' ? current.toLocaleString() : current;
      const tStr = typeof total === 'number' ? total.toLocaleString() : total;
      dom.status.innerHTML = `불러오는 중...<span class="muted">(${cStr}/${tStr})</span>`;
    };

    const username = await loadUsernameAuto(onProgress);
    if (username) {
      MY_HANDLE = username;
      window.MY_HANDLE = username;
    }

    const { tweets, loadedFiles } = await loadTweetsAuto(onProgress);

    state.allTweets = tweets;

    let mediaCount = 0;
    for (const tw of state.allTweets) {
      mediaCount += getMediaItemsFromTweet(tw).length;
    }

    state.tweetById = new Map();
    for (const tw of state.allTweets) {
      const tid = String(tw.id || tw.id_str || "");
      if (tid) state.tweetById.set(tid, tw);
    }

    window.restoreSelectedState();

    dom.status.innerHTML = `로드 완료 - ${tweets.length.toLocaleString()}개<span class="muted">(미디어 ${mediaCount.toLocaleString()}개)</span>`;

    enableControls(true);
    render();
  } catch (e) {
    dom.status.textContent = "로드 실패 - data 폴더가 올바른 위치에 있는지 확인해 주세요";
    enableControls(false);
    setError(String(e && e.message ? e.message : e));
  }
}

// 페이지 이동 헬퍼
function goPrev(shouldScroll) {
  if (state.currentPage > 1) state.currentPage--;
  render();
  if (shouldScroll) dom.prevPageBtn.scrollIntoView({ behavior: "smooth", block: "start" });
}
function goNext(shouldScroll) {
  if (state.currentPage < state.totalPages) state.currentPage++;
  render();
  if (shouldScroll) dom.prevPageBtn.scrollIntoView({ behavior: "smooth", block: "start" });
}
function goPage(p, shouldScroll) {
  const n = Number(p);
  if (Number.isFinite(n) && n >= 1 && n <= state.totalPages) {
    state.currentPage = n;
    render();
    if (shouldScroll) dom.prevPageBtn.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function syncDateExact() {
  const hasExact = !!dom.dateExact.value;
  dom.dateFrom.disabled = hasExact;
  dom.dateTo.disabled = hasExact;
}

function syncMediaTypeFilter() {
  const isTextOnly = (document.querySelector('input[name="mediaFilter"]:checked') || {}).value === "textOnly";
  if (dom.filterMediaVideo) dom.filterMediaVideo.disabled = isTextOnly;
  if (dom.filterMediaPhoto) dom.filterMediaPhoto.disabled = isTextOnly;
  if (dom.filterMediaYoutube) dom.filterMediaYoutube.disabled = isTextOnly;
}
document.querySelectorAll('input[name="mediaFilter"]').forEach(r =>
  r.addEventListener("change", () => { syncMediaTypeFilter(); _renderFiltered(); })
);

// events
dom.dateExact.addEventListener("input", () => { syncDateExact(); _renderFilteredDebounced(); });
dom.reloadBtn.addEventListener("click", loadData);

// 실시간 필터 이벤트
[dom.excludeRetweets, dom.excludeMentions,
dom.filterTagQuoteMine, dom.filterTagQuoteOther, dom.filterTagAnon, dom.filterTagNormal, dom.filterTagExternalLink,
dom.filterMediaVideo, dom.filterMediaPhoto, dom.filterMediaYoutube,
dom.threadGroup, dom.showQuotePreview, dom.showReplyPreview,
].forEach(el => { if (el) el.addEventListener("change", _renderFiltered); });

dom.keyword.addEventListener("input", _renderFilteredDebounced);
dom.minRT.addEventListener("input", _renderFilteredDebounced);
dom.minFav.addEventListener("input", _renderFilteredDebounced);
dom.dateFrom.addEventListener("input", _renderFilteredDebounced);
dom.dateTo.addEventListener("input", _renderFilteredDebounced);

dom.clearBtn.addEventListener("click", () => {
  dom.keyword.value = "";
  dom.excludeRetweets.checked = false;
  if (dom.excludeMentions) dom.excludeMentions.checked = false;
  dom.minRT.value = "0";
  dom.minFav.value = "0";
  dom.dateFrom.value = "";
  dom.dateTo.value = "";
  dom.dateExact.value = "";
  const radioAll = document.getElementById("mediaFilterAll");
  if (radioAll) radioAll.checked = true;
  if (dom.filterTagQuoteMine) dom.filterTagQuoteMine.checked = true;
  if (dom.filterTagQuoteOther) dom.filterTagQuoteOther.checked = true;
  if (dom.filterTagAnon) dom.filterTagAnon.checked = true;
  if (dom.filterTagNormal) dom.filterTagNormal.checked = true;
  if (dom.filterTagExternalLink) dom.filterTagExternalLink.checked = true;
  if (dom.filterMediaVideo) dom.filterMediaVideo.checked = true;
  if (dom.filterMediaPhoto) dom.filterMediaPhoto.checked = true;
  if (dom.filterMediaYoutube) dom.filterMediaYoutube.checked = true;
  syncDateExact();
  syncMediaTypeFilter();

  setError("");
  state.currentPage = 1;
  render();
});

if (dom.selectAllPageBtn) {
  dom.selectAllPageBtn.addEventListener("click", () => {
    const { items } = getPageItems();
    const allSelected = items.length > 0 && items.every(t => state.selectedIds.has(String(t.id || t.id_str || "")));
    if (allSelected) {
      for (const t of items) {
        const id = String(t.id || t.id_str || "");
        if (id && state.selectedIds.has(id)) {
          state.selectedIds.delete(id);
          const oidx = state.selectedOrder.indexOf(id);
          if (oidx >= 0) state.selectedOrder.splice(oidx, 1);
          _removeCardFromPanel(id);
        }
      }
    } else {
      for (const t of items) {
        const id = String(t.id || t.id_str || "");
        if (id && !state.selectedIds.has(id)) {
          state.selectedIds.add(id);
          state.selectedOrder.push(id);
          _addCardToPanel(id);
        }
      }
    }
    updateCounts(items);
    for (const t of items) {
      const id = String(t.id || t.id_str || "");
      const trEl = dom.tbody.querySelector(`tr[data-tweet-id="${id}"]`);
      if (trEl) trEl.classList.toggle("tweetSelected", state.selectedIds.has(id));
    }
    window.saveSelectedState();
  });
}

dom.selectAllFilteredBtn.addEventListener("click", () => {
  const count = state.filtered.length;
  if (!confirm(`총 ${count}개의 검색 결과를 전체 선택합니까?`)) return;
  for (const t of state.filtered) {
    const id = String(t.id || t.id_str || "");
    if (id && !state.selectedIds.has(id)) {
      state.selectedIds.add(id);
      state.selectedOrder.push(id);
    }
  }
  window.saveSelectedState();
  render();
});

dom.clearSelBtn.addEventListener("click", () => {
  const count = state.selectedIds.size;
  if (count === 0) return;
  if (!confirm(`선택된 ${count}개의 트윗을 모두 해제합니까?`)) return;
  state.selectedIds.clear();
  state.selectedOrder = [];
  window.saveSelectedState();
  render();
});

// 상단 pager: 스크롤 없음 / 하단 pager: 상단 pager 위치로 스크롤
dom.prevPageBtn.addEventListener("click", () => goPrev(false));
dom.nextPageBtn.addEventListener("click", () => goNext(false));
dom.prevPageBtnBottom.addEventListener("click", () => goPrev(true));
dom.nextPageBtnBottom.addEventListener("click", () => goNext(true));

dom.pageSelect.addEventListener("change", () => goPage(dom.pageSelect.value, false));
dom.pageSelectBottom.addEventListener("change", () => goPage(dom.pageSelectBottom.value, true));

dom.exportBtn.addEventListener("click", exportSelected);

// init
enableControls(false);
if (dom.pageInfoBottom) dom.pageInfoBottom.textContent = "0-0";
loadData();
