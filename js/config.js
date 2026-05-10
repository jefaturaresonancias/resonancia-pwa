// js/config.js — Configuración y estado global de la PWA

const Config = (() => {
  const KEY_URL = "rmn_api_url";
  const KEY_ROL = "rmn_rol";

  return {
    getUrl()  { return localStorage.getItem(KEY_URL) || ""; },
    setUrl(v) { localStorage.setItem(KEY_URL, v.trim()); },
    clearUrl(){ localStorage.removeItem(KEY_URL); },

    getRol()  { return localStorage.getItem(KEY_ROL) || ""; },
    setRol(v) { localStorage.setItem(KEY_ROL, v); },

    isReady() { return !!this.getUrl(); }
  };
})();
