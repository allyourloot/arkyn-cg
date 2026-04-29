// ---- Quad buffer helpers ----

/**
 * Fullscreen quad vertices as a triangle strip.
 *
 * With `includeUv = true` (default) each vertex is [x, y, u, v] (stride 16).
 * UV v-axis is flipped so an Image() upload (top-left origin) maps correctly.
 *
 * With `includeUv = false` each vertex is [x, y] (stride 8) — used by
 * background/overlay shaders that derive coords from gl_FragCoord.
 */
export function createQuadBuffer(
    gl: WebGLRenderingContext,
    includeUv = true,
): WebGLBuffer | null {
    const verts = includeUv
        ? new Float32Array([
            -1, -1,   0, 1,
             1, -1,   1, 1,
            -1,  1,   0, 0,
             1,  1,   1, 0,
        ])
        : new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    return buffer;
}

/**
 * Bind the standard quad attribute layout produced by `createQuadBuffer`.
 *
 * With `includeUv = true`: binds `aPosition` (2 floats) + `aUv` (2 floats),
 * stride 16. With `includeUv = false`: binds `aPosition` (2 floats), stride 0.
 */
export function bindQuadAttributes(
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    includeUv = true,
): void {
    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    if (includeUv) {
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);
        const aUv = gl.getAttribLocation(program, "aUv");
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
    } else {
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
    }
}

// ---- Texture helpers ----

/**
 * Configure a texture with CLAMP_TO_EDGE wrapping and NEAREST filtering
 * (pixel-art crisp). The texture is left bound after this call.
 */
export function configureTexture(
    gl: WebGLRenderingContext,
    tex: WebGLTexture | null,
): void {
    if (!tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}

// ---- Cleanup helpers ----

/**
 * Delete a set of GL resources and drop the WebGL context. Call during
 * component teardown to prevent resource leaks.
 */
export function cleanupGL(
    gl: WebGLRenderingContext,
    resources: {
        textures?: (WebGLTexture | null)[];
        buffers?: (WebGLBuffer | null)[];
        programs?: (WebGLProgram | null)[];
    },
): void {
    for (const tex of resources.textures ?? []) {
        if (tex) gl.deleteTexture(tex);
    }
    for (const buf of resources.buffers ?? []) {
        if (buf) gl.deleteBuffer(buf);
    }
    for (const prog of resources.programs ?? []) {
        if (prog) gl.deleteProgram(prog);
    }
    const loseExt = gl.getExtension("WEBGL_lose_context");
    if (loseExt) loseExt.loseContext();
}

// ---- Shader compile / link ----

/**
 * Compile a GLSL shader. Returns null on compile failure, with the error
 * logged under the supplied `label` so multiple shaders in one app can be
 * told apart in the console.
 */
export function compileShader(
    gl: WebGLRenderingContext,
    type: number,
    source: string,
    label = "shader",
): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(`${label} compile error:`, gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

// ---- Context loss handling ----

/**
 * Wire `webglcontextlost` / `webglcontextrestored` listeners on a canvas
 * with the standard preventDefault() + log behavior the shared renderers
 * use. Pass `onLoss` to pause render loops / mark contextLost flags, and
 * `onRestore` to rebuild GL resources (programs, buffers, textures) and
 * any cached uniform locations.
 *
 * Returns a `dispose()` function that removes both listeners — call from
 * the consumer's cleanup path.
 */
export function createContextLossHandler(
    canvas: HTMLCanvasElement,
    callbacks: { onLoss?: () => void; onRestore?: () => void },
): () => void {
    const onLost = (e: Event) => {
        e.preventDefault();
        callbacks.onLoss?.();
    };
    const onRestored = () => {
        callbacks.onRestore?.();
    };
    canvas.addEventListener("webglcontextlost", onLost, false);
    canvas.addEventListener("webglcontextrestored", onRestored, false);
    return () => {
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", onRestored);
    };
}

/**
 * Compile + link a vertex/fragment shader pair into a WebGLProgram. Returns
 * null if either shader fails to compile or the program fails to link. The
 * optional `label` is woven into the error messages.
 */
export function createProgram(
    gl: WebGLRenderingContext,
    vsSource: string,
    fsSource: string,
    label = "program",
): WebGLProgram | null {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource, `${label} vertex`);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource, `${label} fragment`);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(`${label} link error:`, gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}
