/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to
 do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

const invalidatedContexts = new WeakSet<object>();

/** AIR requires reload after loss; a restored native context still has stale engine caches. */
export function invalidateWebGL2Context(context: object): void {
    invalidatedContexts.add(context);
}

/** Internal GFX admission. Real WebGL2 contexts always provide isContextLost. */
export function assertWebGL2ContextActive(context: { isContextLost?(): boolean } | null | undefined): void {
    if (context?.isContextLost?.()) invalidateWebGL2Context(context);
    if (!context || invalidatedContexts.has(context)) {
        throw Object.assign(new Error('WebGL2 context is lost or closed.'), { code: 'WEBGL2_CONTEXT_LOST' });
    }
}
