import { NativeModules, Platform, Share } from "react-native";

export type StorySharePayload = {
  posterUri: string;
  title: string;
  contentUrl: string;
  dominantColor?: string;
};

export type StoryShareResult = {
  status: "shared" | "cancelled" | "download";
  file?: File;
};

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const POSTER_WIDTH = 820;
const POSTER_MAX_HEIGHT = 1120;
const POSTER_TOP = 250;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The poster image could not be decoded."));
    };
    image.src = objectUrl;
  });
}

async function loadPosterImage(uri: string): Promise<HTMLImageElement> {
  try {
    const response = await fetch(uri, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error(`Poster request failed with ${response.status}`);
    return await loadImageFromBlob(await response.blob());
  } catch {
    // Keep a direct-image fallback for proxy URLs that do not expose a
    // readable response body but still send CORS headers on the image.
    return await new Promise((resolve, reject) => {
      const image = new window.Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The poster image failed to load."));
      image.src = uri;
    });
  }
}

function dominantColor(
  image: HTMLImageElement,
  context: CanvasRenderingContext2D,
): string {
  const sample = document.createElement("canvas");
  sample.width = 24;
  sample.height = 24;
  const sampleContext = sample.getContext("2d");
  if (!sampleContext) return "#172033";

  sampleContext.drawImage(image, 0, 0, sample.width, sample.height);
  const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 80) continue;
    red += pixels[index];
    green += pixels[index + 1];
    blue += pixels[index + 2];
    count += 1;
  }

  if (!count) return "#172033";
  const soften = (value: number) => Math.round(value / count * 0.72);
  return `rgb(${soften(red)}, ${soften(green)}, ${soften(blue)})`;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Story poster export failed."))),
      "image/png",
      1,
    );
  });
}

/**
 * Builds a real PNG File for Instagram Stories and mobile-web file sharing.
 * It intentionally lives in a browser-only branch so native builds keep using
 * the existing Android share module.
 */
export async function createStoryPosterFile(
  payload: StorySharePayload,
): Promise<File> {
  if (Platform.OS !== "web") {
    throw new Error("Story poster generation is only available on web.");
  }

  const image = await loadPosterImage(payload.posterUri);
  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  canvas.style.display = "none";
  document.body.appendChild(canvas);

  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available in this browser.");

    const color = payload.dominantColor ?? dominantColor(image, context);
    const background = context.createLinearGradient(0, 0, STORY_WIDTH, STORY_HEIGHT);
    background.addColorStop(0, color);
    background.addColorStop(0.55, "#090b14");
    background.addColorStop(1, "#000000");
    context.fillStyle = background;
    context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

    const imageRatio = image.naturalWidth / image.naturalHeight;
    const posterHeight = Math.min(POSTER_MAX_HEIGHT, POSTER_WIDTH / imageRatio);
    const posterX = (STORY_WIDTH - POSTER_WIDTH) / 2;
    const posterY = POSTER_TOP + (POSTER_MAX_HEIGHT - posterHeight) / 2;

    context.save();
    roundedRect(context, posterX, posterY, POSTER_WIDTH, posterHeight, 30);
    context.clip();
    context.drawImage(image, posterX, posterY, POSTER_WIDTH, posterHeight);
    context.restore();

    context.fillStyle = "#ffffff";
    context.font = "700 42px Inter, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("S-MOVIE ORIGINAL.", STORY_WIDTH / 2, posterY + posterHeight + 115);

    const blob = await canvasToBlob(canvas);
    return new File([blob], "s-movie-story.png", { type: "image/png" });
  } finally {
    canvas.remove();
  }
}

export function downloadStoryPoster(file: File, title: string): void {
  if (Platform.OS !== "web") return;
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "s-movie"}-story.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Android's native module creates the transparent sticker bitmap, extracts
 * Palette colors, and sends ADD_TO_STORY. Expo Go/web use the system share
 * fallback because custom Java modules only exist in a prebuilt app.
 */
export async function shareToInstagramStory(payload: StorySharePayload): Promise<StoryShareResult> {
  if (Platform.OS === "android") {
    const nativeShare = NativeModules.SMovieStoryShare;
    if (nativeShare?.shareToInstagramStory) {
      const handled = await nativeShare.shareToInstagramStory(payload);
      if (handled) return { status: "shared" };
    }
  }

  if (Platform.OS === "web") {
    const file = await createStoryPosterFile(payload);
    const webNavigator = navigator;
    if (typeof webNavigator.canShare === "function" && webNavigator.canShare({ files: [file] })) {
      try {
        await webNavigator.share({
          files: [file],
          title: payload.title,
          text: `Watch ${payload.title} on S-MOVIE ORIGINAL:`,
          url: payload.contentUrl,
        });
        return { status: "shared", file };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return { status: "cancelled", file };
        }
        return { status: "download", file };
      }
    }
    return { status: "download", file };
  }

  await Share.share({
    title: payload.title,
    message: `Check out "${payload.title}" on S-MOVIE ORIGINAL: ${payload.contentUrl}`,
    url: payload.contentUrl,
  });
  return { status: "shared" };
}