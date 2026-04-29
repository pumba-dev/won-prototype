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
    imageData = removeSaltAndPepperNoise(imageData, kernelSize);
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
  kernelSize: number
): ImageData {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data);
  const half = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rVals: number[] = [];
      const gVals: number[] = [];
      const bVals: number[] = [];

      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (ny * width + nx) * 4;
            rVals.push(data[idx]);
            gVals.push(data[idx + 1]);
            bVals.push(data[idx + 2]);
          }
        }
      }

      const base = (y * width + x) * 4;
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

// ─── Center Color Detection ──────────────────────────────────────────────────

function detectCenterColor(
  imageData: ImageData,
  threshold: number
): string | null {
  const { width, height, data } = imageData;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const half = 2; // 5×5 square

  let totalR = 0,
    totalG = 0,
    totalB = 0,
    count = 0;

  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = (ny * width + nx) * 4;
        totalR += data[idx];
        totalG += data[idx + 1];
        totalB += data[idx + 2];
        count++;
      }
    }
  }

  const r = totalR / count;
  const g = totalG / count;
  const b = totalB / count;

  if (r > threshold && g > threshold && b > threshold) return "white";
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

      if (r > g && r > b) {
        rectangleColors.push(0); // Red → bit 0
      } else if (g > r && g > b) {
        rectangleColors.push(1); // Green → bit 1
      } else {
        x++;
        continue;
      }

      // Advance past this colored region (skip to next border)
      let cur = (y * width + x) * 4;

      while (
        data[cur] >= threshold ||
        data[cur + 1] >= threshold ||
        data[cur + 2] >= threshold
      ) {
        x++;
        if (x >= width) break;
        cur = (y * width + x) * 4;

        if (
          data[cur] < threshold &&
          data[cur + 1] < threshold &&
          data[cur + 2] < threshold
        ) {
          while (
            x < width &&
            data[cur] < threshold &&
            data[cur + 1] < threshold &&
            data[cur + 2] < threshold
          ) {
            x++;
            cur = (y * width + x) * 4;
          }
          break;
        }
      }

      if (x >= width) {
        x = 0;
        while (
          y < height &&
          (data[cur] >= threshold ||
            data[cur + 1] >= threshold ||
            data[cur + 2] >= threshold)
        ) {
          y++;
          cur = (y * width + x) * 4;
          if (y >= height) break;
          if (
            data[cur] < threshold &&
            data[cur + 1] < threshold &&
            data[cur + 2] < threshold
          ) {
            while (
              y < height &&
              data[cur] < threshold &&
              data[cur + 1] < threshold &&
              data[cur + 2] < threshold
            ) {
              y++;
              cur = (y * width + x) * 4;
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
