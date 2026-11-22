# glTF texture upload experiment

By default each entry in `GLTFAsset.textures` is a distinct mutable `Texture2D`.
Equal entries may still reuse the decoded image within one load; their names, sampler
settings, GPU textures and destruction remain independent.

For a controlled upload-count experiment only, construct a direct
`new GLTFLoader({ experimentalTextureDeduplication: true })`. Equivalent core
texture indices can then alias one mutable object. Only the first name is retained;
renaming, sampler mutation and destroying that object affect every alias. Do not enable
this for assets that need independent texture slots. This setting is off by default,
is not a global default and does not apply to the native asset factory; configured
URL loads bypass the native URL-only asset cache. A count of uploads is not a GPU
memory or load-time measurement.
