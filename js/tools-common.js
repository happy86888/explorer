/* ============================================================
 * Brian's Toolkit - 工具共用 JS 模組
 * 提供:API Key 管理、Claude API 呼叫、本地儲存、HTML escape
 * ============================================================ */

(function() {
  'use strict';

  const STORAGE_KEY_API = 'ce_anthropic_api_key';

  // === API Key 管理 ===
  function getApiKey() {
    try { return localStorage.getItem(STORAGE_KEY_API) || ''; } catch (e) { return ''; }
  }
  function setApiKey(key) {
    try { localStorage.setItem(STORAGE_KEY_API, key); } catch (e) {}
  }

  // === 呼叫 Claude API ===
  async function callClaude(prompt, options) {
    options = options || {};
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('尚未設定 API Key');

    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: options.maxTokens || 4000,
      messages: options.messages || [{ role: 'user', content: prompt }]
    };
    if (options.system) body.system = options.system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const t = await response.text();
      throw new Error(`API ${response.status}: ${t.substring(0, 150)}`);
    }

    const data = await response.json();
    let text = data.content.map(b => b.text || '').join('').trim();

    if (options.parseJson) {
      text = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      return JSON.parse(text);
    }
    return text;
  }

  // === 本地儲存(每個工具獨立 namespace) ===
  function createStorage(namespace) {
    const STORAGE_KEY = 'ce_' + namespace + '_records';

    return {
      loadAll: function() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
        catch (e) { return {}; }
      },
      saveAll: function(records) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch (e) {}
      },
      save: function(id, record) {
        const all = this.loadAll();
        all[id] = record;
        this.saveAll(all);
      },
      load: function(id) {
        return this.loadAll()[id] || null;
      },
      delete: function(id) {
        const all = this.loadAll();
        delete all[id];
        this.saveAll(all);
      },
      list: function() {
        return Object.values(this.loadAll()).sort((a, b) => b.createdAt - a.createdAt);
      }
    };
  }

  // === HTML escape ===
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
              .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth()+1}/${d.getDate()}`;
  }

  // === API Key Modal helpers ===
  function setupApiKeyModal(modalId, inputId, saveBtnId) {
    const modal = document.getElementById(modalId);
    const input = document.getElementById(inputId);
    const saveBtn = document.getElementById(saveBtnId);
    if (!modal || !input || !saveBtn) return;

    function show() {
      input.value = getApiKey();
      modal.classList.add('show');
    }
    function hide() { modal.classList.remove('show'); }

    saveBtn.addEventListener('click', () => {
      const key = input.value.trim();
      if (!key.startsWith('sk-ant-')) {
        alert('API Key 格式不對,應該以 sk-ant- 開頭');
        return;
      }
      setApiKey(key);
      hide();
    });

    return { show, hide };
  }

  // === 暴露給工具用 ===
  window.BrianTools = {
    getApiKey, setApiKey,
    callClaude,
    createStorage,
    escapeHtml, formatDate,
    setupApiKeyModal
  };
})();
