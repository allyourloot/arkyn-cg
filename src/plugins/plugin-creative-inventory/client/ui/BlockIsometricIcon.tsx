import { useEffect, useRef } from "react";
import { getBlockMeta } from "../inventoryStore";
import { useVoxelWorldRendererInterface } from "../pluginInterfaces";
import type { UvRect } from "@plugins/plugin-voxel-world-renderer/client";

type BlockIsometricIconProps = {
    blockId: number;
    size?: number;
    className?: string;
};

type BlockIconFaceUvs = {
    top: UvRect;
    left: UvRect;
    right: UvRect;
};

export function BlockIsometricIcon({ blockId, size = 38, className }: BlockIsometricIconProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const voxelWorldRenderer = useVoxelWorldRendererInterface();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const canvasSize = Math.max(1, Math.floor(size * dpr));
        if (canvas.width !== canvasSize) canvas.width = canvasSize;
        if (canvas.height !== canvasSize) canvas.height = canvasSize;

        if (!voxelWorldRenderer) {
            context.clearRect(0, 0, canvasSize, canvasSize);
            return;
        }

        const { textureUri } = getBlockMeta(blockId);
        const faceUvs = voxelWorldRenderer.getFaceUvs(textureUri);
        drawBlockIsometricIcon(context, canvasSize, voxelWorldRenderer.getAtlasImage(), {
            top: faceUvs.PY,
            left: faceUvs.NX,
            right: faceUvs.PZ,
        });
    }, [blockId, size, voxelWorldRenderer]);

    return (
        <canvas
            ref={canvasRef}
            className={className}
            style={{ width: `${size}px`, height: `${size}px`, imageRendering: "pixelated" }}
        />
    );
}

type Vec2 = { x: number; y: number };
type SourceRect = { x: number; y: number; width: number; height: number };

function drawBlockIsometricIcon(
    context: CanvasRenderingContext2D,
    size: number,
    atlasImage: HTMLImageElement,
    faceUvs: BlockIconFaceUvs,
) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, size, size);

    const centerX = size * 0.5;
    const topY = size * 0.06;
    const halfWidth = size * 0.28;
    const halfTopHeight = size * 0.18;
    const sideHeight = size * 0.4;

    const topPoint: Vec2 = { x: centerX, y: topY };
    const rightPoint: Vec2 = { x: centerX + halfWidth, y: topY + halfTopHeight };
    const bottomPoint: Vec2 = { x: centerX, y: topY + halfTopHeight * 2 };
    const leftPoint: Vec2 = { x: centerX - halfWidth, y: topY + halfTopHeight };
    const down: Vec2 = { x: 0, y: sideHeight };

    drawTexturedParallelogram(
        context,
        atlasImage,
        uvRectToSourceRect(faceUvs.left, atlasImage.width, atlasImage.height),
        leftPoint,
        subtract(bottomPoint, leftPoint),
        down,
    );
    drawShadingOverlay(context, [leftPoint, bottomPoint, add(bottomPoint, down), add(leftPoint, down)], "rgba(0, 0, 0, 0.18)");
    drawTexturedParallelogram(
        context,
        atlasImage,
        uvRectToSourceRect(faceUvs.right, atlasImage.width, atlasImage.height),
        rightPoint,
        subtract(bottomPoint, rightPoint),
        down,
    );
    drawShadingOverlay(context, [rightPoint, bottomPoint, add(bottomPoint, down), add(rightPoint, down)], "rgba(0, 0, 0, 0.08)");
    drawTexturedParallelogram(
        context,
        atlasImage,
        uvRectToSourceRect(faceUvs.top, atlasImage.width, atlasImage.height),
        topPoint,
        subtract(rightPoint, topPoint),
        subtract(leftPoint, topPoint),
    );
}

function drawTexturedParallelogram(
    context: CanvasRenderingContext2D,
    source: HTMLImageElement,
    sourceRect: SourceRect,
    origin: Vec2,
    axisX: Vec2,
    axisY: Vec2,
) {
    context.save();
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.lineTo(origin.x + axisX.x, origin.y + axisX.y);
    context.lineTo(origin.x + axisX.x + axisY.x, origin.y + axisX.y + axisY.y);
    context.lineTo(origin.x + axisY.x, origin.y + axisY.y);
    context.closePath();
    context.clip();

    context.setTransform(
        axisX.x / sourceRect.width,
        axisX.y / sourceRect.width,
        axisY.x / sourceRect.height,
        axisY.y / sourceRect.height,
        origin.x,
        origin.y,
    );
    context.imageSmoothingEnabled = false;
    context.drawImage(
        source,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        0,
        0,
        sourceRect.width,
        sourceRect.height,
    );
    context.restore();
}

function uvRectToSourceRect(uvRect: UvRect, imageWidth: number, imageHeight: number): SourceRect {
    const x = Math.max(0, Math.floor(uvRect.uMin * imageWidth));
    const y = Math.max(0, Math.floor(uvRect.vMin * imageHeight));
    const width = Math.max(1, Math.ceil((uvRect.uMax - uvRect.uMin) * imageWidth));
    const height = Math.max(1, Math.ceil((uvRect.vMax - uvRect.vMin) * imageHeight));
    return { x, y, width, height };
}

function drawShadingOverlay(context: CanvasRenderingContext2D, corners: [Vec2, Vec2, Vec2, Vec2], color: string) {
    context.save();
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(corners[0].x, corners[0].y);
    context.lineTo(corners[1].x, corners[1].y);
    context.lineTo(corners[2].x, corners[2].y);
    context.lineTo(corners[3].x, corners[3].y);
    context.closePath();
    context.fill();
    context.restore();
}

function add(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x - b.x, y: a.y - b.y };
}
