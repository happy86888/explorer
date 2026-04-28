/* ============================================================
 * Brian's Toolkit - 工具共用 JS 模組
 * 提供:API Key 管理、AI API 呼叫(Claude / Groq)、本地儲存、HTML escape
 *
 * 預設用 Claude(學員)
 * 在 URL 加 ?groq 切換成 Groq 模式(管理者測試用)
 * ?claude 切回 Claude 模式
 * ============================================================ */

(function() {
  'use strict';

  // === Storage Keys ===
  const STORAGE_KEY_PROVIDER = 'ce_ai_provider';
  const STORAGE_KEY_CLAUDE = 'ce_anthropic_api_key';
  const STORAGE_KEY_GROQ = 'ce_groq_api_key';

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
    const key = provider === 'groq' ? STORAGE_KEY_GROQ : STORAGE_KEY_CLAUDE;
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }
  function setApiKey(value, provider) {
    provider = provider || getProvider();
    const key = provider === 'groq' ? STORAGE_KEY_GROQ : STORAGE_KEY_CLAUDE;
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  // === 呼叫 AI(自動切換 Claude/Groq) ===
  async function callClaude(prompt, options) {
    options = options || {};
    const provider = getProvider();
    const apiKey = getApiKey(provider);
    if (!apiKey) throw new Error('尚未設定 API Key');

    if (provider === 'groq') {
      return await callGroqInternal(prompt, options, apiKey);
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

  // === Groq API(免費版,OpenAI 相容介面) ===
  async function callGroqInternal(prompt, options, apiKey) {
    // Groq 免費可用模型,從強到弱依序試,遇到 rate limit 自動降級
    const models = [
      'llama-3.3-70b-versatile',     // 最強免費模型,中文還可以
      'llama-3.1-8b-instant',        // 較小但快
      'gemma2-9b-it'                 // Google Gemma,備用
    ];

    const messages = [];
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }
    messages.push({ role: 'user', content: prompt });

    let lastError = null;

    for (const model of models) {
      const body = {
        model: model,
        messages: messages,
        max_tokens: options.maxTokens || 4000,
        temperature: 0.7
      };

      // Groq 支援原生 JSON 模式(部分模型)
      if (options.parseJson) {
        body.response_format = { type: 'json_object' };
      }

      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(body)
        });

        if (response.ok) {
          const data = await response.json();
          const text = (data.choices?.[0]?.message?.content || '').trim();

          if (!text) {
            throw new Error('Groq 沒有回應內容');
          }

          if (model !== models[0]) {
            console.log(`🔧 Groq ${models[0]} 不可用,自動切換到 ${model}`);
          }
          return parseResponse(text, options);
        }

        // 429 / 5xx 嘗試下一個模型
        if (response.status === 429 || response.status >= 500) {
          console.log(`⚠️ Groq ${model} 失敗(${response.status}),試下一個...`);
          lastError = await response.text();
          continue;
        }

        // 其他錯誤直接丟出
        const errText = await response.text();
        throw new Error(`Groq API ${response.status}: ${errText.substring(0, 200)}`);

      } catch (e) {
        lastError = e.message || String(e);
        if (!String(lastError).includes('429') && !String(lastError).includes('失敗')) {
          throw e;
        }
      }
    }

    throw new Error(`Groq 全部模型都不可用。\n\n建議:\n1. 等 1 分鐘再試\n2. 或在網址加 ?claude 切回 Claude 模式\n\n細節:${String(lastError).substring(0, 200)}`);
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
  function setupApiKeyModal(modalId, inputId, saveBtnId) {
    const modal = document.getElementById(modalId);
    const input = document.getElementById(inputId);
    const saveBtn = document.getElementById(saveBtnId);
    if (!modal || !input || !saveBtn) return;

    function refreshDisplay() {
      const provider = getProvider();
      input.value = getApiKey(provider);
      input.placeholder = provider === 'groq'
        ? 'gsk_...(Groq API Key)'
        : 'sk-ant-api03-xxxxxxxxxxxxxxxxx';

      // 切換 modal 內文
      const bodyEl = modal.querySelector('.ce-modal-body');
      const costEl = modal.querySelector('.ce-modal-cost');

      if (provider === 'groq') {
        if (bodyEl) {
          bodyEl.innerHTML = `
            這個工具用 <strong>Groq AI</strong>(免費版,Llama 3.3 70B 模型)幫你運作。<br/>
            <strong>申請步驟(一次性):</strong><br/>
            1. 到 <a href="https://console.groq.com/keys" target="_blank">console.groq.com/keys</a><br/>
            2. 用 Google 帳號登入<br/>
            3. 點 Create API Key → 複製 gsk_ 開頭的 Key<br/>
            4. 貼到下方輸入框
          `;
        }
        if (costEl) {
          costEl.innerHTML = `<strong>費用:</strong>完全免費(每分鐘 30 次,不用綁信用卡)。Key 只存在你瀏覽器。`;
        }
      } else {
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

      // GROQ MODE 提示(只在 Groq 模式)
      const indicator = modal.querySelector('.ce-provider-indicator');
      if (provider === 'groq') {
        if (!indicator) {
          const div = document.createElement('div');
          div.className = 'ce-provider-indicator';
          div.style.cssText = 'background:#4a5d3a;color:white;padding:10px 14px;margin-bottom:14px;font-family:monospace;font-size:12px;letter-spacing:0.1em;border-radius:2px;';
          div.innerHTML = '🔧 GROQ MODE · 管理者模式(學員看不到此提示)';
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
      } else if (provider === 'groq') {
        if (!key.startsWith('gsk_')) {
          alert('Groq API Key 格式不對,應該以 gsk_ 開頭');
          return;
        }
      }

      setApiKey(key, provider);
      hide();
    });

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
