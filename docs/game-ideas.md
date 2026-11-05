# Game ideas for MyStudioLive

Brainstorm, 2026-11-05. Not a spec.

## Constraints that shape every idea

- **Input is only**: comment, like, gift, join, follow, share. No mouse, no keyboard.
- **TikTok comment latency is 2–5 s and bursty** → no reflex games; rounds ≥ 15 s; "first correct" must tolerate jitter.
- **Audience size swings 0 → thousands** → need bots for empty rooms (keoco already does this) and aggregation when crowded (500 avatars on screen kills the GPU).
- **Gift-for-outcome = gambling risk.** Anything resembling bầu cua, quay số, đua cược, plinko gets a LIVE banned and conflicts with DISCLAIMER.md. Gifts may buy *power*, never *chance at a payout*.
- **Existing coverage**: ambience (Ma, Chùa, Rạp), comment quiz (Vua), like-driven 2-team (Kéo Co). Gaps: N-team identity games, persistent progression, mass-participation spectacle.

## Candidates

| # | Idea | Core loop | Viewer input | Reuse | Effort | Hook |
|---|---|---|---|---|---|---|
| 1 | **Đại Chiến Tỉnh Thành** | Comment your province to join its army; Vietnam map, provinces conquer neighbours | comment = join, like = troop, gift = artillery/shield | Kéo Co team + like pipeline, generalized to N teams | M (2D canvas) | Regional pride → comment storms ("Nghệ An đâu!") |
| 2 | **Nối Từ** | Word chain: next 2-syllable word must start with the last syllable | comment only; gift = skip/hint | Vua answer normalization, leaderboard | S | Classic VN game, zero learning curve |
| 3 | **Đảo Sinh Tồn** (battle royale) | Every commenter spawns on an island, zone shrinks, last one standing | comment = spawn, like = heal, gift = shield/weapon | three.js stage, crowd code | L | Highest watch-time + gift conversion on TikTok |
| 4 | **Đấu Trường Tri Thức** (A/B/C/D quiz, ladder of 15 questions) | Crowd votes or individual scoring | comment A/B/C/D; gift = 50:50 lifeline | Vua question engine + import | S–M | EdTech fit; weak differentiation vs Vua |
| 5 | **Câu Cá Online** | Comment `câu` to cast, catch fish by rarity, persistent collection | comment; gift = better rod | little | M | Cross-stream progression → returning viewers |

## Notes / blind spots per idea

1. **Tỉnh Thành**
   - Use the **34-province** map (post-2025 merger), not 63 — outdated map draws "sai rồi" comments.
   - Map **must include Hoàng Sa & Trường Sa**; omission is a reputational incident, not a bug.
   - Alias table needed: "sg", "sài gòn", "hcm", "tphcm" → same team; no-accent matching like Vua.
   - Big provinces (HCM, HN) snowball → needs underdog mechanic (troop cap scales inversely, or comeback multiplier).
2. **Nối Từ**
   - Needs a Vietnamese 2-syllable dictionary (~30–40k entries) for validation; without it the host moderates manually and it dies.
   - Concurrency: many valid answers in one burst → first by server receive time wins, show runner-ups to reduce "tôi trả lời trước mà" complaints.
3. **Đảo Sinh Tồn**
   - Perf: cap rendered avatars (~150), the rest as a counter/"ghost" crowd.
   - Elimination must feel fair: deterministic zone + visible HP, not random kills, or viewers leave once killed.
   - Risk of pay-to-win → gift shield duration capped, free likes can heal.
4. **Tri Thức**: avoid the "Ai Là Triệu Phú" name, music and look (licensed format).
5. **Câu Cá**: first scene that needs local persistence across sessions (JSON per viewer uniqueId); rarity tables are gacha-adjacent but fine as long as no real-value payout.

## Recommendation

**Start with #1 Đại Chiến Tỉnh Thành.**

- Fills the clear gap (N-team identity) instead of overlapping Vua/Kéo Co.
- Lowest friction join (one comment, no rules to learn) and the comment storm itself feeds the TikTok algorithm.
- Reuses the most proven code (Kéo Co's team/like/gift scoring) while staying 2D → cheaper than another three.js scene.
- Cost is mostly content (map SVG, alias table, balancing), not engine.

**Quick win in parallel: #2 Nối Từ** if a dictionary source is acceptable (licence check required).

Skip #3 for now: highest payoff but L effort and perf risk; revisit once a 3rd-party sprite/crowd system exists.
