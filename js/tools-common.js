/* ============================================================
 * Brian's Toolkit - 工具共用 JS 模組
 * 提供:API Key 管理、AI API 呼叫(Claude / Gemini)、本地儲存、HTML escape
 *
 * 預設用 Claude(學員)
 * 在 URL 加 ?gemini 切換成 Gemini 模式(管理者用)
 * 切換後會記住,下次進入仍是 Gemini,直到加 ?claude 切回
 * ============================================================ */

(function() {
  'use strict';

  // === Storage Keys ===
  const STORAGE_KEY_PROVIDER = 'ce_ai_provider';
  const STORAGE_KEY_CLAUDE = 'ce_anthropic_api_key';
  const STORAGE_KEY_GEMINI = 'ce_gemini_api_key';

  // === URL 參數切換(只有 Brian 知道) ===
  // ?gemini = 切到 Gemini 模式
  // ?claude = 切回 Claude 模式
  function checkUrlSwitch() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('gemini')) {
        localStorage.setItem(STORAGE_KEY_PROVIDER, 'gemini');
        // 清掉 URL 參數,避免分享出去
        const url = new URL(window.location.href);
        url.searchParams.delete('gemini');
        window.history.replaceState({}, '', url.toString());
        console.log('🔧 已切換到 Gemini 模式');
      } else if (params.has('claude')) {
        localStorage.setItem(STORAGE_KEY_PROVIDER, 'claude');
        const url = new URL(window.location.href);
        url.searchParams.delete('claude');
        window.history.replaceState({}, '', url.toString());
        console.log('🔧 已切換到 Claude 模式');
      }
    } catch (e) {}
  }
  checkUrlSwitch();

  // === Provider 管理 ===
  function getProvider() {
    try { return localStorage.getItem(STORAGE_KEY_PROVIDER) || 'claude'; }
    catch (e) { return 'claude'; }
  }
  function setProvider(p) {
    try { localStorage.setItem(STORAGE_KEY_PROVIDER, p); } catch (e) {}
  }

  // === API Key 管理 ===
  function getApiKey(provider) {
    provider = provider || getProvider();
    const key = provider === 'gemini' ? STORAGE_KEY_GEMINI : STORAGE_KEY_CLAUDE;
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }
  function setApiKey(value, provider) {
    provider = provider || getProvider();
    const key = provider === 'gemini' ? STORAGE_KEY_GEMINI : STORAGE_KEY_CLAUDE;
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  // === 呼叫 AI(自動切換 Claude/Gemini) ===
  async function callClaude(prompt, options) {
    options = options || {};
    const provider = getProvider();
    const apiKey = getApiKey(provider);
    if (!apiKey) throw new Error('尚未設定 API Key');

    if (provider === 'gemini') {
      return await callGeminiInternal(prompt, options, apiKey);
    } else {
      return await callClaudeInternal(prompt, options, apiKey);
    }
  }

  // === Claude API ===
  async function callClaudeInternal(prompt, options, apiKey) {
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
      throw new Error(`Claude API ${response.status}: ${t.substring(0, 150)}`);
    }

    const data = await response.json();
    let text = data.content.map(b => b.text || '').join('').trim();
    return parseResponse(text, options);
  }

  // === Gemini API(免費版) ===
  async function callGeminiInternal(prompt, options, apiKey) {
    const model = 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let fullPrompt = prompt;
    if (options.system) {
      fullPrompt = options.system + '\n\n' + prompt;
    }

    const body = {
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: {
        maxOutputTokens: options.maxTokens || 4000,
        temperature: 0.7
      }
    };

    if (options.parseJson) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const t = await response.text();
      throw new Error(`Gemini API ${response.status}: ${t.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '').join('').trim();

    if (!text) {
      throw new Error('Gemini 沒有回應內容,可能是 prompt 太長或被安全機制擋下');
    }

    return parseResponse(text, options);
  }

  // === 統一解析回應 ===
  function parseResponse(text, options) {
    if (options.parseJson) {
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('AI 回應的 JSON 格式有誤,可能是模型輸出不穩定。試試重新產生一次。\n\n錯誤:' + e.message + '\n\n原始回應前 200 字:' + text.substring(0, 200));
      }
    }
    return text;
  }

  // === 本地儲存 ===
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
        const all = this.loadAll(); all[id] = record; this.saveAll(all);
      },
      load: function(id) { return this.loadAll()[id] || null; },
      delete: function(id) {
        const all = this.loadAll(); delete all[id]; this.saveAll(all);
      },
      list: function() {
        return Object.values(this.loadAll()).sort((a, b) => b.createdAt - a.createdAt);
      }
    };
  }

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
  // 自動根據目前 provider 顯示對應提示
  function setupApiKeyModal(modalId, inputId, saveBtnId) {
    const modal = document.getElementById(modalId);
    const input = document.getElementById(inputId);
    const saveBtn = document.getElementById(saveBtnId);
    if (!modal || !input || !saveBtn) return;

    function refreshDisplay() {
      const provider = getProvider();
      input.value = getApiKey(provider);
      input.placeholder = provider === 'gemini'
        ? 'AIza...(Gemini API Key)'
        : 'sk-ant-api03-xxxxxxxxxxxxxxxxx';

      // 切換 modal 內文為對應 provider
      const bodyEl = modal.querySelector('.ce-modal-body');
      const costEl = modal.querySelector('.ce-modal-cost');

      if (provider === 'gemini') {
        if (bodyEl) {
          bodyEl.innerHTML = `
            這個工具用 <strong>Google Gemini AI</strong>(免費版)幫你運作。<br/>
            <strong>申請步驟(一次性):</strong><br/>
            1. 到 <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a><br/>
            2. 用 Google 帳號登入<br/>
            3. 點 Create API key → 複製 AIza 開頭的 Key<br/>
            4. 貼到下方輸入框
          `;
        }
        if (costEl) {
          costEl.innerHTML = `<strong>費用:</strong>完全免費(每天 50 次、每分鐘 15 次的額度)。Key 只存在你瀏覽器。`;
        }
      } else {
        // Claude 模式 - 還原成原本內文
        if (bodyEl) {
          bodyEl.innerHTML = `
            這個工具用 <strong>Anthropic Claude AI</strong> 幫你運作。<br/>
            為了保護你的資料和費用,你需要使用<strong>自己的 API Key</strong>。<br/><br/>
            <strong>申請步驟(一次性):</strong><br/>
            1. 到 <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a> 註冊<br/>
            2. API Keys → Create Key<br/>
            3. 複製 sk-ant- 開頭的 Key 貼到下面<br/>
            4. 在 Billing 充值最低 5 美金
          `;
        }
        if (costEl) {
          costEl.innerHTML = `<strong>費用估算:</strong>每次產出約 NT$1-3,5 美金可用幾百次。Key 只存在你瀏覽器,不會傳到任何第三方。`;
        }
      }

      // 顯示 GEMINI MODE 提示(只在 Gemini 模式)
      const indicator = modal.querySelector('.ce-provider-indicator');
      if (provider === 'gemini') {
        if (!indicator) {
          const div = document.createElement('div');
          div.className = 'ce-provider-indicator';
          div.style.cssText = 'background:#4a5d3a;color:white;padding:10px 14px;margin-bottom:14px;font-family:monospace;font-size:12px;letter-spacing:0.1em;border-radius:2px;';
          div.innerHTML = '🔧 GEMINI MODE · 管理者模式(學員看不到此提示)';
          modal.querySelector('.ce-modal').insertBefore(div, modal.querySelector('.ce-modal-eyebrow'));
        }
      } else if (indicator) {
        indicator.remove();
      }
    }

    function show() { refreshDisplay(); modal.classList.add('show'); }
    function hide() { modal.classList.remove('show'); }

    saveBtn.addEventListener('click', () => {
      const key = input.value.trim();
      const provider = getProvider();

      if (provider === 'claude') {
        if (!key.startsWith('sk-ant-')) {
          alert('Claude API Key 格式不對,應該以 sk-ant- 開頭');
          return;
        }
      } else if (provider === 'gemini') {
        if (!key.startsWith('AIza')) {
          alert('Gemini API Key 格式不對,應該以 AIza 開頭');
          return;
        }
      }

      setApiKey(key, provider);
      hide();
    });

    // 初次載入就刷新一次,讓還沒打開 modal 時也能正確顯示
    refreshDisplay();

    return { show, hide };
  }

  // === 暴露給工具用 ===
  window.BrianTools = {
    getApiKey, setApiKey,
    getProvider, setProvider,
    callClaude,
    createStorage,
    escapeHtml, formatDate,
    setupApiKeyModal
  };
})();
