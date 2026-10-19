# application lifecycle triggers

For original references to the contracts below, see [Contracts](contracts.md). Source annotations refer to the AIR checkout.

## When to use what

- "Which option values are actually legal, what is the real default, and what does a second `createAirApp` or a restart-after-failure hit?" -> `normalizeAirOptions`, `admitAirOptions` plus `AirAppImpl.close`, [app-options.md](app-options.md).
- "`createAirApp` rejected with some `AIR_E_...` / `WEBGL2_REQUIRED`" -> match `error.code`, then [startup-errors.md](startup-errors.md).
- "Swap or tear down the running scene without reloading" -> `app.run` / `app.releaseScene!()`, receipt fields in [app-options.md](app-options.md).
- "The context was lost; is the app still drawing?" -> `app.contextHealth` / `attachContextHealth`, [context-health.md](context-health.md).
- "Register asset, listener and timer cleanup that a scene switch must honour" -> `app.session` / `createSessionScope`, [session-scope.md](session-scope.md).
- "Fill the window versus fit a host element, or wire design resolution" -> `screenMode`/`container` and `designResolution` rows in [app-options.md](app-options.md); `view.setDesignResolutionSize` is called for you, coordinate-maths routing goes to the camera and UI skills, prose in `docs/manual/design-viewport-and-controls.md`.
