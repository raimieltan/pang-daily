# Conditional conversations — PAN-56

`src/game-core/social/conversation.ts` contains authored nodes, stable speaker/choice IDs, ordered conditional entry branches, and unconditional fallback nodes. Conditions compose explicitly with `all`/`any` and query trust, respect, relationship flags, recognition tier, crew standing/membership, favor status, race history, and unlocks. Casey's low-trust branch takes precedence over the post-race branch.

The runtime `DialogueController` owns input capture and sends presentation-only views through the typed bridge. Choices are checked again against the current saved state before `SocialSession.chooseConversation` applies an authored action. Every effect-bearing choice must be one-shot; effects and consumption share one atomic save. Pure navigation remains repeatable and does not write the social ledger. Closing, cancelling, and scene teardown release dialogue input. Controls held across a context change must return to neutral before they can drive or walk again.

## Repeatable browser acceptance

Run `node tests/dialogue.browser.mjs` with dependencies and Playwright Chromium installed. The isolated Vite harness mounts the real React dialogue, runtime controller, input manager, bridge, persistence, and PAN-32 interaction resolver against authored hub zones without loading Babylon rendering/physics. No test hooks are added to the production game.

The script checks:

- First meeting, familiar fallback, low-trust, and post-race branches.
- Empty-choice fallback exit, cancellation, and repeated open/close.
- Choice conditions changed after opening, rejection without reward, and duplicate confirmation.
- One-shot consumption preserved by a real browser reload using the same session storage.
- Keyboard and simulated gamepad selection, confirmation, cancellation, and held-input quarantine.
- Scene-exit disposal, UI clearing, and restored walking controls.
- Casey takes interaction priority over the overlapping job board; the board remains reachable elsewhere.

Gamepad input is simulated. Physical-controller feel and navigation through the rendered 3D world require separate gameplay checks. Race-conditioned cases use domain-generated fixture race results rather than completing a rendered race; the full race/rematch acceptance belongs to PAN-58 and the integrated social loop.

## Focused automated checks

`yarn test src/game-core/social/conversation.test.ts src/game/social/DialogueController.test.ts src/components/hud/DialogueBox.test.tsx src/game/input/InputManager.test.ts src/game/interaction/Interaction.test.ts`

These cover content references, composition, fallback resolution, repeated navigation without ledger writes, stale selection, one-shot persistence, input capture/restoration, and world-zone priority.
