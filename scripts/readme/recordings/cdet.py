import cv2, numpy as np, json
cap = cv2.VideoCapture('rec-b-pc.mp4')
def frame(t):
    cap.set(cv2.CAP_PROP_POS_MSEC, t*1000); ok, f = cap.read(); return f[83:903, 60:1340] if ok else None
def tmpl(ta, tb, box):
    fa, fb = frame(ta), frame(tb); x, y, w, h = box
    x -= 2; y -= 2; w += 4; h += 4
    d = (np.abs(fa.astype(int)-fb.astype(int)).sum(2) > 60).astype(np.uint8)[y:y+h, x:x+w]
    d = cv2.dilate(d, np.ones((2,2),np.uint8))
    return fa[y:y+h, x:x+w].copy(), (d*255).astype(np.uint8)
T = [tmpl(1.0, 3.0, (270,557,12,19)), tmpl(4.4, 4.0, (547,315,19,24))]
cv2.imwrite('fr/t0.png', np.hstack([T[0][0], cv2.cvtColor(T[0][1], cv2.COLOR_GRAY2BGR)])); cv2.imwrite('fr/t1.png', np.hstack([T[1][0], cv2.cvtColor(T[1][1], cv2.COLOR_GRAY2BGR)]))
def find(f):
    best = None
    for k, (t, m) in enumerate(T):
        r = cv2.matchTemplate(f, t, cv2.TM_SQDIFF, mask=cv2.merge([m,m,m]))
        r = r / max(1, m.sum()/255)
        mn, _, loc, _ = cv2.minMaxLoc(r)
        if best is None or mn < best[0]: best = (mn, loc[0]+2, loc[1]+2, k)   # +2: 箱を広げた分。ほぼ先端の位置
    return best
if __name__ == '__main__':
    for t in [1.0, 3.0, 5.8, 9.4, 18.0, 30, 40.8, 46]:
        print(t, find(frame(t)))

def track(tps):
    """各時刻のカーソル位置（PCアプリの画面内の座標、先端）を返す。順に読み、前の位置から大きく飛ぶ外れ値は捨てる。"""
    cap2 = cv2.VideoCapture('rec-b-pc.mp4'); fps = cap2.get(cv2.CAP_PROP_FPS)
    want = {round(t * fps): t for t in tps}; out = {}; i = 0; last = None
    while True:
        ok, f = cap2.read()
        if not ok or i > max(want): break
        if i in want:
            s, x, y, k = find(f[83:903, 60:1340])
            out[want[i]] = (x, y, s)
        i += 1
    return out
