import { ShaderMaterial, UniformsLib, type Texture } from "three";

function generateLightLUT(
    maxLevel = 15,
    minBrightness = 0.005,
    sigma = 0.43,
    curve = 0.85,
): number[] {
    const lut: number[] = [];

    for (let level = 0; level <= maxLevel; level++) {
        const distanceFromFull = maxLevel - level;
        const normalized =
            Math.exp(-sigma * Math.pow(distanceFromFull, curve));
        const value = minBrightness + (1 - minBrightness) * normalized;
        lut.push(Number(value.toFixed(3)));
    }

    return lut;
}

export const DEFAULT_LIGHT_LUT: number[] = generateLightLUT();

const vertexShader = /* glsl */ `
    attribute float ao;
    attribute float shade;
    attribute float sunlight;
    attribute vec2 uvBoundsMin;
    attribute vec2 uvBoundsMax;
    varying vec2 vUv;
    varying float vAO;
    varying float vShade;
    varying float vSunlight;
    varying vec2 vUvBoundsMin;
    varying vec2 vUvBoundsMax;
    varying vec3 vWorldPosition;

    void main() {
        vUv = uv;
        vAO = ao;
        vShade = shade;
        vSunlight = sunlight;
        vUvBoundsMin = uvBoundsMin;
        vUvBoundsMax = uvBoundsMax;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = /* glsl */ `
    uniform sampler2D map;
    uniform float lightLUT[16];
    uniform float aoMin;
    uniform float aoStrength;
    uniform float aoSunMin;
    varying vec2 vUv;
    varying float vAO;
    varying float vShade;
    varying float vSunlight;
    varying vec2 vUvBoundsMin;
    varying vec2 vUvBoundsMax;
    varying vec3 vWorldPosition;
    #include <fog_pars_fragment>

    float sampleLUT(float level) {
        float clamped = clamp(level, 0.0, 15.0);
        int lo = int(floor(clamped));
        int hi = min(lo + 1, 15);
        float frac = clamped - float(lo);
        return mix(lightLUT[lo], lightLUT[hi], frac);
    }

    float bayer4(vec2 p) {
        vec2 m = mod(floor(p), 4.0);
        float x = m.x;
        float y = m.y;

        if (y < 0.5) {
            if (x < 0.5) return 0.0 / 16.0;
            if (x < 1.5) return 8.0 / 16.0;
            if (x < 2.5) return 2.0 / 16.0;
            return 10.0 / 16.0;
        }
        if (y < 1.5) {
            if (x < 0.5) return 12.0 / 16.0;
            if (x < 1.5) return 4.0 / 16.0;
            if (x < 2.5) return 14.0 / 16.0;
            return 6.0 / 16.0;
        }
        if (y < 2.5) {
            if (x < 0.5) return 3.0 / 16.0;
            if (x < 1.5) return 11.0 / 16.0;
            if (x < 2.5) return 1.0 / 16.0;
            return 9.0 / 16.0;
        }
        if (x < 0.5) return 15.0 / 16.0;
        if (x < 1.5) return 7.0 / 16.0;
        if (x < 2.5) return 13.0 / 16.0;
        return 5.0 / 16.0;
    }

    void main() {
        vec2 clampedUv = clamp(vUv, vUvBoundsMin, vUvBoundsMax);
        vec4 texColor = texture2D(map, clampedUv);
        if (texColor.a < 0.5) discard;
        float aoBase = max(vAO, aoMin);
        float aoSunAtten = mix(aoSunMin, 1.0, vSunlight);
        float aoApplied = mix(1.0, aoBase, clamp(aoStrength * aoSunAtten, 0.0, 1.0));
        float lightFactor = sampleLUT(vSunlight * 15.0);
        gl_FragColor = vec4(texColor.rgb * aoApplied * vShade * lightFactor, texColor.a);

        #ifdef USE_FOG
            float fogDepth = distance(vWorldPosition, cameraPosition);
            #ifdef FOG_EXP2
                float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
            #else
                float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
            #endif
            const float ditherStart = 0.97;
            float ditherFade = clamp((fogFactor - ditherStart) / (1.0 - ditherStart), 0.0, 1.0);
            if (ditherFade >= 1.0) discard;
            if (ditherFade > bayer4(gl_FragCoord.xy)) discard;
        #endif

        #include <colorspace_fragment>
    }
`;

export function createAtlasBlockMaterial(options: {
    map: Texture;
    transparent?: boolean;
    lightLUT?: number[];
    aoMin?: number;
    aoStrength?: number;
    aoSunMin?: number;
}) {
    return new ShaderMaterial({
        uniforms: {
            map: { value: options.map },
            lightLUT: { value: options.lightLUT ?? DEFAULT_LIGHT_LUT },
            aoMin: { value: options.aoMin ?? 0.2 },
            aoStrength: { value: options.aoStrength ?? 0.85 },
            aoSunMin: { value: options.aoSunMin ?? 0.3 },
            ...UniformsLib.fog,
        },
        vertexShader,
        fragmentShader,
        transparent: options.transparent ?? false,
        depthWrite: !(options.transparent ?? false),
        toneMapped: false,
        fog: true,
    });
}
