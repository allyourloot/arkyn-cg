import type { Scene, WebGLRenderer, PerspectiveCamera } from "three";

export interface ThreeJSRendererInterface {
    getScene(): Scene;
    getCamera(): PerspectiveCamera;
    getRenderer(): WebGLRenderer;
    isInitialized(): boolean;
}