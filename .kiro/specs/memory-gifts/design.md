# Design: Memory gifts

`keepGift` command (post `kind:'gift'`, PNG asset, `gifts[]` record with letter), `setVisibility`/`setManyVisibility` refuse non-shareable gifts, schema invariant, `publicProjection` filter, public post page renders `<figure class="gift-letter">` through a strict SVG allow-list (property P3).

Verification: `tests/gifts.test.ts` (G1–G8, mutation-checked), `tests/site-core.pbt.test.ts` (P3), `scripts/e2e-gift-public.mjs` (real server, anonymous reader, 7/7).
