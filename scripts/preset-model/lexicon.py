"""操作の概念辞書。合成データの生成と、実在の定義へのラベル付けに使う。

各概念は (粗いカテゴリ, 細かいまとまり, 種類, 初期キーの候補, 日本語ラベル, 英語の名前) を持つ。
- 粗いカテゴリ: 分担の優先度 (移動 > 視点 > 行動 > 持ち物) と、メニュー・会話の判定に使う
- 細かいまとまり: 「同じ人が持つべき操作」の教師。前後左右は1人の親指、武器1〜3と切り替えは1人、など
英語の名前は ID・設定ファイルの名前のもとになる (snake_case / CamelCase / key.xxx / +xxx に変形する)。
"""

COARSE = ["move", "look", "action", "item", "menu", "social"]
FINE = [
    "dir",        # 前後左右・上下・ハンドル
    "posture",    # ジャンプ・しゃがむ・走る・回避
    "throttle",   # アクセル・ブレーキ
    "look",       # 視点・狙い・カーソル
    "attack",     # 攻撃・撃つ・構える・防御
    "use",        # 使う・調べる・リロード・フック
    "skill",      # 必殺技・能力・特殊
    "slots",      # 武器1〜・ホットバー・切り替え
    "consumable", # 回復・クイック系
    "bag",        # インベントリを開く・捨てる・拾う
    "drive",      # ブースト・サイドブレーキ・ニトロ
    "menu",       # メニュー・マップ・スコア
    "social",     # ボイス・チャット・エモート
]

B, M, W = "button", "mouseDelta", "wheel"

