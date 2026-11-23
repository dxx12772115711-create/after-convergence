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

  /* =========================================================
   * 点赞 & 评论的数据层
   * 填好 config.js 就走线上（Supabase），否则存在浏览器本地。
   * ========================================================= */
  const CFG = window.SITE_CONFIG || {};
  const ONLINE = !!(CFG.supabaseUrl && CFG.supabaseKey);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });
  }
  const CLIENT_ID = LS.get("ac-client", null) || (() => { const id = uuid(); LS.set("ac-client", id); return id; })();

  // 缓存：stats[id] = { likes, liked, comments }，comments[id] = [...]
  const cache = { stats: {}, comments: {} };
  function stat(id) {
    return cache.stats[id] || (cache.stats[id] = { likes: 0, liked: false, comments: 0 });
  }

  /* ---- 线上：Supabase ---- */
  const Remote = {
    base: (CFG.supabaseUrl || "").replace(/\/+$/, ""),
    headers() {
      const h = { apikey: CFG.supabaseKey, "Content-Type": "application/json" };
      if (!String(CFG.supabaseKey).startsWith("sb_")) h.Authorization = "Bearer " + CFG.supabaseKey;
      return h;
    },
    async req(path, opts) {
      const r = await fetch(this.base + path, Object.assign({ headers: this.headers() }, opts));
      const text = await r.text();
      if (!r.ok) {
        let msg = text;
        try { msg = JSON.parse(text).message || text; } catch (e) {}
        throw new Error(msg);
      }
      return text ? JSON.parse(text) : null;
    },
    rpc(fn, body) {
      return this.req("/rest/v1/rpc/" + fn, { method: "POST", body: JSON.stringify(body) });
    },
    mine: new Set(LS.get("ac-mine", [])),
    remember(id) { this.mine.add(id); LS.set("ac-mine", [...this.mine]); },
    forget(id) { this.mine.delete(id); LS.set("ac-mine", [...this.mine]); },
    norm(c) {
      return { id: c.id, name: c.name, text: c.content, time: Date.parse(c.created_at), mine: this.mine.has(c.id) };
    },

    async loadStats() {
      const rows = await this.rpc("get_stats", { p_client: CLIENT_ID });
      (rows || []).forEach((r) => {
        cache.stats[r.work_id] = { likes: +r.likes, liked: !!r.liked, comments: +r.comments };
      });
    },
    async loadComments(id) {
      const q = "/rest/v1/comments?select=id,name,content,created_at&order=created_at.desc&limit=300&work_id=eq." + encodeURIComponent(id);
      cache.comments[id] = (await this.req(q, { method: "GET" })).map((c) => this.norm(c));
    },
    async toggleLike(id) {
      const rows = await this.rpc("toggle_like", { p_work: id, p_client: CLIENT_ID });
      const r = rows[0];
      Object.assign(stat(id), { liked: !!r.is_liked, likes: +r.like_count });
    },
    async addComment(id, name, text) {
      const rows = await this.rpc("add_comment", { p_work: id, p_name: name, p_content: text, p_client: CLIENT_ID });
      this.remember(rows[0].id);
      (cache.comments[id] = cache.comments[id] || []).unshift(this.norm(rows[0]));
      stat(id).comments++;
    },
    async removeComment(id, cid) {
      await this.rpc("delete_comment", { p_id: cid, p_client: CLIENT_ID });
      this.forget(cid);
      cache.comments[id] = (cache.comments[id] || []).filter((c) => c.id !== cid);
      stat(id).comments = Math.max(0, stat(id).comments - 1);
    }
  };

  /* ---- 本地：localStorage（没填 config.js 时使用） ---- */
  const Local = {
    key: "after-convergence-v1",
    all() { return LS.get(this.key, {}); },
    item(d, id) { return d[id] || (d[id] = { likes: 0, liked: false, comments: [] }); },
    async loadStats() {
      const d = this.all();
      Object.keys(d).forEach((id) => {
        cache.stats[id] = { likes: d[id].likes, liked: d[id].liked, comments: d[id].comments.length };
      });
    },
    async loadComments(id) {
      const w = this.item(this.all(), id);
      cache.comments[id] = w.comments.slice().reverse().map((c) => Object.assign({ mine: true }, c));
    },
    async toggleLike(id) {
      const d = this.all(), w = this.item(d, id);
      w.liked = !w.liked;
      w.likes = Math.max(0, w.likes + (w.liked ? 1 : -1));
      LS.set(this.key, d);
      Object.assign(stat(id), { liked: w.liked, likes: w.likes });
    },
    async addComment(id, name, text) {
      const d = this.all(), w = this.item(d, id);
      w.comments.push({ id: uuid(), name, text, time: Date.now() });
      LS.set(this.key, d);
      await this.loadComments(id);
      stat(id).comments = w.comments.length;
    },
    async removeComment(id, cid) {
      const d = this.all(), w = this.item(d, id);
      w.comments = w.comments.filter((c) => c.id !== cid);
      LS.set(this.key, d);
      await this.loadComments(id);
      stat(id).comments = w.comments.length;
    }
  };

  const Data = ONLINE ? Remote : Local;

  function friendlyError(err) {
    const m = String(err && err.message || err);
    if (m.includes("too_fast")) return "发得太快啦，歇 20 秒再试试～";
    if (m.includes("too_busy")) return "评论区有点挤，稍等一会儿再发吧～";
    if (m.includes("invalid_content")) return "评论内容不能为空，也不能超过 500 字哦";
    if (m.includes("Failed to fetch") || m.includes("NetworkError")) return "网络好像不太顺畅，稍后再试试～";
    return "出了点小问题，稍后再试试～";
  }

  /* ---------- 小提示 ---------- */
  const toastEl = document.createElement("div");
  toastEl.className = "toast";
  toastEl.setAttribute("role", "status");
  document.body.appendChild(toastEl);
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

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
    const s = stat(w.id);
    return `
      <button class="card-like${s.liked ? " liked" : ""}" data-like="${esc(w.id)}" aria-pressed="${s.liked}" aria-label="点赞">
        ${ICON_HEART}<span>${s.likes}</span>
      </button>
      <span class="card-cmt" aria-label="评论数">${ICON_CMT}<span>${s.comments}</span></span>`;
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
  function refreshAllCardStats() {
    works.forEach((w) => refreshCardStats(w.id));
  }
  function refreshEverywhere(id) {
    refreshCardStats(id);
    if (current && current.id === id) renderInteract();
  }

  function pop(btn) {
    if (!btn) return;
    btn.classList.remove("pop");
    void btn.offsetWidth;
    btn.classList.add("pop");
  }

  // 点赞：先在界面上立刻变化，再和服务器同步；失败就恢复
  const liking = new Set();
  async function like(id) {
    if (liking.has(id)) return;
    liking.add(id);
    const s = stat(id);
    const before = { liked: s.liked, likes: s.likes };
    s.liked = !s.liked;
    s.likes = Math.max(0, s.likes + (s.liked ? 1 : -1));
    refreshEverywhere(id);
    if (s.liked) {
      pop(grid.querySelector(`[data-like="${CSS.escape(id)}"]`));
      if (current && current.id === id) pop($("likeBtn"));
    }
    try {
      await Data.toggleLike(id);
    } catch (err) {
      Object.assign(s, before);
      toast(friendlyError(err));
    }
    liking.delete(id);
    refreshEverywhere(id);
  }

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-like]");
    if (btn) {
      e.stopPropagation();
      like(btn.dataset.like);
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
    const s = stat(current.id);
    const box = story.querySelector(".interact");
    box.innerHTML = `
      <button class="like-btn${s.liked ? " liked" : ""}" id="likeBtn" aria-pressed="${s.liked}">
        ${ICON_HEART}<span>${s.liked ? "已喜欢" : "喜欢"}</span><b>${s.likes}</b>
      </button>
      <span class="cmt-count">${ICON_CMT}${s.comments} 条评论</span>`;
  }

  function renderComments(state) {
    if (!current) return;
    const list = story.querySelector(".comment-list");
    if (state === "loading") {
      list.innerHTML = `<li class="comment-empty">评论加载中…</li>`;
      return;
    }
    if (state === "error") {
      list.innerHTML = `<li class="comment-empty">评论加载失败了，<button class="comment-retry" type="button">点这里重试</button></li>`;
      return;
    }
    const comments = cache.comments[current.id] || [];
    if (!comments.length) {
      list.innerHTML = `<li class="comment-empty">还没有评论，来抢沙发吧～</li>`;
      return;
    }
    list.innerHTML = comments.map((c) => `
      <li class="comment">
        <div class="comment-avatar" aria-hidden="true">${esc(Array.from(c.name || "匿")[0])}</div>
        <div class="comment-main">
          <div class="comment-head">
            <span class="comment-name">${esc(c.name || "匿名")}</span>
            <span class="comment-time">${timeAgo(c.time)}</span>
            ${c.mine ? `<button class="comment-del" data-del="${esc(c.id)}">删除</button>` : ""}
          </div>
          <p class="comment-text">${esc(c.text)}</p>
        </div>
      </li>`).join("");
  }

  async function loadComments(work) {
    renderComments("loading");
    try {
      await Data.loadComments(work.id);
      stat(work.id).comments = cache.comments[work.id].length;
      if (current === work) { renderComments(); renderInteract(); }
      refreshCardStats(work.id);
    } catch (err) {
      if (current === work) renderComments("error");
    }
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
          <input class="cf-name" name="nickname" placeholder="昵称（选填）" maxlength="20" value="${esc(LS.get("ac-name", ""))}">
          <textarea class="cf-text" name="content" placeholder="说点什么吧～" maxlength="500" rows="3" required></textarea>
          <div class="cf-row">
            <span class="cf-hint">${ONLINE ? "Ctrl + Enter 快速发送" : "（评论暂时只保存在本机）"}</span>
            <button class="cf-submit" type="submit">发送</button>
          </div>
        </form>
        <ul class="comment-list"></ul>
      </section>`;
    renderInteract();
    loadComments(w);

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

  // 弹窗里的点赞 / 删除评论 / 重试
  story.addEventListener("click", async (e) => {
    if (!current) return;
    if (e.target.closest("#likeBtn")) { like(current.id); return; }
    if (e.target.closest(".comment-retry")) { loadComments(current); return; }
    const del = e.target.closest("[data-del]");
    if (del && confirm("确定删除这条评论吗？")) {
      const work = current;
      del.disabled = true;
      try {
        await Data.removeComment(work.id, del.dataset.del);
        if (current === work) { renderComments(); renderInteract(); }
        refreshCardStats(work.id);
      } catch (err) {
        del.disabled = false;
        toast(friendlyError(err));
      }
    }
  });

  // 发表评论
  story.addEventListener("submit", async (e) => {
    if (!current || e.target.id !== "commentForm") return;
    e.preventDefault();
    const form = e.target;
    const nameEl = form.querySelector(".cf-name");
    const textEl = form.querySelector(".cf-text");
    const submit = form.querySelector(".cf-submit");
    const name = nameEl.value.trim();
    const text = textEl.value.trim();
    if (!text) { textEl.focus(); return; }
    LS.set("ac-name", name);
    const work = current;
    submit.disabled = true;
    submit.textContent = "发送中…";
    try {
      await Data.addComment(work.id, name, text);
      textEl.value = "";
      if (current === work) { renderComments(); renderInteract(); }
      refreshCardStats(work.id);
      toast("评论发送成功～");
    } catch (err) {
      toast(friendlyError(err));
    }
    submit.disabled = false;
    submit.textContent = "发送";
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
  Data.loadStats()
    .then(() => {
      refreshAllCardStats();
      if (current) renderInteract();
    })
    .catch(() => {});

  // 链接里带 #作品id 时直接打开对应作品（方便分享）
  const fromHash = works.findIndex((w) => "#" + w.id === location.hash);
  if (fromHash >= 0) openWork(fromHash, true);
})();
