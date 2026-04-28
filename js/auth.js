/* ============================================================
 * Brian's Toolkit - 通行碼驗證模組
 * ============================================================
 *
 * ⚠️ 給 Brian 看的:每月/每季換密碼,只要改下面這兩個值就好
 *
 * PASSWORD: 本期通行碼(學員輸入這個)
 * VALID_DAYS: 學員驗證後幾天內不用再輸(建議 7-30)
 *
 * ============================================================
 */

(function() {
  'use strict';

  // ============================================================
  // URL 參數切換 AI Provider(隱藏功能,只有 Brian 知道)
  // ?groq = 切到 Groq 模式 / ?claude = 切回 Claude 模式
  // ============================================================
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('groq')) {
      localStorage.setItem('ce_ai_provider', 'groq');
      const url = new URL(window.location.href);
      url.searchParams.delete('groq');
      window.history.replaceState({}, '', url.toString());
      console.log('🔧 已切換到 Groq 模式(管理者模式)');
    } else if (params.has('claude')) {
      localStorage.setItem('ce_ai_provider', 'claude');
      const url = new URL(window.location.href);
      url.searchParams.delete('claude');
      window.history.replaceState({}, '', url.toString());
      console.log('🔧 已切換到 Claude 模式');
    }
  } catch (e) {}

  // ============================================================
  // 設定區 ⬇️
  // ============================================================

  const PASSWORD = 'ceobrian';       // ← 改這裡換密碼

  const VALID_DAYS = 36500;          // ← 一次驗證有效幾天 (36500 = 100 年,等於永久)

  // ============================================================
  // 以下不用動
  // ============================================================

  const STORAGE_KEY = 'brian_auth_v1';

  function hash(str) {
    // 簡單的混淆,不是加密(因為前端沒有真正的加密)
    // 主要是讓密碼不要明文存在 localStorage
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
      h = h & h;
    }
    return h.toString(36);
  }

  const PASSWORD_HASH = hash(PASSWORD);

  function getStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setStored(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function clearStored() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function isVerified() {
    const data = getStored();
    if (!data) return false;
    // 密碼必須跟現在的一致(密碼換掉的話,舊紀錄就無效)
    if (data.h !== PASSWORD_HASH) {
      clearStored();
      return false;
    }
    // 過期檢查
    if (Date.now() > data.exp) {
      clearStored();
      return false;
    }
    return true;
  }

  function daysRemaining() {
    const data = getStored();
    if (!data || !isVerified()) return 0;
    const ms = data.exp - Date.now();
    return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }

  function verify(input) {
    if (hash(input) !== PASSWORD_HASH) return false;
    setStored({
      h: PASSWORD_HASH,
      exp: Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000
    });
    return true;
  }

  function logout() {
    clearStored();
  }

  // 暴露給其他頁面用
  window.BrianAuth = {
    isVerified,
    verify,
    logout,
    daysRemaining,
    // 給工具頁用:如果沒驗證就跳回首頁
    requireAuth: function() {
      if (!isVerified()) {
        // 找出回首頁的相對路徑(根據當前路徑深度)
        const depth = window.location.pathname.split('/').filter(Boolean).length - 1;
        const homePath = '../'.repeat(Math.max(0, depth)) + 'index.html';
        window.location.href = homePath;
        return false;
      }
      return true;
    }
  };
})();