# id: (coarse, fine, type, keys, ja, en)
CONCEPTS = {
    # 移動の方向
    "forward": ("move", "dir", B, ["KEY_W", "ARROW_UP"], ["前進", "前へ", "前に進む", "前移動", "進む"], ["forward", "move forward", "move up", "walk forward", "run forward"]),
    "back": ("move", "dir", B, ["KEY_S", "ARROW_DOWN"], ["後退", "後ろへ", "下がる", "後ろ移動", "バック"], ["back", "backward", "move back", "move backward", "walk back"]),
    "left": ("move", "dir", B, ["KEY_A", "ARROW_LEFT"], ["左", "左へ", "左移動", "左に移動", "左へ歩く"], ["left", "move left", "strafe left", "walk left"]),
    "right": ("move", "dir", B, ["KEY_D", "ARROW_RIGHT"], ["右", "右へ", "右移動", "右に移動", "右へ歩く"], ["right", "move right", "strafe right", "walk right"]),
    "up": ("move", "dir", B, ["KEY_W", "ARROW_UP"], ["上", "上へ", "上移動", "上に移動"], ["up", "move up", "climb up", "go up"]),
    "down": ("move", "dir", B, ["KEY_S", "ARROW_DOWN"], ["下", "下へ", "下移動", "下に移動"], ["down", "move down", "climb down", "go down"]),
    # 姿勢・移動の補助
    "jump": ("move", "posture", B, ["SPACE", "KEY_K", "KEY_Z"], ["ジャンプ", "跳ぶ", "飛ぶ", "跳躍", "ジャンプする"], ["jump", "hop", "leap", "jump up"]),
    "crouch": ("move", "posture", B, ["LCTRL", "KEY_C", "LSHIFT"], ["しゃがむ", "しゃがみ", "かがむ", "伏せる", "スニーク"], ["crouch", "sneak", "duck", "prone", "crouch toggle"]),
    "sprint": ("move", "posture", B, ["LSHIFT", "LCTRL", "KEY_X"], ["走る", "ダッシュ", "全力疾走", "走る・回避", "スプリント"], ["sprint", "run", "dash", "sprint toggle", "fast move"]),
    "dodge": ("move", "posture", B, ["SPACE", "LALT", "KEY_C", "LSHIFT"], ["回避", "ローリング", "緊急回避", "避ける", "ステップ"], ["dodge", "roll", "evade", "dodge roll", "step"]),
    "walk": ("move", "posture", B, ["LALT", "LCTRL"], ["歩く", "ゆっくり歩く", "忍び足"], ["walk", "walk toggle", "slow walk"]),
    "climb": ("move", "posture", B, ["SPACE", "KEY_F"], ["登る", "よじ登る", "つかまる"], ["climb", "mantle", "vault"]),
    # 乗り物
    "steer_left": ("move", "dir", B, ["KEY_A", "ARROW_LEFT"], ["左に曲がる", "ハンドル左", "左旋回"], ["steer left", "turn left"]),
    "steer_right": ("move", "dir", B, ["KEY_D", "ARROW_RIGHT"], ["右に曲がる", "ハンドル右", "右旋回"], ["steer right", "turn right"]),
    "accelerate": ("move", "throttle", B, ["KEY_W", "ARROW_UP"], ["アクセル", "加速", "前進する", "スロットル"], ["accelerate", "throttle", "gas", "accel"]),
    "brake": ("move", "throttle", B, ["KEY_S", "ARROW_DOWN"], ["ブレーキ", "減速", "バック・ブレーキ", "止まる"], ["brake", "reverse", "decelerate", "brake reverse"]),
    "handbrake": ("action", "drive", B, ["SPACE"], ["サイドブレーキ", "ハンドブレーキ", "ドリフト"], ["handbrake", "drift", "ebrake"]),
    "boost": ("action", "drive", B, ["LSHIFT", "KEY_N"], ["ブースト", "ニトロ", "加速アイテム"], ["boost", "nitro", "turbo"]),
    "horn": ("action", "drive", B, ["KEY_H"], ["クラクション", "ホーン"], ["horn", "honk"]),
    # 視点
    "look": ("look", "look", M, [None], ["視点", "カメラ", "見回す", "視点移動", "カメラ操作"], ["look", "camera", "view", "look around", "mouse look"]),
    "aim_cursor": ("look", "look", M, [None], ["狙い", "照準", "カーソル", "エイム", "向き"], ["aim", "cursor", "crosshair", "pointer", "aim direction"]),
    "zoom": ("look", "look", W, [None], ["ズーム", "拡大縮小", "カメラ距離"], ["zoom", "camera zoom", "zoom in out"]),
    # 攻撃
    "attack": ("action", "attack", B, ["MOUSE_L", "KEY_J"], ["攻撃", "殴る", "斬る", "通常攻撃", "攻撃する"], ["attack", "hit", "melee", "strike", "primary attack"]),
    "fire": ("action", "attack", B, ["MOUSE_L"], ["撃つ", "射撃", "発砲", "発射", "ショット"], ["fire", "shoot", "primary fire", "fire weapon", "trigger"]),
    "aim_down": ("action", "attack", B, ["MOUSE_R"], ["構える", "ズームして狙う", "覗く", "エイムする", "サイト"], ["aim down sights", "ads", "secondary fire", "alt fire", "scope"]),
    "block": ("action", "attack", B, ["MOUSE_R", "KEY_L"], ["防御", "ガード", "構える・防御", "受け流し", "盾"], ["block", "guard", "parry", "defend", "shield"]),
    "light_attack": ("action", "attack", B, ["KEY_J", "KEY_U", "MOUSE_L"], ["弱攻撃", "パンチ", "弱パンチ", "小攻撃"], ["light attack", "punch", "weak attack", "light punch"]),
    "heavy_attack": ("action", "attack", B, ["KEY_K", "KEY_I", "MOUSE_R"], ["強攻撃", "キック", "強パンチ", "大攻撃"], ["heavy attack", "kick", "strong attack", "heavy punch"]),
    "sub_attack": ("action", "attack", B, ["KEY_F", "MOUSE_R"], ["サブ攻撃", "副攻撃", "サブ武器"], ["sub attack", "secondary attack", "sub weapon"]),
    "grenade": ("action", "attack", B, ["KEY_G"], ["グレネード", "投げる", "投擲", "手榴弾"], ["grenade", "throw", "throwable", "toss"]),
    "melee": ("action", "attack", B, ["KEY_V", "KEY_F"], ["近接攻撃", "格闘", "ナイフ"], ["melee attack", "knife", "bash"]),
    # 使う
    "interact": ("action", "use", B, ["KEY_E", "KEY_F", "MOUSE_R"], ["使う", "調べる", "使う・調べる", "使う・拾う", "話す", "開ける", "調べる・開く"], ["interact", "use", "activate", "talk", "open", "pick up"]),
    "reload": ("action", "use", B, ["KEY_R"], ["リロード", "弾の補充", "装填"], ["reload", "reload weapon"]),
    "grapple": ("action", "use", B, ["KEY_E", "KEY_Q", "KEY_F"], ["フック", "グラップル", "ロープ"], ["grapple", "hook", "grappling hook"]),
    "mount": ("action", "use", B, ["KEY_R", "KEY_F"], ["騎乗", "乗る", "降りる", "乗り降り"], ["mount", "ride", "enter vehicle", "dismount"]),
    "flashlight": ("action", "use", B, ["KEY_F", "KEY_L"], ["ライト", "懐中電灯", "明かり"], ["flashlight", "torch", "light toggle"]),
    "lock_on": ("action", "use", B, ["KEY_Q", "MOUSE_M", "TAB"], ["ロックオン", "ターゲット", "注目"], ["lock on", "target", "focus target"]),
    # 能力
    "special": ("action", "skill", B, ["KEY_Q", "KEY_E", "KEY_L"], ["必殺技", "特殊攻撃", "特殊", "スキル", "アクション"], ["special", "special attack", "skill", "action", "super"]),
    "ability1": ("action", "skill", B, ["KEY_Q", "DIGIT_1"], ["能力1", "スキル1", "アビリティ1"], ["ability 1", "skill 1", "ability one"]),
    "ability2": ("action", "skill", B, ["KEY_E", "DIGIT_2"], ["能力2", "スキル2", "アビリティ2"], ["ability 2", "skill 2", "ability two"]),
    "ability3": ("action", "skill", B, ["KEY_F", "KEY_C", "DIGIT_3"], ["能力3", "スキル3", "アビリティ3"], ["ability 3", "skill 3", "ultimate"]),
    # 持ち物の切り替え
    "slot1": ("item", "slots", B, ["DIGIT_1"], ["武器1", "アイテム1", "ホットバー1", "スロット1", "メイン武器"], ["weapon 1", "item 1", "hotbar 1", "slot 1", "primary weapon"]),
    "slot2": ("item", "slots", B, ["DIGIT_2"], ["武器2", "アイテム2", "ホットバー2", "スロット2", "サブ武器"], ["weapon 2", "item 2", "hotbar 2", "slot 2", "secondary weapon"]),
    "slot3": ("item", "slots", B, ["DIGIT_3"], ["武器3", "アイテム3", "ホットバー3", "スロット3", "近接武器"], ["weapon 3", "item 3", "hotbar 3", "slot 3", "melee weapon"]),
    "slot4": ("item", "slots", B, ["DIGIT_4"], ["武器4", "アイテム4", "ホットバー4", "スロット4"], ["weapon 4", "item 4", "hotbar 4", "slot 4"]),
    "slot5": ("item", "slots", B, ["DIGIT_5"], ["武器5", "アイテム5", "ホットバー5", "スロット5"], ["weapon 5", "item 5", "hotbar 5", "slot 5"]),
    "slot6": ("item", "slots", B, ["DIGIT_6"], ["ホットバー6", "アイテム6", "スロット6"], ["hotbar 6", "item 6", "slot 6"]),
    "slot7": ("item", "slots", B, ["DIGIT_7"], ["ホットバー7", "アイテム7", "スロット7"], ["hotbar 7", "item 7", "slot 7"]),
    "slot8": ("item", "slots", B, ["DIGIT_8"], ["ホットバー8", "アイテム8", "スロット8"], ["hotbar 8", "item 8", "slot 8"]),
    "slot9": ("item", "slots", B, ["DIGIT_9"], ["ホットバー9", "アイテム9", "スロット9"], ["hotbar 9", "item 9", "slot 9"]),
    "slot10": ("item", "slots", B, ["DIGIT_0"], ["ホットバー10", "アイテム10", "スロット10"], ["hotbar 10", "item 10", "slot 10"]),
    "switch": ("item", "slots", W, [None], ["武器の切り替え", "持ち物の切り替え", "切り替え", "次の武器", "アイテム切り替え"], ["switch weapon", "next weapon", "cycle item", "hotbar scroll", "weapon wheel"]),
    "prev_weapon": ("item", "slots", B, ["KEY_Q"], ["前の武器", "直前の武器", "武器を戻す"], ["previous weapon", "last weapon", "quick switch"]),
    # 消耗品
    "heal": ("item", "consumable", B, ["KEY_H", "KEY_R", "DIGIT_4"], ["回復", "クイック回復", "回復薬", "治療", "薬を使う"], ["heal", "quick heal", "use potion", "medkit", "heal self"]),
    "quick_mana": ("item", "consumable", B, ["KEY_J"], ["クイックマナ", "マナ回復", "魔力回復"], ["quick mana", "mana potion", "restore mana"]),
    "quick_buff": ("item", "consumable", B, ["KEY_B"], ["クイックバフ", "強化", "バフ"], ["quick buff", "buff", "use buff"]),
    "quick_item": ("item", "consumable", B, ["KEY_Q", "KEY_R"], ["クイックアイテム", "アイテムを使う", "道具を使う"], ["quick item", "use item", "consumable"]),
    # 持ち物
    "inventory": ("item", "bag", B, ["KEY_E", "KEY_I", "TAB", "ESC"], ["インベントリ", "持ち物", "バッグ", "所持品", "持ち物を開く"], ["inventory", "bag", "backpack", "open inventory", "items"]),
    "drop": ("item", "bag", B, ["KEY_Q", "KEY_G"], ["捨てる", "落とす", "アイテムを捨てる", "置く"], ["drop", "drop item", "discard", "throw item"]),
    "craft": ("item", "bag", B, ["KEY_C", "TAB"], ["クラフト", "作る", "製作"], ["craft", "crafting", "build menu"]),
    # メニュー
    "pause": ("menu", "menu", B, ["ESC"], ["メニュー", "ポーズ", "一時停止", "設定", "オプション"], ["pause", "menu", "escape", "options", "pause menu"]),
    "map": ("menu", "menu", B, ["KEY_M", "TAB"], ["マップ", "地図", "全体マップ", "マップの表示", "ミニマップ"], ["map", "world map", "full map", "map style", "minimap"]),
    "score": ("menu", "menu", B, ["TAB"], ["スコア", "スコアボード", "戦績", "順位"], ["scoreboard", "score", "stats", "leaderboard"]),
    "journal": ("menu", "menu", B, ["KEY_J", "KEY_L"], ["クエスト", "日誌", "任務一覧"], ["journal", "quest log", "missions"]),
    "screenshot": ("menu", "menu", B, ["F2", "F12"], ["スクリーンショット", "撮影"], ["screenshot", "take screenshot"]),
    # 会話
    "voice": ("social", "social", B, ["KEY_V", "KEY_T"], ["ボイス", "ボイスチャット", "話す（ボイス）", "マイク"], ["voice", "push to talk", "voice chat", "mic"]),
    "chat": ("social", "social", B, ["ENTER", "KEY_T", "KEY_Y"], ["チャット", "文字チャット", "メッセージ"], ["chat", "text chat", "all chat", "team chat"]),
    "emote": ("social", "social", B, ["KEY_B", "KEY_G"], ["エモート", "ジェスチャー", "感情表現"], ["emote", "gesture", "taunt"]),
    "ping": ("social", "social", B, ["MOUSE_M", "KEY_Z"], ["ピン", "マーク", "合図"], ["ping", "mark", "signal"]),
    "report": ("social", "social", B, ["KEY_R"], ["通報", "報告する"], ["report", "report body"]),
}

