import subprocess, numpy as np, json, sys
def frames(path, fps, crop=None, scale=None):
    vf = f"fps={fps}" + (f",crop={crop}" if crop else "") + (f",scale={scale}" if scale else "")
    w, h = map(int, (scale or crop.split(':')[0]+':'+crop.split(':')[1]).split(':')[:2])
    p = subprocess.run(['ffmpeg','-v','error','-i',path,'-vf',vf,'-f','rawvideo','-pix_fmt','rgb24','-'], capture_output=True)
    a = np.frombuffer(p.stdout, np.uint8); return a.reshape(-1, h, w, 3)
name = sys.argv[1]
ph = frames(f'{name}-phone.mp4', 30, crop='200:200:440:833')   # パッドの中央
v = ph.reshape(len(ph), -1, 3).mean(1)
base = v[0]
d = np.abs(v - base).sum(1)
i = int(np.argmax(d > 15)); print('phone highlight frame', i, i/30, v[i])
pc = frames(f'{name}-pc.mp4', 30, crop='1280:820:60:83', scale='320:205')
dd = np.abs(pc[1:].astype(int) - pc[:-1].astype(int)).reshape(len(pc)-1, -1).max(1)
j = int(np.argmax(dd > 40)) + 1; print('pc first change frame', j, j/30)
log = json.load(open(f'{name}-marks.json'))['log']
first = [e for e in log if e[0]=='d'][0][1]
json.dump({'phone_hl': i/30, 'pc_change': j/30, 'log_first_down': first}, open(f'{name}-sync.json','w'))
