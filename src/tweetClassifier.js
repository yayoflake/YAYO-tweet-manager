// src/tweetClassifier.js

function isMediaTweet(tweet) {
  const e1 = tweet && tweet.extended_entities && Array.isArray(tweet.extended_entities.media)
    ? tweet.extended_entities.media
    : null;
  if (e1 && e1.length > 0) return true;

  const e2 = tweet && tweet.entities && Array.isArray(tweet.entities.media)
    ? tweet.entities.media
    : null;
  if (e2 && e2.length > 0) return true;

  return false;
}

function getEntitiesUrls(tweet) {
  return tweet && tweet.entities && Array.isArray(tweet.entities.urls) ? tweet.entities.urls : [];
}

function getMediaEntities(tweet) {
  const e1 = tweet && tweet.extended_entities && Array.isArray(tweet.extended_entities.media)
    ? tweet.extended_entities.media
    : null;
  if (e1 && e1.length) return e1;

  const e2 = tweet && tweet.entities && Array.isArray(tweet.entities.media)
    ? tweet.entities.media
    : null;
  if (e2 && e2.length) return e2;

  return [];
}

function extractMediaShortUrls(tweet) {
  const media = getMediaEntities(tweet);
  const out = new Set();
  for (const m of media) {
    if (m && m.url) out.add(String(m.url));
  }
  return out;
}

function removeUrlsFromTextKeepNewlines(text, urlsToRemove) {
  if (!text) return "";
  let s = String(text);

  for (const u of urlsToRemove) {
    if (!u) continue;
    s = s.split(u).join("");
  }

  s = s.replace(/[^\S\r\n]{2,}/g, " ");
  s = s.replace(/[^\S\r\n]*\n[^\S\r\n]*/g, "\n");
  s = s.trim();

  return s;
}

function isAnonymousQnaExpandedUrl(expandedUrl) {
  const u = String(expandedUrl || "").toLowerCase();
  return (
    u.startsWith("https://spinspin.net/") ||
    u.startsWith("https://peing.net/") ||
    u.startsWith("https://spin-spin.com/")
  );
}

function analyzeUrls(tweet, myHandle) {
  const urls = getEntitiesUrls(tweet);

  const tweetUrlRe = /^https?:\/\/(?:x\.com|twitter\.com)\/([^\/]+)\/status\/(\d+)(?:\b|\/|$)/i;

  const my = String(myHandle || "").toLowerCase();

  let quoteMineId = null;
  let quoteMineShortUrl = null;
  let quoteOthersExpandedUrl = null;
  let quoteOthersShortUrl = null;

  // 익명 질문은 첫 번째만 대표로 처리(원하면 복수 링크도 확장 가능)
  let anonymousExpandedUrl = null;
  let anonymousShortUrl = null;

  let hasYouTube = false; // 유튜브 링크

  for (const u of urls) {
    const expanded = (u && (u.expanded_url || u.url)) ? String(u.expanded_url || u.url) : "";
    const shortUrl = (u && u.url) ? String(u.url) : "";

    if (!expanded) continue;

    // 1) 익명 질문 우선 분류
    if (isAnonymousQnaExpandedUrl(expanded)) {
      if (!anonymousExpandedUrl) {
        anonymousExpandedUrl = expanded;
        anonymousShortUrl = shortUrl || null;
      }
      // 익명 질문은 링크 첨부로 치지 않음
      continue;
    }

    // 2) 트윗 인용 여부
    const m = expanded.match(tweetUrlRe);
    if (m) {
      const handle = String(m[1] || "");
      const id = String(m[2] || "");

      if (handle.toLowerCase() === my) {
        if (!quoteMineId) {
          quoteMineId = id;
          quoteMineShortUrl = shortUrl || null;
        }
      } else {
        // 남의 트윗 인용은 대표 1개만 잡는다
        if (!quoteOthersExpandedUrl) {
          quoteOthersExpandedUrl = expanded;
          quoteOthersShortUrl = shortUrl || null;
        }
      }
      continue;
    }

    // 3) 유튜브 링크
    if (isYouTubeUrl(expanded)) {
      hasYouTube = true;
      continue;
    }

  }

  return {
    quoteMineId,
    quoteMineShortUrl,
    quoteOthersExpandedUrl,
    quoteOthersShortUrl,
    anonymousExpandedUrl,
    anonymousShortUrl,
    hasYouTube,
  };
}

