import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function spawnUnzip(zipPath: string, outputDir: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("unzip", ["-o", zipPath, "-d", outputDir], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

export async function materializeConvertZip(args: { convert_zip_base64: string; output_dir: string }) {
  const outDir = path.resolve(args.output_dir);
  await fsp.mkdir(outDir, { recursive: true });
  const buf = Buffer.from(args.convert_zip_base64, "base64");
  const zipPath = path.join(outDir, "assets.zip");
  await fsp.writeFile(zipPath, buf);
  const extracted = await spawnUnzip(zipPath, outDir);
  return { output_dir: outDir, zip_path: zipPath, extracted };
}