# 実在のゲームの注釈 (data/labels.json) で使う概念。合成には使わない (言い回しの一覧を持たない)
CONCEPTS.update({
    "move2d": ("move", "dir", "axis2d", [], [], []),        # 2 軸の移動 (WASD をまとめたもの)
    "move_x": ("move", "dir", B, [], [], []),               # 左右の軸
    "move_y": ("move", "dir", B, [], [], []),               # 前後の軸
    "camera_toggle": ("look", "look", B, [], [], []),       # 視点の切り替え
    "grab": ("action", "use", B, [], [], []),               # つかむ・押す・引く
    "rotate": ("action", "use", B, [], [], []),             # 回す
    "pickup": ("item", "bag", B, [], [], []),               # 拾う
    "pick_item": ("item", "slots", B, [], [], []),          # 見ているものを手に持つ
    "offhand": ("item", "slots", B, [], [], []),            # 持ち替え
    "note": ("action", "skill", B, [], [], []),             # 楽器の音
    "ui": ("menu", "menu", B, [], [], []),                  # 画面の操作・デバッグ・設定
    "lean": ("move", "posture", B, [], [], []),             # 体を傾ける (左右のリーン)
    "use": ("action", "use", B, [], [], []),                # その他の使う操作 (射撃モード・スキャン・納刀など)
})

