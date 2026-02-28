/**
 * htmlConverter.js
 * 기존 블로그 HTML을 파싱하여 스타일A 포맷으로 재변환하는 기능을 제공합니다.
 */

window.htmlConverter = {
    /**
     * 기존 블로그 HTML을 파싱하여 가공된 데이터 배열을 반환합니다.
     * @param {string} html - 원본 HTML 텍스트
     * @returns {Array} 트윗 데이터 배열
     */
    parseOldHtml: function (html) {
        // <hr> 태그와 그 내용을 캡처하여 분리
        const parts = html.split(/(<hr[^>]*>)/i);
        const results = [];
        const tempDiv = document.createElement('div');

        // 파싱된 블록들을 가공 (블록-구분선-블록... 구조)
        let blockTexts = [];
        let separators = [];
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) {
                blockTexts.push(parts[i]);
            } else {
                separators.push(parts[i]);
            }
        }

        blockTexts.forEach((block, idx) => {
            const trimmed = block.trim();
            if (!trimmed) return;

            // 1. 반응 수치 추출
            let retweetCount = 0;
            let favoriteCount = 0;
            const rtMatch = trimmed.match(/🔁\s*(\d+)/);
            const favMatch = trimmed.match(/❤\s*(\d+)/);
            if (rtMatch) retweetCount = parseInt(rtMatch[1], 10);
            if (favMatch) favoriteCount = parseInt(favMatch[1], 10);

            // 2. 본문 내용 추출 (줄바꿈 보존)
            // 브라우저의 innerText는 개행을 포함하지만 구조에 따라 다를 수 있으므로 
            // <br>을 개행으로 명시적 치환 후 처리
            tempDiv.innerHTML = trimmed.replace(/<br\s*\/?>/gi, '\n');

            const paragraphs = Array.from(tempDiv.querySelectorAll('p, div'));
            let lines = [];

            if (paragraphs.length > 0) {
                paragraphs.forEach(p => {
                    const text = p.innerText.trim();
                    if (text && !text.match(/🔁|❤/)) {
                        lines.push(text);
                    }
                });
            } else {
                const contentText = tempDiv.innerText.replace(/🔁\s*\d+|❤\s*\d+/g, '').trim();
                lines = contentText.split('\n');
            }

            // 3. 타래 여부 판별 (HR 스타일 활용)
            // 사용자 피드백 반영: style6를 타래 이어짐으로, style5를 새로운 시작으로 처리
            let isChild = false;
            if (idx > 0) {
                const prevSep = separators[idx - 1] || "";
                if (prevSep.includes('style6')) {
                    isChild = true;
                }
            }

            results.push({
                fullText: lines.join('\n').trim(),
                retweet_count: retweetCount,
                favorite_count: favoriteCount,
                isChild: isChild
            });
        });

        return results;
    },

    /**
     * 파싱된 데이터를 기반으로 스타일A HTML을 생성합니다.
     * @param {Array} dataArr - 파싱된 데이터 배열
     * @returns {string} 스타일A HTML
     */
    generateStyleAHtml: function (dataArr) {
        if (typeof window.generateTistoryHtml !== 'function') {
            return "오류: 변환 엔진(tistoryExport.js)을 찾을 수 없습니다.";
        }

        // 가짜 트윗 객체 생성
        const fakeTweets = dataArr.map((item, idx) => {
            const tId = `conv-${idx}`;
            return {
                id: tId,
                id_str: tId,
                full_text: item.fullText,
                retweet_count: item.retweet_count,
                favorite_count: item.favorite_count,
                created_at: new Date().toISOString(),
                // 타래 이어짐 구현: isChild가 true이면 이전 트윗의 ID를 부모로 설정
                in_reply_to_status_id_str: (item.isChild && idx > 0) ? `conv-${idx - 1}` : null,
                entities: { urls: [], media: [] },
                extended_entities: { media: [] }
            };
        });

        // 스타일A 옵션 강제 적용
        const options = {
            format: 'html',
            styleOption: 'styleA',
            incDate: false,
            incTime: false,
            incRt: true,
            incFav: true,
            incLink: false,
            incUserId: false,
            incIntro: false,
            isAdvanced: false // 이미지 치환자는 텍스트에 포함되어 있으므로 false
        };

        // 기존 엔진 호출
        return window.generateTistoryHtml(fakeTweets, new Map(), false, options);
    },

    /**
     * 메인 실행 함수
     */
    convert: function (html) {
        const data = this.parseOldHtml(html);
        return this.generateStyleAHtml(data);
    }
};
