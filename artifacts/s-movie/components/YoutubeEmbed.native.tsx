import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export interface YoutubeEmbedRef {
  injectJavaScript: (js: string) => void;
}

interface YoutubeEmbedProps {
  videoKey: string;
  muted?: boolean;
  controls?: boolean;
  loop?: boolean;
  style?: any;
  onError?: () => void;
}

// ── Anti-detection shim ─────────────────────────────────────────────────────
// Injected BEFORE page load so YouTube cannot detect we are a WebView.
// Also injects a <style> tag early so branding classes are hidden from the
// very first paint — nothing ever flashes before our CSS kicks in.
const INJECT_BEFORE = `
(function() {
  /* 1. Spoof browser fingerprint so YouTube serves HD streams */
  try { Object.defineProperty(navigator,'webdriver',{get:function(){return false;},configurable:true}); } catch(e){}
  try {
    Object.defineProperty(navigator,'plugins',{
      get:function(){
        var p=[
          {name:'Chrome PDF Plugin',filename:'internal-pdf-viewer'},
          {name:'Chrome PDF Viewer',filename:'mhjfbmdgcfjbbpaeojofohoefgiehjai'},
          {name:'Native Client',filename:'internal-nacl-plugin'},
        ];
        p.length=3;
        p.item=function(i){return p[i]||null;};
        p.namedItem=function(n){return p.find(function(x){return x.name===n;})||null;};
        return p;
      },configurable:true,
    });
  } catch(e){}
  try{Object.defineProperty(navigator,'languages',{get:function(){return['en-US','en'];},configurable:true});}catch(e){}
  try{Object.defineProperty(navigator,'platform',{get:function(){return'Linux armv8l';},configurable:true});}catch(e){}
  try{if(!window.chrome)window.chrome={runtime:{},loadTimes:function(){},csi:function(){},app:{}};}catch(e){}
  try{window.Notification=undefined;}catch(e){}
  try{Object.defineProperty(document,'referrer',{get:function(){return'https://www.google.com/';},configurable:true});}catch(e){}
  window.open=function(){return null;};
  window.alert=function(){};
  window.confirm=function(){return false;};
  window.prompt=function(){return null;};

  /* 2. Inject CSS as early as possible so branding NEVER appears on screen.
        Uses both class selectors and attribute selectors for maximum coverage. */
  try {
    var s = document.createElement('style');
    s.id = 'smovie-hide';
    s.textContent = [
      /* ── Chrome top: title bar, channel name, share ── */
      '.ytp-chrome-top',
      '.ytp-title','.ytp-title-text','.ytp-title-link',
      '.ytp-title-channel','.ytp-title-channel-logo',
      '.ytp-title-expanded-title',
      '.ytp-chrome-top-buttons',
      '.ytp-share-button','.ytp-share-button-visible',
      '.ytp-subtitles-button',
      /* ── Chrome bottom: control bar ── */
      '.ytp-chrome-bottom','.ytp-chrome-controls',
      '.ytp-progress-bar-container','.ytp-time-display',
      '.ytp-right-controls','.ytp-left-controls',
      '.ytp-volume-panel','.ytp-time-separator',
      '.ytp-play-button','.ytp-mute-button',
      '.ytp-settings-button','.ytp-fullscreen-button',
      '.ytp-size-button','.ytp-miniplayer-button',
      '.ytp-remote-button','.ytp-cast-button',
      '.ytp-watch-later-button','.ytp-watch-later-icon',
      /* ── Watermark / logo ── */
      '.ytp-watermark','.ytp-youtube-button',
      '.ytp-wordmark','.ytp-logo','.ytp-logo-button',
      '.branding-img-container','.ytp-branding-logo',
      /* ── Gradients YouTube adds over the video ── */
      '.ytp-gradient-top','.ytp-gradient-bottom',
      '.ytp-heat-map-container',
      /* ── Pause overlay (shows title + recommendations when paused) ── */
      '.ytp-pause-overlay','.ytp-pause-overlay-container',
      '.ytp-pause-overlay-tile',
      /* ── End screen ── */
      '.ytp-endscreen-content','.ytp-endscreen-element',
      /* ── Cards & annotations ── */
      '.ytp-ce-element','.ytp-ce-covering-overlay',
      '.ytp-ce-expanding-overlay','.ytp-ce-video',
      '.ytp-ce-playlist','.ytp-ce-website',
      '.ytp-ce-channel','.ytp-ce-link',
      '.ytp-cards-teaser','.ytp-cards-button',
      '.ytp-cards-button-icon','.iv-card',
      '.video-annotations','.annotation',
      /* ── Spinner ── */
      '.ytp-spinner',
      /* ── Context menu ── */
      '.ytp-contextmenu',
      /* ── Info panel ── */
      '.ytp-info-panel-preview','.ytp-info-panel-preview-title',
      /* ── Misc ── */
      '.ytp-suggestion-set','.ytp-videowall-still',
      '.ytp-preview','.ytp-storyboard-framepreview',
      'a[href*="youtube.com"]',
      '.iv-branding','.iv-card-content',
    ].join(',') + '{display:none!important;opacity:0!important;pointer-events:none!important;}';
    /* Also: make the player background pure black so no letterbox shows */
    s.textContent += 'html,body,.html5-video-player,.html5-main-video{background:#000!important;}';
    /* Push style into <head> immediately */
    (document.head || document.documentElement).appendChild(s);
  } catch(e) {}
})();
true;
`;

