'use strict';

const OBSTACLES = '.status-bar,.mobile-navbar,.mobile-toolbar,.mobile-bottom-bar,.note-reader-mobile-dock,.note-reader-native-toolbar,.pdf-toolbar,.view-header,.cozy-mini-panel';

class PlaybackControls {
  constructor(plugin, adapter, setIcon) {
    this.plugin = plugin; this.adapter = adapter; this.setIcon = setIcon; this.buttons = new Set(); this.views = [];
  }
  state() { return this.adapter.playback?.() || { active: false, canToggle: false }; }
  button(parent, action = 'toggle') {
    const button = parent.ownerDocument.createElement('button');
    button.type = 'button'; button.className = `clickable-icon ${action === 'stop' ? 'cozy-stop-control' : 'cozy-pause-control'}`;
    button.dataset.playbackAction = action; parent.append(button);
    let pointerSession;
    button.addEventListener('pointerdown', event => {
      if (['mouse', 'touch', 'pen'].includes(event.pointerType)) button.classList.toggle('is-touch-control', event.pointerType !== 'mouse');
      if (event.button === 0) pointerSession = this.state().session;
    });
    button.addEventListener('pointercancel', () => { pointerSession = undefined; });
    button.addEventListener('keydown', event => {
      if (![' ', 'Enter'].includes(event.key)) return;
      event.stopPropagation(); if (event.repeat) event.preventDefault();
    });
    button.addEventListener('click', event => {
      event.stopPropagation();
      const expected = event.detail ? pointerSession : undefined; pointerSession = undefined;
      if (this.destroyed || !this.buttons.has(button) || !button.isConnected) return;
      if (action === 'stop') void this.stop(expected); else void this.toggle(expected);
    });
    this.buttons.add(button); this.paint(button, this.state()); return button;
  }
  forget(button) { this.buttons.delete(button); }
  paint(button, state) {
    const zh = this.plugin.settings.settingsLanguage === 'chinese';
    const stop = button.dataset.playbackAction === 'stop';
    const icon = stop ? 'square' : state.active && !state.paused ? 'pause' : 'play';
    if (button.dataset.icon !== icon) { this.setIcon(button, icon); button.dataset.icon = icon; }
    const label = !state.active ? (zh ? '请先开始朗读' : 'Start reading first')
      : stop ? (zh ? '停止朗读' : 'Stop reading')
        : state.paused ? (zh ? '继续朗读' : 'Resume reading') : (zh ? '暂停朗读' : 'Pause reading');
    const title = state.active && state.title ? `${label}${zh ? '：' : ': '}${String(state.title).slice(0, 160)}` : label;
    if (button.getAttribute('aria-label') !== title) button.setAttribute('aria-label', title);
    const disabled = !state.active || Boolean(this.stopping) || (stop
      ? state.canStop === false || typeof this.adapter.stopPlayback !== 'function'
      : !state.canToggle || Boolean(this.pending));
    if (button.disabled !== disabled) button.disabled = disabled;
    if (button.classList.contains('is-playback-active') !== !!state.active) button.classList.toggle('is-playback-active', !!state.active);
  }
  async toggle(expectedSession) {
    const state = this.state();
    if (this.destroyed || this.pending || this.stopping || !state.active || !state.canToggle
      || (expectedSession !== undefined && expectedSession !== state.session)) return;
    const pending = this.pending = { session: state.session }; this.update();
    try {
      // Keep resume inside the user's click stack for mobile audio gesture requirements.
      await this.adapter.togglePlayback();
    } catch (error) { if (!this.destroyed && this.state().session === state.session) this.adapter.playbackError?.(error); }
    finally { if (this.pending === pending) this.pending = null; if (!this.destroyed) this.update(); }
  }
  async stop(expectedSession) {
    const state = this.state();
    if (this.destroyed || this.stopping || !state.active || state.canStop === false || typeof this.adapter.stopPlayback !== 'function'
      || (expectedSession !== undefined && expectedSession !== state.session)) return;
    // Stop must remain available while a pause/resume operation or synthesis is pending.
    const stopping = this.stopping = { session: state.session }; this.update();
    try { await this.adapter.stopPlayback(); }
    catch (error) { if (!this.destroyed && this.state().session === state.session) this.adapter.playbackError?.(error); }
    finally { if (this.stopping === stopping) this.stopping = null; if (!this.destroyed) this.update(); }
  }
  sync(views) { this.views = views; this.update(); this.floating?.configure(); }
  update() {
    if (this.destroyed) return;
    const state = this.state();
    if (this.pending && this.pending.session !== state.session) this.pending = null;
    if (this.stopping && this.stopping.session !== state.session) this.stopping = null;
    for (const button of this.buttons) this.paint(button, state);
    let view;
    if (this.plugin.settings.floatingPauseButton === true && state.active) {
      const active = this.plugin.app.workspace?.activeLeaf?.view;
      const candidate = active && this.views.includes(active) ? active : this.adapter.activeView?.();
      if (this.views.includes(candidate) && candidate.containerEl.isConnected) view = candidate;
    }
    if (view !== this.floating?.view) { this.floating?.destroy(); this.floating = null; }
    if (view && !this.floating) this.floating = new FloatingPauseButton(this, view);
    this.floating?.updateVisibility();
  }
  destroy() { this.destroyed = true; this.floating?.destroy(); this.floating = null; this.buttons.clear(); this.views = []; }
}

