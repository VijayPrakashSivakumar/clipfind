/**
 * ClipFind — UI module.
 * Renders the discovery panel on YouTube watch pages. No fabricated prices,
 * ratings, or images.
 */
const PANEL_ID = 'clipfind-panel';
const STYLE_ID = 'clipfind-styles';

export class ClipFindUI {
  constructor(opts = {}) {
    const { onRefresh, onJumpTo, onCopyLink, onOpenLink, onScanVisuals } = opts;
    this.onRefresh = onRefresh;
    this.onJumpTo = onJumpTo;
    this.onCopyLink = onCopyLink;
    this.onOpenLink = onOpenLink;
    this.onScanVisuals = onScanVisuals;
    this.panel = null;
    this.tabs = ['all', 'products', 'software', 'resources', 'creator'];
    this.activeTab = 'all';
    this.query = '';
    this._items = [];
  }

  ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
#${PANEL_ID}{position:fixed;z-index:2147483647;top:110px;right:18px;width:min(380px,calc(100vw-36px));max-height:min(640px,calc(100vh-140px));display:flex;flex-direction:column;background:#1a1a1a;border:1px solid #3a3a3a;border-radius:14px;box-shadow:0 10px 36px rgb(0 0 0 / 45%);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#f1f1f1;box-sizing:border-box;animation:cfFadeIn .22s ease}@keyframes cfFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}#${PANEL_ID} .cf-header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #333}#${PANEL_ID} .cf-brand{font-weight:800;font-size:17px;letter-spacing:-.4px;background:linear-gradient(90deg,#3ea6ff,#ff6b6b);-webkit-background-clip:text;-webkit-text-fill-color:transparent}#${PANEL_ID} .cf-status{margin-left:auto;font-size:11px;color:#9aa0a6}#${PANEL_ID} .cf-toolbar{display:flex;gap:8px;padding:10px 14px;border-bottom:1px solid #2a2a2a;overflow-x:auto}#${PANEL_ID} .cf-tab{flex:0 0 auto;background:transparent;border:1px solid #3a3a3a;color:#c7c7c7;padding:6px 12px;border-radius:20px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}#${PANEL_ID} .cf-tab.active{background:#3ea6ff;color:#0b0b0b;border-color:#3ea6ff}#${PANEL_ID} .cf-tab:hover:not(.active){border-color:#555;color:#fff}#${PANEL_ID} .cf-search-wrap{padding:10px 14px;border-bottom:1px solid #2a2a2a}#${PANEL_ID} .cf-search{width:100%;background:#242424;border:1px solid #3a3a3a;border-radius:8px;color:#f1f1f1;padding:8px 12px;font:inherit;font-size:13px}#${PANEL_ID} .cf-search:focus{outline:2px solid #3ea6ff;border-color:#3ea6ff}#${PANEL_ID} .cf-count{padding:6px 14px;font-size:12px;color:#9aa0a6;border-bottom:1px solid #2a2a2a}#${PANEL_ID} .cf-list{overflow-y:auto;padding:0;min-height:0}#${PANEL_ID} .cf-empty,#${PANEL_ID} .cf-error{padding:24px 16px;text-align:center;color:#9aa0a6;font-size:13px}#${PANEL_ID} .cf-error{color:#ff6b6b}#${PANEL_ID} .cf-card{display:flex;gap:10px;padding:10px 14px;border-bottom:1px solid #242424;align-items:flex-start}#${PANEL_ID} .cf-card:last-child{border-bottom:none}#${PANEL_ID} .cf-thumb{flex:0 0 auto;width:52px;height:40px;background:#242424;border:1px solid #333;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#888}#${PANEL_ID} .cf-body{flex:1;min-width:0}#${PANEL_ID} .cf-name{font-weight:700;font-size:13.5px;color:#f1f1f1;margin:0 0 4px 0;overflow-wrap:break-word}#${PANEL_ID} .cf-meta{display:flex;gap:8px;align-items:center;font-size:11px;color:#9aa0a6;margin-bottom:4px;flex-wrap:wrap}#${PANEL_ID} .cf-badge{display:inline-block;font-size:10px;font-weight:800;padding:1px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.3px}#${PANEL_ID} .cf-badge.exact{background:#2d6a4f;color:#d4edda}#${PANEL_ID} .cf-badge.likely{background:#b8860b;color:#fff3cd}#${PANEL_ID} .cf-badge.search{background:#555;color:#ddd}#${PANEL_ID} .cf-context{font-size:12px;color:#c7c7c7;margin:0 0 8px 0;overflow-wrap:anywhere}#${PANEL_ID} .cf-actions{display:flex;gap:6px;flex-wrap:wrap}#${PANEL_ID} .cf-btn{border:none;border-radius:6px;padding:5px 10px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}#${PANEL_ID} .cf-btn.jump{background:#3ea6ff;color:#0b0b0b}#${PANEL_ID} .cf-btn.jump:hover{background:#65b8ff}#${PANEL_ID} .cf-btn.copy{background:transparent;color:#c7c7c7;border:1px solid #444}#${PANEL_ID} .cf-btn.copy:hover{border-color:#888;color:#fff}#${PANEL_ID} .cf-btn.open{background:#242424;color:#3ea6ff;border:1px solid #3ea6ff}#${PANEL_ID} .cf-btn.open:hover{background:#3ea6ff;color:#0b0b0b}#${PANEL_ID} .cf-refresh-bar{padding:10px 14px;border-top:1px solid #2a2a2a;background:#242424;border-bottom-left-radius:14px;border-bottom-right-radius:14px}#${PANEL_ID} .cf-btn-refresh{width:100%;background:transparent;color:#3ea6ff;border:1px solid #3ea6ff;border-radius:8px;padding:8px;font:inherit;font-weight:700;cursor:pointer}#${PANEL_ID} .cf-btn-refresh:hover{background:rgba(62,166,255,.15)}#${PANEL_ID} .cf-btn-refresh:disabled{opacity:.5;cursor:not-allowed}#${PANEL_ID} .cf-close{position:absolute;top:8px;left:8px;background:transparent;border:none;color:#888;font-size:16px;cursor:pointer;padding:4px;line-height:1}#${PANEL_ID} .cf-close:hover{color:#fff}#${PANEL_ID} .cf-btn-visual{background:#242424;color:#ff6b6b;border:1px solid #ff6b6b;border-radius:6px;padding:6px 10px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;margin-left:8px}#${PANEL_ID} .cf-btn-visual:hover{background:rgba(255,107,107,.15)}#${PANEL_ID} .cf-btn-visual:disabled{opacity:.5;cursor:not-allowed}#${PANEL_ID} .cf-thumb img{width:100%;height:100%;object-fit:cover;border-radius:8px}button{font-family:inherit}`;
    document.head.appendChild(s);
  }
  createPanel() {
    if (document.getElementById(PANEL_ID)) return this.panel;
    this.ensureStyles();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'ClipFind discoveries');
    panel.setAttribute('tabIndex', '-1');
    const close = document.createElement('button');
    close.className = 'cf-close';
    close.setAttribute('aria-label', 'Close ClipFind panel');
    close.textContent = '✕';
    close.onclick = () => this.remove();
    const header = document.createElement('div');
    header.className = 'cf-header';
    const brand = document.createElement('div');
    brand.className = 'cf-brand';
    brand.textContent = 'ClipFind';
    const status = document.createElement('div');
    status.className = 'cf-status';
    status.id = 'cf-status';
    status.textContent = 'Idle';
    header.append(brand, status);
    const toolbar = document.createElement('div');
    toolbar.className = 'cf-toolbar';
    toolbar.id = 'cf-toolbar';
    const searchWrap = document.createElement('div');
    searchWrap.className = 'cf-search-wrap';
    const search = document.createElement('input');
    search.className = 'cf-search';
    search.type = 'search';
    search.placeholder = 'Search discoveries (e.g. "laptop at 04:35")';
    search.setAttribute('aria-label', 'Search discoveries');
    searchWrap.appendChild(search);
    const count = document.createElement('div');
    count.className = 'cf-count';
    count.id = 'cf-count';
    count.textContent = '0 discoveries';
    const list = document.createElement('div');
    list.className = 'cf-list';
    list.id = 'cf-list';
    const refreshBar = document.createElement('div');
    refreshBar.className = 'cf-refresh-bar';
    const btnRefresh = document.createElement('button');
    btnRefresh.className = 'cf-btn-refresh';
    btnRefresh.id = 'cf-btn-refresh';
    btnRefresh.textContent = 'Find Everything';
    btnRefresh.onclick = () => this.onRefresh();
    const btnVisual = document.createElement('button');
    btnVisual.className = 'cf-btn-visual';
    btnVisual.id = 'cf-btn-visual';
    btnVisual.textContent = 'Scan Visuals';
    btnVisual.onclick = () => {
      if (this.onScanVisuals) this.onScanVisuals();
    };
    refreshBar.appendChild(btnVisual);
    panel.append(close, header, toolbar, searchWrap, count, list, refreshBar);
    document.body.append(panel);
    this.panel = panel;
    this.bindTabs(toolbar);
    search.addEventListener('input', (e) => {
      this.query = e.target.value.toLowerCase();
      this.render(this._items);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById(PANEL_ID)) {
        ui.remove();
      }
    });

    return panel;
    });
    return panel;
  }

  bindTabs(toolbar) {
    for (const tab of this.tabs) {
      const btn = document.createElement('button');
      btn.className = `cf-tab ${tab === this.activeTab ? 'active' : ''}`;
      btn.textContent = this.tabLabel(tab);
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', this.activeTab === tab);
      btn.onclick = () => {
        this.activeTab = tab;
        for (const b of toolbar.querySelectorAll('.cf-tab')) {
          const active = b.textContent === this.tabLabel(tab);
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active);
        }
        this.render(this._items);
      };
      toolbar.appendChild(btn);
    }
  }

  tabLabel(tab) {
    const labels = { all: 'All', products: 'Products', software: 'Tools & AI', resources: 'Resources', creator: 'Creator Links' };
    return labels[tab] || tab;
  }

  setStatus(text) {
    const el = document.getElementById('cf-status');
    if (el) el.textContent = text;
  }

  setRefreshing(refreshing) {
    const btn = document.getElementById('cf-btn-refresh');
    if (btn) {
      btn.disabled = refreshing;
      btn.textContent = refreshing ? 'Analyzing…' : 'Find Everything';
    }
  }

  setVisualScanning(scanning) {
    const btn = document.getElementById('cf-btn-visual');
    if (btn) {
      btn.disabled = scanning;
      btn.textContent = scanning ? 'Scanning Visuals…' : 'Scan Visuals';
    }
  }
  setItems(items) {
    this._items = items;
    this.render(items);
  }

  filter(items) {
    const q = this.query;
    const tab = this.activeTab;
    return items.filter((item) => {
      if (tab !== 'all' && item.category !== tab) return false;
      if (!q) return true;
      const hay = `${item.name} ${item.category} ${item.evidence || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  render(items) {
    const list = document.getElementById('cf-list');
    const count = document.getElementById('cf-count');
    if (!list) return;
    const shown = this.filter(items);
    count.textContent = `${shown.length} discovery${shown.length !== 1 ? 's' : ''}`;
    list.replaceChildren();
    if (shown.length === 0) {
      const empty = document.createElement('div');
      empty.className = items.length === 0 ? 'cf-empty' : 'cf-empty';
      empty.textContent = items.length === 0
        ? 'No discoveries yet. Click "Find Everything" to analyze this video.'
        : 'No discoveries match your search or filter.';
      list.appendChild(empty);
      return;
    }
    for (const item of shown) list.appendChild(this.createCard(item));
  }
  createCard(item) {
    const card = document.createElement('article');
    card.className = 'cf-card';
    card.setAttribute('role', 'article');
    const thumb = document.createElement('div');
    thumb.className = 'cf-thumb';
    if (item.thumbnail) {
      const img = document.createElement('img');
      img.src = item.thumbnail;
      img.alt = item.name;
      img.style.display = 'block';
      thumb.appendChild(img);
    } else {
      thumb.textContent = this.categoryIcon(item.category);
    }
    const body = document.createElement('div');
    body.className = 'cf-body';
    const name = document.createElement('div');
    name.className = 'cf-name';
    name.textContent = item.name || 'Untitled';
    const meta = document.createElement('div');
    meta.className = 'cf-meta';
    const cat = document.createElement('span');
    cat.className = 'cf-badge';
    cat.textContent = item.category;
    const match = document.createElement('span');
    match.className = `cf-badge ${(item.matchStatus || '').toLowerCase().replace(/\s+/g, '-')}`;
    match.textContent = item.matchStatus || 'Search Suggested';
    const ts = document.createElement('span');
    ts.textContent = item.timestamp != null ? `• ${this.formatTime(item.timestamp)}` : '• no timestamp';
    meta.append(cat, match, ts);
    const context = document.createElement('div');
    context.className = 'cf-context';
    context.textContent = item.evidence || 'No supporting context available.';
    const actions = document.createElement('div');
    actions.className = 'cf-actions';
    const btnJump = document.createElement('button');
    btnJump.className = 'cf-btn jump';
    btnJump.textContent = item.timestamp != null ? 'Jump to Video' : 'Open Link';
    btnJump.onclick = (e) => { e.stopPropagation(); if (this.onJumpTo) this.onJumpTo(item.timestamp, item.videoId); };
    const btnCopy = document.createElement('button');
    btnCopy.className = 'cf-btn copy';
    btnCopy.textContent = 'Copy Link';
    btnCopy.onclick = (e) => { e.stopPropagation(); if (this.onCopyLink) this.onCopyLink(item.url); };
    const btnOpen = document.createElement('button');
    btnOpen.className = 'cf-btn open';
    btnOpen.textContent = 'Open';
    btnOpen.title = item.url;
    btnOpen.onclick = (e) => { e.stopPropagation(); if (this.onOpenLink) this.onOpenLink(item.url); };
    actions.append(btnJump, btnCopy, btnOpen);
    body.append(name, meta, context, actions);
    card.append(thumb, body);
    return card;
  }

  categoryIcon(category) {
    const icons = { products: '🛍️', software: '💻', education: '📚', social: '🔗', other: '📎' };
    return icons[category] || '📎';
  }

  formatTime(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds || 0)));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m > 0 ? `${m}:${rem.toString().padStart(2, '0')}` : `0:${rem.toString().padStart(2, '0')}`;
  }

  showError(message) {
    const list = document.getElementById('cf-list');
    const count = document.getElementById('cf-count');
    if (!list) return;
    list.replaceChildren();
    const err = document.createElement('div');
    err.className = 'cf-error';
    err.textContent = message || 'Unable to complete analysis.';
    list.appendChild(err);
    if (count) count.textContent = 'Error';
  }

  remove() {
    if (this.panel && this.panel.parentNode) this.panel.parentNode.removeChild(this.panel);
    this.panel = null;
  }
}

export const ui = new ClipFindUI();



