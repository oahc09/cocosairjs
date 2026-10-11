// Adapted math ideas: Shader Effects Inc. 2026 MIT, see ../UPSTREAM.md and ../LICENSE.reference.txt.
// Native capsule-chain scan — an exact port of agents.makeStrokePolylineScan (dbfd42ab): the
// 64×1 rgba16float points texture walked per pixel, midpoint quadratic-Bézier spine with 3
// subdivisions, per-sub-chord round-cone (age-shrunk per-end radii) SDF, min-union depth, and an
// age-weighted exp() blend. No compute pass, no second canvas, no TypeGPU.
precision highp float;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
    vec4 trail0;  // colorA.rgb (linear), radius
    vec4 trail1;  // colorB.rgb (linear), shrink
    vec4 trail2;  // aspect, viewportH, softness, linearDiagnostic
};
layout(set = 1, binding = 1) uniform highp sampler2D pointsTexture;
out vec4 cc_FragColor;
const int MAX_POINTS = 64;
const int SUBDIVISIONS = 3;
void main() {
    float aspect = trail2.x;
    float viewportH = trail2.y;
    float softness = trail2.z;
    float radius = trail0.w;
    float shrink = trail1.w;
    vec3 colorA = trail0.rgb;
    vec3 colorB = trail1.rgb;
    float px = v_uv.x * aspect;
    float py = v_uv.y;
    float baseRadius = radius * 0.1;
    float edgeW = 1.5 / max(viewportH, 1.0) + softness * baseRadius;
    float sharp = 4.0 / max(baseRadius, 0.005);
    float minSdf = 100.0;
    float ageSum = 0.0;
    float wSum = 0.0;
    vec4 prev = vec4(0.0, 0.0, 1.0, 0.0);
    vec4 prev2 = vec4(0.0, 0.0, 1.0, 0.0);
    for (int i = 0; i < MAX_POINTS; i++) {
        vec4 cur = texelFetch(pointsTexture, ivec2(i, 0), 0);
        if (cur.z < 1.0) {
            float cx = cur.x * aspect;
            float cy = cur.y;
            float linked = cur.w > 0.0 ? 1.0 : 0.0;
            float prevAlive = prev.z < 1.0 ? 1.0 : 0.0;
            if (linked * prevAlive > 0.5) {
                // Quadratic around joint `prev`: S -> (control prev) -> E.
                float usePrev2 = (prev.w > 0.0 ? 1.0 : 0.0) * (prev2.z < 1.0 ? 1.0 : 0.0);
                float jx = prev.x * aspect;
                float jy = prev.y;
                float sx0 = usePrev2 > 0.5 ? (prev2.x * aspect + jx) * 0.5 : jx;
                float sy0 = usePrev2 > 0.5 ? (prev2.y + jy) * 0.5 : jy;
                float ageS = usePrev2 > 0.5 ? (prev2.z + prev.z) * 0.5 : prev.z;
                float widPrev = abs(prev.w);
                float widS = usePrev2 > 0.5 ? (abs(prev2.w) + widPrev) * 0.5 : widPrev;
                float ex = (jx + cx) * 0.5;
                float ey = (jy + cy) * 0.5;
                float ageE = (prev.z + cur.z) * 0.5;
                float widE = (widPrev + abs(cur.w)) * 0.5;
                float sx = sx0;
                float sy = sy0;
                float sAge = ageS;
                float sWid = widS;
                float jMin = 100.0;
                float jAge = 1.0;
                for (int k = 0; k < SUBDIVISIONS; k++) {
                    float t = (float(k) + 1.0) / float(SUBDIVISIONS);
                    float omt = 1.0 - t;
                    float bx = omt * omt * sx0 + 2.0 * omt * t * jx + t * t * ex;
                    float by = omt * omt * sy0 + 2.0 * omt * t * jy + t * t * ey;
                    float bAge = mix(ageS, ageE, t);
                    float bWid = mix(widS, widE, t);
                    float ra = baseRadius * sWid * (1.0 - sAge * shrink);
                    float rb = baseRadius * bWid * (1.0 - bAge * shrink);
                    float bax = bx - sx;
                    float bay = by - sy;
                    float tt = clamp(((px - sx) * bax + (py - sy) * bay) / max(bax * bax + bay * bay, 1e-8), 0.0, 1.0);
                    float dist = length(vec2(px - (sx + bax * tt), py - (sy + bay * tt))) - mix(ra, rb, tt);
                    if (dist < jMin) {
                        jMin = dist;
                        jAge = mix(sAge, bAge, tt);
                    }
                    sx = bx;
                    sy = by;
                    sAge = bAge;
                    sWid = bWid;
                }
                minSdf = min(minSdf, jMin);
                float w = exp(jMin * -1.0 * sharp);
                ageSum += jAge * w;
                wSum += w;
            } else {
                // Lone survivor: a dot.
                float dist = length(vec2(px - cx, py - cy)) - baseRadius * abs(cur.w) * (1.0 - cur.z * shrink);
                minSdf = min(minSdf, dist);
                float w = exp(dist * -1.0 * sharp);
                ageSum += cur.z * w;
                wSum += w;
            }
        }
        prev2 = prev;
        prev = cur;
    }
    float age = ageSum / max(wSum, 1e-20);
    // Ordered-edge explicit inverse of the upstream coverage smoothsteps.
    float coverage = (1.0 - smoothstep(-edgeW, edgeW, minSdf)) * (1.0 - smoothstep(0.8, 1.0, age));
    vec3 rgb = mix(colorA, colorB, clamp(age, 0.0, 1.0));
    float alpha = coverage;
    vec3 outRgb = trail2.w > 0.5
        ? rgb
        : mix(12.92 * rgb, 1.055 * pow(max(rgb, 0.0), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), rgb));
    cc_FragColor = vec4(outRgb, alpha);
}
