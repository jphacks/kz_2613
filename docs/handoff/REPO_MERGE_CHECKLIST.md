# 安全な初期統合の確認リスト

- [ ] `jphacks/kz_2613` をクローン・更新し、`git status` を確認する。他のメンバーの変更を上書きしない。
- [ ] ZIPを展開し、`repo_overlay` の中身だけをリポジトリのルートへコピーする。
- [ ] 元の `README.md` と `LICENSE` の内容が保持されている。
- [ ] 継続して適用する開発ルールとして `AGENTS.md` と `CLAUDE.md` を読む。
- [ ] 2026-10-24時点の共有要件 `docs/requirements/requirements-v0.2.md` を読む。
- [ ] 後から決まった入力・技術構成の判断が `docs/decisions/` に記録されている。
- [ ] `py -3 scripts/verify_overlay.py` が成功する。
- [ ] Python 3.12環境を構築し、ホストのpytestが成功する。Minecraft試験とは区別する。
- [ ] `npm ci && npm run check && npm test && npm run build` が成功する。初回でlockがない場合だけ `npm install` で生成してコミットし、以降は `npm ci` を使う。
- [ ] 正確なバージョンと観測した結果を `docs/handoff/BUILD_LOG.md` に記録する。
- [ ] ゲーム入力の互換性を主張する前に実機ゲートを実施する。
- [ ] コミット・PRの前に変更をレビューする。ZIPそのものはpushや提出を行わない。
