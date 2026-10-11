// C03 stage 1: Cursor Trail renders into a child RT (rgba8, linear premultiplied).
// Full E08 algorithm: 5-tap capsule chain scan over the 64×1 rgba16f points texture.
precision highp float;
in highp vec2 v_uv;
layout(set = 1, binding = 0) uniform Constants {
    vec4 ts0;  // colorA.rgb (linear), radius
    vec4 ts1;  // colorB.rgb (linear), shrink
    vec4 ts2;  // canvas.width, canvas.height, softness, trailEnabled
    vec4 ts3;  // length, unused, unused, unused
};
layout(set = 1, binding = 1) uniform highp sampler2D pointsTexture;
out vec4 cc_FragColor;
const int MAX_POINTS = 64;
const int SUBDIVISIONS = 3;
void main() {
    if (ts2.w < 0.5) { cc_FragColor = vec4(0.0); return; }
    float aspect = ts2.x / ts2.y;
    float viewportH = ts2.y;
    float radius = ts0.w;
    float shrink = ts1.w;
    float softness = ts2.z;
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
                float sx = sx0, sy = sy0, sAge = ageS, sWid = widS;
                float jMin = 100.0, jAge = 1.0;
                for (int k = 0; k < SUBDIVISIONS; k++) {
                    float t = (float(k) + 1.0) / float(SUBDIVISIONS);
                    float omt = 1.0 - t;
                    float bx = omt * omt * sx0 + 2.0 * omt * t * jx + t * t * ex;
                    float by = omt * omt * sy0 + 2.0 * omt * t * jy + t * t * ey;
                    float bAge = mix(ageS, ageE, t);
                    float bWid = mix(widS, widE, t);
                    float ra = baseRadius * sWid * (1.0 - sAge * shrink);
                    float rb = baseRadius * bWid * (1.0 - bAge * shrink);
                    float bax = bx - sx, bay = by - sy;
                    float tt = clamp(((px - sx) * bax + (py - sy) * bay) / max(bax * bax + bay * bay, 1e-8), 0.0, 1.0);
                    float dist = length(vec2(px - (sx + bax * tt), py - (sy + bay * tt))) - mix(ra, rb, tt);
                    if (dist < jMin) { jMin = dist; jAge = mix(sAge, bAge, tt); }
                    sx = bx; sy = by; sAge = bAge; sWid = bWid;
                }
                minSdf = min(minSdf, jMin);
                float w = exp(jMin * -1.0 * sharp);
                ageSum += jAge * w;
                wSum += w;
            } else {
                float dist = length(vec2(px - cx, py - cy)) - baseRadius * abs(cur.w) * (1.0 - cur.z * shrink);
                minSdf = min(minSdf, dist);
                float w = exp(dist * -1.0 * sharp);
                ageSum += cur.z * w;
                wSum += w;
            }
        }
        prev2 = prev; prev = cur;
    }
    float age = ageSum / max(wSum, 1e-20);
    float coverage = (1.0 - smoothstep(-edgeW, edgeW, minSdf)) * (1.0 - smoothstep(0.8, 1.0, age));
    vec3 rgb = mix(ts0.rgb, ts1.rgb, clamp(age, 0.0, 1.0));
    // PREMULTIPLY for the child RT (linear domain — no OETF here).
    // Freeze the RGBA8 storage conversion explicitly. A one-code premultiplied
    // channel difference near alpha=1/255 is amplified by the next pass's division.
    // Quantizing the normalized output here gives the child texture a defined
    // round-to-nearest byte contract, without changing the trail's linear math.
    vec4 premultiplied = clamp(vec4(rgb * coverage, coverage), 0.0, 1.0);
    cc_FragColor = floor(premultiplied * 255.0 + 0.5) / 255.0;
}
