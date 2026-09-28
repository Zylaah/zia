

const THROTTLE_MS = 50;
const SETTLE_MS = 80;

export class ZiaChild extends JSWindowActorChild {
  #lastSent = 0;
  #trailingTimer = null;

  handleEvent(event) {
    switch (event.type) {
      case "scroll":
        this.#onScroll();
        break;
      case "DOMContentLoaded":
      case "pageshow":
        this.#onPageShown();
        break;
    }
  }

  #onScroll() {
    const now = Date.now();
    if (now - this.#lastSent >= THROTTLE_MS) {
      this.#sendScroll(now);
    }
    this.contentWindow?.clearTimeout(this.#trailingTimer);
    this.#trailingTimer = this.contentWindow?.setTimeout(() => this.#sendScroll(Date.now()), SETTLE_MS);
  }

  #sendScroll(now) {
    this.#lastSent = now;
    const win = this.contentWindow;
    if (!win) {
      return;
    }
    try {
      this.sendAsyncMessage("Zia:Scrolled", { x: win.scrollX, y: win.scrollY });
    } catch (err) {
    }
  }

  #onPageShown() {
    const win = this.contentWindow;
    if (!win) {
      return;
    }
    win.requestAnimationFrame(() =>
      win.requestAnimationFrame(() => {
        try {
          this.sendAsyncMessage("Zia:Painted", {});
        } catch (err) {
        }
      })
    );
  }

  // Kick gives its streams no artwork, so the music player showed its
  // favicon: the channel's own picture is asked of Kick by the page itself
  // (as Kick's site does), for the channel named in the address.
  async receiveMessage(message) {
    if (message.name !== "Zia:KickAvatar") {
      return null;
    }
    const win = this.contentWindow;
    const slug = String(message.data?.slug || "");
    if (!win || !/^[\w-]+$/.test(slug) || !/(^|\.)kick\.com$/.test(win.location.hostname)) {
      return null;
    }
    for (const path of [`/api/v2/channels/${slug}`, `/api/v1/channels/${slug}`]) {
      try {
        const response = await win.fetch(path, { credentials: "include", headers: { Accept: "application/json" } });
        if (!response.ok) {
          continue;
        }
        const data = JSON.parse(await response.text());
        const pic = data?.user?.profile_pic || data?.user?.profilepic;
        if (typeof pic === "string" && /^https:\/\//.test(pic)) {
          return pic;
        }
      } catch (err) {
      }
    }
    return null;
  }

  didDestroy() {
    this.contentWindow?.clearTimeout(this.#trailingTimer);
  }
}
