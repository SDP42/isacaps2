// Runs in WhatsApp Web's own page context (world: MAIN). WhatsApp decrypts a voice note into a Blob and plays it from a
// blob: URL; this keeps a reference to audio blobs as they are created and hands them to the MIRAGE content script.
// Nothing leaves the page here: the content script sends a note to MIRAGE only when the user clicks its button.
(() => {
  const create = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    const url = create.apply(this, arguments);
    try {
      if (obj instanceof Blob && /^audio\//.test(obj.type)) window.postMessage({ __mirage: "audio", blob: obj, at: Date.now() }, location.origin);
    } catch (_) { /* never break the page */ }
    return url;
  };
})();
