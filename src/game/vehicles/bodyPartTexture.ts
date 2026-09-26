import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import type { BodyPartLook } from '@/game-core/exterior';

/** Tiny, deterministic surface masks. No canvas, downloads, decals or deformed geometry. */
export function bodyPartTexture(scene: Scene, look: BodyPartLook): RawTexture {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const value = look.finish === 'fake_carbon' ? (((x >> 2) + (y >> 2)) % 2 ? 165 : 235) : 255;
    const offset = (y * size + x) * 4;
    pixels.set([value, value, value, 255], offset);
  }
  const line = (x0: number, y0: number, x1: number, y1: number, shade: number) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / steps), y = Math.round(y0 + (y1 - y0) * i / steps);
      pixels.set([shade, shade, shade, 255], (y * size + x) * 4);
    }
  };
  if (look.wear === 'scratched') {
    line(5, 12, 31, 17, 105); line(9, 17, 25, 20, 160); line(38, 48, 58, 42, 115);
  } else if (look.wear === 'cracked') {
    line(10, 0, 18, 17, 30); line(18, 17, 14, 29, 30); line(14, 29, 29, 40, 30);
    line(29, 40, 25, 63, 30); line(14, 29, 39, 25, 45); line(39, 25, 49, 9, 45);
  }
  const texture = RawTexture.CreateRGBATexture(pixels, size, size, scene, true, false, Texture.NEAREST_SAMPLINGMODE);
  texture.name = `exterior_${look.finish === 'fake_carbon' ? 'carbon' : 'paint'}_${look.wear}`;
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}
