import { toArrayBuffer } from '../utils/buffer.util';

describe('Buffer Util - N-01 ArrayBuffer Slicing', () => {
  it('extracts exactly the slice when using toArrayBuffer', () => {
    // 1. Create a large ArrayBuffer (memory pool) of 16 bytes
    const pool = new ArrayBuffer(16);
    const poolView = new Uint8Array(pool);
    poolView.fill(0); // [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]

    // 2. Create a smaller Buffer that references a slice in the middle of the pool
    // Equivalent to a Buffer returned by Multer in production
    // Offset 4, length 4 bytes: [255, 255, 255, 255]
    const buf = Buffer.from(pool, 4, 4);
    buf.fill(255); 
    
    // Validate the pool state: [0,0,0,0, 255,255,255,255, 0,0,0,0, 0,0,0,0]
    expect(poolView[3]).toBe(0);
    expect(poolView[4]).toBe(255);
    
    // 3. The original buggy code used buf.buffer
    // This exposes the entire 16-byte pool, not just the 4 bytes!
    const buggyBuffer = buf.buffer;
    expect(buggyBuffer.byteLength).toBe(16); // Bug! Should be 4
    expect(new Uint8Array(buggyBuffer)[0]).toBe(0); // Reads outside the intended file bounds!

    // 4. Test the fix using toArrayBuffer helper
    const correctBuffer = toArrayBuffer(buf);
    
    // Now it correctly isolates the 4 bytes
    expect(correctBuffer.byteLength).toBe(4);
    
    // And contains only the 255s
    const correctView = new Uint8Array(correctBuffer);
    expect(correctView[0]).toBe(255);
    expect(correctView[3]).toBe(255);
  });
});
