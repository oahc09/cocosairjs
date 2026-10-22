"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.equals = void 0;
function equals(a, b) {
    return mathAbs(a - b) <= EPSILON * Math.max(1.0, mathAbs(a), mathAbs(b));
}
exports.equals = equals;
