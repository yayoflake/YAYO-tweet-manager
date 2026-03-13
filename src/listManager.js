/**
 * src/listManager.js
 * 선택 목록 파일 저장 및 불러오기 기능을 담당합니다.
 */

window.listManager = {
    /**
     * 현재 선택된 트윗 ID 목록을 JSON 파일로 저장합니다.
     */
    saveSelectionToFile: function () {
        if (!window.state || !window.state.selectedOrder || window.state.selectedOrder.length === 0) {
            alert('저장할 선택된 트윗이 없습니다.');
            return;
        }

        const data = {
            version: "1.0",
            savedAt: new Date().toISOString(),
            tweetIds: window.state.selectedOrder
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `yayo-selection-${timestamp}.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    },

    /**
     * JSON 파일을 읽어서 현재 선택 상태로 복구합니다.
     */
    loadSelectionFromFile: function (file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data || !Array.isArray(data.tweetIds)) {
                    throw new Error('올바른 파일 형식이 아닙니다.');
                }

                const newIds = data.tweetIds;
                const foundIds = [];
                const missingCount = 0;

                // 현재 로드된 전체 트윗 데이터(state.tweetById)에 있는지 확인
                newIds.forEach(id => {
                    if (window.state.tweetById && window.state.tweetById.has(id)) {
                        foundIds.push(id);
                    }
                });

                if (foundIds.length === 0) {
                    alert('파일에 포함된 트윗이 현재 로드된 데이터에 하나도 발견되지 않았습니다.\n데이터 폴더가 일치하는지 확인해 주세요.');
                    return;
                }

                if (!confirm(`불러온 파일에서 ${foundIds.length}개의 트윗을 찾았습니다.\n현재 선택 목록을 이 목록으로 교체할까요?`)) {
                    return;
                }

                // 상태 업데이트
                window.state.selectedIds.clear();
                window.state.selectedOrder = [];

                foundIds.forEach(id => {
                    window.state.selectedIds.add(id);
                    window.state.selectedOrder.push(id);
                });

                // 저장 및 UI 갱신
                if (window.saveSelectedState) window.saveSelectedState();
                if (window.render) window.render();

                const missing = newIds.length - foundIds.length;
                if (missing > 0) {
                    alert(`불러오기 완료: ${foundIds.length}개 성공, ${missing}개 실패(로드된 데이터에 없음)`);
                } else {
                    if (window._em && window._em.fn.showToast) {
                        window._em.fn.showToast(`✔ ${foundIds.length}개의 트윗 목록을 불러왔습니다!`);
                    }
                }

            } catch (err) {
                console.error(err);
                alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
            }
        };
        reader.readAsText(file);
    }
};
