export interface RxLogEvent {
  type: "signal" | "bits" | "decode";
  timestamp: number;
  color?: string | null;
  bits?: number[];
  allBits?: number[];
  partialMessage?: string;
}