// ── CSS + layout: applied after load + polled every 400ms ──────────────────
// Re-injects the <style> tag (in case YouTube removed it) and positions
// the video at a precise 16:9 ratio, centered in the WebView viewport.
const JS_COVER_AND_HIDE = `
(function() {
  /* Ensure our <style> tag is still present */
  if (!document.getElementById('smovie-hide')) {
    var s = document.createElement('style');
    s.id = 'smovie-hide';
    s.textContent = [
      '.ytp-chrome-top,.ytp-title,.ytp-title-text,.ytp-title-link,',
      '.ytp-title-channel,.ytp-title-channel-logo,.ytp-title-expanded-title,',
      '.ytp-chrome-top-buttons,.ytp-share-button,.ytp-share-button-visible,',
      '.ytp-chrome-bottom,.ytp-chrome-controls,.ytp-progress-bar-container,',
      '.ytp-time-display,.ytp-right-controls,.ytp-left-controls,',
      '.ytp-volume-panel,.ytp-settings-button,.ytp-fullscreen-button,',
      '.ytp-watermark,.ytp-youtube-button,.ytp-wordmark,.ytp-logo,.ytp-logo-button,',
      '.branding-img-container,.ytp-branding-logo,',
      '.ytp-gradient-top,.ytp-gradient-bottom,.ytp-heat-map-container,',
      '.ytp-pause-overlay,.ytp-pause-overlay-container,.ytp-pause-overlay-tile,',
      '.ytp-endscreen-content,.ytp-endscreen-element,',
      '.ytp-ce-element,.ytp-ce-covering-overlay,.ytp-ce-expanding-overlay,',
      '.ytp-cards-teaser,.ytp-cards-button,.iv-card,.video-annotations,.annotation,',
      '.ytp-spinner,.ytp-contextmenu,.ytp-info-panel-preview,',
      '.ytp-suggestion-set,.ytp-videowall-still,.ytp-preview,',
      'a[href*="youtube.com"],.iv-branding,.iv-card-content',
    ].join('') + '{display:none!important;opacity:0!important;pointer-events:none!important;}';
    s.textContent += 'html,body,.html5-video-player{background:#000!important;}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* Position <video> element: 16:9 aspect, full width, centered */
  try {
    document.querySelectorAll('video').forEach(function(v) {
      v.style.cssText = [
        'object-fit:contain!important',
        'width:100vw!important',
        'height:56.25vw!important',
        'position:fixed!important',
        'top:50%!important',
        'left:50%!important',
        'transform:translate(-50%,-50%)!important',
        'z-index:1!important',
        'margin:0!important',
        'padding:0!important',
        'background:#000!important',
      ].join(';');
    });
  } catch(e) {}

  /* Suppress scroll */
  try {
    document.body.style.overflow = 'hidden';
    document.body.style.margin   = '0';
    document.body.style.padding  = '0';
    document.documentElement.style.overflow = 'hidden';
  } catch(e) {}
})(); true;
`;

// ── Audio control ───────────────────────────────────────────────────────────
// Uses #movie_player (YouTube's internal API surface exposed on the embed page)
// as the primary route — more reliable than window.player on Android WebView.
const JS_MUTE = `
(function() {
  try {
    var p = document.getElementById('movie_player');
    if (p && typeof p.mute === 'function') { p.mute(); return; }
  } catch(e) {}
  try {
    var v = document.querySelector('video');
    if (v) v.muted = true;
  } catch(e) {}
})(); true;
`;

