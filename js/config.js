// js/config.js — Configuración y estado global de la PWA

const Config = (() => {
  const KEY_URL = "rmn_api_url";
  const KEY_ROL = "rmn_rol";
  const DEFAULT_URL = "https://script.google.com/macros/s/AKfycbz-fzW9c4tVFfE1gmmzA4G3hJtEXHgaF35xGThLbOR2ZuIOXGDh_Ru-6UkWlZfS1WRv/exec";

  return {
    getUrl()  { return localStorage.getItem(KEY_URL) || DEFAULT_URL; },
    setUrl(v) { localStorage.setItem(KEY_URL, v.trim()); },
    clearUrl(){ localStorage.removeItem(KEY_URL); },

    getRol()  { return localStorage.getItem(KEY_ROL) || ""; },
    setRol(v) { localStorage.setItem(KEY_ROL, v); },

    isReady() { return !!this.getUrl(); },

    // Valida PIN contra la API — devuelve Promise<boolean>
    async validarPin(rol, pin) {
      try {
        const res = await fetch(
          this.getUrl() +
          "?action=validarPin&rol=" + encodeURIComponent(rol) +
          "&pin=" + encodeURIComponent(pin),
          { redirect: "follow" }
        );
        const json = await res.json();
        return json.ok === true && json.data && json.data.valido === true;
      } catch(e) {
        console.error("validarPin error:", e);
        return false;
      }
    }
  };
})();