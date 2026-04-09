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
