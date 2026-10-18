/** Debug-only, one-frame CPU submission observation; never use for timing samples. */
export async function observeIndexedDraws(
    gl: WebGL2RenderingContext,
    frame: () => Promise<void>,
): Promise<Record<string, unknown>> {
    const maxVertexAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
    const calls: Record<string, unknown>[] = [];
    const keys = ['drawElements', 'drawElementsInstanced'] as const;
    const descriptors = keys.map((key) => Object.getOwnPropertyDescriptor(gl, key));
    const originalDraw = gl.drawElements;
    const originalInstanced = gl.drawElementsInstanced;
    const record = (
        mode: number,
        indexCount: number,
        indexType: number,
        byteOffset: number,
        instances: number,
    ): void => {
        const attributes: { location: number; divisor: number; components: number }[] = [];
        for (let location = 0; location < maxVertexAttributes; location++) {
            if (gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_ENABLED)) {
                attributes.push({
                    location,
                    divisor: gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_DIVISOR),
                    components: gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_SIZE),
                });
            }
        }
        calls.push({ mode, indexCount, indexType, byteOffset, instances, attributes });
    };
    try {
        gl.drawElements = function (mode, count, type, offset): void {
            originalDraw.call(this, mode, count, type, offset);
            record(mode, count, type, offset, 1);
        };
        gl.drawElementsInstanced = function (mode, count, type, offset, instances): void {
            originalInstanced.call(this, mode, count, type, offset, instances);
            record(mode, count, type, offset, instances);
        };
        await frame();
        return {
            scope: 'one-frame WebGL2 indexed CPU submissions; not GPU completion or visible instance count',
            maxVertexAttributes,
            calls,
            submittedInstances: calls.reduce((sum, call) => sum + Number(call.instances), 0),
            submittedIndexReferences: calls.reduce(
                (sum, call) => sum + Number(call.indexCount) * Number(call.instances),
                0,
            ),
        };
    } finally {
        keys.forEach((key, index) => {
            const descriptor = descriptors[index];
            if (descriptor) Object.defineProperty(gl, key, descriptor);
            else Reflect.deleteProperty(gl, key);
        });
    }
}
