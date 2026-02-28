function normalizeCount(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function isRetweetByText(fullText) {
  if (!fullText) return false;
  return /^RT\s+@/i.test(fullText);
}

function formatKoreanDate(createdAt) {
  const t = Date.parse(createdAt || "");
  if (!t) return createdAt || "";
  const d = new Date(t);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? "오전" : "오후";
  h = h % 12 || 12;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 · ${ampm} ${h}:${m}`;
}

function formatDateOnly(createdAt) {
  const t = Date.parse(createdAt || "");
  if (!t) return "";
  const d = new Date(t);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatTimeOnly(createdAt) {
  const t = Date.parse(createdAt || "");
  if (!t) return "";
  const d = new Date(t);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? "오전" : "오후";
  h = h % 12 || 12;
  return `${ampm} ${h}:${m}`;
}

function clampInt(n, min = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.floor(x));
}

function el(id) {
  return document.getElementById(id);
}

function isThreadReply(tweet, myHandle) {
  if (!tweet || !myHandle) return false;
  const r = tweet.in_reply_to_screen_name;
  if (!r) return false;
  return r.toLowerCase() === myHandle.toLowerCase();
}

function isMentionToOther(fullText, myHandle) {
  if (!fullText || !myHandle) return false;
  const s = String(fullText).trimStart();
  if (!s.startsWith("@")) return false;
  const m = s.match(/^@(\w+)/);
  if (!m) return false;
  return m[1].toLowerCase() !== String(myHandle).toLowerCase();
}

function isYouTubeUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com") {
      return u.pathname.startsWith("/watch") || u.pathname.startsWith("/shorts/");
    }
    if (host === "youtu.be") return true;
    return false;
  } catch {
    return false;
  }
}

// ── 티스토리 이미지 스타일 유틸리티 ──────────────────────────────────────────

const TISTORY_IMAGE_ALIGN = "alignLeft";
const TISTORY_IMAGE_MAX_WIDTH = 400;

/**
 * 티스토리 이미지 치환자 내의 스타일 객체를 보정합니다.
 * @param {Object} styleObj 티스토리 치환자 JSON 부분
 * @param {number} customMaxWidth 사용자 지정 최대 너비
 */
function applyTistoryImageStyle(styleObj, customMaxWidth) {
  if (!styleObj) return;

  // alignCenter -> alignLeft (사용자 요청)
  if (styleObj.style === "alignCenter") {
    styleObj.style = TISTORY_IMAGE_ALIGN;
  }

  // 가로 너비 제한
  // customMaxWidth가 명시적으로 false이거나 null이면 제한하지 않음.
  // undefined인 경우에만 기본 설정값 사용.
  let maxWidth = null;
  if (typeof customMaxWidth === 'number') {
    maxWidth = customMaxWidth;
  } else if (customMaxWidth === undefined) {
    maxWidth = (typeof TISTORY_IMAGE_MAX_WIDTH !== "undefined" ? TISTORY_IMAGE_MAX_WIDTH : 500);
  }

  if (maxWidth !== null && typeof styleObj.originWidth === "number" && styleObj.originWidth > maxWidth) {
    styleObj.width = maxWidth;
  }
}