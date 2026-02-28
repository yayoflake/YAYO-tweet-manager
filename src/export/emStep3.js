// src/export/emStep3.js
// exportManager.js에서 분리된 Step 2(미리보기) + Step 3(내보내기) 렌더링 로직
//
// [모듈 구조]
// init 함수에서 DOM 참조를 클로저에 캡처한 후 getChunks, getChunkTweets,
// renderStep2, renderStep3 함수를 반환. _buildExportOptions 헬퍼로
// 5곳에서 반복되던 options 객체 생성을 중앙화.
//
// window._em 프록시를 통해 공유 상태에 접근

window._emSteps = {
    /**
     * Step2/Step3 모듈 초기화. exportManager.js의 DOMContentLoaded 내부에서 호출.
     * @param {Object} ctx - 컨텍스트 객체 (DOM 참조)
     */
    init: function (ctx) {
        const _em = window._em;

        // DOM 참조 (호출 시점에 이미 존재하는 요소들)
        const emPreviewViewer = ctx.emPreviewViewer;
        const emStep3Right = ctx.emStep3Right;
        const emIncDate = ctx.emIncDate;
        const emIncRt = ctx.emIncRt;
        const emIncFav = ctx.emIncFav;
        const emIncLink = ctx.emIncLink;
        const emIncIntro = ctx.emIncIntro;
        const emIncUserId = ctx.emIncUserId;
        const emIncTime = ctx.emIncTime;
        const emIncMedia = ctx.emIncMedia;
        const emImgResize = ctx.emImgResize;
        const emImgMaxWidth = ctx.emImgMaxWidth;
        const emStep3FormatText = ctx.emStep3FormatText;
        const emStep3DataText = ctx.emStep3DataText;

        // _em.fn의 showToast/renderChunkNavigation을 init 스코프에서 한 번만 바인딩
        const _showToast = (...args) => { if (_em.fn.showToast) _em.fn.showToast(...args); };
        const _renderChunkNav = () => { if (_em.fn.renderChunkNavigation) _em.fn.renderChunkNavigation(); };

        /**
         * 내보내기 옵션 객체 빌드 헬퍼. renderStep2/renderStep3에서 공통으로 사용.
         * @param {string} format - 'html' 또는 'markdown'
         * @param {Object} overrides - 기본값을 덮어쓰는 추가 옵션 (e.g. { isAdvanced: false })
         * @returns {Object} generateTistoryHtml에 전달할 옵션 객체
         */
        function _buildExportOptions(format, overrides = {}) {
            const styleSelector = (format === 'markdown') ? 'input[name="emMdStylePreset"]:checked' : 'input[name="emStylePreset"]:checked';
            return {
                styleOption: (document.querySelector(styleSelector) || {}).value || 'styleA',
                incDate: emIncDate ? emIncDate.checked : true,
                incTime: emIncTime ? emIncTime.checked : true,
                incRt: emIncRt ? emIncRt.checked : true,
                incFav: emIncFav ? emIncFav.checked : true,
                incLink: emIncLink ? emIncLink.checked : true,
                incIntro: emIncIntro ? emIncIntro.checked : true,
                incUserId: emIncUserId ? emIncUserId.checked : true,
                isAdvanced: emIncMedia ? emIncMedia.checked : false,
                imgResize: emImgResize ? emImgResize.checked : false,
                imgMaxWidth: emImgMaxWidth ? emImgMaxWidth.value : 400,
                format: format,
                ...overrides
            };
        }

        function getChunks() {
            const managerItems = _em.managerItems;
            let chunks = [];
            let currentChunkTweets = [];
            managerItems.forEach((item) => {
                if (item.type === 'tweet') {
                    currentChunkTweets.push(item.tweetId);
                } else if (item.type === 'divider') {
                    if (currentChunkTweets.length > 0) {
                        chunks.push([...currentChunkTweets]);
                    }
                    currentChunkTweets = [];
                }
            });
            if (currentChunkTweets.length > 0 || chunks.length === 0) {
                chunks.push([...currentChunkTweets]);
            }
            return chunks;
        }

        function getChunkTweets(chunkIdx) {
            const chunks = getChunks();
            const ids = chunks[chunkIdx] || [];
            return ids.map(id => (window.state.tweetById ? window.state.tweetById.get(id) : null) || (window.globalTweets ? window.globalTweets.find(tw => tw.id === id) : null)).filter(Boolean);
        }

        /**
         * Step 2: 미리보기 렌더링. 현재 청크의 트윗을 HTML/마크다운/PDF로 변환하여
         * emPreviewViewer에 표시한다. 포맷과 옵션은 UI 컨트롤 값을 읽어 적용.
         */
        function renderStep2() {
            _renderChunkNav();

            const tweets = getChunkTweets(_em.currentChunkIndex);
            if (tweets.length === 0) {
                emPreviewViewer.innerHTML = '<div style="color: #666; text-align: center; margin-top: 50px;">선택된 트윗이 없습니다.</div>';
                return;
            }

            const emFormatEl = document.querySelector('input[name="emFormat"]:checked');
            const format = emFormatEl ? emFormatEl.value : 'html';

            let html = '';
            if (format === 'markdown') {
                if (window.generateTistoryHtml) {
                    html = window.generateTistoryHtml(tweets, null, true, _buildExportOptions('markdown'));
                    const renderedHtml = (typeof marked !== 'undefined' && marked.parse) ? marked.parse(html, { breaks: true }) : html;
                    emPreviewViewer.innerHTML = `<div class="markdown-preview-content" style="padding: 10px; line-height: 1.6;">${renderedHtml}</div>`;
                }
            } else if (format === 'text') {
                if (window.generateTistoryHtml) {
                    const text = window.generateTistoryHtml(tweets, null, true, _buildExportOptions('text'));
                    emPreviewViewer.innerHTML = `<pre style="padding: 20px; font-family: monospace; white-space: pre-wrap; word-break: break-all; margin: 0; background: #f9f9f9; font-size: 13px;">${text}</pre>`;
                }
            } else {
                // HTML 및 PDF는 동일한 HTML 엔진 사용
                if (window.generateTistoryHtml) {
                    html = window.generateTistoryHtml(tweets, null, true, _buildExportOptions(format === 'pdf' ? 'html' : format));
                }
                else {
                    html = 'HTML 변환 엔진을 불러올 수 없습니다.';
                }
                emPreviewViewer.innerHTML = `<div class="tistory-preview-content">${html}</div>`;
            }
        }

        /**
         * PDF 내보내기 실행. 새 창을 열어 HTML을 렌더링하고 브라우저 인쇄창 호출.
         */
        function exportToPdf(tweets, options) {
            const html = window.generateTistoryHtml(tweets, new Map(), false, options);
            const win = window.open('', '_blank', 'width=800,height=900');
            if (!win) {
                _showToast('❌ 팝업 차단을 해제해 주세요.');
                return;
            }

            const doc = win.document;
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>PDF 내보내기 - YAYO</title>
                    <link rel="stylesheet" href="src/style.css">
                    <style>
                        body { padding: 40px; background: #fff !important; }
                        .tistory-preview-content { max-width: 800px; margin: 0 auto; }
                        @media print {
                            body { padding: 0; }
                            .tistory-preview-content { width: 100%; border: none; }
                            @page { margin: 2cm; }
                        }
                    </style>
                </head>
                <body>
                    <div class="tistory-preview-content">${html}</div>
                    <script>
                        window.onload = function() {
                            // 이미지 로드 대기 후 인쇄
                            setTimeout(() => {
                                window.print();
                                // 인쇄 창이 닫힌 후 창 닫기 시도는 브라우저 정책에 따라 안 될 수 있음
                            }, 500);
                        };
                    </script>
                </body>
                </html>
            `);
            doc.close();
        }

        /**
         * Step 3: 내보내기 렌더링. 이미지 포함 여부 및 포맷에 따라 UI 구성.
         */
        function renderStep3() {
            _renderChunkNav();

            const emFormatEl = document.querySelector('input[name="emFormat"]:checked');
            const format = emFormatEl ? emFormatEl.value : 'html';
            const isMarkdown = (format === 'markdown');
            const isPdf = (format === 'pdf');
            const isText = (format === 'text');

            // 적용된 설정 텍스트 갱신
            if (emStep3FormatText) {
                let fmtLab = 'HTML';
                if (isMarkdown) fmtLab = '마크다운';
                if (isPdf) fmtLab = 'PDF (인쇄)';
                if (isText) fmtLab = '텍스트 (TXT)';
                emStep3FormatText.textContent = fmtLab;
            }
            const includeImages = emIncMedia ? emIncMedia.checked : false;
            if (emStep3DataText) {
                let dataParts = [];
                if (includeImages && !isText) dataParts.push('이미지');
                if (emIncUserId && emIncUserId.checked) dataParts.push('ID');
                if (emIncDate && emIncDate.checked) dataParts.push('날짜');
                if (emIncTime && emIncTime.checked) dataParts.push('시간');
                if (emIncRt && emIncRt.checked) dataParts.push('RT');
                if (emIncFav && emIncFav.checked) dataParts.push('마음');
                if (emIncLink && emIncLink.checked) dataParts.push('원본링크');
                if (emIncIntro && emIncIntro.checked) dataParts.push('인트로');
                emStep3DataText.textContent = dataParts.length > 0 ? dataParts.join(', ') : '없음';
            }

            const currentChunkIndex = _em.currentChunkIndex;
            const chunks = getChunks();
            const chunkTweets = getChunkTweets(currentChunkIndex);
            if (chunkTweets.length === 0) return;

            const chunk = chunks[currentChunkIndex];
            if (!chunk) return;

            if (isPdf) {
                // PDF 전용 UI
                emStep3Right.innerHTML = `
                    <div style="display: flex; flex-direction: column; height: 100%; box-sizing: border-box; justify-content: center; align-items: center; text-align: center; gap: 20px; padding: 20px;">
                        <div style="font-size: 48px;">📄</div>
                        <div>
                            <h3 style="margin: 0 0 8px 0;">PDF로 내보내기</h3>
                            <p style="color: #666; font-size: 14px; line-height: 1.6;">
                                브라우저의 전용 인쇄 창을 통해 PDF를 생성합니다.<br>
                                아래 버튼을 누르면 새 창이 열리며 인쇄 설정이 나타납니다.<br>
                                <b>대상을 'PDF로 저장'으로 선택해 주세요.</b>
                            </p>
                        </div>
                        <button id="emStep3PdfBtn" class="btn-primary" style="padding: 12px 40px; font-size: 16px; font-weight: bold;">PDF 생성 (인쇄 창 열기)</button>
                        <div style="font-size: 12px; color: #999;">※ 이미지가 많을 경우 로딩에 다소 시간이 걸릴 수 있습니다.</div>
                    </div>
                `;

                document.getElementById('emStep3PdfBtn').addEventListener('click', () => {
                    exportToPdf(chunkTweets, _buildExportOptions('html')); // PDF는 내부적으로 html 옵션 사용

                    // 완료 표시
                    if (!window._chunkExportFlags) window._chunkExportFlags = {};
                    window._chunkExportFlags[_em.currentChunkIndex] = true;
                    _renderChunkNav();
                });

            } else if (includeImages && !isText) {
                emStep3Right.innerHTML = `
                <div class="emStep3AdvancedContainer" style="display: flex; flex-direction: column; height: 100%; gap: 12px; box-sizing: border-box;">
                    <!-- ① 이미지 다운로드 및 업로드 -->
                    <div style="flex: 0 1 auto; display: flex; flex-direction: column; min-height: 0; max-height: 35%;">
                        <div class="em-adv-step">① 이미지 다운로드 및 업로드</div>
                        <p id="emStep3ImageHint" style="font-size: 13px; margin: 4px 0; color: #555;"></p>
                        <div id="emStep3ImageList" class="em-adv-image-list" style="flex: 1; min-height: 40px; overflow-y: auto; margin-top: 8px; border: 1px solid #ddd; border-radius: 4px; padding: 4px;"></div>
                        <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-start; flex-shrink: 0;">
                            <button id="emStep3CopyBtn" class="btn-primary" style="padding: 6px 16px; font-size: 13px; font-weight: bold; display: none;"></button>
                            <button id="emStep3ScriptBtn" class="btn-dark" style="padding: 6px 16px; font-size: 13px;"></button>
                            <span class="em-adv-folder-hint" style="margin: 0; font-size: 12px; color: #888;"></span>
                        </div>
                    </div>

                    <!-- ② 이미지 치환자 매칭 -->
                    <div style="flex: 1 1 0%; display: flex; flex-direction: column; min-height: 0;">
                        <div class="em-adv-step">② ${isMarkdown ? '이미지 치환자' : '티스토리 치환자'} 매칭</div>
                        <p style="font-size: 13px; margin: 4px 0; color: #555;">모든 이미지를 업로드한 후 에디터를 ${isMarkdown ? '마크다운(또는 HTML)' : 'HTML'} 모드로 전환하여 본문 전체를 복사/붙여넣기 하세요.</p>
                        <textarea id="emStep3PasteArea" class="em-textarea" style="flex: 1;" placeholder="여기에 복사한 텍스트를 붙여넣으세요..."></textarea>
                        <div id="emStep3MatchStatus" class="em-adv-match-status" style="margin-top: 4px; display: none;"></div>
                        <div style="margin-top: 8px; display: flex; justify-content: flex-start; gap: 8px; flex-shrink: 0;">
                            <button id="emStep3TransformBtn" class="btn-success" style="width: 100%; padding: 8px 16px; font-size: 13px; font-weight: bold;">최종 ${isMarkdown ? '마크다운' : 'HTML'} 변환</button>
                        </div>
                    </div>

                    <!-- ③ 최종 결과물 -->
                    <div style="flex: 1 1 0%; display: flex; flex-direction: column; min-height: 0; padding-bottom: 8px;">
                        <div class="em-adv-step">③ 최종 결과물</div>
                        <p style="font-size: 13px; margin: 4px 0; color: #555;">최종 ${isMarkdown ? '마크다운' : 'HTML'} 결과가 생성되면 여기에 표시됩니다.</p>
                        <textarea id="emStep3FinalResultArea" class="em-textarea" style="flex: 1;" readonly placeholder="최종 ${isMarkdown ? '마크다운' : 'HTML'} 결과가 여기에 표시됩니다..."></textarea>
                        <div style="margin-top: 8px; display: flex; justify-content: flex-start; gap: 8px; flex-shrink: 0;">
                            <button id="emStep3SaveFileBtn" class="btn-secondary" style="padding: 6px 16px; font-size: 13px;">파일로 저장 (.${isMarkdown ? 'md' : 'txt'})</button>
                            <button id="emStep3CopyResultBtn" class="btn-secondary" style="padding: 6px 24px; font-size: 13px;">클립보드에 복사</button>
                        </div>
                    </div>
                </div>
            `;

                // 이미지 목록 데이터 수집
                const photoItems = (window.exportAdvanced && typeof window.exportAdvanced.collectPhotoItems === 'function')
                    ? window.exportAdvanced.collectPhotoItems(chunkTweets)
                    : [];

                // 이미지 목록 렌더링
                const listEl = document.getElementById('emStep3ImageList');
                if (photoItems.length === 0) {
                    listEl.innerHTML = '<div style="padding: 10px; text-align: center; color: #888; font-size: 12px;">선택한 범위에 이미지가 없습니다.</div>';
                    document.getElementById('emStep3ScriptBtn').disabled = true;
                } else {
                    listEl.innerHTML = '';
                    photoItems.forEach(item => {
                        const row = document.createElement("div");
                        row.className = "em-adv-image-row";
                        row.style.cssText = "display:flex; align-items:center; gap:8px; padding:2px 0;";

                        const img = document.createElement("img");
                        img.src = item.localUrl;
                        img.style.cssText = "width:30px; height:30px; object-fit:cover; border-radius:2px;";
                        img.onerror = () => { img.style.display = "none"; };
                        row.appendChild(img);

                        const name = document.createElement("span");
                        name.textContent = item.fname;
                        name.style.fontSize = '12px';
                        row.appendChild(name);

                        listEl.appendChild(row);
                    });
                }

                // 버튼 및 안내 문구 설정 (서버 모드 vs file:// 모드)
                const scriptBtn = document.getElementById('emStep3ScriptBtn');
                // nextElementSibling은 emStep3CopyBtn을 가리키므로, 부모 컨테이너 내 span을 직접 탐색
                const hintSpan = scriptBtn.parentElement.querySelector('span.em-adv-folder-hint');
                const hintP = document.getElementById('emStep3ImageHint');
                const _isServer = window.exportAdvanced && window.exportAdvanced.isLocalServer && window.exportAdvanced.isLocalServer();

                if (_isServer) {
                    // 서버 모드: 버튼 두 개 — 탐색기 선택 열기 + 임시 폴더 복사
                    scriptBtn.textContent = '탐색기에서 자동 선택';
                    scriptBtn.className = 'btn-dark';
                    const copyBtn = document.getElementById('emStep3CopyBtn');
                    copyBtn.textContent = '임시 폴더에서 열기';
                    copyBtn.className = 'btn-primary';
                    copyBtn.style.display = '';
                    const infoIconSvg = `<svg class="em-info-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
                    hintP.innerHTML = '티스토리 에디터를 열고 아래의 모든 이미지를 업로드하세요.<br>' +
                        '동영상 내보내기는 지원되지 않습니다. <span class="em-info-btn" data-tooltip="티스토리가 2026년 2월 23일 동영상 신규 업로드 지원을 종료했습니다. 왜!? ( ; ω ; )\n번거롭더라도 유튜브 등의 외부 동영상 플랫폼에 업로드한 뒤 직접 외부 동영상을 첨부해 주시길 바랍니다.">' + infoIconSvg + '</span>';
                    hintSpan.textContent = '';

                    if (photoItems.length > 0) {
                        // 탐색기에서 열기 (원본 폴더에서 선택)
                        scriptBtn.addEventListener('click', async () => {
                            if (photoItems.length > 50) {
                                const confirmed = confirm(`티스토리는 한 번에 최대 50개의 이미지까지만 업로드할 수 있습니다.\n현재 게시글의 이미지가 50개를 초과(${photoItems.length}개)하여, 한 번에 드래그하면 일부가 누락될 수 있습니다.\n\n'임시 폴더로 복사' 기능을 이용하여 이미지를 나누어 업로드하는 것을 권장합니다.\n\n그래도 탐색기를 여시겠습니까?`);
                                if (!confirmed) return;
                            }
                            scriptBtn.disabled = true;
                            scriptBtn.textContent = '여는 중...';
                            const result = await window.exportAdvanced.openImagesInExplorer(photoItems);
                            if (result && result.ok) {
                                hintSpan.textContent = `✔ ${result.selected}개 파일이 선택된 상태로 열렸습니다.`;
                                _showToast(`✔ 탐색기에서 이미지 ${result.selected}개를 선택하여 열었습니다.`);
                            } else {
                                hintSpan.textContent = '❌ 오류가 발생했습니다.';
                            }
                            scriptBtn.disabled = false;
                            scriptBtn.textContent = '탐색기에서 자동 선택';
                        });

                        // 임시 폴더로 복사 (50개 초과 대응)
                        copyBtn.addEventListener('click', async () => {
                            copyBtn.disabled = true;
                            copyBtn.textContent = '복사 중...';
                            const result = await window.exportAdvanced.copyImagesToTempFolder(photoItems);
                            if (result && result.ok) {
                                hintSpan.textContent = `✔ ${result.copied}/${result.total}개 복사 완료`;
                                _showToast(`✔ 이미지 ${result.copied}개를 임시 폴더에 복사했습니다.`);
                            } else {
                                hintSpan.textContent = '❌ 오류가 발생했습니다.';
                            }
                            copyBtn.disabled = false;
                            copyBtn.textContent = '임시 폴더에서 열기';
                        });
                    } else {
                        scriptBtn.disabled = true;
                        copyBtn.disabled = true;
                    }
                } else {
                    // file:// 모드: 기존 스크립트 다운로드 방식
                    scriptBtn.textContent = '스크립트 다운로드 (.ps1)';
                    const infoIconSvg = `<svg class="em-info-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
                    hintP.innerHTML = '아래 버튼을 눌러 스크립트를 다운로드하고 파워쉘로 실행하세요. 티스토리에서 글쓰기를 눌러 빈 에디터를 열고, 수집된 이미지를 모두 업로드하세요.<br>' +
                        '동영상 내보내기는 지원되지 않습니다. <span class="em-info-btn" data-tooltip="티스토리가 2026년 2월 23일 동영상 신규 업로드 지원을 종료했습니다.\n유튜브 등의 외부 동영상 플랫폼에 업로드한 뒤 직접 외부 동영상을 첨부해 주시길 바랍니다.">' + infoIconSvg + '</span>';
                    hintSpan.textContent = '실행 시 탐색기가 자동으로 열립니다.';
                    const srcPath = (window.exportAdvanced && typeof window.exportAdvanced.getMediaAbsPath === 'function') ? window.exportAdvanced.getMediaAbsPath() : null;

                    if (srcPath && photoItems.length > 0) {
                        scriptBtn.addEventListener('click', () => {
                            window.exportAdvanced.downloadCopyScript(photoItems);
                        });
                    } else {
                        scriptBtn.disabled = true;
                        if (!srcPath && hintSpan) hintSpan.textContent = "로컬 파일(file://) 환경에서만 사용 가능합니다.";
                    }
                }

                // 치환자 매칭 연동
                const pasteArea = document.getElementById('emStep3PasteArea');
                const matchStatus = document.getElementById('emStep3MatchStatus');

                // 저장된 값 복원 및 상태 업데이트
                const pasteValues = _em.emStep3PasteValues;
                if (pasteValues[currentChunkIndex] !== undefined) {
                    pasteArea.value = pasteValues[currentChunkIndex];
                    if (window.exportAdvanced && typeof window.exportAdvanced.parseTistoryImageTags === 'function') {
                        const tagMap = window.exportAdvanced.parseTistoryImageTags(pasteArea.value);
                        window.exportAdvanced.updateMatchStatus(matchStatus, photoItems, tagMap);
                    }
                }

                pasteArea.addEventListener('input', () => {
                    // _em.currentChunkIndex를 직접 참조하여 stale 캡처 방지
                    _em.emStep3PasteValues[_em.currentChunkIndex] = pasteArea.value;
                    if (window.exportAdvanced && typeof window.exportAdvanced.parseTistoryImageTags === 'function') {
                        const str = pasteArea.value;
                        const tagMap = window.exportAdvanced.parseTistoryImageTags(str);
                        window.exportAdvanced.updateMatchStatus(matchStatus, photoItems, tagMap);
                    }
                });


                // ② - 최종 HTML 변환 버튼
                document.getElementById('emStep3TransformBtn').addEventListener('click', () => {
                    const str = pasteArea.value;
                    const tagMap = (photoItems.length > 0 && window.exportAdvanced) ? window.exportAdvanced.parseTistoryImageTags(str) : new Map();

                    if (window.generateTistoryHtml) {
                        const finalHtml = window.generateTistoryHtml(chunkTweets, tagMap, false, _buildExportOptions(format));
                        const finalResultArea = document.getElementById('emStep3FinalResultArea');
                        if (finalResultArea) {
                            finalResultArea.value = finalHtml;
                            const formatLabel = isMarkdown ? '마크다운' : 'HTML';
                            _showToast(`✔ ${formatLabel} 변환이 완료되었습니다.`);

                            // 변환 성공 시 완료 플래그 설정
                            if (!window._chunkExportFlags) window._chunkExportFlags = {};
                            window._chunkExportFlags[_em.currentChunkIndex] = true;
                            _renderChunkNav();
                        }
                    } else {
                        _showToast('❌ 변환 엔진을 찾을 수 없습니다.');
                    }
                });

                // ③ - 클립보드에 복사 버튼
                document.getElementById('emStep3CopyResultBtn').addEventListener('click', () => {
                    const finalResultArea = document.getElementById('emStep3FinalResultArea');
                    if (finalResultArea && finalResultArea.value) {
                        tryCopyToClipboard(finalResultArea.value);
                        _showToast('✔ 결과가 클립보드에 복사되었습니다!');
                    } else {
                        const formatLabel = isMarkdown ? '마크다운' : 'HTML';
                        _showToast(`⚠ 먼저 [최종 ${formatLabel} 변환] 버튼을 눌러 결과물을 생성해 주세요.`);
                    }
                });

                // ③ - 파일로 저장 버튼
                document.getElementById('emStep3SaveFileBtn').addEventListener('click', () => {
                    const finalResultArea = document.getElementById('emStep3FinalResultArea');
                    const content = finalResultArea ? finalResultArea.value : '';
                    if (content) {
                        const blob = new Blob([content], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                        a.href = url;
                        // 포맷에 따라 .md 또는 .txt 확장자 선택
                        const ext = isMarkdown ? 'md' : 'txt';
                        a.download = `yayo-export-${dateStr}.${ext}`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        _showToast('💾 파일 저장을 완료했습니다.');
                    } else {
                        _showToast('⚠ 저장할 내용이 없습니다.');
                    }
                });

            } else {
                emStep3Right.innerHTML = `
                <div style="display: flex; flex-direction: column; height: 100%; box-sizing: border-box; overflow: hidden; padding-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-shrink: 0;">
                        <span style="font-weight: 600; color: #333;">최종 결과물</span>
                    </div>
                    <textarea id="emStep3TextArea" class="em-textarea" style="flex: 1;" readonly placeholder="(변환된 텍스트가 표시됩니다...)"></textarea>
                    
                    <div class="exportManagerFooter" style="padding: 12px 0 0 0; border-top: 1px solid #ddd; margin-top: 12px; flex-shrink: 0; display: flex; justify-content: flex-start; align-items: center;">
                        <div style="display: flex; gap: 8px;">
                            <button id="emStep3SaveFilesBtn" class="btn-primary" style="padding: 6px 16px; font-size: 13px; background: #2b3a4a;">파일로 저장 (.${isMarkdown ? 'md' : (isText ? 'txt' : 'txt')})</button>
                            <button id="emStep3CopyTextBtn" class="btn-success" style="padding: 6px 24px; font-size: 13px; font-weight: bold;">클립보드에 복사</button>
                        </div>
                    </div>
                </div>
            `;

                // 완료 표시 동작
                const markChunkCompleted = () => {
                    if (!window._chunkExportFlags) window._chunkExportFlags = {};
                    window._chunkExportFlags[_em.currentChunkIndex] = true;
                    _renderChunkNav();
                }

                // 내용 자동 생성
                const textArea = document.getElementById('emStep3TextArea');
                if (textArea && window.generateTistoryHtml) {
                    textArea.value = window.generateTistoryHtml(chunkTweets, new Map(), false, _buildExportOptions(format, { isAdvanced: false }));
                }

                document.getElementById('emStep3CopyTextBtn').addEventListener('click', () => {
                    if (textArea) {
                        tryCopyToClipboard(textArea.value);
                        _showToast('✔ 텍스트가 클립보드에 복사되었습니다!');
                        markChunkCompleted();
                    }
                });

                document.getElementById('emStep3SaveFilesBtn').addEventListener('click', () => {
                    const content = textArea ? textArea.value : '';
                    if (content) {
                        const blob = new Blob([content], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                        a.href = url;
                        const ext = isMarkdown ? 'md' : 'txt';
                        a.download = `yayo-export-${dateStr}.${ext}`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        _showToast('💾 파일 저장을 완료했습니다.');
                        markChunkCompleted();
                    } else {
                        _showToast('⚠ 저장할 내용이 없습니다.');
                    }
                });
            }
        }

        // 외부에서 호출할 수 있도록 함수 노출
        return {
            getChunks,
            getChunkTweets,
            renderStep2,
            renderStep3,
        };
    }
};
