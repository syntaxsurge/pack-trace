import { createHash } from "crypto";

type Hashable = string | Buffer | Uint8Array;

function toBuffer(payload: Hashable | unknown): Buffer {
  if (payload instanceof Uint8Array && !(payload instanceof Buffer)) {
    return Buffer.from(payload);
  }

  if (payload instanceof Buffer) {
    return payload;
  }

  if (typeof payload === "string") {
    return Buffer.from(payload, "utf8");
  }

  return Buffer.from(JSON.stringify(payload), "utf8");
}

export function sha256(payload: Hashable | unknown): string {
  return createHash("sha256").update(toBuffer(payload)).digest("hex");
}

