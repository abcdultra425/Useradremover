// ==UserScript==
// @name         유저 광고 제거
// @namespace    https://arca.live/
// @version      1.0.0
// @description  광고 링크에 차단 단어가 있으면 그 광고를 숨기거나 차단 표시로 바꿉니다.
// @match        https://arca.live/*
// @updateURL    https://raw.githubusercontent.com/abcdultra425/Useradremover/main/useradremover.user.js
// @downloadURL  https://raw.githubusercontent.com/abcdultra425/Useradremover/main/useradremover.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    if (window.__userAdRemover) return;
    window.__userAdRemover = true;

    // arca.live 출처의 localStorage. @grant none 인 iOS Safari에서도 동작하고,
    // 이 브라우저의 다음 방문까지 유지된다. 민감 정보 저장용은 아니다.
    const STORAGE_KEY = 'useradremover.settings.v1';
    const BLOCKED_LABEL = '[스크립트에 의해 차단된 광고]';
    const DEFAULTS = {
        enabled: true,
        action: 'hide',
        blockedWord: '',
        filterAllPosts: false,
        hideAllAds: false,
    };

    const settings = loadSettings();

    function loadSettings() {
        const next = {
            enabled: DEFAULTS.enabled,
            action: DEFAULTS.action,
            blockedWord: DEFAULTS.blockedWord,
            filterAllPosts: DEFAULTS.filterAllPosts,
            hideAllAds: DEFAULTS.hideAllAds,
        };

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return next;
            const parsed = JSON.parse(raw);
            if (typeof parsed.enabled === 'boolean') next.enabled = parsed.enabled;
            if (parsed.action === 'hide' || parsed.action === 'label') next.action = parsed.action;
            if (typeof parsed.blockedWord === 'string') next.blockedWord = parsed.blockedWord;
            if (typeof parsed.filterAllPosts === 'boolean') next.filterAllPosts = parsed.filterAllPosts;
            if (typeof parsed.hideAllAds === 'boolean') next.hideAllAds = parsed.hideAllAds;
        } catch (_) {
            // 저장소가 막혀 있으면 이번 페이지만 기본값으로 동작한다.
        }

        return next;
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                enabled: settings.enabled,
                action: settings.action,
                blockedWord: settings.blockedWord,
                filterAllPosts: settings.filterAllPosts,
                hideAllAds: settings.hideAllAds,
            }));
        } catch (_) {
            // 저장에 실패해도 현재 페이지의 필터는 유지한다.
        }
    }

    function pathnameOf(link) {
        if (link.pathname) return link.pathname;

        const href = link.getAttribute?.('href');
        if (!href) return '';

        try {
            return new URL(href, location.origin).pathname;
        } catch (_) {
            return '';
        }
    }

    function boardSlug(pathname, requirePostId) {
        const source = String(pathname || '');
        const match = requirePostId
            ? source.match(/^\/b\/([^/]+)\/\d+/i)
            : source.match(/^\/b\/([^/]+)/i);
        if (!match) return '';

        try {
            return decodeURIComponent(match[1]).toLowerCase();
        } catch (_) {
            return match[1].toLowerCase();
        }
    }

    function rowLinks(row) {
        const links = [];
        if (row.matches?.('a[href]')) links.push(row);
        if (row.querySelectorAll) {
            for (const link of row.querySelectorAll('a[href]')) links.push(link);
        }
        return links;
    }

    function rowTitle(row) {
        const title = row.querySelector?.('.vcol.col-title, .col-title');
        const source = title || row;
        return (source.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function blockedWords() {
        return settings.blockedWord
            .split(/\r?\n/)
            .map((word) => word.trim().toLowerCase())
            .filter(Boolean);
    }

    function textHasWord(text, words) {
        return words.some((word) => text.includes(word));
    }

    // 명시 모드는 링크와 제목을 지운 뒤에도 같은 행을 다시 판별해야 한다.
    const originals = new WeakMap();

    function signals(row) {
        const saved = originals.get(row);
        if (saved) return saved;

        return {
            ownPath: pathnameOf(row),
            linkPaths: rowLinks(row).map((link) => pathnameOf(link)),
            title: rowTitle(row),
        };
    }

    function matches(row) {
        const words = blockedWords();
        if (words.length === 0 || row.classList?.contains('head')) return false;

        const info = signals(row);

        // 기본값은 기존 스크립트와 같다. 상단 유저 광고에 쓰이는 column 행만,
        // 글 주소(/b/채널/글번호)의 채널에 차단 단어가 있을 때 걸린다.
        if (!settings.filterAllPosts) {
            return row.matches?.('a.vrow.column')
                && textHasWord(boardSlug(info.ownPath, true), words);
        }

        // 실시간·베스트 목록은 글 주소가 /b/live/글번호 로 바뀌고,
        // 실제 채널은 행 안 배지 주소(/b/채널)에 남아 있다.
        for (const path of info.linkPaths) {
            if (textHasWord(boardSlug(path, false), words)) return true;
        }

        return textHasWord(info.title, words);
    }

    function adMark(row) {
        if (row.querySelector?.('.vcol.col-ad, #textad')) return true;
        const idCell = row.querySelector?.('.vcol.col-id');
        return (idCell?.textContent || '').replace(/\s+/g, ' ').trim() === '광고';
    }

    function isAdRow(row) {
        if (row.classList?.contains('head')) return false;
        const saved = originals.get(row);
        if (saved?.isAd) return true;
        return adMark(row);
    }

    function candidates() {
        const parts = [settings.hideAllAds ? 'a.vrow.column' : 'a.vrow.column[href]'];
        if (settings.filterAllPosts) {
            parts.push('.article-list .vrow', '.included-article-list .vrow');
        }
        const nodes = new Set(document.querySelectorAll(parts.join(', ')));

        for (const node of document.querySelectorAll('[data-useradremover-hidden], [data-useradremover-labeled]')) {
            nodes.add(node);
        }

        return nodes;
    }

    function remember(row) {
        if (originals.has(row) || row.getAttribute('data-useradremover-labeled') === '1') return;

        originals.set(row, {
            html: row.innerHTML,
            href: row.getAttribute('href'),
            hadHref: row.hasAttribute('href'),
            pointerEvents: row.style.pointerEvents,
            tabIndex: row.hasAttribute('tabindex') ? row.getAttribute('tabindex') : null,
            isAd: adMark(row),
            ownPath: pathnameOf(row),
            linkPaths: rowLinks(row).map((link) => pathnameOf(link)),
            title: rowTitle(row),
        });
    }

    function restoreContent(row) {
        const saved = originals.get(row);
        row.removeAttribute('data-useradremover-labeled');
        if (!saved) return;

        row.innerHTML = saved.html;
        if (saved.hadHref) row.setAttribute('href', saved.href ?? '');
        else row.removeAttribute('href');
        row.style.pointerEvents = saved.pointerEvents || '';
        if (saved.tabIndex == null) row.removeAttribute('tabindex');
        else row.setAttribute('tabindex', saved.tabIndex);
        originals.delete(row);
    }

    function hide(row) {
        if (row.getAttribute('data-useradremover-labeled') === '1') restoreContent(row);
        if (row.getAttribute('data-useradremover-hidden') === '1') return;
        row.setAttribute('data-useradremover-hidden', '1');
        row.style.setProperty('display', 'none', 'important');
    }

    function markLabeled(row) {
        if (row.getAttribute('data-useradremover-hidden') === '1') {
            row.removeAttribute('data-useradremover-hidden');
            row.style.removeProperty('display');
        }

        remember(row);
        if (row.getAttribute('data-useradremover-labeled') === '1') return;

        row.setAttribute('data-useradremover-labeled', '1');
        row.removeAttribute('href');
        row.tabIndex = -1;
        row.style.pointerEvents = 'none';

        const note = document.createElement('span');
        note.textContent = BLOCKED_LABEL;
        row.replaceChildren(note);
    }

    function release(row) {
        if (originals.has(row) || row.getAttribute('data-useradremover-labeled') === '1') restoreContent(row);
        if (row.getAttribute('data-useradremover-hidden') !== '1') return;
        row.removeAttribute('data-useradremover-hidden');
        row.style.removeProperty('display');
    }

    function applyFilter() {
        if (!settings.enabled) {
            for (const row of document.querySelectorAll('[data-useradremover-hidden], [data-useradremover-labeled]')) {
                release(row);
            }
            return;
        }

        for (const row of candidates()) {
            if (settings.hideAllAds && isAdRow(row)) {
                hide(row);
                continue;
            }

            if (matches(row)) {
                if (settings.action === 'label') markLabeled(row);
                else hide(row);
            } else {
                release(row);
            }
        }
    }

    function blockLabeledActivation(event) {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        if (!target.closest('[data-useradremover-labeled]')) return;
        event.preventDefault();
        event.stopPropagation();
    }

    let scheduled = false;

    function scheduleApply() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            applyFilter();
            placeButton();
        });
    }

    const host = document.createElement('div');
    host.id = 'useradremover-root';
    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
        <style>
            :host {
                position: fixed;
                inset: 0;
                z-index: 2147483000;
                pointer-events: none;
                color: #1c1c1e;
                font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                letter-spacing: 0;
                -webkit-font-smoothing: antialiased;
            }

            button, textarea, select {
                font: inherit;
            }

            .launcher {
                position: absolute;
                right: var(--uar-right, 12px);
                bottom: var(--uar-bottom, calc(12px + env(safe-area-inset-bottom, 0px)));
                width: 40px;
                height: 40px;
                display: grid;
                place-items: center;
                padding: 0;
                border: 1px solid rgba(255, 255, 255, 0.28);
                border-radius: 999px;
                background: rgba(28, 28, 30, 0.92);
                color: #fff;
                box-shadow: 0 1px 1px rgba(0, 0, 0, 0.12), 0 8px 20px rgba(0, 0, 0, 0.28);
                pointer-events: auto;
                touch-action: manipulation;
                cursor: pointer;
            }

            .launcher svg {
                display: block;
            }

            .launcher:focus-visible {
                outline: 2px solid #fff;
                outline-offset: 3px;
            }

            .launcher:active {
                transform: scale(0.96);
            }

            .backdrop {
                position: absolute;
                inset: 0;
                display: flex;
                justify-content: center;
                align-items: flex-start;
                padding:
                    calc(16px + env(safe-area-inset-top, 0px))
                    16px
                    calc(16px + env(safe-area-inset-bottom, 0px));
                background: rgba(0, 0, 0, 0.48);
                pointer-events: auto;
            }

            .backdrop[hidden] {
                display: none;
            }

            .panel {
                width: min(100%, 300px);
                margin-top: 10vh;
                padding: 12px;
                border: 1px solid rgba(0, 0, 0, 0.08);
                border-radius: 12px;
                background: #fff;
                box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04), 0 12px 28px rgba(0, 0, 0, 0.18);
            }

            .head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin-bottom: 8px;
            }

            h2 {
                margin: 0;
                font-size: 15px;
                line-height: 1.3;
                font-weight: 650;
                text-wrap: balance;
            }

            .close {
                width: 28px;
                height: 28px;
                display: grid;
                place-items: center;
                padding: 0;
                border: 0;
                border-radius: 8px;
                background: transparent;
                color: #3a3a3c;
                cursor: pointer;
            }

            .close:focus-visible {
                outline: 2px solid #0a84ff;
                outline-offset: 2px;
            }

            .field {
                display: grid;
                gap: 4px;
                margin-bottom: 8px;
            }

            .field span,
            .option strong {
                font-size: 12px;
                font-weight: 600;
            }

            textarea {
                width: 100%;
                box-sizing: border-box;
                height: 88px;
                margin: 0;
                padding: 6px 8px;
                border: 1px solid rgba(60, 60, 67, 0.28);
                border-radius: 8px;
                background: #fff;
                color: #1c1c1e;
                font-size: 16px;
                line-height: 1.35;
                resize: vertical;
            }

            textarea:focus,
            select:focus {
                outline: 2px solid #0a84ff;
                outline-offset: 1px;
                border-color: transparent;
            }

            select {
                width: 100%;
                box-sizing: border-box;
                height: 34px;
                margin: 0;
                padding: 0 8px;
                border: 1px solid rgba(60, 60, 67, 0.28);
                border-radius: 8px;
                background: #fff;
                color: #1c1c1e;
                font-size: 16px;
            }

            .hint, .option small {
                color: #636366;
                font-size: 12px;
                line-height: 1.4;
                text-wrap: pretty;
            }

            .options {
                display: grid;
                gap: 6px;
            }

            .option {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                padding: 7px 8px;
                border: 1px solid rgba(60, 60, 67, 0.16);
                border-radius: 8px;
                cursor: pointer;
            }

            .option input {
                width: 16px;
                height: 16px;
                margin: 1px 0 0;
                flex: 0 0 auto;
                accent-color: #0a84ff;
            }

            .option span {
                display: grid;
                gap: 2px;
            }

            @media (prefers-reduced-motion: reduce) {
                .launcher:active {
                    transform: none;
                }
            }
        </style>
        <button class="launcher" type="button" aria-label="유저 광고 제거 설정" aria-expanded="false">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16"/>
                <circle cx="8" cy="7" r="2.2" fill="currentColor" stroke="none"/>
                <circle cx="15" cy="12" r="2.2" fill="currentColor" stroke="none"/>
                <circle cx="10" cy="17" r="2.2" fill="currentColor" stroke="none"/>
            </svg>
        </button>
        <div class="backdrop" hidden>
            <div class="panel" role="dialog" aria-modal="true" aria-labelledby="uar-title">
                <div class="head">
                    <h2 id="uar-title">유저 광고 제거</h2>
                    <button class="close" type="button" aria-label="닫기">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/>
                        </svg>
                    </button>
                </div>
                <label class="option">
                    <input type="checkbox" name="enabled">
                    <span><strong>활성화</strong></span>
                </label>
                <label class="field">
                    <span>동작</span>
                    <select name="action">
                        <option value="hide">숨김</option>
                        <option value="label">차단된 광고 명시</option>
                    </select>
                </label>
                <label class="field">
                    <span>차단 단어</span>
                    <textarea name="blockedWord" rows="4" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="enter" placeholder="arca.live/b/&lt;차단할 채널&gt;/글번호&#10;예: example"></textarea>
                    <small class="hint">광고 링크에 아래 단어가 들어 있으면 그 광고를 차단합니다. 한 줄에 하나씩 입력합니다.</small>
                </label>
                <div class="options">
                    <label class="option">
                        <input type="checkbox" name="hideAllAds">
                        <span>
                            <strong>광고 전체 숨김</strong>
                            <small>단어와 상관없이 유저 광고를 숨깁니다. 입력한 단어는 그대로 둡니다.</small>
                        </span>
                    </label>
                    <label class="option">
                        <input type="checkbox" name="filterAllPosts">
                        <span>
                            <strong>게시글 전역에 적용</strong>
                            <small>목록의 글도 차단합니다. 채널 주소와 제목을 함께 확인합니다.</small>
                        </span>
                    </label>
                </div>
            </div>
        </div>
    `;

    const launcher = shadow.querySelector('.launcher');
    const backdrop = shadow.querySelector('.backdrop');
    const panel = shadow.querySelector('.panel');
    const wordInput = shadow.querySelector('textarea[name="blockedWord"]');
    const enabledInput = shadow.querySelector('input[name="enabled"]');
    const actionInput = shadow.querySelector('select[name="action"]');
    const allPostsInput = shadow.querySelector('input[name="filterAllPosts"]');
    const hideAllAdsInput = shadow.querySelector('input[name="hideAllAds"]');
    const closeButton = shadow.querySelector('.close');

    wordInput.value = settings.blockedWord;
    enabledInput.checked = settings.enabled;
    actionInput.value = settings.action;
    allPostsInput.checked = settings.filterAllPosts;
    hideAllAdsInput.checked = settings.hideAllAds;

    let lastFocus = null;

    function openModal() {
        lastFocus = shadow.activeElement || document.activeElement;
        backdrop.hidden = false;
        launcher.setAttribute('aria-expanded', 'true');
        wordInput.focus();
    }

    function closeModal() {
        backdrop.hidden = true;
        launcher.setAttribute('aria-expanded', 'false');
        if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }

    function placeButton() {
        const nav = document.querySelector('.nav-control');
        const rect = nav?.getBoundingClientRect();
        if (!rect || rect.width < 1 || rect.height < 1) {
            host.style.removeProperty('--uar-right');
            host.style.removeProperty('--uar-bottom');
            return;
        }

        const right = Math.max(12, window.innerWidth - rect.right);
        const bottom = Math.max(12, window.innerHeight - rect.top + 10);
        host.style.setProperty('--uar-right', `${right}px`);
        host.style.setProperty('--uar-bottom', `${bottom}px`);
    }

    launcher.addEventListener('click', openModal);
    closeButton.addEventListener('click', closeModal);

    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) closeModal();
    });

    panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            closeModal();
        }
    });

    wordInput.addEventListener('input', () => {
        settings.blockedWord = wordInput.value;
        saveSettings();
        applyFilter();
    });

    enabledInput.addEventListener('change', () => {
        settings.enabled = enabledInput.checked;
        saveSettings();
        applyFilter();
    });

    actionInput.addEventListener('change', () => {
        settings.action = actionInput.value === 'label' ? 'label' : 'hide';
        saveSettings();
        applyFilter();
    });

    allPostsInput.addEventListener('change', () => {
        settings.filterAllPosts = allPostsInput.checked;
        saveSettings();
        applyFilter();
    });

    hideAllAdsInput.addEventListener('change', () => {
        settings.hideAllAds = hideAllAdsInput.checked;
        saveSettings();
        applyFilter();
    });

    document.addEventListener('click', blockLabeledActivation, true);
    document.addEventListener('auxclick', blockLabeledActivation, true);

    window.addEventListener('resize', placeButton);

    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    document.documentElement.appendChild(host);
    applyFilter();
    placeButton();
})();
