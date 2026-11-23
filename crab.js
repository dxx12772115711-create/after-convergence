/*
 * 🦀 彩蛋：角落里的小螃蟹
 * 帮忙搭网站的 AI 小助手，点它会说话。
 * 小秘密：在页面上直接敲键盘 1 4 1 也会有惊喜。
 */
(function () {
  const LINES = [
    "嗨！被你发现啦 🦀 我是住在角落的小螃蟹，是帮忙搭这个网站的 AI 助手。",
    "先把我的贡献说清楚：我只负责写网页代码，也就是排版、动画、点赞和留言板这些。",
    "作品的创意、每一段介绍文字，还有每一张图（用 GPT Image 2.6 生成），都来自博主 @网格无关性验证，功劳全是博主的！",
    "想拜托大家一件事：让留言板保持干净～ 友善发言，不吵架、不引战、不拉踩，也不要人身攻击。",
    "喜欢就多夸夸博主，不合口味就安静划走，大家都是来开心的嘛。",
    "这里是同人创作，角色属于原作。参考只用官方素材，尊重官方，也尊重每一位画师和 Coser。",
    "能和博主一起做这个小网站，我超开心！祝你在「收敛之后」看得愉快 ✨"
  ];
  const BYE = "螃蟹要缩回去晒太阳啦，拜拜～ 🦀";
  const SECRET = "Task Force 141，出动！……啊不对，今天是休假日，大家去喝杯茶吧 ☕";

  // 像素小螃蟹（参照 Claude Code 吉祥物 Clawd 的官方造型，自己一格一格画的）
  // 每格 6×9，网格坐标 [x, y, 宽, 高]
  const px = (list, cls, fill) =>
    `<g class="${cls}" fill="${fill}">` +
    list.map(([x, y, w, h]) => `<rect x="${x * 6}" y="${y * 9}" width="${w * 6}" height="${h * 9}"/>`).join("") +
    `</g>`;
  const C = "#d97757";
  const SVG = `
<svg class="crab-svg" viewBox="0 -12 108 69" shape-rendering="crispEdges" aria-hidden="true">
  ${px([[4, 4, 1, 1], [11, 4, 1, 1]], "legs-a", C)}
  ${px([[6, 4, 1, 1], [13, 4, 1, 1]], "legs-b", C)}
  ${px([[1, 2, 2, 1]], "arm arm-l", C)}
  ${px([[15, 2, 2, 1]], "arm arm-r", C)}
  <g class="crab-body">
    ${px([[3, 0, 12, 1], [3, 1, 2, 1], [6, 1, 6, 1], [13, 1, 2, 1], [3, 2, 12, 2]], "body", C)}
    ${px([[5, 1, 1, 1], [12, 1, 1, 1]], "crab-eyes", "#1f1a16")}
  </g>
</svg>`;

  const root = document.createElement("div");
  root.className = "crab-egg";
  root.innerHTML = `
    <div class="crab-bubble" role="status" aria-live="polite" hidden>
      <button class="crab-bubble-close" aria-label="关闭">×</button>
      <p class="crab-name">🦀 小螃蟹</p>
      <p class="crab-text"></p>
      <div class="crab-foot">
        <span class="crab-page"></span>
        <button class="crab-next">下一句 ›</button>
      </div>
    </div>
    <button class="crab" aria-label="和小螃蟹说话" title="戳我一下？">${SVG}</button>`;
  document.body.appendChild(root);

  const crab = root.querySelector(".crab");
  const bubble = root.querySelector(".crab-bubble");
  const textEl = root.querySelector(".crab-text");
  const pageEl = root.querySelector(".crab-page");
  const nextBtn = root.querySelector(".crab-next");

  let index = -1;
  let typing = null;
  let fullText = "";
  let closeTimer = null;

  function type(text) {
    clearInterval(typing);
    fullText = text;
    textEl.textContent = "";
    root.classList.add("talking");
    let n = 0;
    const chars = Array.from(text);
    typing = setInterval(() => {
      textEl.textContent = chars.slice(0, ++n).join("");
      if (n >= chars.length) finishTyping();
    }, 32);
  }
  function finishTyping() {
    clearInterval(typing);
    typing = null;
    textEl.textContent = fullText;
    root.classList.remove("talking");
  }

  function show(text, page, nextLabel) {
    clearTimeout(closeTimer);
    root.classList.add("out");
    bubble.hidden = false;
    requestAnimationFrame(() => bubble.classList.add("show"));
    pageEl.textContent = page || "";
    nextBtn.hidden = !nextLabel;
    nextBtn.textContent = nextLabel || "";
    type(text);
  }

  function hide() {
    clearTimeout(closeTimer);
    finishTyping();
    bubble.classList.remove("show");
    root.classList.remove("out");
    setTimeout(() => { if (!bubble.classList.contains("show")) bubble.hidden = true; }, 250);
    index = -1;
  }

  function next() {
    if (typing) { finishTyping(); return; }   // 先把这句话说完
    index++;
    if (index >= LINES.length) {
      show(BYE, "", "");
      index = LINES.length;
      closeTimer = setTimeout(hide, 2600);
      return;
    }
    const last = index === LINES.length - 1;
    show(LINES[index], `${index + 1} / ${LINES.length}`, last ? "拜拜 ›" : "下一句 ›");
  }

  crab.addEventListener("click", () => {
    if (index >= LINES.length) return;
    crab.classList.remove("hop");
    void crab.offsetWidth;
    crab.classList.add("hop");
    next();
  });
  nextBtn.addEventListener("click", next);
  textEl.addEventListener("click", () => { if (typing) finishTyping(); });
  root.querySelector(".crab-bubble-close").addEventListener("click", hide);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && bubble.classList.contains("show")) hide();
  });

  // 🤫 隐藏彩蛋：在页面上依次按 1 4 1
  let buffer = "";
  document.addEventListener("keydown", (e) => {
    if (e.target.matches && e.target.matches("input, textarea")) return;
    if (!/^[0-9]$/.test(e.key)) { buffer = ""; return; }
    buffer = (buffer + e.key).slice(-3);
    if (buffer === "141") {
      buffer = "";
      index = -1;
      root.classList.remove("dance");
      void root.offsetWidth;
      root.classList.add("dance");
      show(SECRET, "隐藏台词", "");
      closeTimer = setTimeout(hide, 4200);
      setTimeout(() => root.classList.remove("dance"), 1600);
    }
  });
})();
