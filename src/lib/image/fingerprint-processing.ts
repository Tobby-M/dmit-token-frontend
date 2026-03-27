function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load captured fingerprint image."));
    image.src = dataUrl;
  });
}

export async function toHighContrastFingerprint(dataUrl: string): Promise<string> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Unable to process captured fingerprint image.");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = frame.data;
  let min = 255;
  let max = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const luminance =
      pixels[index] * 0.299 +
      pixels[index + 1] * 0.587 +
      pixels[index + 2] * 0.114;

    min = Math.min(min, luminance);
    max = Math.max(max, luminance);
  }

  const range = Math.max(1, max - min);
  const threshold = 138;

  for (let index = 0; index < pixels.length; index += 4) {
    const luminance =
      pixels[index] * 0.299 +
      pixels[index + 1] * 0.587 +
      pixels[index + 2] * 0.114;
    const normalized = ((luminance - min) / range) * 255;
    const boosted = Math.min(255, Math.max(0, (normalized - 128) * 1.55 + 128));
    const value = boosted >= threshold ? 255 : 0;

    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }

  context.putImageData(frame, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}
