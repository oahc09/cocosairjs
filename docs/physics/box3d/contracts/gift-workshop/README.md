# Gift workshop M0 design, reconstruction 1

These files reconstruct the v1.2 chapter 12 design. They are not the lost production1.2.5 configuration, original five layouts, replay inputs, or a playable example. No BIZ result is imported from historical reports.

- config.json fixes the original SKU masses, order totals, input/state timing, scoring and initial physical thresholds. Compound geometry now explicitly includes the metal attachment point; its total body mass is distributed from real geometry in the future adapter, not duplicated per child.
- layouts.json defines five new seeded, uniquely identified 12-item layouts. The candidate public-input waypoint protocol is not an executed tick trace. Exact input recordings and at least 20 seconds of normal-play time reserve require real implementation and testing.
- scenarios.json preserves the atomic two-item delivery, earlier-than-65-degree evidence, recovery generations, cutoff precedence, 5 normal plus 15 abnormal completed lifecycle rounds, and non-substitutable BIZ07 device/human requirements.
- The static checker verifies initial compound AABBs, attachment reach bounds and conservative receiver clearance. It cannot establish dynamic stability, obstacle avoidance, full door/wall swept clearance, correct trigger timing, all-query self-filtering or completion within 180 seconds.

## Newly selected dimensions and reasons

The 6 by 4 m tabletop remains 1.5 m high. The chamber retains 1.0 by 0.85 by 0.6 m inner space; the table must have a genuine hole under its hinge door, not a hidden solid plane. The receiver plane is y=0.5 m and its floor is y=-0.35 m, leaving 0.85 m clearance, greater than every current SKU's full diagonal plus 0.1 m even when rotated. This is a design constraint, not proof of real successful passage.

The stock uses a 3 by 4 grid with 0.65 m x spacing and 0.9 m z spacing. All five layouts are quarter-turn yaw permutations with the full attachment geometry included. The head moves in the explicitly bounded volume and cruises at y=2.6 m. Real controls must still sweep every held child shape and handle initial overlap; the waypoint protocol must stop on obstacles rather than teleport through them.

The receiver and door dimensions require a later CAD-free geometric fixture plus real public Hinge/collision validation. The static endpoint check only shows that the declared open door bottom is above the receiving plane; it does not certify the swept door volume or eliminate a shipping jam.

## Remaining gates

T32 is IN_PROGRESS, not DONE: the abnormal-fixture geometry and complete input-command schema need further specification before the business fixture design can be frozen. Do not make T32 depend on successful runtime traces or dynamic gameplay results: those are later T33/T34 requirements. The current static layout checks do not establish them. T34/BIZ01-BIZ08 have not run. BIZ07 additionally requires actual desktop, Android, iOS and three first-time humans. M0 performance values remain draft until M7 freeze; page budgets and physics-increment budgets are different quantities.
