// src/ui.js

const MAX_LINK_LEN = 50;
function truncateText(text, max) {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

const _ytTitleCache = new Map();
async function fetchYouTubeTitle(url) {
  if (_ytTitleCache.has(url)) return _ytTitleCache.get(url);
  _ytTitleCache.set(url, null);
  try {
    const oembedUrl = "https://www.youtube.com/oembed?url=" + encodeURIComponent(url) + "&format=json";
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;
    const data = await res.json();
    const title = data && data.title ? String(data.title) : null;
    _ytTitleCache.set(url, title);
    return title;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(s) {
  const str = String(s || "");
  if (!str.includes("&")) return str;
  const ta = document.createElement("textarea");
  ta.innerHTML = str;
  return ta.value;
}

function renderTextWithLinks(container, text) {
  container.textContent = "";
  const s = decodeHtmlEntities(text || "");
  if (!s) return;

  function appendText(parent, str) {
    if (typeof state === "undefined" || !state.highlightTerms || state.highlightTerms.length === 0) {
      parent.appendChild(document.createTextNode(str));
      return;
    }

    const hlTerms = state.highlightTerms;
    const escapedTerms = hlTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const hlRe = new RegExp(`(${escapedTerms.join('|')})`, 'gi');

    let match;
    let lastIndex = 0;
    while ((match = hlRe.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parent.appendChild(document.createTextNode(str.slice(lastIndex, match.index)));
      }
      const strong = document.createElement("strong");
      strong.className = "searchMark";
      strong.textContent = match[0];
      parent.appendChild(strong);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < str.length) {
      parent.appendChild(document.createTextNode(str.slice(lastIndex)));
    }
  }

  let startIdx = 0;

  // RT prefix: render "RT" bold + green
  if (/^RT\s/i.test(s)) {
    const rt = document.createElement("span");
    rt.className = "rtPrefix";
    rt.textContent = "RT";
    container.appendChild(rt);
    startIdx = 2; // skip "RT", leave the space for normal text flow
  }

  const tokenRe = /(https?:\/\/[^\s]+|@\w+)/g;
  tokenRe.lastIndex = startIdx;

  let lastIdx = startIdx;
  let m;
  while ((m = tokenRe.exec(s)) !== null) {
    const start = m.index;
    const end = start + m[0].length;

    if (start > lastIdx) appendText(container, s.slice(lastIdx, start));

    if (m[0].charAt(0) === "@") {
      const handle = m[0].slice(1);
      const a = document.createElement("a");
      a.href = "https://twitter.com/" + handle;
      appendText(a, m[0]);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "mentionLink";
      container.appendChild(a);
    } else {
      const a = document.createElement("a");
      a.href = m[0];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      if (isYouTubeUrl(m[0])) {
        const icon = document.createElement("span");
        icon.className = "ytIcon";
        icon.title = "YouTube";
        a.appendChild(icon);
        const titleSpan = document.createElement("span");
        appendText(titleSpan, truncateText(m[0], MAX_LINK_LEN));
        if (m[0].length > MAX_LINK_LEN) a.title = m[0];
        a.appendChild(titleSpan);
        fetchYouTubeTitle(m[0]).then(title => {
          if (title) {
            titleSpan.innerHTML = "";
            appendText(titleSpan, truncateText(title, MAX_LINK_LEN));
            a.title = title;
          } else {
            titleSpan.textContent = "비공개 또는 접근할 수 없는 동영상";
            titleSpan.style.color = "#9d9d9d";
          }
        });
      } else {
        appendText(a, truncateText(m[0], MAX_LINK_LEN));
        if (m[0].length > MAX_LINK_LEN) a.title = m[0];
      }
      container.appendChild(a);
    }

    lastIdx = end;
  }

  if (lastIdx < s.length) appendText(container, s.slice(lastIdx));
}

async function tryCopyToClipboard(text) {
  const v = String(text || "");
  if (!v) return false;

  try {
    await navigator.clipboard.writeText(v);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = v;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function makeClickableId(idStr) {
  const span = document.createElement("span");
  span.className = "clickableId";
  span.textContent = idStr;
  span.title = "클릭하면 ID 복사";
  span.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const ok = await tryCopyToClipboard(idStr);
    if (ok) {
      span.textContent = "ID 복사됨";
      setTimeout(() => { span.textContent = idStr; }, 800);
    } else {
      span.textContent = "복사 실패";
      setTimeout(() => { span.textContent = idStr; }, 1200);
    }
  });
  return span;
}

function buildMediaSmall(srcTweet) {
  const mItems = getMediaItemsFromTweet(srcTweet);
  if (!mItems.length) return null;
  const g = document.createElement("div");
  g.className = "mediaGridSmall";
  for (const m of mItems) {
    if (m.kind === "video") {
      const v = document.createElement("video");
      v.controls = true;
      v.src = m.url;
      g.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = m.url;
      img.alt = m.name;
      img.onerror = () => { img.style.display = "none"; };
      g.appendChild(img);
    }
  }
  return g;
}

function tagClassFor(tag) {
  if (!tag.action) return "";

  // 미디어 태그는 기존 디자인(굵기 등)을 유지하면서 클릭만 가능하게 함
  if (tag.label === "미디어") return "tagClickableMedia";

  const base = ["tagClickable"];
  if (tag.label === "내 트윗 인용") base.push("tagQuoteMine");
  if (tag.label === "남의 트윗 인용") base.push("tagQuoteOther");
  if (tag.label === "익명 질문") base.push("tagAnon");
  return base.join(" ");
}

const _HIDDEN_TAG_LABELS = new Set(["유튜브"]);

function renderTags({ parent, derived }) {
  if (!derived.tags || !derived.tags.length) return;

  const visibleTags = derived.tags.filter(tag => !_HIDDEN_TAG_LABELS.has(tag.label));
  if (!visibleTags.length) return;

  const tagsWrap = document.createElement("span");
  tagsWrap.className = "tags";

  for (const tag of visibleTags) {
    const s = document.createElement("span");
    s.className = `tag ${tagClassFor(tag)}`.trim();
    s.textContent = tag.label;

    if (tag.action) {
      s.title = tag.action.type === "copy" ? "클릭하면 복사" : "클릭하면 이동";

      s.addEventListener("click", async (ev) => {
        ev.stopPropagation();

        if (tag.action.type === "open") {
          window.open(tag.action.value, "_blank", "noopener,noreferrer");
          return;
        }

        if (tag.action.type === "openLocal") {
          if (window.exportAdvanced && window.exportAdvanced.openImagesInExplorer) {
            window.exportAdvanced.openImagesInExplorer(tag.action.value);
          }
          return;
        }

        if (tag.action.type === "copy") {
          const ok = await tryCopyToClipboard(tag.action.value);
          if (ok) {
            s.textContent = `${tag.label} - ID 복사됨`;
            setTimeout(() => { s.textContent = tag.label; }, 800);
          } else {
            s.textContent = `${tag.label} - 복사 실패`;
            setTimeout(() => { s.textContent = tag.label; }, 1200);
          }
        }
      });
    }

    tagsWrap.appendChild(s);
  }

  parent.appendChild(tagsWrap);
}

const RT_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><g><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"></path></g></svg>`;
const FAV_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><g><path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path></g></svg>`;
const LINK_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><g><path d="M18.36 5.64c-1.95-1.96-5.11-1.96-7.07 0L9.88 7.05 8.46 5.64l1.42-1.42c2.73-2.73 7.16-2.73 9.9 0 2.73 2.74 2.73 7.17 0 9.9l-1.42 1.42-1.41-1.42 1.41-1.41c1.96-1.96 1.96-5.12 0-7.07zm-2.12 3.53l-7.07 7.07-1.41-1.41 7.07-7.07 1.41 1.41zm-12.02.71l1.42-1.42 1.41 1.42-1.41 1.41c-1.96 1.96-1.96 5.12 0 7.07 1.95 1.96 5.11 1.96 7.07 0l1.41-1.41 1.42 1.41-1.42 1.42c-2.73 2.73-7.16 2.73-9.9 0-2.73-2.74-2.73-7.17 0-9.9z"></path></g></svg>`;

// ── 공통 빌드 헬퍼 ──────────────────────────────────────────────────────────

// 날짜 줄 (답글이면 ↪ + 레이블 포함)
function buildDateLine(tweet, isReply, index = null) {
  const div = document.createElement("div");
  div.className = "tweetDate";

  if (index !== null) {
    const idxSpan = document.createElement("span");
    idxSpan.className = "tweetIndex";
    idxSpan.textContent = index;
    div.appendChild(idxSpan);
  }

  const fullDateStr = formatKoreanDate(tweet.created_at);
  const parts = fullDateStr.split(" · ");
  const datePart = parts[0];
  const timePart = parts.length > 1 ? " · " + parts[1] : "";

  const dateSpan = document.createElement("span");
  dateSpan.className = "clickableDate";
  dateSpan.textContent = (isReply ? "↪ " : "") + datePart;
  dateSpan.title = "클릭하면 트윗 링크로 이동";
  dateSpan.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const tweetId = tweet.id || tweet.id_str || "";
    if (tweetId) {
      window.open(`https://twitter.com/i/status/${tweetId}`, "_blank", "noopener,noreferrer");
    }
  });
  div.appendChild(dateSpan);

  if (timePart) {
    div.appendChild(document.createTextNode(timePart));
  }

  if (isReply) {
    const label = document.createElement("span");
    label.className = "threadReplyLabel";
    label.textContent = " (내 트윗에 남긴 답글)";
    div.appendChild(label);
  }

  const copyBtn = document.createElement("span");
  copyBtn.className = "copyTweetBtn";
  copyBtn.title = "본문 복사";
  const iconHtml = `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="10" width="12" height="12" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`;
  copyBtn.innerHTML = iconHtml;

  copyBtn.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const text = tweet.full_text || "";
    const ok = await tryCopyToClipboard(text);
    if (ok) {
      copyBtn.innerHTML = "<span style='font-size:10px; color:#888; font-weight:normal; margin-left:2px; display:inline-block; line-height:1; vertical-align:middle; position:relative; top:-1px;'>복사됨</span>";
      setTimeout(() => {
        copyBtn.innerHTML = iconHtml;
      }, 700);
    }
  });
  div.appendChild(copyBtn);

  return div;
}

