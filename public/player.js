export function createPlayer({
  container,
  title,
  playOrigin,
  requestTicket,
  onState,
  onError,
  frameId = "player",
}) {
  let generation = 0,
    controller = null,
    frame = null,
    timeout = null,
    messageHandler = null,
    phase = "idle";
  const setPhase = (value) => {
    phase = value;
    onState?.(value);
  };
  function clear() {
    generation++;
    controller?.abort();
    controller = null;
    clearTimeout(timeout);
    timeout = null;
    if (messageHandler) {
      window.removeEventListener("message", messageHandler);
      messageHandler = null;
    }
    if (frame) {
      frame.removeAttribute("src");
      frame.remove();
      frame = null;
    }
  }
  return {
    get phase() {
      return phase;
    },
    async start() {
      if (phase === "loading") return false;
      clear();
      const run = generation;
      controller = new AbortController();
      setPhase("loading");
      const timedOut = () => {
        if (run === generation && phase === "loading") {
          clear();
          setPhase("error");
          onError?.(
            new Error("The player took too long to load. Please retry."),
          );
        }
      };
      timeout = setTimeout(timedOut, 15000);
      try {
        const data = await requestTicket(controller.signal);
        if (run !== generation) return false;
        const url = new URL(data.play_url);
        if (
          url.origin !== playOrigin ||
          !url.pathname.startsWith("/play/") ||
          url.search ||
          url.hash ||
          url.username ||
          url.password
        )
          throw new Error("Invalid player origin.");
        clearTimeout(timeout);
        timeout = setTimeout(timedOut, 45000);
        frame = document.createElement("iframe");
        frame.id = frameId;
        frame.title = title;
        frame.setAttribute("sandbox", "allow-scripts allow-pointer-lock");
        frame.setAttribute("allow", "fullscreen; autoplay");
        frame.referrerPolicy = "no-referrer";
        frame.addEventListener(
          "load",
          () => {
            if (run === generation) {
              clearTimeout(timeout);
              setPhase("playing");
              frame?.focus();
            }
          },
          { once: true },
        );
        frame.addEventListener(
          "error",
          () => {
            if (run === generation) {
              clear();
              setPhase("error");
              onError?.(new Error("The player could not load. Please retry."));
            }
          },
          { once: true },
        );

        messageHandler = (event) => {
          if (run !== generation) return;
          if (event.origin !== playOrigin && event.origin !== location.origin) return;
          if (event.data?.type === "onehtml:error") {
            const errorMsg = event.data.message || "An error occurred in the sandbox execution.";
            setPhase("error");
            onError?.(new Error(errorMsg));
          }
        };
        window.addEventListener("message", messageHandler);

        frame.src = url.href;
        container.replaceChildren(frame);
        return true;
      } catch (error) {
        if (run !== generation || error.name === "AbortError") return false;
        clear();
        setPhase("error");
        onError?.(error);
        return false;
      }
    },
    stop() {
      clear();
      setPhase("idle");
    },
    destroy() {
      clear();
      phase = "idle";
    },
  };
}
