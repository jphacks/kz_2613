"""build_dataset.py の読み取り (Source・Source 2・Unreal Engine 3) を、小さな見本のフォルダで確かめる。
    python scripts/preset-model/test_readers.py
実際のゲームのファイルは読まない。見本は一時フォルダに作って消す。
"""

import os
import struct
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_dataset as bd  # noqa: E402


def write(path, text, enc="utf-8"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(("﻿" + text).encode("utf-16-le") if enc == "utf-16" else text.encode("utf-8"))


def main():
    with tempfile.TemporaryDirectory() as t:
        # Source: 操作の一覧・英語と日本語の表示名 (UTF-16)・初期キー
        src = os.path.join(t, "source", "mod")
        write(os.path.join(src, "scripts", "kb_act.lst"),
              '"blank"\t"=========="\n"blank"\t"#Valve_Movement_Title"\n"+forward"\t"#Valve_Move_Forward"\n'
              '"+jump"\t"#Valve_Jump"\n"+attack"\t"#Valve_Primary_Attack"\n"invnext"\t"#Valve_Next_Weapon"\n')
        write(os.path.join(src, "resource", "mod_english.txt"),
              '"lang"\n{\n"Tokens"\n{\n"Valve_Move_Forward"\t"Move forward"\n"Valve_Jump"\t"Jump"\n'
              '"Valve_Primary_Attack"\t"Primary attack" // コメント\n"Valve_Next_Weapon"\t"Next weapon"\n}\n}\n', "utf-16")
        write(os.path.join(src, "resource", "mod_japanese.txt"),
              '"lang"\n{\n"Tokens"\n{\n"Valve_Move_Forward"\t"前進"\n"Valve_Jump"\t"ジャンプ"\n}\n}\n', "utf-16")
        write(os.path.join(src, "cfg", "config_default.cfg"),
              'bind "w" "+forward"\nbind "SPACE" "+jump"\nbind "MOUSE1" "+attack"\nbind "MWHEELDOWN" "invnext"\n')
        acts, how = bd.source_engine(os.path.join(t, "source"))
        got = {a["id"]: (a["label"], a.get("label_ja"), a.get("default")) for a in acts}
        assert how and "kb_act" in how, how
        assert got == {"+forward": ("Move forward", "前進", "KEY_W"), "+jump": ("Jump", "ジャンプ", "SPACE"),
                       "+attack": ("Primary attack", None, "MOUSE_L"), "invnext": ("Next weapon", None, "WHEEL_DOWN")}, got

        # Source 2: .vcfg の "キー" "+操作"
        write(os.path.join(t, "s2", "game", "cfg", "user_keys_default.vcfg"),
              '"config"\n{\n"bindings"\n{\n"w" "+forward"\n"s" "+back"\n"a" "+left"\n"d" "+right"\n'
              '"SPACE" "+jump"\n"MOUSE1" "+attack"\n"F1" "say hello world"\n}\n}\n')
        acts, how = bd.source_engine(os.path.join(t, "s2"))
        got = {a["id"]: a["default"] for a in acts}
        assert how and "vcfg" in how, how
        assert got == {"+forward": "KEY_W", "+back": "KEY_S", "+left": "KEY_A", "+right": "KEY_D", "+jump": "SPACE", "+attack": "MOUSE_L"}, got

        # Unreal Engine 3: キー → GBA_ の操作だけ (GBA_ → 軸の定義は除く)
        write(os.path.join(t, "ue3", "Game", "Config", "DefaultInput.ini"),
              '[Engine.PlayerInput]\nBindings=(Name="GBA_MoveForward",Command="Axis aBaseY Speed=1.0")\n'
              'Bindings=(Name="W",Command="GBA_MoveForward")\nBindings=(Name="S",Command="GBA_Backward")\n'
              'Bindings=(Name="A",Command="GBA_StrafeLeft")\nBindings=(Name="D",Command="GBA_StrafeRight")\n'
              'Bindings=(Name="SpaceBar",Command="GBA_Jump")\nBindings=(Name="LeftMouseButton",Command="GBA_Fire")\n')
        acts, how = bd.unreal3_input(os.path.join(t, "ue3"))
        got = {a["id"]: a["default"] for a in acts}
        assert how and "Unreal" in how, how
        assert got == {"GBA_MoveForward": "KEY_W", "GBA_Backward": "KEY_S", "GBA_StrafeLeft": "KEY_A", "GBA_StrafeRight": "KEY_D",
                       "GBA_Jump": "SPACE", "GBA_Fire": "MOUSE_L"}, got

        # Source で kb_act.lst と config_default.cfg が VPK に入っている場合 (データは目録の後ろ = 0x7fff)
        vroot = os.path.join(t, "vpkgame")
        files = {("lst", "scripts", "kb_act"): b'"+duck"\t"#Valve_Duck"\n"+reload"\t"#Valve_Reload"\n',
                 ("cfg", "cfg", "config_default"): b'bind "CTRL" "+duck"\nbind "r" "+reload"\n'}
        tree, data = b"", b""
        for (ext, path, name), body in files.items():
            tree += ext.encode() + b"\0" + path.encode() + b"\0" + name.encode() + b"\0"
            tree += struct.pack("<IHHIIH", 0, 0, 0x7FFF, len(data), len(body), 0xFFFF) + b"\0\0"
            data += body
        tree += b"\0"
        os.makedirs(vroot)
        with open(os.path.join(vroot, "pak01_dir.vpk"), "wb") as f:
            f.write(struct.pack("<III", 0x55AA1234, 1, len(tree)) + tree + data)
        write(os.path.join(vroot, "resource", "game_english.txt"), '"Valve_Duck"\t"Duck"\n"Valve_Reload"\t"Reload weapon"\n', "utf-16")
        acts, how = bd.source_engine(vroot)
        got = {a["id"]: (a["label"], a.get("default")) for a in acts}
        assert got == {"+duck": ("Duck", "LCTRL"), "+reload": ("Reload weapon", "KEY_R")}, got

        # Godot 4: 英字は ASCII、矢印・Shift は 1<<22 から、マウスは button_index
        g4 = os.path.join(t, "g4", "project.godot")
        write(g4, '[application]\n\nconfig/name="Platformer 2D"\n\n[input]\n\n'
                  'move_left={\n"deadzone": 0.5,\n"events": [Object(InputEventKey,"resource_local_to_scene":false,"device":-1,'
                  '"keycode":0,"physical_keycode":65,"unicode":97,"echo":false,"script":null)\n'
                  ', Object(InputEventJoypadMotion,"resource_local_to_scene":false,"device":-1,"axis":0,"axis_value":-1.0,"script":null)\n]\n}\n'
                  'jump={\n"deadzone": 0.5,\n"events": [Object(InputEventKey,"device":-1,"keycode":4194320,"physical_keycode":0,"script":null)\n]\n}\n'
                  'shoot={\n"deadzone": 0.5,\n"events": [Object(InputEventMouseButton,"device":-1,"position":Vector2(0, 0),'
                  '"global_position":Vector2(0, 0),"factor":1.0,"button_index":1,"canceled":false,"pressed":false,"double_click":false,"script":null)\n]\n}\n'
                  'run={\n"deadzone": 0.5,\n"events": [Object(InputEventKey,"device":-1,"keycode":4194325,"script":null)\n]\n}\n'
                  '\n[rendering]\n\nrenderer/rendering_method="mobile"\n')
        name, acts = bd.godot_project(g4)
        assert name == "Platformer 2D", name
        assert {a["id"]: a.get("default") for a in acts} == {"move_left": "KEY_A", "jump": "ARROW_UP", "shoot": "MOUSE_L", "run": "LSHIFT"}, acts
        # Godot 3: scancode、特殊キーは 1<<24 から
        g3 = os.path.join(t, "g3", "project.godot")
        write(g3, '[application]\n\nconfig/name="Kinematic Char"\n\n[input]\n\n'
                  'jump={\n"deadzone": 0.5,\n"events": [ Object(InputEventKey,"resource_local_to_scene":false,"device":0,"alt":false,'
                  '"scancode":32,"physical_scancode":0,"unicode":0,"echo":false,"script":null)\n ]\n}\n'
                  'move_right={\n"deadzone": 0.5,\n"events": [ Object(InputEventKey,"device":0,"scancode":16777233,"script":null)\n ]\n}\n')
        name, acts = bd.godot_project(g3)
        assert name == "Kinematic Char" and {a["id"]: a.get("default") for a in acts} == {"jump": "SPACE", "move_right": "ARROW_RIGHT"}, acts

        # Rewired の UserData: 軸は正負の表示名で 2 つ、マウスの軸は視点、マウスのボタン・ホイール、分類は ID の前に付ける
        ud = {
            "actionCategories": [{"_id": 0, "_name": "Default"}, {"_id": 5, "_name": "InGame"}],
            "actions": [
                {"_id": 61, "_name": "Move Horizontal", "_type": 0, "_descriptiveName": "Move Horizontal",
                 "_positiveDescriptiveName": "Move Right", "_negativeDescriptiveName": "Move Left", "_categoryId": 5},
                {"_id": 60, "_name": "Aim Horizontal", "_type": 0, "_descriptiveName": "Aim Horizontal",
                 "_positiveDescriptiveName": "Aim Right", "_negativeDescriptiveName": "Aim Left", "_categoryId": 5},
                {"_id": 57, "_name": "Use", "_type": 1, "_descriptiveName": "Use", "_categoryId": 5},
                {"_id": 50, "_name": "Inventory Next", "_type": 1, "_descriptiveName": "Next Slot", "_categoryId": 5},
                {"_id": 34, "_name": "Menu", "_type": 1, "_descriptiveName": "Menu", "_categoryId": 0},
            ],
            "keyboardMaps": [{"actionElementMaps": [
                {"_actionId": 61, "_axisContribution": 0, "_keyboardKeyCode": 100}, {"_actionId": 61, "_axisContribution": 1, "_keyboardKeyCode": 97},
                {"_actionId": 34, "_axisContribution": 0, "_keyboardKeyCode": 27}]}],
            "mouseMaps": [{"actionElementMaps": [
                {"_actionId": 60, "_elementType": 0, "_elementIdentifierId": 0, "_axisContribution": 0},
                {"_actionId": 57, "_elementType": 1, "_elementIdentifierId": 3, "_axisContribution": 0},
                {"_actionId": 50, "_elementType": 0, "_elementIdentifierId": 2, "_axisContribution": 0}]}],
        }
        got = {a["id"]: (a["label"], a["type"], a.get("default")) for a in bd.rewired_actions(ud)}
        assert got == {"Menu": ("Menu", "button", "ESC"), "InGame/Inventory Next": ("Next Slot", "wheel", None),
                       "InGame/Use": ("Use", "button", "MOUSE_L"), "InGame/Aim Horizontal": ("Aim Horizontal", "mouseDelta", None),
                       "InGame/Move Horizontal+": ("Move Right", "button", "KEY_D"), "InGame/Move Horizontal-": ("Move Left", "button", "KEY_A")}, got

        # 読めないフォルダは空
        os.makedirs(os.path.join(t, "empty"))
        assert bd.source_engine(os.path.join(t, "empty")) == ([], None)
        assert bd.unreal3_input(os.path.join(t, "empty")) == ([], None)
    print("合格: Source の kb_act.lst・翻訳 (英語・日本語)・初期キー・VPK の中のファイル / Source 2 の .vcfg / Unreal Engine 3 の Input.ini / Godot 3・4 の project.godot / Rewired の設定")


if __name__ == "__main__":
    main()
