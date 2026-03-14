import sharp from "sharp";
import { mkdirSync } from "fs";
import { join } from "path";

const OUT = join(import.meta.dirname, "..", "src-tauri", "icons");
mkdirSync(OUT, { recursive: true });

const src = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "C:/Users/AGrac/.cursor/projects/g-You/assets/you-icon-square.png"
);

async function run() {
  const img = sharp(
    "C:/Users/AGrac/.cursor/projects/g-You/assets/you-icon-square.png"
  );
  const meta = await img.metadata();
  const size = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width - size) / 2);
  const top = Math.floor((meta.height - size) / 2);

  const square = img.extract({ left, top, width: size, height: size });

  await square.clone().resize(1024, 1024).png().toFile(join(OUT, "icon.png"));
  await square.clone().resize(512, 512).png().toFile(join(OUT, "512x512.png"));
  await square.clone().resize(256, 256).png().toFile(join(OUT, "256x256.png"));
  await square.clone().resize(128, 128).png().toFile(join(OUT, "128x128.png"));
  await square.clone().resize(64, 64).png().toFile(join(OUT, "64x64.png"));
  await square.clone().resize(32, 32).png().toFile(join(OUT, "32x32.png"));

  await square
    .clone()
    .resize(256, 256)
    .toFormat("png")
    .toFile(join(OUT, "icon.ico"));

  await square
    .clone()
    .resize(512, 512)
    .toFormat("png")
    .toFile(join(OUT, "icon.icns"));

  console.log("Icons generated in", OUT);
}

run().catch(console.error);