function getMediaItemsFromTweet(tweet) {
  const id = String(tweet.id || tweet.id_str || "");
  const media = getMediaEntities(tweet);

  const seen = new Set();
  const unique = media.filter(m => {
    const k = m.media_url_https || m.media_url || "";
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return unique.slice(0, 4).map(m => {
    if (m.type === "photo") {
      const basename = (m.media_url_https || m.media_url || "").split("/").pop();
      if (!basename) return null;
      return { kind: "image", url: `../data/tweets_media/${id}-${basename}`, name: basename };
    } else {
      const variants = m.video_info?.variants || [];
      const mp4s = variants.filter(v => v.content_type === "video/mp4");
      mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      if (!mp4s.length) return null;
      const basename = mp4s[0].url.split("?")[0].split("/").pop();
      if (!basename) return null;
      return { kind: "video", url: `../data/tweets_media/${id}-${basename}`, name: basename };
    }
  }).filter(Boolean);
}

function getDerived(tweet, myHandle) {
  if (tweet._derived) return tweet._derived;

  const media = isMediaTweet(tweet);

  const {
    quoteMineId,
    quoteMineShortUrl,
    quoteOthersExpandedUrl,
    quoteOthersShortUrl,
    anonymousExpandedUrl,
    anonymousShortUrl,
    hasYouTube,
  } = analyzeUrls(tweet, myHandle);

  // 태그는 독립적으로 누적
  // 태그는 이제 괄호 없이 표시, 대신 클릭 액션을 붙인다
  const tags = [];

  if (quoteMineId) {
    tags.push({
      label: "내 트윗 인용",
      action: { type: "open", value: `https://twitter.com/i/status/${quoteMineId}` },
    });
  }

  if (quoteOthersExpandedUrl) {
    tags.push({
      label: "남의 트윗 인용",
      action: { type: "open", value: quoteOthersExpandedUrl },
    });
  }

  if (hasYouTube) {
    tags.push({
      label: "유튜브",
      action: null,
    });
  }

  if (anonymousExpandedUrl) {
    tags.push({
      label: "익명 질문",
      action: { type: "open", value: anonymousExpandedUrl },
    });
  }

  if (media) {
    const mItems = getMediaItemsFromTweet(tweet);
    tags.push({
      label: "미디어",
      action: {
        type: "openLocal",
        value: mItems.map(m => ({ fname: `${String(tweet.id || tweet.id_str || "")}-${m.name}` }))
      }
    });
  }

  // 본문에서 제거할 URL들
  // 1) 미디어 t.co
  // 2) 내 트윗 인용 t.co
  // 3) 남의 트윗 인용 t.co
  // 4) 익명 질문 t.co
  const urlsToRemove = new Set();
  for (const u of extractMediaShortUrls(tweet)) urlsToRemove.add(u);
  if (quoteMineShortUrl) urlsToRemove.add(quoteMineShortUrl);
  if (quoteOthersShortUrl) urlsToRemove.add(quoteOthersShortUrl);
  if (anonymousShortUrl) urlsToRemove.add(anonymousShortUrl);

  let cleanedText = removeUrlsFromTextKeepNewlines(tweet.full_text || "", urlsToRemove);

  // 남은 t.co URL을 원본 expanded_url로 치환 (링크 첨부 등)
  for (const u of getEntitiesUrls(tweet)) {
    const shortUrl = u && u.url ? String(u.url) : "";
    const expandedUrl = u && u.expanded_url ? String(u.expanded_url) : "";
    if (shortUrl && expandedUrl && shortUrl !== expandedUrl && !urlsToRemove.has(shortUrl)) {
      cleanedText = cleanedText.split(shortUrl).join(expandedUrl);
    }
  }

  // 내보내기용 본문: 내 트윗 인용이면 뒤에 인용 ID 부착
  const exportText = quoteMineId ? `${cleanedText} (인용 ID:${quoteMineId})` : cleanedText;

  const derivedObj = {
    cleanedText,
    exportText,
    tags,
    quoteMineId,
    isMedia: media,
  };
  tweet._derived = derivedObj;
  return derivedObj;
}