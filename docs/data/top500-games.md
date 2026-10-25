# 主要500タイトルの一覧（#98）

- 作成日：2026-10-25（`scripts/profiles/build-catalog.mjs` で生成。手で書き換えない）
- 選定：Steamの公開データ（売上上位1000・全期間の売上上位1000・最もプレイされている100・月ごとのトップリリース）の順位を合算し、ゲームだけを上位から 498 本。個別の定義があるのに上位に入らなかった 2 本（このPCで抽出したもの等）と、Steam外の 2 本（ゲーム検出で見分けられるもの）を加えた計 502 本。
- 定義：個別の定義（`scripts/profiles/overrides/`）がなければ、Steamのタグからジャンルの型を当てて作った**仮の定義（template）**。実機で確かめていない定義を確認済みとして扱わない。
- 状態：device 1／extracted 4／unverified 9／template 488
- 向き：good 215／limited 180／unsuitable 107（unsuitable はマウス中心・ターン制等で、分担の対象外）

| 順位 | ゲーム | AppID | 型 | 向き | 状態 | コントローラー完全対応 |
|---|---|---|---|---|---|---|
| 1 | Counter-Strike 2 | 730 | override | good | unverified |  |
| 2 | Dota 2 | 570 | pointer | unsuitable | template |  |
| 3 | Cyberpunk 2077 | 1091500 | fps | limited | template |  |
| 4 | Apex Legends™ | 1172470 | fps | good | template |  |
| 5 | AION 2 | 3393110 | action3d | limited | template |  |
| 6 | WARDOGS | 1867240 | fps | limited | template |  |
| 7 | PUBG: BATTLEGROUNDS | 578080 | action3d | limited | template |  |
| 8 | Marvel Rivals | 2767030 | action3d | good | template |  |
| 9 | War Thunder | 236390 | action3d | good | template |  |
| 10 | Call of Duty® | 1938090 | fps | good | template |  |
| 11 | Tom Clancy's Rainbow Six Siege | 359550 | fps | good | template |  |
| 12 | HELLDIVERS™ 2 | 553850 | action3d | good | template |  |
| 13 | Overwatch® | 2357570 | action3d | good | template |  |
| 14 | Dead by Daylight | 381210 | action3d | good | template |  |
| 15 | R.E.P.O. | 3241660 | override | good | extracted |  |
| 16 | Warframe | 230410 | action3d | good | template |  |
| 17 | Slay the Spire 2 | 2868840 | pointer | unsuitable | template |  |
| 18 | ARC Raiders | 1808500 | action3d | good | template |  |
| 19 | Rust | 252490 | action3d | good | template |  |
| 20 | Grand Theft Auto V Enhanced | 3240220 | action3d | good | template |  |
| 21 | Monster Hunter Wilds | 2246340 | action3d | good | template |  |
| 22 | Enshrouded | 1203620 | action3d | good | template |  |
| 23 | Battlefield™ 6 | 2807960 | fps | limited | template |  |
| 24 | Valheim | 892970 | override | good | unverified |  |
| 25 | EA SPORTS FC™ 27 | 4080220 | action3d | limited | template |  |
| 26 | Stardew Valley | 413150 | override | good | unverified |  |
| 27 | Team Fortress 2 | 440 | override | good | unverified |  |
| 28 | BeamNG.drive | 284160 | racing | good | template |  |
| 29 | Aniimo | 4126040 | action3d | good | template |  |
| 30 | VRChat | 438100 | action3d | limited | template |  |
| 31 | Limbus Company | 1973530 | pointer | unsuitable | template |  |
| 32 | Delta Force | 2507950 | fps | good | template |  |
| 33 | Project Zomboid | 108600 | action3d | good | template |  |
| 34 | Baldur's Gate 3 | 1086940 | pointer | unsuitable | template |  |
| 35 | Don't Starve Together | 322330 | action3d | good | template |  |
| 36 | The Binding of Isaac: Rebirth | 250900 | topdown | good | template |  |
| 37 | PEAK | 3527290 | action3d | good | template |  |
| 38 | Terraria | 105600 | override | good | extracted |  |
| 39 | Total War: WARHAMMER III | 1142710 | pointer | unsuitable | template |  |
| 40 | ELDEN RING | 1245620 | action3d | good | template |  |
| 41 | DayZ | 221100 | action3d | good | template |  |
| 42 | Forza Horizon 6 | 2483190 | racing | good | template |  |
| 43 | THE FINALS | 2073850 | fps | good | template |  |
| 44 | Geometry Dash | 322170 | platformer | limited | template |  |
| 45 | Sid Meier's Civilization VII | 1295660 | pointer | unsuitable | template |  |
| 46 | Hearts of Iron IV | 394360 | pointer | unsuitable | template |  |
| 47 | Palworld | 1623730 | action3d | good | template |  |
| 48 | Left 4 Dead 2 | 550 | override | good | unverified |  |
| 49 | Risk of Rain 2 | 632360 | action3d | good | template |  |
| 50 | How to Fish | 4001890 | action3d | good | template |  |
| 51 | Red Dead Redemption 2 | 1174180 | action3d | good | template |  |
| 52 | RimWorld | 294100 | action3d | limited | template |  |
| 53 | Destiny 2 | 1085660 | fps | limited | template |  |
| 54 | The Sims™ 4 | 1222670 | action3d | limited | template |  |
| 55 | Dressmaker | 4019220 | action3d | limited | template |  |
| 56 | The Elder Scrolls V: Skyrim Special Edition | 489830 | action3d | limited | template |  |
| 57 | Yu-Gi-Oh! Master Duel | 1449850 | pointer | unsuitable | template |  |
| 58 | Farming Simulator 25 | 2300320 | action3d | good | template |  |
| 59 | Warhammer 40,000: Space Marine 2 | 2183900 | action3d | good | template |  |
| 60 | The Outlast Trials | 1304930 | action3d | good | template |  |
| 61 | Wuthering Waves | 3513350 | action3d | limited | template |  |
| 62 | Street Fighter™ 6 | 1364780 | fighting | limited | template |  |
| 63 | Phasmophobia | 739630 | action3d | limited | template |  |
| 64 | FINAL FANTASY RESONANCE | 3259780 | pointer | unsuitable | template |  |
| 65 | Once Human | 2139460 | action3d | good | template |  |
| 66 | The Witcher 3: Wild Hunt — Remastered | 292030 | action3d | limited | template |  |
| 67 | Garry's Mod | 4000 | override | good | unverified |  |
| 68 | Arena Breakout: Infinite | 2073620 | fps | good | template |  |
| 69 | Call of Duty®: Modern Warfare® 4 | 4435490 | fps | good | template |  |
| 70 | Resident Evil 4 | 2050650 | action3d | limited | template |  |
| 71 | Scam With Your Friends | 4954910 | action3d | good | template |  |
| 72 | Phantom Blade Zero | 4115450 | action3d | limited | template |  |
| 73 | STAR WARS: Galactic Racer™ | 4078430 | racing | limited | template |  |
| 74 | NARAKA: BLADEPOINT | 1203220 | action3d | limited | template |  |
| 75 | MapleStory | 216150 | platformer | limited | template |  |
| 76 | Zenless Zone Zero | 4162040 | action3d | limited | template |  |
| 77 | Moon Sweepers | 5335510 | action3d | good | template |  |
| 78 | Planet Zoo 2 | 3219030 | pointer | unsuitable | template |  |
| 79 | over the hill | 2929250 | racing | good | template |  |
| 80 | NBA 2K27 | 4356430 | pointer | unsuitable | template |  |
| 81 | Kingdom Come: Deliverance II | 1771300 | action3d | limited | template |  |
| 82 | Path of Exile 2 | 2694490 | topdown | limited | template |  |
| 83 | Gears of War: E-Day | 3010850 | action3d | good | template |  |
| 84 | RuneScape: Dragonwilds | 1374490 | action3d | good | template |  |
| 85 | Resident Evil Requiem | 3764200 | action3d | limited | template |  |
| 86 | ACE COMBAT 8: WINGS OF THEVE | 2288340 | action3d | good | template |  |
| 87 | Where Winds Meet | 3564740 | action3d | good | template |  |
| 88 | Crimson Desert Enhanced | 3321460 | action3d | limited | template |  |
| 89 | Escape from Tarkov | 3932890 | fps | good | template |  |
| 90 | Magic: The Gathering Arena | 2141910 | pointer | unsuitable | template |  |
| 91 | Crusader Kings III | 1158310 | pointer | unsuitable | template |  |
| 92 | Warrior Cats: Clans of the Forest | 3960600 | action3d | limited | template |  |
| 93 | Tape to Tape | 1566200 | topdown | good | template |  |
| 94 | Euro Truck Simulator 2 | 227300 | racing | good | template |  |
| 95 | Castlevania: Belmont's Curse | 4231820 | platformer | limited | template |  |
| 96 | Dragon's Dogma 2 | 2054970 | action3d | limited | template |  |
| 97 | The Walking Dead: The Telltale Definitive Series | 1449690 | action3d | limited | template |  |
| 98 | Gray Zone Warfare | 2479810 | fps | good | template |  |
| 99 | Sid Meier’s Civilization® VI | 289070 | pointer | unsuitable | template |  |
| 100 | We Were Here Tomorrow | 2315050 | pointer | unsuitable | template |  |
| 101 | Torchlight: Infinite | 1974050 | action3d | good | template |  |
| 102 | Clive Barker's Hellraiser: Revival | 1551980 | action3d | limited | template |  |
| 103 | Age of Empires II: Definitive Edition | 813780 | pointer | unsuitable | template |  |
| 104 | The Elder Scrolls® Online | 306130 | action3d | limited | template |  |
| 105 | FINAL FANTASY XIV Online | 39210 | pointer | unsuitable | template |  |
| 106 | Tomb Raider IV-VI Remastered | 2525380 | action3d | limited | template |  |
| 107 | EA SPORTS™ Madden NFL 27 | 3940610 | pointer | unsuitable | template |  |
| 108 | Far Far West | 3124540 | fps | good | template |  |
| 109 | Groundwork Simulator | 5306540 | action3d | good | template |  |
| 110 | Fallout 76 | 1151340 | action3d | good | template |  |
| 111 | Disney Dreamlight Valley | 1401590 | action3d | limited | template |  |
| 112 | American Truck Simulator | 270880 | racing | good | template |  |
| 113 | Big Walk | 1478500 | action3d | good | template |  |
| 114 | Bodycam | 2406770 | fps | limited | template |  |
| 115 | theHunter: Call of the Wild™ | 518790 | fps | good | template |  |
| 116 | Gamble With Your Friends | 3892270 | action3d | good | template |  |
| 117 | Mycopunk | 3247750 | fps | good | template |  |
| 118 | BOMBANANA! | 4656000 | action3d | good | template |  |
| 119 | The Blood of Dawnwalker | 3751260 | action3d | limited | template |  |
| 120 | Schedule I | 3164500 | action3d | good | template |  |
| 121 | Invokyr | 3883570 | action3d | good | template |  |
| 122 | Hood Warfare 2 | 5155360 | fps | limited | template |  |
| 123 | No More Room in Hell 2 | 292000 | fps | good | template |  |
| 124 | Aimlabs | 714010 | action3d | good | template |  |
| 125 | Battlefield™ REDSEC | 3028330 | fps | limited | template |  |
| 126 | Factorio | 427520 | action3d | good | template |  |
| 127 | CONTROL Resonant | 3669870 | action3d | limited | template |  |
| 128 | IdleOn - The Incremental MMO | 1476970 | pointer | unsuitable | template |  |
| 129 | Black Desert | 582660 | action3d | limited | template |  |
| 130 | iRacing | 266410 | racing | limited | template |  |
| 131 | Escape from Playtime | 2087540 | action3d | good | template |  |
| 132 | S.T.A.L.K.E.R. 2: Heart of Chornobyl | 1643320 | fps | limited | template |  |
| 133 | Marvel's Spider-Man 2 | 2651280 | action3d | limited | template |  |
| 134 | Victoria 3 | 529340 | pointer | unsuitable | template |  |
| 135 | The Jackbox Party Pack 12 | 4199960 | pointer | unsuitable | template |  |
| 136 | Warhammer 40,000: Dawn of War IV | 2272360 | pointer | unsuitable | template |  |
| 137 | PRAGMATA | 3357650 | action3d | limited | template |  |
| 138 | Chained Beasts | 3569420 | topdown | good | template |  |
| 139 | Active Matter | 2887580 | fps | good | template |  |
| 140 | ARK: Survival Ascended | 2399830 | action3d | good | template |  |
| 141 | Mount & Blade II: Bannerlord | 261550 | action3d | limited | template |  |
| 142 | Diablo® IV | 2344520 | topdown | good | template |  |
| 143 | Trash Day | 3314580 | action3d | good | template |  |
| 144 | Resident Evil 7 Biohazard | 418370 | action3d | limited | template |  |
| 145 | EA SPORTS™ College Football 27 | 4032350 | pointer | unsuitable | template |  |
| 146 | Brick by Brick: Tidy Up the Small Town! | 5228920 | pointer | unsuitable | template |  |
| 147 | STAR WARS Zero Company™ | 2075800 | pointer | unsuitable | template |  |
| 148 | Subnautica 2 | 1962700 | action3d | good | template |  |
| 149 | Transport Fever 3 | 3493540 | pointer | unsuitable | template |  |
| 150 | GONE Fishing | 3645890 | action3d | good | template |  |
| 151 | Cities: Skylines II | 949230 | pointer | unsuitable | template |  |
| 152 | Bloons TD 6 | 960090 | pointer | unsuitable | template |  |
| 153 | Brawlhalla | 291550 | fighting | limited | template |  |
| 154 | Granblue Fantasy: Relink | 881020 | action3d | good | template |  |
| 155 | Shift At Midnight | 3722330 | action3d | good | template |  |
| 156 | Dispatch | 2592160 | action3d | limited | template |  |
| 157 | ONE PIECE: Grand Gourmet | 3905010 | pointer | unsuitable | template |  |
| 158 | FOR HONOR™ | 304390 | action3d | good | template |  |
| 159 | Umamusume: Pretty Derby | 3224770 | action3d | limited | template |  |
| 160 | Automobilista 2 | 1066890 | racing | limited | template |  |
| 161 | Resident Evil Village | 1196590 | action3d | limited | template |  |
| 162 | eFootball™ | 1665460 | action3d | limited | template |  |
| 163 | Stellaris | 281990 | pointer | unsuitable | template |  |
| 164 | Warhammer 40,000: Darktide | 1361210 | fps | good | template |  |
| 165 | Microsoft Flight Simulator 2024 | 2537590 | pointer | unsuitable | template |  |
| 166 | The Isle | 376210 | action3d | limited | template |  |
| 167 | Assetto Corsa | 244210 | racing | limited | template |  |
| 168 | Resident Evil 2 | 883710 | action3d | limited | template |  |
| 169 | Sky: Children of the Light | 2325290 | action3d | good | template |  |
| 170 | Grounded 2 | 2661300 | action3d | good | template |  |
| 171 | Ready or Not | 1144200 | fps | good | template |  |
| 172 | Minecraft Dungeons II | 1912410 | action3d | good | template |  |
| 173 | STAR WARS™: The Old Republic™ | 1286830 | action3d | limited | template |  |
| 174 | Onimusha: Way of the Sword | 2638890 | action3d | limited | template |  |
| 175 | The Last Caretaker | 1783560 | action3d | limited | template |  |
| 176 | Call of Duty®: Black Ops III | 311210 | fps | good | template |  |
| 177 | Valor Mortis | 2828710 | action3d | limited | template |  |
| 178 | Fallout 4 | 377160 | action3d | limited | template |  |
| 179 | SnowRunner | 1465360 | racing | good | template |  |
| 180 | Escape the Backrooms | 1943950 | action3d | good | template |  |
| 181 | 7 Days to Die | 251570 | action3d | good | template |  |
| 182 | Age of Empires IV: Anniversary Edition | 1466860 | pointer | unsuitable | template |  |
| 183 | Shadow of the Tomb Raider: Definitive Edition | 750920 | action3d | limited | template |  |
| 184 | Deep Dish Dungeon | 2871520 | action3d | good | template |  |
| 185 | Halloween: The Game | 3219630 | action3d | good | template |  |
| 186 | World of Warships | 552990 | action3d | good | template |  |
| 187 | Silver Pines | 2333000 | platformer | limited | template |  |
| 188 | NTE: Neverness to Everness | 4508340 | action3d | good | template |  |
| 189 | Hunt: Showdown 1896 | 594650 | fps | good | template |  |
| 190 | Satisfactory | 526870 | action3d | good | template |  |
| 191 | RV There Yet? | 3949040 | action3d | good | template |  |
| 192 | Lost Ark | 1599340 | action3d | limited | template |  |
| 193 | MECCHA CHAMELEON | 4704690 | pointer | unsuitable | template |  |
| 194 | HITMAN World of Assassination | 1659040 | action3d | limited | template |  |
| 195 | Tom Clancy’s The Division® 2 | 2221490 | action3d | good | template |  |
| 196 | Among Us | 945360 | override | good | unverified |  |
| 197 | Bruisers 2D Boxing | 3740090 | action3d | limited | template |  |
| 198 | Heartopia | 4025700 | pointer | unsuitable | template |  |
| 199 | DC Universe™ Online | 24200 | action3d | limited | template |  |
| 200 | Mortal Shell II | 2584270 | action3d | limited | template |  |
| 201 | Wanderburg | 3624140 | topdown | limited | template |  |
| 202 | Deep Rock Galactic | 548430 | fps | good | template |  |
| 203 | Wizard101 | 799960 | pointer | unsuitable | template |  |
| 204 | Age of Wonders 4 | 1669000 | pointer | unsuitable | template |  |
| 205 | Quarantine Zone: The Last Check | 3419520 | action3d | limited | template |  |
| 206 | REMATCH | 2138720 | action3d | limited | template |  |
| 207 | Guild Wars 2® | 1284210 | action3d | limited | template |  |
| 208 | The First Descendant | 2074920 | action3d | good | template |  |
| 209 | DELTARUNE | 1671210 | topdown | limited | template |  |
| 210 | Halo: The Master Chief Collection | 976730 | fps | good | template |  |
| 211 | MY HERO ULTRA RUMBLE | 1607250 | action3d | good | template |  |
| 212 | EA Play | 1289670 | racing | limited | template |  |
| 213 | Happy Wheels | 4705510 | action3d | limited | template |  |
| 214 | PAYDAY 2 | 218620 | fps | good | template |  |
| 215 | ELDEN RING NIGHTREIGN | 2622380 | action3d | good | template |  |
| 216 | Sons Of The Forest | 1326470 | action3d | good | template |  |
| 217 | Warhammer 40,000: Boltgun 2 | 3115160 | fps | limited | template |  |
| 218 | Don't Starve | 219740 | action3d | limited | template |  |
| 219 | Stupid Never Dies | 3486530 | action3d | limited | template |  |
| 220 | Monster Prom 4: Monster Con | 2869860 | pointer | unsuitable | template |  |
| 221 | DRAGON BALL XENOVERSE 2 | 454650 | fighting | limited | template |  |
| 222 | Dead Cells | 588650 | platformer | limited | template |  |
| 223 | Raft | 648800 | action3d | good | template |  |
| 224 | Machine Party | 4108000 | action3d | good | template |  |
| 225 | Tabletop Simulator | 286160 | pointer | unsuitable | template |  |
| 226 | Rise of the Tomb Raider™ | 391220 | action3d | limited | template |  |
| 227 | Order of the Sinking Star | 499170 | topdown | limited | template |  |
| 228 | Resident Evil 3 | 952060 | action3d | limited | template |  |
| 229 | Dune: Awakening | 1172710 | action3d | good | template |  |
| 230 | Digimon Story Time Stranger | 1984270 | pointer | unsuitable | template |  |
| 231 | Foundation | 690830 | pointer | unsuitable | template |  |
| 232 | Permafrost | 2254990 | action3d | good | template |  |
| 233 | Tenebris Somnia | 2121510 | action3d | limited | template |  |
| 234 | DREDGE | 1562430 | action3d | limited | template |  |
| 235 | Half Sword | 2397300 | action3d | limited | template |  |
| 236 | Space Engineers 2 | 1133870 | action3d | limited | template |  |
| 237 | inZOI | 2456740 | pointer | unsuitable | template |  |
| 238 | Clair Obscur: Expedition 33 | 1903340 | pointer | unsuitable | template |  |
| 239 | Split Fiction | 2001120 | action3d | good | template |  |
| 240 | Killing Floor 2 | 232090 | fps | good | template |  |
| 241 | ReStory: Chill Electronics Repairs | 3812600 | pointer | unsuitable | template |  |
| 242 | Timberborn | 1062090 | pointer | unsuitable | template |  |
| 243 | One Million Coins | 5258340 | action3d | limited | template |  |
| 244 | TCG Card Shop Simulator | 3070070 | pointer | unsuitable | template |  |
| 245 | Call of Duty®: Warzone™ | 1962663 | fps | good | template |  |
| 246 | STALZONE | 1818450 | fps | limited | template |  |
| 247 | Borderlands 4 | 1285190 | fps | good | template |  |
| 248 | The Planet Crafter | 1284190 | action3d | good | template |  |
| 249 | MechWarrior 5: Mercenaries | 784080 | fps | good | template |  |
| 250 | Jurassic World Evolution 3 | 2958130 | pointer | unsuitable | template |  |
| 251 | Conan Exiles Enhanced | 440900 | action3d | good | template |  |
| 252 | Sea of Thieves: 2026 Edition | 1172620 | action3d | good | template |  |
| 253 | Assassin's Creed Black Flag Resynced | 3751950 | action3d | limited | template |  |
| 254 | Arma Reforger | 1874880 | fps | good | template |  |
| 255 | Manor Lords | 1363080 | pointer | unsuitable | template |  |
| 256 | Tidy Up the Halloween Shop | 5316540 | action3d | limited | template |  |
| 257 | Atomic Heart | 668580 | fps | limited | template |  |
| 258 | No Man's Sky | 275850 | action3d | good | template |  |
| 259 | Lethal Company | 1966720 | override | good | unverified |  |
| 260 | Way of the Hunter 2 | 2543830 | fps | good | template |  |
| 261 | War Robots | 767560 | action3d | limited | template |  |
| 262 | World of Tanks | 1407200 | action3d | limited | template |  |
| 263 | WWE 2K26 | 3717070 | fighting | limited | template |  |
| 264 | METRO 2039 | 2590240 | fps | limited | template |  |
| 265 | Vampire Survivors | 1794680 | topdown | good | template |  |
| 266 | Tainted Grail: The Fall of Avalon | 1466060 | action3d | limited | template |  |
| 267 | Graveyard Keeper 2 | 4358690 | action3d | limited | template |  |
| 268 | Mass Effect™ Legendary Edition | 1328670 | action3d | limited | template |  |
| 269 | Palia | 2707930 | action3d | good | template |  |
| 270 | REANIMAL | 2129530 | action3d | good | template |  |
| 271 | Gunfire Reborn | 1217060 | fps | good | template |  |
| 272 | Resident Evil 5 | 21690 | action3d | good | template |  |
| 273 | No Rest for the Wicked | 1371980 | action3d | good | template |  |
| 274 | Empires of the Undergrowth | 463530 | pointer | unsuitable | template |  |
| 275 | Slime Rancher 2 | 1657630 | action3d | limited | template |  |
| 276 | Diablo II: Resurrected – Infernal Edition | 2536520 | topdown | good | template |  |
| 277 | Paralives | 1118520 | action3d | limited | template |  |
| 278 | DYNASTY WARRIORS 3: Complete Edition Remastered | 3841510 | action3d | good | template |  |
| 279 | F1® 25 | 3059520 | racing | limited | template |  |
| 280 | Windrose | 3041230 | action3d | good | template |  |
| 281 | SMITE 2 | 2437170 | action3d | good | template |  |
| 282 | It Takes Two | 1426210 | action3d | good | template |  |
| 283 | Abiotic Factor | 427410 | action3d | good | template |  |
| 284 | Nivalis Nights | 1488490 | action3d | limited | template |  |
| 285 | Cat Mail Co. | 4380490 | pointer | unsuitable | template |  |
| 286 | Starfield | 1716740 | action3d | limited | template |  |
| 287 | the cabin game | 4406280 | pointer | unsuitable | template |  |
| 288 | World of Sea Battle | 2948190 | action3d | good | template |  |
| 289 | Dupery: A Game of Solo Deduction | 3845070 | pointer | unsuitable | template |  |
| 290 | GIRLS' FRONTLINE 2: EXILIUM | 3347400 | pointer | unsuitable | template |  |
| 291 | Tomb Raider I-III Remastered Starring Lara Croft | 2478970 | action3d | limited | template |  |
| 292 | BioShock Infinite | 8870 | fps | limited | template |  |
| 293 | REKA | 1737870 | action3d | limited | template |  |
| 294 | House Flipper 2 | 1190970 | action3d | good | template |  |
| 295 | Arknights: Endfield | 4732690 | action3d | limited | template |  |
| 296 | 007 First Light | 3768760 | action3d | limited | template |  |
| 297 | Overcooked! 2 | 728880 | action3d | good | template |  |
| 298 | Pathogenic | 3808690 | topdown | good | template |  |
| 299 | ICARUS | 1149460 | action3d | good | template |  |
| 300 | Japanese Ramen Simulator | 4968640 | fps | good | template |  |
| 301 | Cities: Skylines | 255710 | pointer | unsuitable | template |  |
| 302 | Resident Evil 6 | 221040 | action3d | good | template |  |
| 303 | Deadzone: Rogue | 3228590 | fps | good | template |  |
| 304 | Shipping Store Simulator 2037 | 4098030 | pointer | unsuitable | template |  |
| 305 | GTFO | 493520 | fps | good | template |  |
| 306 | FINAL FANTASY VII REVELATION | 4354570 | action3d | limited | template |  |
| 307 | Bank Simulator | 3355800 | action3d | limited | template |  |
| 308 | DRAGON BALL: Sparking! ZERO | 1790600 | fighting | limited | template |  |
| 309 | Call of Duty®: Black Ops II | 202970 | fps | good | template |  |
| 310 | Supermarket Simulator | 2670630 | action3d | good | template |  |
| 311 | System Shock 2: 25th Anniversary Remaster | 866570 | fps | good | template |  |
| 312 | Star Trek Online | 9900 | action3d | limited | template |  |
| 313 | Frosthaven | 2347080 | pointer | unsuitable | template |  |
| 314 | Hell Let Loose: Vietnam | 3079210 | fps | limited | template |  |
| 315 | VEIN | 1857950 | action3d | good | template |  |
| 316 | Call of Duty®: Modern Warfare® | 2000950 | fps | good | template |  |
| 317 | Cult of the Lamb | 1313140 | pointer | unsuitable | template |  |
| 318 | Witchspire | 2679100 | action3d | good | template |  |
| 319 | Warhammer 40,000: Rogue Trader | 2186680 | pointer | unsuitable | template |  |
| 320 | Escape Simulator 2 | 2879840 | action3d | good | template |  |
| 321 | TEKKEN 8 | 1778820 | fighting | limited | template |  |
| 322 | ARK: Survival Evolved | 346110 | action3d | good | template |  |
| 323 | Car Park Capital | 3031880 | pointer | unsuitable | template |  |
| 324 | Bills Must Be Paid | 4421010 | pointer | unsuitable | template |  |
| 325 | Monster Hunter Stories 3: Twisted Reflection | 2852190 | pointer | unsuitable | template |  |
| 326 | House Flipper | 613100 | action3d | limited | template |  |
| 327 | ULTRAKILL | 1229490 | fps | limited | template |  |
| 328 | WorldBox - God Simulator | 1206560 | pointer | unsuitable | template |  |
| 329 | Drive Beyond Horizons | 2625420 | racing | good | template |  |
| 330 | Burglin' Gnomes | 3844970 | action3d | good | template |  |
| 331 | Call of Duty®: Modern Warfare® III | 3595270 | fps | good | template |  |
| 332 | Call of Duty®: Black Ops 7 | 3606480 | fps | good | template |  |
| 333 | Backrooms: Escape Together | 2141730 | action3d | good | template |  |
| 334 | Online: 404 | 4094350 | action3d | good | template |  |
| 335 | Ghost of Tsushima DIRECTOR'S CUT | 2215430 | action3d | good | template |  |
| 336 | Grounded | 962130 | action3d | good | template |  |
| 337 | Waterpark Simulator | 3293260 | action3d | good | template |  |
| 338 | NARUTO X BORUTO Ultimate Ninja STORM CONNECTIONS | 1020790 | fighting | limited | template |  |
| 339 | PowerWash Simulator 2 | 2968420 | action3d | good | template |  |
| 340 | Star Trek: Outposts Unknown | 3469910 | pointer | unsuitable | template |  |
| 341 | Moonlight Peaks | 2209900 | action3d | limited | template |  |
| 342 | South Park™: The Fractured But Whole™ | 488790 | action3d | limited | template |  |
| 343 | Dying Light 2 Stay Human: Reloaded Edition | 534380 | action3d | good | template |  |
| 344 | Tropico 6 | 492720 | pointer | unsuitable | template |  |
| 345 | Monster Prom 3: Monster Roadtrip | 1665190 | pointer | unsuitable | template |  |
| 346 | Black Myth: Wukong | 2358720 | action3d | limited | template |  |
| 347 | Tomb Raider Game of the Year | 203160 | action3d | limited | template |  |
| 348 | Super Battle Golf | 4069520 | action3d | limited | template |  |
| 349 | System Shock | 482400 | fps | limited | template |  |
| 350 | Teardown | 1167630 | action3d | good | template |  |
| 351 | Blood Strike | 3199170 | fps | good | template |  |
| 352 | Throne and Liberty | 2429640 | action3d | limited | template |  |
| 353 | Marvel’s Spider-Man Remastered | 1817070 | action3d | limited | template |  |
| 354 | Planet Coaster 2 | 2688950 | pointer | unsuitable | template |  |
| 355 | The Gold River Project | 1253220 | action3d | good | template |  |
| 356 | Grim Dawn | 219990 | topdown | good | template |  |
| 357 | Hollow Knight: Silksong | 1030300 | platformer | limited | template |  |
| 358 | Infinity Nikki | 3164330 | action3d | good | template |  |
| 359 | iRacing® Studios NASCAR 26 | 4883590 | racing | limited | template |  |
| 360 | World of Tanks Blitz | 444200 | fps | good | template |  |
| 361 | Dimraeth | 2402680 | action3d | good | template |  |
| 362 | Sonic Racing: CrossWorlds | 2486820 | racing | good | template |  |
| 363 | GemCraft - Legacy Collection | 4207990 | topdown | limited | template |  |
| 364 | Pummel Party | 880940 | pointer | unsuitable | template |  |
| 365 | Elite Dangerous | 359320 | action3d | good | template |  |
| 366 | DARK SOULS™ III | 374320 | action3d | good | template |  |
| 367 | Le Mans Ultimate | 2399420 | racing | limited | template |  |
| 368 | RuneScape ® | 1343400 | action3d | limited | template |  |
| 369 | Hollow Knight | 367520 | platformer | limited | template |  |
| 370 | Summoners War | 2426960 | pointer | unsuitable | template |  |
| 371 | Slay the Spire | 646570 | pointer | unsuitable | template |  |
| 372 | Nuclear Option | 2168680 | action3d | good | template |  |
| 373 | God of War Ragnarök | 2322010 | action3d | limited | template |  |
| 374 | Warhammer 40,000: Dawn of War - Definitive Edition | 3556750 | pointer | unsuitable | template |  |
| 375 | IRON NEST: Heavy Turret Simulator | 2950790 | pointer | unsuitable | template |  |
| 376 | Undertale | 391540 | action3d | limited | template |  |
| 377 | Fields of Mistria | 2142790 | pointer | unsuitable | template |  |
| 378 | Chained Together | 2567870 | platformer | good | template |  |
| 379 | Balatro | 2379780 | pointer | unsuitable | template |  |
| 380 | Call of Duty®: Modern Warfare® II | 3595230 | action3d | good | template |  |
| 381 | Master of Command | 2878450 | pointer | unsuitable | template |  |
| 382 | KINGDOM HEARTS -HD 1.5+2.5 ReMIX- | 2552430 | action3d | limited | template |  |
| 383 | Soulmask | 2646460 | action3d | good | template |  |
| 384 | Fishing Planet | 380600 | action3d | limited | template |  |
| 385 | Two Point Museum | 2185060 | pointer | unsuitable | template |  |
| 386 | Hades II | 1145350 | action3d | limited | template |  |
| 387 | Warhammer: Vermintide 2 | 552500 | action3d | good | template |  |
| 388 | The Elder Scrolls IV: Oblivion Remastered | 2623190 | action3d | limited | template |  |
| 389 | Endacopia | 2684630 | pointer | unsuitable | template |  |
| 390 | Arms of God | 3100310 | topdown | limited | template |  |
| 391 | EVE Online | 8500 | action3d | good | template |  |
| 392 | Medieval Dynasty | 1129580 | action3d | good | template |  |
| 393 | Tiny Eden | 3375110 | action3d | limited | template |  |
| 394 | Big Dig | 4304900 | pointer | unsuitable | template |  |
| 395 | Train Sim World® 7  | 4678800 | racing | limited | template |  |
| 396 | The Jackbox Party Pack 3 | 434170 | pointer | unsuitable | template |  |
| 397 | Party Animals | 1260320 | action3d | good | template |  |
| 398 | Cuphead | 268910 | platformer | good | template |  |
| 399 | MX Bikes | 655500 | action3d | limited | template |  |
| 400 | Heroes of Might and Magic: Olden Era | 3105440 | pointer | unsuitable | template |  |
| 401 | The Forest | 242760 | action3d | good | template |  |
| 402 | Funnel Runners | 3712080 | action3d | good | template |  |
| 403 | ONE PIECE: PIRATE WARRIORS 4 | 1089090 | action3d | limited | template |  |
| 404 | Pathfinder: Wrath of the Righteous - Enhanced Edition | 1184370 | pointer | unsuitable | template |  |
| 405 | MechWarrior 5: Clans | 2000890 | fps | good | template |  |
| 406 | FATAL FRAME II: Crimson Butterfly REMAKE | 3920610 | action3d | limited | template |  |
| 407 | Dead as Disco | 3404260 | action3d | limited | template |  |
| 408 | Sovereign Tower | 4113940 | pointer | unsuitable | template |  |
| 409 | EA SPORTS FC™ 26 | 3405690 | action3d | limited | template |  |
| 410 | The Quarry | 1577120 | action3d | good | template |  |
| 411 | SILENT HILL: Townfall | 1636440 | action3d | limited | template |  |
| 412 | Blade and Sorcery | 629730 | action3d | limited | template |  |
| 413 | Assetto Corsa EVO | 3058630 | racing | limited | template |  |
| 414 | Librarian: Tidy Up the Arcane Library! | 4197610 | pointer | unsuitable | template |  |
| 415 | Shroom and Gloom | 3271280 | pointer | unsuitable | template |  |
| 416 | Fable | 2769570 | action3d | limited | template |  |
| 417 | V Rising | 1604030 | action3d | good | template |  |
| 418 | Leafy Corner | 3558600 | pointer | unsuitable | template |  |
| 419 | Trivia Murder Party 3 | 3048060 | pointer | unsuitable | template |  |
| 420 | Hello Kitty Island Adventure | 2495100 | action3d | good | template |  |
| 421 | DRAGON BALL GEKISHIN SQUADRA | 2072560 | topdown | good | template |  |
| 422 | Colony Ship: A Post-Earth Role Playing Game | 648410 | pointer | unsuitable | template |  |
| 423 | PGA TOUR 2K25 | 2385530 | action3d | limited | template |  |
| 424 | Beat Saber | 620980 | action3d | limited | template |  |
| 425 | LEGO® Batman™: Legacy of the Dark Knight | 2215200 | action3d | good | template |  |
| 426 | Total War: WARHAMMER II | 594570 | pointer | unsuitable | template |  |
| 427 | Star Trek: Voyager - Across the Unknown | 2643390 | pointer | unsuitable | template |  |
| 428 | DRAGON BALL FighterZ | 678950 | fighting | limited | template |  |
| 429 | Core Keeper | 1621690 | action3d | good | template |  |
| 430 | Resident Evil | 304240 | action3d | limited | template |  |
| 431 | Last Epoch | 899770 | topdown | good | template |  |
| 432 | Resident Evil 0 | 339340 | action3d | limited | template |  |
| 433 | OPERATOR | 1913370 | fps | good | template |  |
| 434 | Sir, We Have an Orc Problem | 4594150 | action3d | limited | template |  |
| 435 | Killing Floor 3 | 1430190 | fps | good | template |  |
| 436 | Planet Zoo | 703080 | pointer | unsuitable | template |  |
| 437 | House Party | 611790 | action3d | limited | template |  |
| 438 | The Last of Us™ Part I | 1888930 | action3d | limited | template |  |
| 439 | Dying Light: The Beast | 3008130 | action3d | good | template |  |
| 440 | Blue Archive | 3557620 | action3d | limited | template |  |
| 441 | Ravenswatch | 2071280 | action3d | good | template |  |
| 442 | Halls of Torment | 2218750 | topdown | limited | template |  |
| 443 | Poppy Playtime | 1721470 | action3d | limited | template |  |
| 444 | BLEACH Rebirth of Souls | 1689620 | fighting | limited | template |  |
| 445 | Tropico 7 | 1853440 | pointer | unsuitable | template |  |
| 446 | The Farmer Was Replaced | 2060160 | pointer | unsuitable | template |  |
| 447 | The Last of Us™ Part II Remastered | 2531310 | action3d | limited | template |  |
| 448 | SULFUR | 2124120 | fps | limited | template |  |
| 449 | Predecessor | 961200 | action3d | good | template |  |
| 450 | Ore Factory Squad ⛏️ | 4210580 | action3d | good | template |  |
| 451 | Avatar: Frontiers of Pandora™ | 2840770 | action3d | good | template |  |
| 452 | PAYDAY 3 | 1272080 | fps | good | template |  |
| 453 | Content Warning | 2881650 | action3d | good | template |  |
| 454 | Wizardry Variants Daphne | 2379740 | action3d | limited | template |  |
| 455 | Monster Prom | 743450 | pointer | unsuitable | template |  |
| 456 | RoadCraft | 2104890 | racing | good | template |  |
| 457 | Trailmakers | 585420 | action3d | good | template |  |
| 458 | Persona5: The Phantom X | 3061570 | pointer | unsuitable | template |  |
| 459 | Rain World | 312520 | platformer | good | template |  |
| 460 | XCOM® 2 | 268500 | pointer | unsuitable | template |  |
| 461 | TEKKEN 7 | 389730 | fighting | limited | template |  |
| 462 | Disney/Pixar Toy Story 3 Complete Edition | 4049180 | action3d | good | template |  |
| 463 | Strinova | 1282270 | action3d | good | template |  |
| 464 | Songs of Syx | 1162750 | pointer | unsuitable | template |  |
| 465 | Barony | 371970 | action3d | good | template |  |
| 466 | DARK SOULS™: REMASTERED | 570940 | action3d | limited | template |  |
| 467 | Normal Golf Game | 3510740 | pointer | unsuitable | template |  |
| 468 | Tales of Eternia Remastered | 3470960 | action3d | limited | template |  |
| 469 | Hogwarts Legacy | 990080 | action3d | limited | template |  |
| 470 | The Sinking City 2 | 2825860 | action3d | limited | template |  |
| 471 | Retro Rewind - Video Store Simulator | 3552140 | pointer | unsuitable | template |  |
| 472 | Microsoft Flight Simulator (2020) 40th Anniversary Edition | 1250410 | action3d | limited | template |  |
| 473 | Liar's Bar | 3097560 | fps | good | template |  |
| 474 | YAPYAP | 3834090 | action3d | good | template |  |
| 475 | RaceRoom Racing Experience | 211500 | racing | limited | template |  |
| 476 | BloomTale | 3168520 | pointer | unsuitable | template |  |
| 477 | Buckshot Roulette | 2835570 | action3d | limited | template |  |
| 478 | Infinity Kingdom | 1573360 | pointer | unsuitable | template |  |
| 479 | Sephiria | 2436940 | topdown | good | template |  |
| 480 | TBH: Task Bar Hero | 3678970 | pointer | unsuitable | template |  |
| 481 | Anno 117: Pax Romana | 3274580 | pointer | unsuitable | template |  |
| 482 | NARUTO SHIPPUDEN: Ultimate Ninja STORM 4 | 349040 | fighting | limited | template |  |
| 483 | Mewgenics | 686060 | pointer | unsuitable | template |  |
| 484 | DinoBones: Tidy Up the Museum | 5064340 | action3d | limited | template |  |
| 485 | Outer Wilds | 753640 | action3d | limited | template |  |
| 486 | Portal 2 | 620 | override | good | unverified |  |
| 487 | Conqueror's Blade | 835570 | action3d | good | template |  |
| 488 | Grand Theft Auto IV: The Complete Edition | 12210 | racing | limited | template |  |
| 489 | Resident Evil 4 (2005) | 254700 | action3d | limited | template |  |
| 490 | Trails in the Sky 2nd Chapter | 4225980 | pointer | unsuitable | template |  |
| 491 | Dungeon Inn | 2552310 | pointer | unsuitable | template |  |
| 492 | Phoenix Wright: Ace Attorney Trilogy | 787480 | pointer | unsuitable | template |  |
| 493 | Shape of Dreams | 2444750 | pointer | unsuitable | template |  |
| 494 | Borderlands 2 | 49520 | fps | good | template |  |
| 495 | Marathon | 3065800 | fps | limited | template |  |
| 496 | Wandering Sword | 1876890 | action3d | limited | template |  |
| 497 | Date Everything! | 2201320 | pointer | unsuitable | template |  |
| 498 | Europa Universalis IV | 236850 | pointer | unsuitable | template |  |
| - | tModLoader | 1281930 | override | good | extracted |  |
| - | Goose Goose Duck | 1568590 | override | good | extracted |  |
| - | Minecraft: Java Edition | - | override | good | device |  |
| - | Fortnite | - | fps | good | template | ○ |