// 트윗 본문·미디어·지표·ID 빌드 (좌우 패널 공용)
// mediaSize: "normal" → mediaGrid, "small" → mediaGridSmall
function buildTweetBody(tweet, derived, { mediaSize = "normal" } = {}) {
  const textEl = document.createElement("div");
  textEl.className = "tweetText";
  const bodySpan = document.createElement("span");
  renderTextWithLinks(bodySpan, derived.cleanedText || "");
  textEl.appendChild(bodySpan);
  if ((derived.cleanedText || "").trim()) textEl.appendChild(document.createTextNode(" "));
  renderTags({ parent: textEl, derived });

  let mediaEl = null;
  if (derived.isMedia) {
    if (mediaSize === "small") {
      mediaEl = buildMediaSmall(tweet);
    } else {
      const mItems = getMediaItemsFromTweet(tweet);
      if (mItems.length) {
        mediaEl = document.createElement("div");
        mediaEl.className = "mediaGrid";
        for (const m of mItems) {
          if (m.kind === "video") {
            const v = document.createElement("video");
            v.controls = true;
            v.src = m.url;
            mediaEl.appendChild(v);
          } else {
            const img = document.createElement("img");
            img.src = m.url;
            img.alt = m.name;
            img.onerror = () => { img.style.display = "none"; };
            mediaEl.appendChild(img);
          }
        }
      }
    }
  }

  let metricsEl = null;
  if (!isRetweetByText(tweet.full_text)) {
    metricsEl = document.createElement("div");
    metricsEl.className = "tweetMetrics";
    const rt = document.createElement("span");
    rt.className = "metric metric-rt";
    rt.innerHTML = RT_SVG;
    const rtSpan = document.createElement("span");
    rtSpan.className = "metric-count";
    rtSpan.textContent = normalizeCount(tweet.retweet_count);
    rt.appendChild(rtSpan);

    const fav = document.createElement("span");
    fav.className = "metric metric-fav";
    fav.innerHTML = FAV_SVG;
    const favSpan = document.createElement("span");
    favSpan.className = "metric-count";
    favSpan.textContent = normalizeCount(tweet.favorite_count);
    fav.appendChild(favSpan);

    const link = document.createElement("span");
    link.className = "metric metric-link";
    link.innerHTML = LINK_SVG;
    link.title = "원문 트윗 링크";
    link.style.cursor = "pointer";
    link.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const tweetId = tweet.id || tweet.id_str || "";
      if (tweetId) {
        window.open(`https://twitter.com/i/status/${tweetId}`, "_blank", "noopener,noreferrer");
      }
    });

    metricsEl.appendChild(rt);
    metricsEl.appendChild(fav);
    metricsEl.appendChild(link);
  }

  const idEl = document.createElement("div");
  idEl.className = "tweetId";
  const idLabel = document.createElement("span");
  idLabel.className = "tweetIdLabel";
  idLabel.textContent = "ID:";
  idEl.appendChild(idLabel);
  idEl.appendChild(document.createTextNode(" "));
  idEl.appendChild(makeClickableId(String(tweet.id || tweet.id_str || "")));

  return { textEl, mediaEl, metricsEl, idEl };
}

