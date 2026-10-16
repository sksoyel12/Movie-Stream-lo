import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

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

function ytCmd(iframe: HTMLIFrameElement | null, func: string, args: any[] = []) {
  iframe?.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "*",
  );
}

const YoutubeEmbed = forwardRef<YoutubeEmbedRef, YoutubeEmbedProps>(
  ({ videoKey, muted = false, controls = false, loop = true, style, onError }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const readyRef  = useRef(false);
    const mutedRef  = useRef(muted);

    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://localhost";

    // URL: disable all chrome, request HD, no related content.
    // mute param mirrors the initial muted prop so the iframe loads
    // with the correct audio state — postMessage-only unmute is blocked
    // by most browsers when the page was initially loaded muted.
    const src = useMemo(() => {
      const params = new URLSearchParams({
        autoplay:         "1",
        mute:             muted ? "1" : "0",
        controls:         "0",
        loop:             loop     ? "1" : "0",
        playlist:         videoKey,
        rel:              "0",
        modestbranding:   "1",
        showinfo:         "0",
        iv_load_policy:   "3",
        playsinline:      "1",
        enablejsapi:      "1",
        disablekb:        "1",
        cc_load_policy:   "3",
        fs:               "0",
        autohide:         "1",
        vq:               "hd1080",
        hd:               "1",
        hl:               "en",
        origin,
      });
      return `https://www.youtube-nocookie.com/embed/${videoKey}?${params}`;
    // muted included so URL rebuilds when prop flips (re-mounts iframe with correct state)
    }, [videoKey, loop, muted]);

    // Listen for YouTube player-ready signal then apply quality + mute state
    useEffect(() => {
      function onMessage(evt: MessageEvent) {
        try {
          const data =
            typeof evt.data === "string" ? JSON.parse(evt.data) : evt.data;
          if (
            !readyRef.current &&
            (data?.event === "onReady" || data?.info !== undefined)
          ) {
            readyRef.current = true;
            applyMuteState(mutedRef.current);
            ytCmd(iframeRef.current, "setPlaybackQuality", ["hd1080"]);
          }
        } catch {}
      }
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    }, []);

    useEffect(() => {
      mutedRef.current = muted;
      if (readyRef.current) applyMuteState(muted);
    }, [muted]);

    function applyMuteState(m: boolean) {
      if (m) {
        ytCmd(iframeRef.current, "mute");
      } else {
        ytCmd(iframeRef.current, "unMute");
        ytCmd(iframeRef.current, "setVolume", [100]);
      }
    }

    useImperativeHandle(ref, () => ({
      injectJavaScript: (_js: string) => {
        ytCmd(iframeRef.current, "pauseVideo");
      },
    }));

    // Teaser: 16:9, centered, no zoom, pointer-events off so taps never
    // trigger YouTube's chrome reveal (title, watermark, end cards etc.)
    const teaserStyle: React.CSSProperties = {
      position:      "absolute",
      top:           "50%",
      left:          "0",
      width:         "100%",
      height:        "56.25vw",
      transform:     "translateY(-50%)",
      border:        "none",
      pointerEvents: "none",
    };

    const fullStyle: React.CSSProperties = {
      position:      "absolute",
      inset:         0,
      width:         "100%",
      height:        "100%",
      border:        "none",
    };

    return (
      <div
        style={{
          position:        "absolute",
          inset:           0,
          overflow:        "hidden",
          backgroundColor: "#000",
        }}
      >
        <iframe
          ref={iframeRef}
          src={src}
          style={controls ? fullStyle : teaserStyle}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          title="S Movie Original teaser"
          onError={onError}
        />

        {/* ── Full branding-suppression overlays (teaser / no-controls mode) ── */}
        {!controls && (
          <>
            {/* TOP — solid black, tall enough to bury channel avatar + title +
                channel name + any top-bar buttons YouTube injects.
                148px covers the full chrome-top region at any viewport width. */}
            <div
              style={{
                position:        "absolute",
                top:             0,
                left:            0,
                right:           0,
                height:          148,
                zIndex:          30,
                backgroundColor: "#000",
                pointerEvents:   "none",
              }}
            />

            {/* BOTTOM — solid black strip covering the entire YouTube control
                bar (progress bar, play/pause, volume, settings, YT logo).
                96px is tall enough for the tallest control-bar variant. */}
            <div
              style={{
                position:        "absolute",
                bottom:          0,
                left:            0,
                right:           0,
                height:          96,
                zIndex:          30,
                backgroundColor: "#000",
                pointerEvents:   "none",
              }}
            />

            {/* LEFT edge — wide enough to cover the chain-link / share icon
                YouTube renders at the mid-left of the player (~80px wide) */}
            <div
              style={{
                position:        "absolute",
                top:             148,
                bottom:          96,
                left:            0,
                width:           90,
                zIndex:          30,
                backgroundColor: "#000",
                pointerEvents:   "none",
              }}
            />

            {/* RIGHT edge — wide enough to cover the YouTube watermark logo
                that appears at the mid-right of the player (~120px wide) */}
            <div
              style={{
                position:        "absolute",
                top:             148,
                bottom:          96,
                right:           0,
                width:           120,
                zIndex:          30,
                backgroundColor: "#000",
                pointerEvents:   "none",
              }}
            />

            {/* CENTRE pointer-events absorber — intercepts every mouse/touch
                event so hover never triggers YouTube's control-reveal.
                Transparent so the video frame is still fully visible. */}
            <div
              style={{
                position:        "absolute",
                top:             148,
                left:            90,
                right:           120,
                bottom:          96,
                zIndex:          25,
                pointerEvents:   "all",
                backgroundColor: "transparent",
                cursor:          "default",
              }}
            />
          </>
        )}
      </div>
    );
  },
);

YoutubeEmbed.displayName = "YoutubeEmbed";
export default YoutubeEmbed;
