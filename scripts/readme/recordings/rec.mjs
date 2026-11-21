// 録画の開始・終了（スマホ: screenrecord、PC: ffmpeg gdigrab の主画面）
import { spawn, execFileSync } from 'node:child_process';
const ADB = process.env.ADB || 'adb';
export function start(name, { pc = true } = {}) {
  const t0 = Date.now();
  const phone = spawn(ADB, ['shell', 'screenrecord', '--bit-rate', '12000000', `/sdcard/${name}.mp4`]);
  let ff = null;
  if (pc) ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', '30', '-offset_x', '0', '-offset_y', '0', '-video_size', '1920x1080', '-i', 'desktop', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', `${name}-pc.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
  const marks = [];
  return {
    mark(label) { marks.push([label, Date.now() - t0]); },
    async stop() {
      if (ff) { ff.stdin.write('q'); await new Promise(r => ff.on('exit', r)); }
      execFileSync(ADB, ['shell', 'pkill', '-INT', 'screenrecord']);
      await new Promise(r => phone.on('exit', r));
      await new Promise(r => setTimeout(r, 1500));
      execFileSync(ADB, ['pull', `/sdcard/${name}.mp4`, `${name}-phone.mp4`]);
      return marks;
    },
  };
}
