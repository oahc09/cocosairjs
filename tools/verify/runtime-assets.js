/** Development-only inspection of live Cocos objects. Never parses asset files,
 * mutates nodes, creates MaterialInstances, or enters the SDK export graph.
 * Pass the public SDK namespace as `types` so browser and HEADLESS tests agree.
 */
export function inspectRuntimeAssets (root, types, collections = {}) {
    const { Node, Mesh, Material, Texture2D, Skeleton, AnimationClip, MeshRenderer, SkinnedMeshRenderer, Animation } = types;
    const resources = [];
    const references = [];
    const diagnostics = [];
    const unchecked = [];
    const ids = new Map();
    const counts = {};
    const issue = (code, location, message) => diagnostics.push({ code, location, message });
    function record (object, kind, location) {
        if (!object) { issue('MISSING_DEPENDENCY', location, `Missing ${kind}`); return null; }
        const ctor = types[kind];
        if (ctor && !(object instanceof ctor)) { issue('TYPE_MISMATCH', location, `Expected ${kind}`); return null; }
        if (!ids.has(object)) {
            counts[kind] = (counts[kind] || 0) + 1;
            const id = `${kind}:${counts[kind]}`;
            ids.set(object, id);
            const valid = types.isValid ? types.isValid(object, true) : object.isValid !== false;
            resources.push({ id, kind, name: object.name || '', valid });
            if (!valid) issue('DESTROYED_RESOURCE', location, `${id} is destroyed or pending destruction`);
        }
        return ids.get(object);
    }
    function reference (owner, field, object, kind) {
        const target = record(object, kind, `${owner}.${field}`);
        references.push({ owner, field, target });
        return target;
    }
    function inspectMaterial (material, location) {
        const id = record(material, 'Material', location);
        if (!id) return;
        if (!material.effectAsset) issue('MISSING_EFFECT', location, 'Material has no effect');
        const names = new Set();
        for (const pass of material.passes) for (const name of Object.keys(pass.properties || {})) names.add(name);
        for (const name of names) {
            const property = material.getProperty(name);
            const values = Array.isArray(property) ? property : [property];
            for (const value of values) {
                if (value instanceof Texture2D) reference(id, name, value, 'Texture2D');
            }
        }
        unchecked.push({ location: id, reason: 'Only explicitly assigned Texture2D properties are visible; builtin/default sampler bindings are not inferred.' });
    }
    function inspectClip (clip, node, location) {
        if (!record(clip, 'AnimationClip', location)) return;
        let index = 0;
        for (const track of clip.tracks) {
            let target = node;
            let unknown = false;
            for (let i = 0; i < track.path.length; i++) {
                if (target == null) break;
                if (track.path.isHierarchyAt(i)) {
                    const path = track.path.parseHierarchyAt(i);
                    target = target instanceof Node ? (path ? target.getChildByPath(path) : target) : undefined;
                } else if (track.path.isComponentAt(i)) {
                    target = target instanceof Node ? target.getComponent(track.path.parseComponentAt(i)) : undefined;
                } else if (track.path.isPropertyAt(i)) {
                    target = target[track.path.parsePropertyAt(i)];
                } else if (track.path.isElementAt(i)) {
                    target = target[track.path.parseElementAt(i)];
                } else { unknown = true; break; }
            }
            const trackLocation = `${location}.tracks[${index++}]`;
            if (unknown) unchecked.push({ location: trackLocation, reason: 'Custom track path resolver cannot be checked without executing it.' });
            else if (target == null) issue('ANIMATION_TARGET', trackLocation, 'Animation target cannot be resolved');
            if (track.proxy) unchecked.push({ location: trackLocation, reason: 'Custom value proxy execution is outside read-only inspection.' });
        }
    }
    if (!(root instanceof Node)) {
        issue('TYPE_MISMATCH', 'root', 'Expected Node');
    } else {
        const visit = (node) => {
            const id = record(node, 'Node', node.name);
            for (const renderer of node.getComponents(MeshRenderer)) {
                reference(id, 'mesh', renderer.mesh, 'Mesh');
                const slots = renderer.mesh ? renderer.mesh.struct.primitives.length : renderer.sharedMaterials.length;
                for (let slot = 0; slot < slots; slot++) {
                    const material = renderer.sharedMaterials[slot];
                    reference(id, `materials[${slot}]`, material, 'Material');
                    if (material instanceof Material) inspectMaterial(material, `${id}.materials[${slot}]`);
                }
                if (renderer instanceof SkinnedMeshRenderer) {
                    const skeleton = renderer.skeleton;
                    reference(id, 'skeleton', skeleton, 'Skeleton');
                    reference(id, 'skinningRoot', renderer.skinningRoot, 'Node');
                    if (skeleton instanceof Skeleton) {
                        if (skeleton.joints.length !== skeleton.bindposes.length) issue('BINDPOSE_COUNT', id, 'Joint and bindpose counts differ');
                        skeleton.joints.forEach((path, joint) => {
                            const base = renderer.skinningRoot;
                            if (!base || !(path ? base.getChildByPath(path) : base)) {
                                issue('JOINT_REFERENCE', `${id}.joints[${joint}]`, `Unresolved joint '${path}'`);
                            }
                        });
                    }
                }
            }
            for (const animation of node.getComponents(Animation)) {
                animation.clips.forEach((clip, index) => inspectClip(clip, node, `${id}.clips[${index}]`));
            }
            for (const child of node.children) { references.push({ owner: id, field: 'child', target: record(child, 'Node', child.name) }); visit(child); }
        };
        visit(root);
    }
    for (const [key, kind] of Object.entries({ meshes: 'Mesh', materials: 'Material', textures: 'Texture2D', skeletons: 'Skeleton', animations: 'AnimationClip' })) {
        if (!collections[key]) continue;
        Array.from(collections[key]).forEach((asset, index) => record(asset, kind, `${key}[${index}]`));
    }
    return { ok: diagnostics.length === 0, counts, resources, references, diagnostics, unchecked };
}

export function validateRuntimeAssets (root, types, collections) {
    const report = inspectRuntimeAssets(root, types, collections);
    if (!report.ok) {
        const error = new Error(report.diagnostics.map((d) => `${d.code} ${d.location}: ${d.message}`).join('\n'));
        error.report = report;
        throw error;
    }
    return report;
}
