/// <reference lib="webworker" />

export interface ProcessRequest {
  type: "processFrame";
  buffer: ArrayBuffer;
  width: number;
  height: number;
  kernelSize: number;
  colorThreshold: number;
  preProcess: boolean;
}

export interface ProcessResponse {
  type: "frameResult";
  centerColor: string | null;
  rectangleColors: number[];
}

self.onmessage = (event: MessageEvent<ProcessRequest>) => {
  const { buffer, width, height, kernelSize, colorThreshold, preProcess } =
    event.data;

  let imageData = new ImageData(new Uint8ClampedArray(buffer), width, height);

  if (preProcess) {
    imageData = removeSaltAndPepperNoise(imageData, kernelSize, colorThreshold);
  }

  const centerColor = detectCenterColor(imageData, colorThreshold);
  const { rectangleColors } = detectRectangles(imageData, colorThreshold);

  const response: ProcessResponse = {
    type: "frameResult",
    centerColor,
    rectangleColors,
  };

  (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
};

// ─── Noise Reduction ─────────────────────────────────────────────────────────

function removeSaltAndPepperNoise(
  imageData: ImageData,
  kernelSize: number,
  blackThreshold: number
): ImageData {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data);
  const half = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = (y * width + x) * 4;
      const pr = data[base], pg = data[base + 1], pb = data[base + 2];

      // Black pixels are guard/border markers — preserve them as-is.
      if (pr < blackThreshold && pg < blackThreshold && pb < blackThreshold) continue;

      const rVals: number[] = [];
      const gVals: number[] = [];
      const bVals: number[] = [];

      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (ny * width + nx) * 4;
            const nr = data[idx], ng = data[idx + 1], nb = data[idx + 2];
            // Exclude black neighbors so border pixels don't corrupt the median.
            if (nr < blackThreshold && ng < blackThreshold && nb < blackThreshold) continue;
            rVals.push(nr);
            gVals.push(ng);
            bVals.push(nb);
          }
        }
      }

      if (rVals.length === 0) continue;

      output[base] = median(rVals);
      output[base + 1] = median(gVals);
      output[base + 2] = median(bVals);
      output[base + 3] = data[base + 3];
    }
  }

  return new ImageData(output, width, height);
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[mid - 1] + values[mid]) / 2
    : values[mid];
}

// Remove top and bottom `trim` fraction of values before averaging to eliminate outliers.
function trimmedMean(values: number[], trim: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * trim);
  const trimmed = sorted.slice(cut, sorted.length - cut);
  const src = trimmed.length > 0 ? trimmed : sorted;
  return src.reduce((s, v) => s + v, 0) / src.length;
}

// ─── Center Color Detection ──────────────────────────────────────────────────

function detectCenterColor(
  imageData: ImageData,
  threshold: number
): string | null {
  const { width, height, data } = imageData;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  // Proportional region: at least 10px radius, up to 5% of the shorter dimension.
  const half = Math.max(10, Math.floor(Math.min(width, height) * 0.05));

  const rVals: number[] = [];
  const gVals: number[] = [];
  const bVals: number[] = [];

  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = (ny * width + nx) * 4;
        rVals.push(data[idx]);
        gVals.push(data[idx + 1]);
        bVals.push(data[idx + 2]);
      }
    }
  }

  const r = trimmedMean(rVals, 0.1);
  const g = trimmedMean(gVals, 0.1);
  const b = trimmedMean(bVals, 0.1);

  // "White" requires all channels above threshold AND balanced (max−min < 40).
  // This prevents overexposed colors (e.g. bright red r=255,g=200,b=200, diff=55)
  // from being misclassified as white.
  const channelBalance = Math.max(r, g, b) - Math.min(r, g, b);
  if (r > threshold && g > threshold && b > threshold && channelBalance < 40) return "white";
  if (r < threshold && g < threshold && b < threshold) return "black";
  if (r > g && r > b) return "red";
  if (g > r && g > b) return "green";
  if (b > r && b > g) return "blue";
  return null;
}

// ─── Rectangle Detection ─────────────────────────────────────────────────────

function detectRectangles(
  imageData: ImageData,
  threshold: number
): { rectangleColors: number[] } {
  const { width, height, data } = imageData;
  const rectangleColors: number[] = [];

  for (let y = 0; y < height; y++) {
    let x = 0;

    while (x < width) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (r < threshold && g < threshold && b < threshold) {
        x++;
        continue;
      }

      // Collect ALL pixels in this horizontal colored segment, then classify
      // by trimmed mean to reject noise outliers (single bright/dark pixels).
      const segR: number[] = [];
      const segG: number[] = [];

      while (x < width) {
        const cur = (y * width + x) * 4;
        const pr = data[cur];
        const pg = data[cur + 1];
        const pb = data[cur + 2];

        if (pr < threshold && pg < threshold && pb < threshold) {
          // Dark border: skip it, then break so the outer while starts the next rectangle.
          while (x < width) {
            const bc = (y * width + x) * 4;
            if (
              data[bc] >= threshold ||
              data[bc + 1] >= threshold ||
              data[bc + 2] >= threshold
            )
              break;
            x++;
          }
          break;
        }

        segR.push(pr);
        segG.push(pg);
        x++;
      }

      if (segR.length > 0) {
        const avgR = trimmedMean(segR, 0.1);
        const avgG = trimmedMean(segG, 0.1);
        if (avgR > avgG) rectangleColors.push(0);
        else if (avgG > avgR) rectangleColors.push(1);
      }

      // Advance y to skip the rest of this row band and the border below it.
      if (x >= width) {
        x = 0;
        while (
          y < height &&
          (data[(y * width + x) * 4] >= threshold ||
            data[(y * width + x) * 4 + 1] >= threshold ||
            data[(y * width + x) * 4 + 2] >= threshold)
        ) {
          y++;
          if (y >= height) break;
          if (
            data[(y * width + x) * 4] < threshold &&
            data[(y * width + x) * 4 + 1] < threshold &&
            data[(y * width + x) * 4 + 2] < threshold
          ) {
            while (
              y < height &&
              data[(y * width + x) * 4] < threshold &&
              data[(y * width + x) * 4 + 1] < threshold &&
              data[(y * width + x) * 4 + 2] < threshold
            ) {
              y++;
            }
            break;
          }
        }
        if (y >= height) break;
      }
    }
  }

  return { rectangleColors };
}