class FloatingPauseButton {
  constructor(controls, view) {
    this.controls = controls; this.view = view; this.host = view.containerEl; this.doc = this.host.ownerDocument; this.win = this.doc.defaultView;
    const position = this.win.getComputedStyle(this.host).position;
    this.ownedClass = (!position || position === 'static') && !this.host.classList.contains('cozy-playback-host');
    if (this.ownedClass) this.host.classList.add('cozy-playback-host');
    this.root = this.doc.createElement('div'); this.root.className = 'cozy-floating-controls'; this.host.append(this.root);
    this.button = controls.button(this.root); this.button.classList.add('cozy-floating-playback');
    this.stopSlot = this.doc.createElement('div'); this.stopSlot.className = 'cozy-floating-stop-slot'; this.root.append(this.stopSlot);
    this.stopButton = controls.button(this.stopSlot, 'stop'); this.stopButton.classList.add('cozy-floating-stop');
    this.touch = this.doc.body.classList.contains('is-mobile') || !this.win.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    this.enter = event => { this.input(event); this.hovered = !this.touch; this.updateVisibility(); };
    this.leave = () => { this.hovered = false; this.updateVisibility(true); };
    this.pointer = event => { this.pointerFocus = true; this.keyboardFocus = false; this.input(event); this.updateVisibility(); };
    this.focus = () => { if (!this.pointerFocus) this.keyboardFocus = true; this.updateVisibility(); };
    this.blur = event => {
      if (this.root.contains(event.relatedTarget)) return;
      this.pointerFocus = false; this.keyboardFocus = false; this.updateVisibility(true);
    };
    this.key = () => { this.pointerFocus = false; this.keyboardFocus = true; this.updateVisibility(); };
    this.root.addEventListener('pointerenter', this.enter); this.root.addEventListener('pointerleave', this.leave);
    this.root.addEventListener('pointerdown', this.pointer); this.root.addEventListener('focusin', this.focus);
    this.root.addEventListener('focusout', this.blur); this.root.addEventListener('keydown', this.key);
    this.resize = () => this.schedule();
    this.win.addEventListener('resize', this.resize);
    this.win.visualViewport?.addEventListener('resize', this.resize);
    this.win.visualViewport?.addEventListener('scroll', this.resize);
    if (this.win.ResizeObserver) this.observer = new this.win.ResizeObserver(this.resize);
    if (this.win.MutationObserver) this.attributes = new this.win.MutationObserver(this.resize);
    this.configure();
  }
  input(event) {
    if (['mouse', 'touch', 'pen'].includes(event.pointerType)) this.touch = this.doc.body.classList.contains('is-mobile') || event.pointerType !== 'mouse';
    this.root.classList.toggle('is-touch-controls', this.touch);
  }
  updateVisibility(delay = false) {
    if (this.destroyed) return;
    this.root.classList.toggle('is-touch-controls', this.touch);
    const enabled = this.controls.plugin.settings.floatingStopButton !== false && this.stopFits !== false;
    this.stopSlot.hidden = !enabled;
    if (!enabled && this.doc.activeElement === this.stopButton) this.button.focus({ preventScroll: true });
    const show = enabled && (this.touch || this.hovered || this.keyboardFocus);
    if (show || !enabled) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    if (show || !enabled) this.root.classList.toggle('is-expanded', !!show);
    else if (delay && !this.hideTimer) this.hideTimer = setTimeout(() => {
      this.hideTimer = null; this.root.classList.remove('is-expanded');
    }, 250);
    else if (!delay && !this.hideTimer) this.root.classList.remove('is-expanded');
  }
  configure() {
    if (this.destroyed) return;
    const obstacles = [...this.doc.querySelectorAll(OBSTACLES)];
    if (!this.obstacles || obstacles.length !== this.obstacles.length || obstacles.some((el, i) => el !== this.obstacles[i])) {
      this.obstacles = obstacles; this.observer?.disconnect(); this.attributes?.disconnect();
      this.observer?.observe(this.host); this.observer?.observe(this.button);
      for (const el of obstacles) {
        this.observer?.observe(el);
        this.attributes?.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      }
    }
    this.layout();
  }
  schedule() {
    if (this.destroyed || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.layout(); }, 40);
  }
  layout() {
    if (this.destroyed) return;
    const host = this.host.getBoundingClientRect(), viewport = this.win.visualViewport;
    const top = Math.max(host.top, viewport?.offsetTop || 0);
    const end = Math.min(host.bottom, (viewport?.offsetTop || 0) + (viewport?.height || this.win.innerHeight));
    const right = Math.min(host.right, (viewport?.offsetLeft || 0) + (viewport?.width || this.win.innerWidth));
    const style = this.win.getComputedStyle(this.button);
    const height = parseFloat(style.height) || 44, width = parseFloat(style.width) || 44;
    const safeBottom = parseFloat(style.scrollMarginBottom) || 0;
    const safeRight = parseFloat(style.scrollMarginRight) || 0;
    const x = right - 16 - safeRight - width; let bottom = end - 12 - safeBottom;
    const bars = (this.obstacles || []).map(el => {
      if (el.classList.contains('cozy-mini-panel')) return null;
      const rect = el.getBoundingClientRect(), css = this.win.getComputedStyle(el);
      return rect.width && rect.height && css.display !== 'none' && css.visibility !== 'hidden' ? rect : null;
    }).filter(Boolean).sort((a, b) => b.bottom - a.bottom);
    for (const rect of bars) {
      if (rect.left < x + width && rect.right > x && rect.top < bottom + 12 && rect.bottom > bottom - height - 12) bottom = rect.top - 12;
    }
    const outline = this.host.querySelector('.cozy-mini-panel:not([hidden])');
    const panel = outline?.getBoundingClientRect();
    const overlapsOutline = panel?.width && panel?.height && panel.left < x + width + 8 && panel.right > x - 8
      && panel.top < bottom + 8 && panel.bottom > bottom - height - 8;
    // On a very short viewport the outline's own pause control is available; do not cover its headings.
    this.root.hidden = this.button.hidden = !host.width || !host.height || !!overlapsOutline || x < Math.max(host.left, viewport?.offsetLeft || 0) + 8 || bottom - height < top + 12;
    this.root.style.setProperty('--cozy-playback-right', `${Math.max(16, host.right - x - width)}px`);
    this.root.style.setProperty('--cozy-playback-bottom', `${Math.max(12, host.bottom - bottom)}px`);
    const stopTop = bottom - 2 * height - 8, stopBottom = bottom - height;
    const blocked = rect => rect.left < x + width + 4 && rect.right > x - 4 && rect.top < stopBottom && rect.bottom > stopTop - 4;
    this.stopFits = stopTop >= top + 12 && !bars.some(blocked) && !(panel?.width && panel?.height && blocked(panel));
    this.updateVisibility();
  }
  destroy() {
    this.destroyed = true; clearTimeout(this.timer); clearTimeout(this.hideTimer); this.observer?.disconnect(); this.attributes?.disconnect();
    this.win.removeEventListener('resize', this.resize);
    this.win.visualViewport?.removeEventListener('resize', this.resize);
    this.win.visualViewport?.removeEventListener('scroll', this.resize);
    this.root.removeEventListener('pointerenter', this.enter); this.root.removeEventListener('pointerleave', this.leave);
    this.root.removeEventListener('pointerdown', this.pointer); this.root.removeEventListener('focusin', this.focus);
    this.root.removeEventListener('focusout', this.blur); this.root.removeEventListener('keydown', this.key);
    this.controls.forget(this.button); this.controls.forget(this.stopButton); this.root.remove();
    if (this.ownedClass) this.host.classList.remove('cozy-playback-host');
  }
}

