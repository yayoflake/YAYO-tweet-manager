// src/tistoryExport.js
// app.js에서 분리된 티스토리/마크다운 HTML 변환 엔진 및 내보내기 함수

function generateTistoryHtml(tweets, tagMap, isLocalPreview = false, options = {}) {
    const format = options.format || 'html';
    const isHtml = format === 'html';
    const isText = format === 'text';
    const isAdvanced = options.isAdvanced === true; // 이미지 포함 여부

    const styleOption = typeof options === 'string' ? options : (options.styleOption || 'styleA');
    const incDate = options.incDate !== false;
    const incTime = options.incTime !== false;
    const incRt = options.incRt !== false;
    const incFav = options.incFav !== false;
    const incLink = options.incLink !== false;
    const incUserId = options.incUserId !== false;
    const incIntro = options.incIntro !== false;
    const _tagMap = tagMap instanceof Map ? tagMap : new Map();
    const selectedIdSet = new Set(tweets.map(t => String(t.id || t.id_str || "")));

    function escHtml(s) {
        if (isText) return String(s || "");
        return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function linkify(s) {
        if (isText) return s;
        // 텍스트 내의 URL(http/https)을 찾아 링크 태그로 변환
        return s.replace(/https?:\/\/[^\s<>"]+/g, (url) => {
            return `<a href="${url}" target="_blank" style="text-decoration:underline; color: #37a2d7;">${url}</a>`;
        });
    }

    // 아이콘 설정
    let rtIcon, favIcon, linkIcon;
    if (isText) {
        rtIcon = 'RT: ';
        favIcon = 'Fav: ';
        linkIcon = 'Link: ';
    } else if (styleOption === 'styleC') {
        rtIcon = '🔁 ';
        favIcon = '❤ ';
        linkIcon = '🔗';
    } else {
        const isGray = styleOption === 'styleB';
        const rtColor = isGray ? '#999' : '#06b47b';
        const favColor = isGray ? '#999' : '#f91880';
        const linkColor = '#999';

        const rtSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${rtColor}"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"></path></svg>`;
        const iconStyle = 'display:inline-block !important; vertical-align:middle; border:none;';
        rtIcon = `<img src="data:image/svg+xml;base64,${btoa(rtSvg)}" width="16" height="16" style="${iconStyle} margin-right:4px;" />`;
        // 마음에 들어용(하트) 아이콘
        const favPath = "M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z";
        if (isGray) {
            // 스타일B: 스타일A와 동일한 형태의 테두리 버전
            const favSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${favColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${favPath}"></path></svg>`;
            favIcon = `<img src="data:image/svg+xml;base64,${btoa(favSvg)}" width="16" height="16" style="${iconStyle} margin-right:4px;" />`;
        } else {
            // 스타일A: 꽉 찬 하트
            const favSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${favColor}"><path d="${favPath}"></path></svg>`;
            favIcon = `<img src="data:image/svg+xml;base64,${btoa(favSvg)}" width="16" height="16" style="${iconStyle} margin-right:4px;" />`;
        }
        const linkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${linkColor}"><path d="M18.36 5.64c-1.95-1.96-5.11-1.96-7.07 0L9.88 7.05 8.46 5.64l1.42-1.42c2.73-2.73 7.16-2.73 9.9 0 2.73 2.74 2.73 7.17 0 9.9l-1.42 1.42-1.41-1.42 1.41-1.41c1.96-1.96 1.96-5.12 0-7.07zm-2.12 3.53l-7.07 7.07-1.41-1.41 7.07-7.07 1.41 1.41zm-12.02.71l1.42-1.42 1.41 1.42-1.41 1.41c-1.96 1.96-1.96 5.12 0 7.07 1.95 1.96 5.11 1.96 7.07 0l1.41-1.41 1.42 1.41-1.42 1.42c-2.73 2.73-7.16 2.73-9.9 0-2.73-2.74-2.73-7.17 0-9.9z"></path></svg>`;
        linkIcon = `<img src="data:image/svg+xml;base64,${btoa(linkSvg)}" width="16" height="16" style="display:inline-block !important; vertical-align:middle; border:none;" />`;
    }

    const HR5 = '<hr contenteditable="false" data-ke-style="style5" data-ke-type="horizontalRule" />'; //트윗 사이 구분선
    const HR6 = '<hr contenteditable="false" data-ke-style="style6" data-ke-type="horizontalRule" />'; //타래 사이 구분선
    const BLANK = '<p data-ke-size="size16">&nbsp;</p>';
    const TEXT_SEP = '--------------------------------------------------';

    const lines = [];

    // 티스토리 업로드용 최종 HTML에만 폰트 임포트 포함
    if (isHtml && !isLocalPreview) {
        lines.push('<style>@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap");</style>');
    }

    // 전체 감싸는 div 제거 (사용자 요청: 이미지 정렬 오류 원인 제거)
    const FONT_STYLE = 'font-family: \'Noto Sans KR\', sans-serif;';

    // 헤더 블록 (게시글 인트로)
    if (incIntro) {
        if (isHtml) {
            lines.push(`<blockquote data-ke-style="style3" style="${FONT_STYLE}"><span>트윗 모음입니다. 여기에 소개를 입력해 주세요.&nbsp;</span></blockquote>`);
            for (let i = 0; i < 5; i++) lines.push(BLANK);
        } else if (isText) {
            lines.push('트윗 모음입니다. 여기에 소개를 입력해 주세요.');
            lines.push(TEXT_SEP);
            lines.push('');
        } else {
            lines.push('> 트윗 모음입니다. 여기에 소개를 입력해 주세요.');
            lines.push('');
        }
    }

    for (let i = 0; i < tweets.length; i++) {
        const t = tweets[i];
        const tId = String(t.id || t.id_str || "");
        const prevId = i > 0 ? String(tweets[i - 1].id || tweets[i - 1].id_str || "") : "";

        // 타래 자식 판단: 이전 트윗이 이 트윗의 부모이고 선택 목록 안에 있는 경우
        const replyTo = String(t.in_reply_to_status_id_str || "");
        const isChild = !!replyTo && replyTo === prevId && selectedIdSet.has(prevId);

        if (isHtml) {
            lines.push(isChild ? HR6 : HR5);
        } else if (isText) {
            if (i > 0) lines.push(isChild ? '· · ·' : TEXT_SEP);
        } else {
            // 마크다운: 첫 항목이거나 인트로가 없는 경우 상단 여백 제거
            if (lines.length === 0) {
                lines.push('---');
            } else {
                lines.push(isChild ? '\n---' : '\n\n---');
            }
        }

        // (트위터핸들)(날짜)(시간) 블록
        let infoLine = "";
        if (isHtml) {
            infoLine = `<p data-ke-size="size16" style="${FONT_STYLE}">`;
            if (incUserId) {
                infoLine += `<span style="color: #333333;"><b>@${escHtml(MY_HANDLE)}</b></span> `;
            }
            if (incDate) {
                infoLine += `<span style="color: #9d9d9d;">${escHtml(formatDateOnly(t.created_at))}&nbsp;</span>`;
            }
            if (incTime) {
                infoLine += `<span style="color: #9d9d9d;">${escHtml(formatTimeOnly(t.created_at))}&nbsp;</span>`;
            }
            infoLine += '</p>';
        } else if (isText) {
            if (incUserId) infoLine += `@${MY_HANDLE} `;
            if (incDate) infoLine += `${formatDateOnly(t.created_at)} `;
            if (incTime) infoLine += `${formatTimeOnly(t.created_at)} `;
            infoLine = infoLine.trim();
        } else {
            if (incUserId) infoLine += `**@${MY_HANDLE}** `;
            if (incDate) infoLine += `${formatDateOnly(t.created_at)} `;
            if (incTime) infoLine += `${formatTimeOnly(t.created_at)} `;
            infoLine = infoLine.trim();
        }

        if (incUserId || incDate || incTime) {
            lines.push(infoLine);
            if (!isHtml) lines.push('');
        }

        // 본문 — 줄별 <p> 분리, 빈 줄은 &nbsp; 단락
        const d = getDerived(t, MY_HANDLE);
        const textLines = (d.cleanedText || "").trim().split("\n");

        // 특수 링크 접미사 (인용, 익명 질문)
        const analysis = typeof analyzeUrls === 'function' ? analyzeUrls(t, MY_HANDLE) : {};
        let suffix = "";
        const linkStyle = isHtml ? "text-decoration:underline; color: #37a2d7;" : "";

        if (analysis.quoteMineId) {
            const url = `https://twitter.com/i/status/${analysis.quoteMineId}`;
            if (isHtml) suffix += ` <a href="${url}" target="_blank" style="${linkStyle}">(내 트윗 인용)</a>`;
            else if (isText) suffix += ` (내 트윗 인용: ${url})`;
            else suffix += ` [(내 트윗 인용)](${url})`;
        }
        if (analysis.quoteOthersExpandedUrl) {
            if (isHtml) suffix += ` <a href="${analysis.quoteOthersExpandedUrl}" target="_blank" style="${linkStyle}">(남의 트윗 인용)</a>`;
            else if (isText) suffix += ` (남의 트윗 인용: ${analysis.quoteOthersExpandedUrl})`;
            else suffix += ` [(남의 트윗 인용)](${analysis.quoteOthersExpandedUrl})`;
        }
        if (analysis.anonymousExpandedUrl) {
            if (isHtml) suffix += ` <a href="${analysis.anonymousExpandedUrl}" target="_blank" style="${linkStyle}">(익명 질문)</a>`;
            else if (isText) suffix += ` (익명 질문: ${analysis.anonymousExpandedUrl})`;
            else suffix += ` [(익명 질문)](${analysis.anonymousExpandedUrl})`;
        }

        if (textLines.length > 0 && textLines[0] !== "") {
            for (let j = 0; j < textLines.length; j++) {
                const line = textLines[j];
                if (line.trim()) {
                    let content = isHtml ? linkify(escHtml(line.trimEnd())) : line.trimEnd();
                    // 마지막 줄에 접미사 추가
                    if (j === textLines.length - 1 && suffix) {
                        content += " " + suffix;
                    }
                    if (isHtml) lines.push(`<p data-ke-size="size16" style="${FONT_STYLE}"><span>${content}</span></p>`);
                    else lines.push(isText ? content : content + "  ");
                } else {
                    // 중간의 빈 줄 처리
                    if (j === textLines.length - 1 && suffix) {
                        if (isHtml) lines.push(`<p data-ke-size="size16" style="${FONT_STYLE}"><span>${suffix}</span></p>`);
                        else lines.push(isText ? suffix : suffix + "  ");
                    } else {
                        if (isHtml) lines.push(BLANK);
                        else lines.push("");
                    }
                }
            }
        } else if (suffix) {
            // 본문이 아예 없는 경우 접미사만 출력
            if (isHtml) lines.push(`<p data-ke-size="size16" style="${FONT_STYLE}"><span>${suffix}</span></p>`);
            else lines.push(isText ? suffix : suffix + "  ");
        }

        if (isHtml) lines.push(BLANK);
        else lines.push('');

        // 미디어 플레이스홀더 (고급 내보내기 시 치환자 태그로 대체)
        const mediaItems = getMediaItemsFromTweet(t);
        for (const m of mediaItems) {
            const fname = `${tId}-${m.name}`;
            if (_tagMap.has(fname)) {
                lines.push(_tagMap.get(fname));
                if (isHtml) lines.push(BLANK);
                else lines.push('');
            } else if (isAdvanced && m.kind === 'image') {
                const resize = options.imgResize !== false;
                const maxWidth = options.imgMaxWidth || (typeof TISTORY_IMAGE_MAX_WIDTH !== "undefined" ? TISTORY_IMAGE_MAX_WIDTH : 500);
                if (isHtml) {
                    const alignStyle = (typeof TISTORY_IMAGE_ALIGN !== "undefined" && TISTORY_IMAGE_ALIGN === "alignLeft") ? "text-align: left;" : "text-align: center;";
                    const imgStyle = resize ? `max-width: ${maxWidth}px; height: auto; border-radius: 8px; border: 1px solid #eee;` : `max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #eee;`;
                    lines.push(`<p data-ke-size="size16" style="${alignStyle}"><img src="${m.url}" alt="${escHtml(m.name)}" style="${imgStyle}" /></p>`);
                    lines.push(BLANK);
                } else if (isText) {
                    lines.push(`[이미지: ${m.name}]`);
                } else {
                    // 마크다운에서는 이미지 앞뒤로 빈 줄을 추가하여 문단 구분을 명확히 함
                    lines.push('');
                    if (resize) {
                        // 마크다운에서도 크기 조절을 위해 <img> 태그 사용 (티스토리 마크다운 모드 호환)
                        lines.push(`<img src="${m.url}" alt="${escHtml(m.name)}" width="${maxWidth}" style="max-width: 100%; height: auto;" />`);
                    } else {
                        lines.push(`![${m.name}](${m.url})`);
                    }
                    lines.push('\n');
                }
            } else { // isAdvanced가 false이거나 이미지가 아닌 경우 플레이스홀더
                if (isHtml) lines.push(`<p>[${escHtml(fname)}]</p>`);
                else lines.push(`[${fname}]`);
                if (isHtml) lines.push(BLANK);
                else lines.push('');
            }
        }

        // 반응 수치 및 링크
        const rtCount = normalizeCount(t.retweet_count);
        const favCount = normalizeCount(t.favorite_count);
        const tweetUrl = `https://twitter.com/i/status/${tId}`;

        if (isHtml) {
            if (styleOption === 'styleC') {
                // 스타일C는 텍스트와 이모지로만 구성되므로 테이블 없이 깔끔하게 출력
                let metricsHtml = `<p data-ke-size="size16" style="${FONT_STYLE} margin: 4px 0;">`;
                let parts = [];
                if (incRt) parts.push(`<span>${rtIcon}${rtCount}</span>`);
                if (incFav) parts.push(`<span>${favIcon}${favCount}</span>`);
                if (incLink) parts.push(`<a href="${tweetUrl}" target="_blank" style="text-decoration:none;">${linkIcon}</a>`);

                metricsHtml += parts.join('<span style="display:inline-block; width:12px;"></span>');
                metricsHtml += '</p>';
                if (parts.length > 0) lines.push(metricsHtml);
            } else {
                // 스타일A, B는 테이블로 정밀한 정렬 유지
                let metricsHtml = `<table style="all:unset; border:none; border-collapse:separate; border-spacing:0 !important; padding:0; margin:0; width:auto !important; table-layout:auto !important; background:transparent !important; ${FONT_STYLE}">`;
                metricsHtml += '<tr style="border:none; padding:0; margin:0; background:transparent !important;">';

                const tdStyle = 'border:none; padding:0 12px 0 0 !important; margin:0; white-space:nowrap; vertical-align:middle; line-height:1; background:transparent !important;';
                const countStyle = 'display:inline-block !important; vertical-align:middle;';
                if (incRt) metricsHtml += `<td style="${tdStyle}">${rtIcon}<span style="${countStyle}">${rtCount}</span></td>`;
                if (incFav) metricsHtml += `<td style="${tdStyle}">${favIcon}<span style="${countStyle}">${favCount}</span></td>`;
                if (incLink) metricsHtml += `<td style="border:none; padding:0; margin:0; vertical-align:middle; line-height:1; background:transparent !important;"><a href="${tweetUrl}" target="_blank" style="text-decoration:none; vertical-align:middle;">${linkIcon}</a></td>`;

                metricsHtml += '</tr></table>';
                if (incRt || incFav || incLink) lines.push(metricsHtml);
            }
        } else if (isText) {
            let metricsTxt = "";
            if (incRt) metricsTxt += `RT: ${rtCount}  `;
            if (incFav) metricsTxt += `Fav: ${favCount}  `;
            if (incLink) metricsTxt += `Link: ${tweetUrl}  `;
            if (metricsTxt.trim()) lines.push(metricsTxt.trim());
        } else {
            let metricsMd = "";
            let rtLab = "RT: ", favLab = "Fav: ", linkLab = "[Link]";

            if (styleOption === 'styleA') {
                rtLab = "리트윗: ";
                favLab = "마음: ";
                linkLab = "[링크]";
            } else if (styleOption === 'styleC') {
                rtLab = "🔁 ";
                favLab = "❤ ";
                linkLab = "[🔗]";
            }

            if (incRt) metricsMd += `${rtLab}${rtCount}  `;
            if (incFav) metricsMd += `${favLab}${favCount}  `;
            if (incLink) metricsMd += `${linkLab}(${tweetUrl})  `;

            if (metricsMd.trim()) lines.push(metricsMd.trim() + "  ");
        }
    }

    // 닫는 구분선 + 빈 단락
    if (isHtml) {
        lines.push(HR5);
        lines.push(BLANK);
        // lines.push('</div>'); // font-family wrapper end 제거 (이미지 정렬 문제 해결)
    } else if (isText) {
        lines.push('');
        lines.push(TEXT_SEP);
    } else {
        lines.push('\n---');
    }

    return lines.join("\n");
}
window.generateTistoryHtml = generateTistoryHtml;

