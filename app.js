(function () {
  const works = window.WORKS || [];
  const $ = (id) => document.getElementById(id);
  const grid = $("grid");
  const filters = $("filters");
  const modal = $("modal");
  const viewerImg = $("viewerImg");
  const thumbs = $("thumbs");
  const story = $("story");
  const prevBtn = $("prevImg");
  const nextBtn = $("nextImg");

  let current = null;   // 当前打开的作品
  let imgIndex = 0;
  let lastFocus = null;

  $("year").textContent = new Date().getFullYear();

  /* ---------- 点赞 & 评论的存储 ----------
   * 现在保存在浏览器本地（localStorage）。
   * 以后接入线上评论服务时，只需要替换 Store 里的读写逻辑。
   */
  const Store = {
    key: "after-convergence-v1",
    nameKey: "after-convergence-name",
    data: null,
    load() {
      if (this.data) return this.data;
      try { this.data = JSON.parse(localStorage.getItem(this.key)) || {}; }
      catch (e) { this.data = {}; }
      return this.data;
    },
    save() {
      try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {}
    },
    get(id) {
      const d = this.load();
      if (!d[id]) d[id] = { likes: 0, liked: false, comments: [] };
      return d[id];
    },
    toggleLike(id) {
      const w = this.get(id);
      w.liked = !w.liked;
      w.likes = Math.max(0, w.likes + (w.liked ? 1 : -1));
      this.save();
      return w;
    },
    addComment(id, name, text) {
      const w = this.get(id);
      w.comments.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, text, time: Date.now() });
      this.save();
    },
    removeComment(id, cid) {
      const w = this.get(id);
      w.comments = w.comments.filter((c) => c.id !== cid);
      this.save();
    },
    getName() { try { return localStorage.getItem(this.nameKey) || ""; } catch (e) { return ""; } },
    setName(n) { try { localStorage.setItem(this.nameKey, n); } catch (e) {} }
  };

  const ICON_HEART = `<svg class="ico ico-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.3-4.4-9.6-9C.9 8.3 2.7 4.5 6.4 4.5c2.1 0 3.8 1.2 5.6 3.3 1.8-2.1 3.5-3.3 5.6-3.3 3.7 0 5.5 3.8 4 7-2.3 4.6-9.6 9-9.6 9z"/></svg>`;
  const ICON_CMT = `<svg class="ico ico-cmt" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v10.5H9.5l-5 4z"/></svg>`;

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  // **粗体** → <strong>
  function md(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }
  function plain(s) {
    return String(s).replace(/\*\*(.+?)\*\*/g, "$1");
  }
  function no(i) {
    return "No." + String(i + 1).padStart(2, "0");
  }
  function tagsHtml(tags) {
    return (tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function timeAgo(t) {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return "刚刚";
    if (s < 3600) return Math.floor(s / 60) + " 分钟前";
    if (s < 86400) return Math.floor(s / 3600) + " 小时前";
    if (s < 86400 * 7) return Math.floor(s / 86400) + " 天前";
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /* ---------- 分类筛选 ---------- */
  function renderFilters() {
    const all = [...new Set(works.flatMap((w) => w.tags || []))];
    if (all.length < 2) { filters.hidden = true; return; }
    filters.innerHTML = ["全部", ...all]
      .map((t, i) => `<button class="chip${i === 0 ? " active" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`)
      .join("");
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      filters.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === btn));
      renderGrid(btn.dataset.tag === "全部" ? null : btn.dataset.tag);
    });
  }

  /* ---------- 作品卡片 ---------- */
  function cardStatsHtml(w) {
    const s = Store.get(w.id);
    return `
      <button class="card-like${s.liked ? " liked" : ""}" data-like="${esc(w.id)}" aria-pressed="${s.liked}" aria-label="点赞">
        ${ICON_HEART}<span>${s.likes}</span>
      </button>
      <span class="card-cmt" aria-label="评论数">${ICON_CMT}<span>${s.comments.length}</span></span>`;
  }

  function renderGrid(tag) {
    const list = works
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => !tag || (w.tags || []).includes(tag));

    if (!list.length) {
      grid.innerHTML = `<p class="empty">这里还没有作品哦～</p>`;
      return;
    }

    grid.innerHTML = list.map(({ w, i }) => {
      const summary = w.summary || plain((w.paragraphs || [])[0] || "");
      const count = (w.images || []).length;
      return `
        <article class="card" tabindex="0" data-index="${i}" style="animation-delay:${Math.min(i, 8) * 60}ms">
          <div class="card-media">
            <img src="${esc(w.images[0])}" alt="${esc(w.title)}" loading="lazy">
            <span class="card-no">${no(i)}</span>
            ${count > 1 ? `<span class="card-count">${count} 张</span>` : ""}
          </div>
          <div class="card-body">
            <h2 class="card-title"><span class="emoji">${esc(w.emoji || "")}</span>${esc(w.title)}</h2>
            ${w.subtitle ? `<p class="card-en">${esc(w.subtitle)}</p>` : ""}
            <p class="card-summary">${esc(summary)}</p>
            <div class="card-foot">
              <div class="tags">${tagsHtml(w.tags)}</div>
              <div class="card-stats" data-stats="${esc(w.id)}">${cardStatsHtml(w)}</div>
            </div>
          </div>
        </article>`;
    }).join("");
  }

  function refreshCardStats(id) {
    const w = works.find((x) => x.id === id);
    const box = grid.querySelector(`[data-stats="${CSS.escape(id)}"]`);
    if (w && box) box.innerHTML = cardStatsHtml(w);
  }

  function pop(btn) {
    btn.classList.remove("pop");
    void btn.offsetWidth;
    btn.classList.add("pop");
  }

  grid.addEventListener("click", (e) => {
    const like = e.target.closest("[data-like]");
    if (like) {
      e.stopPropagation();
      const id = like.dataset.like;
      Store.toggleLike(id);
      refreshCardStats(id);
      const fresh = grid.querySelector(`[data-like="${CSS.escape(id)}"]`);
      if (fresh && fresh.classList.contains("liked")) pop(fresh);
      return;
    }
    const card = e.target.closest(".card");
    if (card) openWork(+card.dataset.index);
  });
  grid.addEventListener("keydown", (e) => {
    if (e.target.closest("[data-like]")) return;
    const card = e.target.closest(".card");
    if (card && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openWork(+card.dataset.index);
    }
  });

  /* ---------- 详情弹窗 ---------- */
  function renderInteract() {
    if (!current) return;
    const s = Store.get(current.id);
    const box = story.querySelector(".interact");
    box.innerHTML = `
      <button class="like-btn${s.liked ? " liked" : ""}" id="likeBtn" aria-pressed="${s.liked}">
        ${ICON_HEART}<span>${s.liked ? "已喜欢" : "喜欢"}</span><b>${s.likes}</b>
      </button>
      <span class="cmt-count">${ICON_CMT}${s.comments.length} 条评论</span>`;
  }

  function renderComments() {
    if (!current) return;
    const s = Store.get(current.id);
    const list = story.querySelector(".comment-list");
    if (!s.comments.length) {
      list.innerHTML = `<li class="comment-empty">还没有评论，来抢沙发吧～</li>`;
      return;
    }
    list.innerHTML = s.comments.slice().reverse().map((c) => `
      <li class="comment">
        <div class="comment-avatar" aria-hidden="true">${esc((c.name || "匿")[0])}</div>
        <div class="comment-main">
          <div class="comment-head">
            <span class="comment-name">${esc(c.name || "匿名")}</span>
            <span class="comment-time">${timeAgo(c.time)}</span>
            <button class="comment-del" data-del="${esc(c.id)}">删除</button>
          </div>
          <p class="comment-text">${esc(c.text)}</p>
        </div>
      </li>`).join("");
  }

  function openWork(i, fromHash) {
    const w = works[i];
    if (!w) return;
    current = w;
    lastFocus = document.activeElement;

    story.innerHTML = `
      <p class="story-no">${no(i)}</p>
      <h2 class="story-title" id="storyTitle"><span class="emoji">${esc(w.emoji || "")}</span>${esc(w.title)}</h2>
      ${w.subtitle ? `<p class="story-en">${esc(w.subtitle)}</p>` : ""}
      <div class="tags">${tagsHtml(w.tags)}</div>
      <div class="story-text">${(w.paragraphs || []).map((p) => `<p>${md(p)}</p>`).join("")}</div>
      <div class="interact"></div>
      <section class="comments" aria-label="评论">
        <h3 class="comments-title">留言板</h3>
        <p class="cf-tip">🦀 小螃蟹提醒：友善发言，不吵架、不引战、不拉踩～</p>
        <form class="comment-form" id="commentForm" autocomplete="off">
          <input class="cf-name" name="name" placeholder="昵称（选填）" maxlength="20" value="${esc(Store.getName())}">
          <textarea class="cf-text" name="text" placeholder="说点什么吧～" maxlength="500" rows="3" required></textarea>
          <div class="cf-row">
            <span class="cf-hint">Ctrl + Enter 快速发送</span>
            <button class="cf-submit" type="submit">发送</button>
          </div>
        </form>
        <ul class="comment-list"></ul>
      </section>`;
    renderInteract();
    renderComments();

    const multi = w.images.length > 1;
    thumbs.innerHTML = multi
      ? w.images.map((src, k) => `<button class="thumb" data-k="${k}" aria-label="第 ${k + 1} 张"><img src="${esc(src)}" alt=""></button>`).join("")
      : "";
    thumbs.hidden = !multi;
    prevBtn.hidden = nextBtn.hidden = !multi;

    setImage(0);
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("open"));
    document.body.style.overflow = "hidden";
    story.scrollTop = 0;
    modal.querySelector(".modal-close").focus();
    if (!fromHash) history.replaceState(null, "", "#" + w.id);
  }

  function closeWork() {
    if (modal.hidden) return;
    modal.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => { modal.hidden = true; }, 250);
    history.replaceState(null, "", location.pathname + location.search);
    current = null;
    if (lastFocus) lastFocus.focus();
  }

  function setImage(k) {
    if (!current) return;
    const n = current.images.length;
    imgIndex = (k + n) % n;
    viewerImg.classList.remove("show");
    viewerImg.onload = () => viewerImg.classList.add("show");
    viewerImg.src = current.images[imgIndex];
    viewerImg.alt = current.title;
    if (viewerImg.complete) viewerImg.classList.add("show");
    thumbs.querySelectorAll(".thumb").forEach((t, idx) => t.classList.toggle("active", idx === imgIndex));
  }

  // 弹窗里的点赞 / 删除评论
  story.addEventListener("click", (e) => {
    if (!current) return;
    if (e.target.closest("#likeBtn")) {
      const s = Store.toggleLike(current.id);
      renderInteract();
      if (s.liked) pop($("likeBtn"));
      refreshCardStats(current.id);
      return;
    }
    const del = e.target.closest("[data-del]");
    if (del && confirm("确定删除这条评论吗？")) {
      Store.removeComment(current.id, del.dataset.del);
      renderComments();
      renderInteract();
      refreshCardStats(current.id);
    }
  });

  // 发表评论
  story.addEventListener("submit", (e) => {
    if (!current || e.target.id !== "commentForm") return;
    e.preventDefault();
    const form = e.target;
    const nameEl = form.querySelector(".cf-name");
    const textEl = form.querySelector(".cf-text");
    const name = nameEl.value.trim();
    const text = textEl.value.trim();
    if (!text) { textEl.focus(); return; }
    Store.setName(name);
    Store.addComment(current.id, name, text);
    textEl.value = "";
    renderComments();
    renderInteract();
    refreshCardStats(current.id);
  });
  story.addEventListener("keydown", (e) => {
    if (e.target.matches(".cf-text") && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });

  thumbs.addEventListener("click", (e) => {
    const t = e.target.closest(".thumb");
    if (t) setImage(+t.dataset.k);
  });
  prevBtn.addEventListener("click", () => setImage(imgIndex - 1));
  nextBtn.addEventListener("click", () => setImage(imgIndex + 1));
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeWork(); });

  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    const typing = e.target.matches("input, textarea");
    if (e.key === "Escape") { if (typing) e.target.blur(); else closeWork(); }
    if (typing) return;
    if (e.key === "ArrowLeft") setImage(imgIndex - 1);
    if (e.key === "ArrowRight") setImage(imgIndex + 1);
  });

  // 手机上左右滑动切换图片
  let touchX = null;
  viewerImg.parentElement.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  viewerImg.parentElement.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) setImage(imgIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  /* ---------- 启动 ---------- */
  renderFilters();
  renderGrid(null);

  // 链接里带 #作品id 时直接打开对应作品（方便分享）
  const fromHash = works.findIndex((w) => "#" + w.id === location.hash);
  if (fromHash >= 0) openWork(fromHash, true);
})();
