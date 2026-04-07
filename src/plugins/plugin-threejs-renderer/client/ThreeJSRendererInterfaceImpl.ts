import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { ThreeJSRendererInterface } from "./ThreeJSRendererInterface";

export class ThreeJSRendererInterfaceImpl implements ThreeJSRendererInterface {
    private readonly renderer: WebGLRenderer;
    private readonly scene: Scene;
    private readonly camera: PerspectiveCamera;
    private _initialized = false;

    constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
    }

    getScene(): Scene {
        return this.scene;
    }

    getCamera(): PerspectiveCamera {
        return this.camera;
    }

    getRenderer(): WebGLRenderer {
        return this.renderer;
    }

    isInitialized(): boolean {
        return this._initialized;
    }

    setInitialized(initialized: boolean) {
        this._initialized = initialized;
    }
}