// src/fsLoader.js

// 스크립트 로드는 최초 1회만 실행 (Promise 재사용)
let initPromise = null;

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error("로드 실패: " + el.src));
    document.head.appendChild(el);
  });
}

function extractTweetObjects(arr) {
  const out = [];
  for (const item of arr) {
    if (item?.tweet && typeof item.tweet === "object") out.push(item.tweet);
  }
  return out;
}

function dedupeById(tweets) {
  const seen = new Set();
  return tweets.filter(t => {
    const id = String(t.id || t.id_str || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function sortNewestFirst(tweets) {
  return tweets.sort((a, b) => (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0));
}

async function doInitScripts(onProgress) {
  window.YTD = window.YTD || {};
  window.YTD.tweets = {};
  window.YTD.account = {};

  // 1) manifest.js 우선 로드하여 전체 정보 파악
  try {
    await injectScript("../data/manifest.js");
  } catch (e) {
    console.warn("manifest.js 로드 실패");
  }

  const manifestData = window.__THAR_CONFIG;
  const tweetFileInfo = manifestData?.dataTypes?.tweets?.files || [];

  // 전체 트윗 수 계산
  let totalTweets = 0;
  tweetFileInfo.forEach(f => {
    totalTweets += parseInt(f.count || 0, 10);
  });

  if (tweetFileInfo.length > 0) {
    // manifest 정보가 있는 경우: 트윗 개수 기반 진행률 표시
    let loadedTweets = 0;
    for (let i = 0; i < tweetFileInfo.length; i++) {
      const file = tweetFileInfo[i];
      const count = parseInt(file.count || 0, 10);

      // 로딩 시작 단계 알림
      if (typeof onProgress === "function") onProgress(loadedTweets, totalTweets);

      try {
        await injectScript(`../${file.fileName}`);
        loadedTweets += count;
      } catch (e) {
        console.error(`${file.fileName} 로드 실패:`, e);
      }

      // 로드 완료 후 알림
      if (typeof onProgress === "function") onProgress(loadedTweets, totalTweets);
    }
  } else {
    // manifest가 없는 경우: 기존 순차 로딩 (트윗 수는 알 수 없으므로 파일 단위 유지)
    try {
      if (typeof onProgress === "function") onProgress(0, "?");
      await injectScript("../data/tweets.js");
    } catch (e) {
      throw new Error("tweets.js를 찾을 수 없습니다.");
    }
    for (let part = 1; ; part++) {
      try {
        await injectScript(`../data/tweets-part${part}.js`);
      } catch { break; }
    }
    if (typeof onProgress === "function") onProgress("완료", "완료");
  }

  try { await injectScript("../data/account.js"); } catch { }
}

function initScripts(onProgress) {
  if (!initPromise) initPromise = doInitScripts(onProgress);
  return initPromise;
}

async function loadUsernameAuto(onProgress) {
  await initScripts(onProgress);
  const arr = window.YTD?.account?.part0;
  const username = arr?.[0]?.account?.username;
  return username ? String(username) : null;
}

async function loadTweetsAuto(onProgress) {
  await initScripts(onProgress);
  const ytd = window.YTD?.tweets || {};
  const combined = [];
  for (const key of Object.keys(ytd).sort()) {
    const arr = ytd[key];
    if (Array.isArray(arr)) combined.push(...extractTweetObjects(arr));
  }
  const loadedFiles = Object.keys(ytd).length;
  return { tweets: sortNewestFirst(dedupeById(combined)), loadedFiles };
}
