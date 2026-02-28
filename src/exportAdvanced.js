// src/exportAdvanced.js
(function () {

  // ── 이미지 수집 ──────────────────────────────────────────────────────────────

  /**
   * 트윗 목록 기반 수집 (공용)
   */
  function collectPhotoItems(tweets) {
    const items = [];
    const seen = new Set();
    if (!tweets) return items;
    for (const t of tweets) {
      if (!t) continue;
      const tId = String(t.id || t.id_str || "");
      for (const m of getMediaItemsFromTweet(t)) {
        if (m.kind !== "image") continue;
        const fname = `${tId}-${m.name}`;
        if (seen.has(fname)) continue;
        seen.add(fname);
        items.push({ fname, localUrl: m.url });
      }
    }
    return items;
  }

  // ── 치환자 변환 (1-1: alignCenter→alignLeft, 1-3: width 제한) ─────────────────

  function transformTistoryTag(tag) {
    const resizeChk = document.getElementById('emImgResize');
    const doResize = resizeChk ? resizeChk.checked : true;
    const maxWidthInput = document.getElementById('emImgMaxWidth');
    const customMaxWidth = (doResize && maxWidthInput) ? parseInt(maxWidthInput.value, 10) : null;

    // 마지막 파이프 필드가 JSON 오브젝트 → 파싱 후 수정
    return tag.replace(/(\{[^{}]*\})(_##\])$/, (match, json, closing) => {
      try {
        const obj = JSON.parse(json);
        // 공용 유틸리티를 사용하여 스타일(정렬, 너비 제한)을 적용합니다.
        if (typeof applyTistoryImageStyle === "function") {
          // doResize가 false이면 customMaxWidth가 null이 되어 utils.js에서 제한을 하지 않습니다.
          applyTistoryImageStyle(obj, customMaxWidth);
        }
        return JSON.stringify(obj) + closing;
      } catch {
        return match; // 파싱 실패 시 원본 유지
      }
    });
  }

  // ── 치환자 파싱 ──────────────────────────────────────────────────────────────

  function parseTistoryImageTags(str) {
    if (!str) return new Map();
    const tagRe = /\[##_Image\|[\s\S]+?_##\]/g;
    // 실제 티스토리 치환자 포맷: 마지막 필드가 JSON {"filename":"파일명.jpg",...}
    const filenameRe = /"filename"\s*:\s*"([^"]+)"/;
    const map = new Map();
    let m;
    while ((m = tagRe.exec(str)) !== null) {
      const fm = m[0].match(filenameRe);
      if (fm) map.set(fm[1], transformTistoryTag(m[0]));
    }
    return map;
  }

  // ── 매칭 현황 업데이트 ────────────────────────────────────────────────────────

  function updateMatchStatus(statusEl, photoItems, tagMap) {
    if (!statusEl) return;
    photoItems = photoItems || [];
    tagMap = tagMap || new Map();

    const total = photoItems.length;
    if (total === 0) { statusEl.textContent = ""; return; }
    let matched = 0;
    for (const item of photoItems) {
      if (tagMap.has(item.fname)) matched++;
    }
    statusEl.className = "em-adv-match-status";
    if (matched === total) {
      statusEl.classList.add("em-adv-match-ok");
      statusEl.textContent = `${total}개 중 ${matched}개 매칭됨 ✓`;
    } else if (matched > 0) {
      statusEl.classList.add("em-adv-match-partial");
      statusEl.textContent = `${total}개 중 ${matched}개 매칭됨 (나머지는 플레이스홀더로 유지)`;
    } else {
      statusEl.classList.add("em-adv-match-none");
      statusEl.textContent = `매칭된 이미지 없음`;
    }
    statusEl.style.display = 'block';
  }

  // ── 실행 환경 감지 ────────────────────────────────────────────────────────────

  /** localhost 서버 모드(start.bat으로 실행)인지 확인 */
  function isLocalServer() {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  }

  // ── PowerShell 스크립트 생성 (file:// 전용) ────────────────────────────────────

  function getMediaAbsPath() {
    if (isLocalServer()) return '__SERVER__'; // 서버 모드에서는 서버가 경로를 알고 있음
    if (!window.location.href.startsWith("file:///")) return null;
    // index.html에서 ../data/tweets_media/ 와 동일한 상대 경로로 절대경로 계산
    const mediaUrl = new URL("../data/tweets_media/", window.location.href);
    let path = decodeURIComponent(mediaUrl.pathname);
    // Windows 드라이브 경로: /E:/... → E:/...
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
    return path.replace(/\//g, "\\").replace(/\\$/, "");
  }

  function generateCopyScript(srcPath, fnames) {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileLines = fnames.map(f => `  '${f.replace(/'/g, "''")}'`).join(",\n");
    return [
      "# 티스토리 업로드용 이미지 복사 스크립트",
      "# 우클릭 → [PowerShell로 실행]",
      `$src = '${srcPath.replace(/'/g, "''")}'`,
      `$dst = Join-Path $env:TEMP 'tistory_${ts}'`,
      "New-Item -ItemType Directory -Path $dst -Force | Out-Null",
      "$files = @(",
      fileLines,
      ")",
      "$ok = 0",
      "foreach ($f in $files) {",
      "  $from = Join-Path $src $f",
      "  if (Test-Path $from) { Copy-Item $from $dst; $ok++ }",
      '  else { Write-Host "파일 없음: $f" }',
      "}",
      'Write-Host "$ok/$($files.Count)개 복사 완료 → $dst"',
      "Start-Sleep 2",
      "explorer $dst",
    ].join("\n");
  }

  function downloadCopyScript(photoItems) {
    photoItems = photoItems || [];
    const srcPath = getMediaAbsPath();
    if (!srcPath) return;
    const bom = "\uFEFF"; // UTF-8 BOM — PowerShell 한국어 경로 인식
    const content = bom + generateCopyScript(srcPath, photoItems.map(i => i.fname));
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "copy_images.ps1";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * 서버 API를 통해 원본 폴더에서 이미지를 선택 상태로 탐색기를 연다.
   * localhost 서버 모드에서만 사용 가능.
   * @param {Array} photoItems - collectPhotoItems의 반환값
   * @returns {Promise<Object>} 서버 응답 { ok, selected, total, errors, folder }
   */
  async function openImagesInExplorer(photoItems) {
    photoItems = photoItems || [];
    if (!isLocalServer()) {
      console.warn('openImagesInExplorer: 서버 모드에서만 사용 가능합니다.');
      return null;
    }
    try {
      const res = await fetch('/api/open-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fnames: photoItems.map(i => i.fname) }),
      });
      return await res.json();
    } catch (e) {
      console.error('openImagesInExplorer 오류:', e);
      return null;
    }
  }

  /**
   * 서버 API를 통해 이미지를 고정 임시폴더에 복사하고 탐색기를 연다.
   * 50개 초과 이미지 업로드 시 사용. 매번 기존 파일을 덮어쓰므로 폴더 누적 없음.
   * @param {Array} photoItems - collectPhotoItems의 반환값
   * @returns {Promise<Object>} 서버 응답 { ok, copied, total, errors, folder }
   */
  async function copyImagesToTempFolder(photoItems) {
    photoItems = photoItems || [];
    if (!isLocalServer()) {
      console.warn('copyImagesToTempFolder: 서버 모드에서만 사용 가능합니다.');
      return null;
    }
    try {
      const res = await fetch('/api/copy-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fnames: photoItems.map(i => i.fname) }),
      });
      return await res.json();
    } catch (e) {
      console.error('copyImagesToTempFolder 오류:', e);
      return null;
    }
  }

  // ── 외부 노출 ────────────────────────────────────────────────────────────────

  window.exportAdvanced = {
    collectPhotoItems,
    parseTistoryImageTags,
    updateMatchStatus,
    downloadCopyScript,
    openImagesInExplorer,
    copyImagesToTempFolder,
    isLocalServer,
    getMediaAbsPath
  };

})();
