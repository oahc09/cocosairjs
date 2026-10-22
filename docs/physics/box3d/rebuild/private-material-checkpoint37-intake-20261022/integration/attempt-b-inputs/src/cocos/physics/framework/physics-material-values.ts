/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

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
/** Private shared instance. Do not re-export from a public engine barrel.
 * These wrappers preserve the primitive's capability boundaries; actual owner wiring
 * remains a separate stage. The adjacent transaction module is the frozen S1 input.
 */
import {
    PhysicsMaterialValuesTransactionRegistry,
    MaterialValuesOwnerDelegate,
    MaterialValuesOwnerLease,
    MaterialValuesTicket,
} from './physics-material-values-transaction';

const values = new PhysicsMaterialValuesTransactionRegistry();

export function registerPhysicsMaterialValuesOwner(
    identity: object,
    generation: number,
    delegate: MaterialValuesOwnerDelegate,
): MaterialValuesOwnerLease {
    return values.registerOwner(identity, generation, delegate);
}

export function beginPhysicsMaterialValuesChange(asset: object): MaterialValuesTicket | undefined {
    return values.begin(asset);
}

export function assertPhysicsMaterialDestroyable(asset: object): void {
    values.assertDestroyable(asset);
}