function addFloatingPauseSetting(container, plugin, Setting) {
  const zh = plugin.settings.settingsLanguage === 'chinese';
  let stopSetting;
  new Setting(container).setName(zh ? '悬浮暂停／继续按钮' : 'Floating pause/resume button')
    .setDesc(zh ? '默认关闭。朗读或暂停时，在当前文档右下角显示一个独立按钮；停止或结束后隐藏。只控制已有朗读，不会开始新的朗读。'
      : 'Off by default. Show one independent button at the current document\'s lower-right during an active or paused reading session. Hidden after stop or completion; never starts new speech.')
    .addToggle(toggle => toggle.setValue(plugin.settings.floatingPauseButton === true).onChange(async value => {
      plugin.settings.floatingPauseButton = value; stopSetting.settingEl.hidden = !value;
      plugin.miniOutline?.sync(); await plugin.saveSettings();
    }));
  stopSetting = new Setting(container).setName(zh ? '显示停止按钮' : 'Show stop button')
    .setDesc(zh ? '在悬浮暂停／继续按钮上方显示停止按钮。桌面端悬停或键盘聚焦时显示，移开后收起；触屏端保持可见。'
      : 'Show Stop above the floating pause/resume button on hover or keyboard focus. It stays visible on touch devices.')
    .addToggle(toggle => toggle.setValue(plugin.settings.floatingStopButton !== false).onChange(async value => {
      plugin.settings.floatingStopButton = value; plugin.miniOutline?.sync(); await plugin.saveSettings();
    }));
  stopSetting.settingEl.addClass('cozy-reader-conditional');
  stopSetting.settingEl.hidden = plugin.settings.floatingPauseButton !== true;
}

module.exports = { PlaybackControls, FloatingPauseButton, addFloatingPauseSetting };
