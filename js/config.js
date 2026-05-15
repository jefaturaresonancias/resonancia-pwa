// js/config.js — Configuración y estado global de la PWA

const Config = (() => {
  const KEY_URL      = "rmn_api_url";
  const KEY_ROL      = "rmn_rol";
  const KEY_PIN_JEF  = "rmn_pin_jefatura";
  const KEY_PIN_ADM  = "rmn_pin_admin";

  return {
    getUrl()  { return localStorage.getItem(KEY_URL) || ""; },
    setUrl(v) { localStorage.setItem(KEY_URL, v.trim()); },
    clearUrl(){ localStorage.removeItem(KEY_URL); },

    getRol()  { return localStorage.getItem(KEY_ROL) || ""; },
    setRol(v) { localStorage.setItem(KEY_ROL, v); },

    isReady() { return !!this.getUrl(); },

    getPinJefatura()  { return localStorage.getItem(KEY_PIN_JEF) || "1234"; },
    setPinJefatura(v) { localStorage.setItem(KEY_PIN_JEF, v); },
    getPinAdmin()     { return localStorage.getItem(KEY_PIN_ADM) || "2026"; },
    setPinAdmin(v)    { localStorage.setItem(KEY_PIN_ADM, v); }
  };
})();
