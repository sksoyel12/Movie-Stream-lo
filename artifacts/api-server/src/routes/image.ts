import { Readable } from "node:stream";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const ALLOWED_HOST = "image.tmdb.org";
const MAX_URL_LENGTH = 2048;
const UPSTREAM_TIMEOUT_MS = 8_000;

router.get("/image", async (req, res): Promise<void> => {
  const candidate = req.query.url;
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > MAX_URL_LENGTH) {
    res.status(400).json({ error: "A valid TMDB image URL is required." });
    return;
  }

  let imageUrl: URL;
  try {
    imageUrl = new URL(candidate);
  } catch {
    res.status(400).json({ error: "A valid TMDB image URL is required." });
    return;
  }

  if (
    imageUrl.protocol !== "https:" ||
    imageUrl.hostname !== ALLOWED_HOST ||
    imageUrl.username.length > 0 ||
    imageUrl.password.length > 0 ||
    imageUrl.port.length > 0
  ) {
    res.status(400).json({ error: "Only HTTPS TMDB image URLs are allowed." });
    return;
  }

  try {
    const upstream = await fetch(imageUrl, {
      headers: { Accept: "image/avif,image/webp,image/*;q=0.8" },
      redirect: "error",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const contentType = upstream.headers.get("content-type");

    if (!upstream.ok || !upstream.body || !contentType?.toLowerCase().startsWith("image/")) {
      await upstream.body?.cancel().catch(() => undefined);
      logger.warn(
        { status: upstream.status, contentType },
        "TMDB image proxy received an invalid upstream response",
      );
      res.status(502).json({ error: "Image upstream failed." });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");

    const contentLength = upstream.headers.get("content-length");
    if (contentLength && /^\d+$/.test(contentLength)) {
      res.setHeader("Content-Length", contentLength);
    }

    const imageStream = Readable.fromWeb(upstream.body as never);
    imageStream.once("error", (error: Error) => {
      logger.warn({ err: error }, "TMDB image proxy stream failed");
      if (res.headersSent) {
        res.destroy(error);
      } else {
        res.status(502).json({ error: "Image upstream failed." });
      }
    });
    res.once("close", () => {
      if (!res.writableEnded) imageStream.destroy();
    });
    imageStream.pipe(res);
  } catch (error) {
    logger.warn({ err: error }, "TMDB image proxy request failed");
    if (res.headersSent) {
      res.destroy(error instanceof Error ? error : undefined);
    } else {
      res.status(502).json({ error: "Image upstream failed." });
    }
    return;
  }
});

export default router;