const JS_UNMUTE = `
(function() {
  /* Primary: YouTube's #movie_player element API (same-page, no cross-origin) */
  try {
    var p = document.getElementById('movie_player');
    if (p && typeof p.unMute === 'function') {
      p.unMute();
      if (typeof p.setVolume === 'function') p.setVolume(100);
      return;
    }
  } catch(e) {}
  /* Fallback: direct <video> element */
  try {
    var v = document.querySelector('video');
    if (v) { v.muted = false; v.volume = 1; }
  } catch(e) {}
  /* Fallback: window.player */
  try {
    var wp = window.player || window.__ytPlayerRef;
    if (wp && typeof wp.unMute === 'function') { wp.unMute(); wp.setVolume(100); }
  } catch(e) {}
})(); true;
`;

// ── Quality enforcement ─────────────────────────────────────────────────────
// Tries multiple API surfaces to lock playback at hd1080/highres.
// Called on load and again when the player fires onStateChange=PLAYING.
const JS_HD = `
(function() {
  var qualities = ['highres','hd2160','hd1440','hd1080','hd720'];
  /* Route 1: #movie_player (most reliable on YouTube embed page) */
  try {
    var p = document.getElementById('movie_player');
    if (p) {
      if (typeof p.setPlaybackQualityRange === 'function') {
        p.setPlaybackQualityRange('hd1080', 'highres');
      }
      if (typeof p.setPlaybackQuality === 'function') {
        p.setPlaybackQuality('hd1080');
      }
      return;
    }
  } catch(e) {}
  /* Route 2: window.player / __ytPlayerRef */
  try {
    var wp = window.player || window.__ytPlayerRef;
    if (wp) {
      if (typeof wp.setPlaybackQualityRange === 'function') wp.setPlaybackQualityRange('hd1080','highres');
      if (typeof wp.setPlaybackQuality === 'function') wp.setPlaybackQuality('hd1080');
    }
  } catch(e) {}
})(); true;
`;

// ── Listen for YouTube's onStateChange to re-enforce quality/branding hides ─
// YouTube sometimes resets quality and reinjects chrome on state transitions.
const JS_SETUP_LISTENERS = `
(function() {
  if (window.__smovie_listeners_set) return;
  window.__smovie_listeners_set = true;

  var SELECTORS = [
    '.ytp-chrome-top','.ytp-title','.ytp-title-text','.ytp-title-link',
    '.ytp-title-channel','.ytp-title-channel-logo','.ytp-title-expanded-title',
    '.ytp-chrome-top-buttons','.ytp-share-button','.ytp-share-button-visible',
    '.ytp-chrome-bottom','.ytp-chrome-controls','.ytp-progress-bar-container',
    '.ytp-time-display','.ytp-right-controls','.ytp-left-controls',
    '.ytp-volume-panel','.ytp-settings-button','.ytp-fullscreen-button',
    '.ytp-watermark','.ytp-youtube-button','.ytp-wordmark',
    '.ytp-logo','.ytp-logo-button','.branding-img-container','.ytp-branding-logo',
    '.ytp-gradient-top','.ytp-gradient-bottom',
    '.ytp-pause-overlay','.ytp-pause-overlay-container','.ytp-pause-overlay-tile',
    '.ytp-endscreen-content','.ytp-endscreen-element',
    '.ytp-ce-element','.ytp-ce-covering-overlay','.ytp-ce-expanding-overlay',
    '.ytp-cards-teaser','.ytp-cards-button','.iv-card',
    '.video-annotations','.annotation',
    '.ytp-contextmenu','.ytp-info-panel-preview',
    '.ytp-suggestion-set','.ytp-videowall-still',
    'a[href*="youtube.com"]','.iv-branding','.iv-card-content',
  ].join(',');

  function hideChrome() {
    document.querySelectorAll(SELECTORS).forEach(function(el) {
      el.style.setProperty('display','none','important');
      el.style.setProperty('opacity','0','important');
      el.style.setProperty('pointer-events','none','important');
    });
  }

  function lockQuality() {
    try {
      var p = document.getElementById('movie_player');
      if (p) {
        if (typeof p.setPlaybackQualityRange === 'function') p.setPlaybackQualityRange('hd1080','highres');
        if (typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality('hd1080');
      }
    } catch(e) {}
  }

  /* Phase 1: fire every 300ms for the first 6s (most critical window) */
  var phase1 = 0;
  var iv1 = setInterval(function() {
    hideChrome(); lockQuality();
    phase1++;
    if (phase1 >= 20) clearInterval(iv1);
  }, 300);

  /* Phase 2: fire every 2s for the next 60s (catches late reinjections) */
  var phase2 = 0;
  setTimeout(function() {
    var iv2 = setInterval(function() {
      hideChrome(); lockQuality();
      phase2++;
      if (phase2 >= 30) clearInterval(iv2);
    }, 2000);
  }, 6500);

  /* MutationObserver: nuke chrome the instant YouTube adds it back */
  try {
    var obs = new MutationObserver(function() { hideChrome(); });
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style','class'] });
  } catch(e) {}
})(); true;
`;