function exportTistory(tagMap) {
    const selectedIds = window.state.selectedOrder;
    if (selectedIds.length === 0) return;
    const tweets = selectedIds.map(id => window.state.tweetById.get(id)).filter(Boolean);
    if (tweets.length === 0) return;

    const html = generateTistoryHtml(tweets, tagMap);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name = `tistory-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.txt`;

    const blob = new Blob([html], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportSimpleText() {
    const selectedIds = window.state.selectedOrder;
    if (selectedIds.length === 0) return;
    const tweets = selectedIds.map(id => window.state.tweetById.get(id)).filter(Boolean);
    if (tweets.length === 0) return;

    const text = generateTistoryHtml(tweets, null, false, { format: 'text' });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name = `tweets-export-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.txt`;

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportSelected() {
    const format = (document.querySelector('input[name="exportFormat"]:checked') || {}).value || "json";
    if (format === "tistory") { exportTistory(); return; }
    if (format === "text") { exportSimpleText(); return; }
    const map = new Map();
    for (const t of window.state.allTweets) {
        const id = String(t.id || t.id_str || "");
        if (id) map.set(id, t);
    }

    const out = [];
    for (const id of window.state.selectedOrder) {
        const t = map.get(id);
        if (t) out.push(t);
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name =
        "tweets-export-" +
        now.getFullYear() +
        pad(now.getMonth() + 1) +
        pad(now.getDate()) +
        "-" +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds()) +
        ".json";

    const blob = new Blob([JSON.stringify(out, null, 2)], {
        type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
}