# まとまりの中での細分 (まとまりを分けるときの境目)。方向は縦と横の軸で分ける。ほかは概念ごと
AXIS = {"forward": "v", "back": "v", "up": "v", "down": "v", "accelerate": "v", "brake": "v", "move_y": "v",
        "left": "h", "right": "h", "steer_left": "h", "steer_right": "h", "move_x": "h"}


def sub_of(concept):
    return AXIS.get(concept, concept)


# 実在の定義に出てくるラベル → 概念 (同じ言い回しが辞書にない分だけ書く)
REAL_LABELS = {
    "マップの表示": "map",
    "スニーク": "crouch",
    "持ち物の切り替え": "switch",
    "使う・攻撃": "attack",
    "スマート選択": "special",
    "スマートカーソル": "special",
    "クイック騎乗": "mount",
    "能力1": "ability1",
}

# ジャンルごとの合成ゲーム: (必ず入る概念, (概念, 入る確率) の任意リスト)
GENRES = {
    "fps": (["forward", "back", "left", "right", "look", "fire"],
            [("jump", .9), ("crouch", .9), ("sprint", .9), ("aim_down", .85), ("reload", .9), ("interact", .8), ("slot1", .85), ("slot2", .85),
             ("slot3", .6), ("slot4", .2), ("slot5", .1), ("switch", .7), ("grenade", .5), ("melee", .4), ("prev_weapon", .3), ("heal", .3), ("score", .6),
             ("pause", .97), ("map", .4), ("voice", .2), ("ping", .2), ("ability1", .2), ("ability2", .2), ("ability3", .15), ("flashlight", .1), ("walk", .2)]),
    "action3d": (["forward", "back", "left", "right", "look", "attack"],
                 [("jump", .9), ("dodge", .6), ("sprint", .7), ("crouch", .5), ("block", .6), ("interact", .9), ("special", .5), ("lock_on", .4),
                  ("slot1", .6), ("slot2", .6), ("slot3", .3), ("heal", .5), ("quick_item", .3), ("inventory", .6), ("map", .6), ("pause", .97),
                  ("journal", .2), ("climb", .3), ("mount", .2), ("heavy_attack", .3), ("ability1", .2), ("ability2", .2), ("switch", .3), ("craft", .2)]),
    "platformer": (["left", "right", "jump"],
                   [("up", .5), ("down", .6), ("attack", .6), ("dodge", .4), ("sprint", .4), ("special", .3), ("interact", .3), ("heal", .2),
                    ("pause", .95), ("map", .3), ("grapple", .15)]),
    "topdown": (["up", "down", "left", "right", "aim_cursor", "attack"],
                [("dodge", .6), ("interact", .7), ("special", .5), ("ability1", .3), ("ability2", .3), ("slot1", .4), ("slot2", .4), ("heal", .4),
                 ("inventory", .5), ("map", .5), ("pause", .97), ("sprint", .2), ("reload", .2), ("zoom", .2)]),
    "racing": (["steer_left", "steer_right", "accelerate", "brake"],
               [("handbrake", .8), ("boost", .7), ("horn", .2), ("look", .2), ("pause", .97), ("map", .3)]),
    "fighting": (["left", "right", "up", "down", "light_attack", "heavy_attack"],
                 [("special", .9), ("block", .6), ("jump", .3), ("dodge", .4), ("pause", .97), ("sub_attack", .2)]),
    "sandbox": (["forward", "back", "left", "right", "jump", "look", "attack", "interact"],
                [("crouch", .8), ("sprint", .8), ("inventory", .9), ("drop", .7), ("craft", .4), ("slot1", .8), ("slot2", .8), ("slot3", .8),
                 ("slot4", .7), ("slot5", .6), ("slot6", .5), ("slot7", .4), ("slot8", .4), ("slot9", .3), ("switch", .6), ("heal", .3),
                 ("quick_mana", .1), ("quick_buff", .1), ("mount", .2), ("grapple", .2), ("pause", .97), ("map", .5), ("chat", .3), ("screenshot", .1)]),
    "terraria_like": (["up", "down", "left", "right", "jump", "aim_cursor", "attack", "interact"],
                      [("grapple", .8), ("special", .5), ("inventory", .95), ("heal", .8), ("quick_mana", .6), ("quick_buff", .6), ("mount", .5),
                       ("slot1", .9), ("slot2", .9), ("slot3", .9), ("slot4", .9), ("slot5", .9), ("slot6", .8), ("slot7", .8), ("slot8", .7),
                       ("slot9", .6), ("slot10", .5), ("map", .8), ("pause", .9)]),
    "social_deduction": (["up", "down", "left", "right", "interact"],
                         [("report", .8), ("attack", .5), ("special", .4), ("map", .9), ("voice", .7), ("chat", .5), ("emote", .3), ("pause", .9), ("sprint", .2)]),
}
