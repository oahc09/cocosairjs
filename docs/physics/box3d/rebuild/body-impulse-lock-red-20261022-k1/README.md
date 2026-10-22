# Retained k1 immediate impulse-lock defect

This real WASM candidate probe exits 1. With a rotated non-diagonal inertia and offset impulse, locked vx=0.16666667 and wx=0.15240385; angular impulse separately leaves locked wx=0.03540925. The next solver step clamps the axes, but the immediate public readback violated the desired velocity-lock contract.

The original candidate run and all five raw/probe/command files are copied unchanged. Existing k1 body-suite passes do not cover this additional case. The k2 bridge candidate explicitly clamps actual native state lock axes immediately after a successful impulse, adds this case to its schema and runner, and requires fresh qualification. Original vendor bytes remain unchanged.
