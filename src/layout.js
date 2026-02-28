// src/layout.js
// 반응형 패널 슬라이드 토글

(function () {
  const filterPanel  = document.getElementById("filterPanel");
  const rightPanel   = document.getElementById("rightPanel");
  const filterToggle = document.getElementById("filterPanelToggle");
  const rightToggle  = document.getElementById("rightPanelToggle");
  const backdrop     = document.getElementById("panelBackdrop");
  if (!filterPanel || !rightPanel || !backdrop) return;

  function openPanel(panel) {
    closeAll();
    panel.classList.add("panelOpen");
    backdrop.classList.add("show");
  }

  function closeAll() {
    filterPanel.classList.remove("panelOpen");
    rightPanel.classList.remove("panelOpen");
    backdrop.classList.remove("show");
  }

  if (filterToggle) filterToggle.addEventListener("click", () => {
    filterPanel.classList.contains("panelOpen") ? closeAll() : openPanel(filterPanel);
  });

  if (rightToggle) rightToggle.addEventListener("click", () => {
    rightPanel.classList.contains("panelOpen") ? closeAll() : openPanel(rightPanel);
  });

  backdrop.addEventListener("click", closeAll);

  // 화면이 충분히 넓어지면 오버레이 닫기
  window.addEventListener("resize", closeAll);
})();
