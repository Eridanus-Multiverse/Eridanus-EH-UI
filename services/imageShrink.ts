import { Platform } from "react-native";

// iPhone 原图 2~4MB，解码成位图是 ~48MB/张；聊天列表渲染窗口里挂几张，
// iOS WebKit 内存一紧就把整页杀掉重载（表现为"页面总是自己刷新"，
// 键盘弹起的内存峰值时刻尤其容易触发）。这里统一做两件事：
//   1. 上传前把原图压到长边 2048 的 JPEG（治新图）
//   2. 气泡加载附件 blob 时降采样到长边 1600（治已存的历史大图）
// GIF 不动（保动图），非 web 平台不动。

const DARK_BG = "#030814"; // PNG 转 JPEG 时铺的底色，跟聊天页背景一致

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decodeToBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // from-image：尊重 EXIF 方向，竖拍照片不会躺倒
    return await createImageBitmap(blob, { imageOrientation: "from-image" } as any);
  } catch {
    try {
      return await createImageBitmap(blob);
    } catch {
      // 老 Safari 兜底：走 <img> 解码
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
      });
    }
  }
}

async function shrinkBlobInner(blob: Blob, maxDim: number, quality: number): Promise<Blob> {
  const bitmap = await decodeToBitmap(blob);
  const w = "naturalWidth" in bitmap ? bitmap.naturalWidth : bitmap.width;
  const h = "naturalHeight" in bitmap ? bitmap.naturalHeight : bitmap.height;
  if (!w || !h) return blob;

  const scale = Math.min(1, maxDim / Math.max(w, h));
  // 已经够小且不需要转格式 → 不折腾
  if (scale >= 1 && blob.size <= 400 * 1024) {
    if ("close" in bitmap) bitmap.close();
    return blob;
  }

  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if ("close" in bitmap) bitmap.close();
    return blob;
  }
  // 统一输出 JPEG（聊天里的 PNG 基本是截图，没有透明需求）；
  // 先铺底色避免透明区变黑块突兀
  ctx.fillStyle = DARK_BG;
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(bitmap as any, 0, 0, outW, outH);
  if ("close" in bitmap) bitmap.close();

  const out = await canvasToBlob(canvas, "image/jpeg", quality);
  canvas.width = 0;
  canvas.height = 0;
  if (!out || out.size >= blob.size) return blob;
  return out;
}

function shouldSkip(type: string): boolean {
  if (Platform.OS !== "web" || typeof document === "undefined") return true;
  if (!type.startsWith("image/")) return true;
  if (type === "image/gif" || type === "image/svg+xml") return true;
  return false;
}

/** 上传前压缩。压不动/出错时原样返回，绝不挡上传。 */
export async function shrinkImageFile(file: File, maxDim = 2048, quality = 0.85): Promise<File> {
  if (shouldSkip(file.type)) return file;
  try {
    const out = await shrinkBlobInner(file, maxDim, quality);
    if (out === (file as Blob)) return file;
    const name = file.name.replace(/\.(png|webp|heic|heif|jpeg|jpg)$/i, "") + ".jpg";
    return new File([out], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** 已存附件的展示降采样。出错原样返回。 */
export async function shrinkImageBlob(blob: Blob, maxDim = 1600, quality = 0.85): Promise<Blob> {
  if (shouldSkip(blob.type)) return blob;
  try {
    return await shrinkBlobInner(blob, maxDim, quality);
  } catch {
    return blob;
  }
}
