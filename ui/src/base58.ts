const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 (Bitcoin alphabet), the standard way Viso, whoiam and Freenet display public keys. */
export function toBase58(b: Uint8Array): string {
  const d: number[] = [];
  for (const byte of b) {
    let carry = byte;
    for (let i = 0; i < d.length; i++) {
      carry += d[i] << 8;
      d[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      d.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (const byte of b) {
    if (byte) break;
    out += "1";
  }
  return out + d.reverse().map((x) => B58[x]).join("");
}

/** Decode Base58 (Bitcoin alphabet) bytes. */
export function fromBase58(s: string): Uint8Array {
  let number = 0n;
  for (const letter of s) {
    const digit = B58.indexOf(letter);
    if (digit < 0) throw new Error(`${s} is not base58`);
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0n) {
    bytes.unshift(Number(number & 0xffn));
    number >>= 8n;
  }
  let zeros = 0;
  for (const letter of s) {
    if (letter !== "1") break;
    zeros++;
  }
  return new Uint8Array([...new Array(zeros).fill(0), ...bytes]);
}