const YoutubeEmbed = forwardRef<YoutubeEmbedRef, YoutubeEmbedProps>(
  ({ videoKey, muted = false, controls = false, loop = true, style, onError }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const loadedRef  = useRef(false);
    const mutedRef   = useRef(muted);

    useImperativeHandle(ref, () => ({
      injectJavaScript: (js: string) => {
        webViewRef.current?.injectJavaScript(js);
      },
    }));

    // URL params: mute mirrors the initial prop so the page loads with correct
    // audio state — YouTube ignores postMessage unmute on a page that loaded muted.
    const uri = useMemo(() => {
      const params = [
        "autoplay=1",
        `mute=${muted ? 1 : 0}`,
        "controls=0",
        `loop=${loop ? 1 : 0}`,
        `playlist=${videoKey}`,
        "rel=0",
        "modestbranding=1",
        "iv_load_policy=3",
        "showinfo=0",
        "playsinline=1",
        "fs=0",
        "autohide=1",
        "enablejsapi=1",
        "disablekb=1",
        "cc_load_policy=3",
        "vq=hd1080",
        "hd=1",
        "hl=en",
        "widget_referrer=https%3A%2F%2Fwww.google.com",
        "origin=https%3A%2F%2Fwww.youtube-nocookie.com",
      ].join("&");
      return `https://www.youtube-nocookie.com/embed/${videoKey}?${params}`;
    }, [videoKey, loop, muted]);

    // Sync muted prop → inject JS (no URL rebuild = no video restart)
    useEffect(() => {
      mutedRef.current = muted;
      if (loadedRef.current) {
        webViewRef.current?.injectJavaScript(muted ? JS_MUTE : JS_UNMUTE);
      }
    }, [muted]);

    function handleLoadEnd() {
      loadedRef.current = true;
      // 1. Cover + hide (CSS already in <head> from INJECT_BEFORE, this reinforces it)
      webViewRef.current?.injectJavaScript(JS_COVER_AND_HIDE);
      // 2. Quality lock
      webViewRef.current?.injectJavaScript(JS_HD);
      // 3. Mute state
      webViewRef.current?.injectJavaScript(mutedRef.current ? JS_MUTE : JS_UNMUTE);
      // 4. Ongoing quality + hide listeners
      webViewRef.current?.injectJavaScript(JS_SETUP_LISTENERS);
    }

    function handleMessage(event: { nativeEvent: { data: string } }) {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg?.type === "error") onError?.();
      } catch { }
    }

    return (
      <WebView
        ref={webViewRef}
        source={{ uri }}
        style={[StyleSheet.absoluteFill, style]}
        allowsInlineMediaPlayback
        allowsFullscreenVideo={controls}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        scrollEnabled={false}
        // Allow loading YouTube scripts regardless of mixed-content
        mixedContentMode="always"
        // Allow protected (DRM) media for higher-quality streams on Android
        allowsProtectedMedia
        // Broad origin whitelist — YouTube embed uses youtube-nocookie.com + fonts/etc
        originWhitelist={["*"]}
        // Chrome 124 on Pixel 7 Pro — serves HD streams + disables bot detection
        userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36"
        injectedJavaScriptBeforeContentLoaded={INJECT_BEFORE}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onError={onError}
        onHttpError={onError}
      />
    );
  },
);

export default YoutubeEmbed;