// ────────────────────────────────────────────────────────────────────────────

function renderTable({
  tbody,
  tweetsOnPage,
  selectedIds,
  myHandle,
  tweetById,
  threadChildIds,
  onToggleSelect,
  showQuotePreview = true,
  showReplyPreview = true,
}) {
  tbody.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const t of tweetsOnPage) {
    const id = String(t.id || t.id_str || "");
    const isReply = isThreadReply(t, myHandle);
    const isChild = isReply && !!(threadChildIds && threadChildIds.has(id));
    const tr = document.createElement("tr");
    if (isReply) tr.classList.add("threadReply");
    if (isChild) tr.classList.add("threadChild");

    tr.dataset.tweetId = id;
    if (selectedIds.has(id)) tr.classList.add("tweetSelected");

    let _mdX = 0, _mdY = 0;
    tr.addEventListener("mousedown", (ev) => { _mdX = ev.clientX; _mdY = ev.clientY; });
    tr.addEventListener("click", (ev) => {
      if (ev.target.closest && ev.target.closest("a")) return;
      if (Math.abs(ev.clientX - _mdX) > 4 || Math.abs(ev.clientY - _mdY) > 4) return;
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;
      const isSelected = tr.classList.toggle("tweetSelected");
      onToggleSelect(id, isSelected);
    });

    const tdTweet = document.createElement("td");

    const wrap = document.createElement("div");
    wrap.className = "tweetWrap";

    const derived = getDerived(t, myHandle);
    const date = buildDateLine(t, isReply);
    const { textEl: text, mediaEl: mainGrid, metricsEl: metrics, idEl: idLine } = buildTweetBody(t, derived);

    // 고아 답글: 부모 미리보기 → 날짜 → 들여쓰기 콘텐츠
    if (isReply && !isChild && showReplyPreview) {
      const parentId = String(t.in_reply_to_status_id_str || "");
      const parentTweet = (parentId && tweetById) ? tweetById.get(parentId) : null;
      const parentPreview = document.createElement("div");
      parentPreview.className = "quotePreview";

      const parentTitle = document.createElement("div");
      parentTitle.className = "quotePreviewTitle";
      parentTitle.appendChild(document.createTextNode("답글 대상 트윗 "));
      const pIdLabel = document.createElement("span");
      pIdLabel.className = "tweetIdLabel";
      pIdLabel.textContent = "ID:";
      parentTitle.appendChild(pIdLabel);
      if (parentId) {
        parentTitle.appendChild(document.createTextNode(" "));
        parentTitle.appendChild(makeClickableId(parentId));
      } else {
        parentTitle.appendChild(document.createTextNode(" (알 수 없음)"));
      }
      parentPreview.appendChild(parentTitle);

      if (parentTweet) {
        const pd = getDerived(parentTweet, myHandle);
        const body = document.createElement("div");
        body.className = "tweetText";
        const pdText = (pd.cleanedText || "").slice(0, 240) + ((pd.cleanedText || "").length > 240 ? " ..." : "");
        renderTextWithLinks(body, pdText);
        if ((pd.cleanedText || "").trim()) body.appendChild(document.createTextNode(" "));
        renderTags({ parent: body, derived: pd });
        parentPreview.appendChild(body);
        const pmg = buildMediaSmall(parentTweet);
        if (pmg) parentPreview.appendChild(pmg);
      } else {
        const body = document.createElement("div");
        body.className = "muted";
        body.textContent = "원본 트윗을 data에서 찾지 못했습니다.";
        parentPreview.appendChild(body);
      }

      wrap.appendChild(parentPreview);
      wrap.appendChild(date);

      const indentWrap = document.createElement("div");
      indentWrap.className = "orphanIndent";
      indentWrap.appendChild(text);
      if (mainGrid) indentWrap.appendChild(mainGrid);
      if (metrics) indentWrap.appendChild(metrics);
      indentWrap.appendChild(idLine);
      wrap.appendChild(indentWrap);
    } else {
      // 일반 트윗 / 타래 자식 / 답글 미리보기 꺼진 고아 답글
      wrap.appendChild(date);
      wrap.appendChild(text);
      if (mainGrid) wrap.appendChild(mainGrid);
      if (metrics) wrap.appendChild(metrics);
      wrap.appendChild(idLine);
    }

    // 인용 미리보기는 맨 아래로
    if (showQuotePreview && derived.quoteMineId && tweetById) {
      const quoted = tweetById.get(String(derived.quoteMineId));
      const preview = document.createElement("div");
      preview.className = "quotePreview";

      const title = document.createElement("div");
      title.className = "quotePreviewTitle";
      title.appendChild(document.createTextNode("인용한 내 트윗 미리보기 "));
      const qIdLabel = document.createElement("span");
      qIdLabel.className = "tweetIdLabel";
      qIdLabel.textContent = "ID:";
      title.appendChild(qIdLabel);
      title.appendChild(document.createTextNode(" "));
      title.appendChild(makeClickableId(String(derived.quoteMineId)));
      preview.appendChild(title);

      if (quoted) {
        const qd = getDerived(quoted, myHandle);
        const body = document.createElement("div");
        body.className = "tweetText";
        const qdText = (qd.cleanedText || "").slice(0, 240) + ((qd.cleanedText || "").length > 240 ? " ..." : "");
        renderTextWithLinks(body, qdText);
        if ((qd.cleanedText || "").trim()) body.appendChild(document.createTextNode(" "));
        renderTags({ parent: body, derived: qd });
        preview.appendChild(body);
        const qmg = buildMediaSmall(quoted);
        if (qmg) preview.appendChild(qmg);
      } else {
        const body = document.createElement("div");
        body.className = "muted";
        body.textContent = "원본 트윗을 data에서 찾지 못했습니다.";
        preview.appendChild(body);
      }

      wrap.appendChild(preview);
    }

    tdTweet.appendChild(wrap);

    tr.appendChild(tdTweet);
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}