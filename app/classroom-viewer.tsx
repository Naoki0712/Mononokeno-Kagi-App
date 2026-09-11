"use client";

import { Building2, RotateCcw, ScanLine } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type ViewerStatus = "loading" | "ready" | "fallback";

type ViewerActions = {
  perspective: () => void;
  plan: () => void;
};

type ViewMode = "space" | "plan";
type MapScope = "nearby" | "school";

const ROOM_WIDTH = 8;
const ROOM_DEPTH = 7;
const ROOM_HEIGHT = 3;

export function ClassroomViewer({ minimal = false }: { minimal?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<ViewerActions | null>(null);
  const [status, setStatus] = useState<ViewerStatus>("loading");
  const [viewMode, setViewMode] = useState<ViewMode>("plan");
  const [mapScope, setMapScope] = useState<MapScope>("nearby");
  const [planResetKey, setPlanResetKey] = useState(0);
  const [schoolResetKey, setSchoolResetKey] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let frameId = 0;
    let statusTimer = 0;
    let active = true;
    let resizeObserver: ResizeObserver | null = null;
    let renderer: THREE.WebGLRenderer | null = null;

    try {
      const scene = new THREE.Scene();
      scene.background = null;

      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(8.7, 7.5, 9.2);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.domElement.setAttribute(
        "aria-label",
        "文化祭当日の写真をもとに、黒い仕切り、血糊風の新聞装飾、植物、小道具、机や箱を再現した教室の3Dビューアー",
      );
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.tabIndex = 0;
      mount.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.8, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.075;
      controls.minDistance = 5;
      controls.maxDistance = 22;
      controls.minPolarAngle = 0.12;
      controls.maxPolarAngle = Math.PI / 2.02;
      controls.update();

      const room = new THREE.Group();
      room.name = "classroom-shell";
      scene.add(room);

      const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0xcfd1ce,
        roughness: 0.9,
      });
      const corridorFloorMaterial = new THREE.MeshStandardMaterial({
        color: 0xc6c7c4,
        roughness: 0.92,
      });
      const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xeeeeea,
        roughness: 0.82,
      });
      const cutawayMaterial = new THREE.MeshStandardMaterial({
        color: 0xf3f3ed,
        roughness: 0.78,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      });
      const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0xd8d9d4,
        metalness: 0.08,
        roughness: 0.52,
      });
      const darkMaterial = new THREE.MeshStandardMaterial({
        color: 0x262827,
        roughness: 0.72,
      });
      const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xd9eef0,
        roughness: 0.12,
        transparent: true,
        opacity: 0.22,
        transmission: 0.28,
        depthWrite: false,
      });
      const frostedGlassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xcbd8d7,
        roughness: 0.62,
        transparent: true,
        opacity: 0.48,
        transmission: 0.08,
        depthWrite: false,
      });
      const boardMaterial = new THREE.MeshStandardMaterial({
        color: 0x23483f,
        roughness: 0.9,
      });
      const noticeMaterial = new THREE.MeshStandardMaterial({
        color: 0x71817d,
        roughness: 0.94,
      });
      const paperMaterial = new THREE.MeshStandardMaterial({
        color: 0xe9e7dd,
        roughness: 0.96,
      });
      const stageMaterial = new THREE.MeshStandardMaterial({
        color: 0xb8bab6,
        roughness: 0.86,
      });
      const woodMaterial = new THREE.MeshStandardMaterial({
        color: 0x9a7650,
        roughness: 0.68,
      });
      const lockerMaterial = new THREE.MeshStandardMaterial({
        color: 0xc2c5c1,
        roughness: 0.75,
      });
      const projectorMaterial = new THREE.MeshStandardMaterial({
        color: 0xd6d8d4,
        roughness: 0.6,
      });
      const lightMaterial = new THREE.MeshStandardMaterial({
        color: 0xf7f3df,
        emissive: 0xfff7d5,
        emissiveIntensity: 0.75,
        roughness: 0.45,
      });
      const deskTopMaterial = new THREE.MeshStandardMaterial({
        color: 0xb88a4e,
        roughness: 0.72,
      });
      const deskFrameMaterial = new THREE.MeshStandardMaterial({
        color: 0x8f9694,
        metalness: 0.35,
        roughness: 0.48,
      });
      const curtainMaterial = new THREE.MeshStandardMaterial({
        color: 0x141a17,
        roughness: 0.98,
      });
      const curtainRailMaterial = new THREE.MeshStandardMaterial({
        color: 0x555a58,
        metalness: 0.55,
        roughness: 0.42,
      });
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x202020,
        transparent: true,
        opacity: 0.78,
      });

      const addBox = (
        width: number,
        height: number,
        depth: number,
        x: number,
        y: number,
        z: number,
        material: THREE.Material,
        edges = true,
        rotationY = 0,
      ) => {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.rotation.y = rotationY;
        mesh.castShadow = !material.transparent;
        mesh.receiveShadow = true;
        room.add(mesh);

        if (edges) {
          const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            edgeMaterial,
          );
          outline.position.copy(mesh.position);
          outline.rotation.copy(mesh.rotation);
          room.add(outline);
        }

        return mesh;
      };

      const addCylinder = (
        radius: number,
        length: number,
        x: number,
        y: number,
        z: number,
        rotation: [number, number, number],
        material: THREE.Material,
        segments = 20,
      ) => {
        const geometry = new THREE.CylinderGeometry(
          radius,
          radius,
          length,
          segments,
        );
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.rotation.set(...rotation);
        mesh.castShadow = !material.transparent;
        mesh.receiveShadow = true;
        room.add(mesh);
        return mesh;
      };

      const addFramedPanel = (
        width: number,
        height: number,
        x: number,
        y: number,
        z: number,
        material: THREE.Material,
      ) => {
        addBox(width, height, 0.055, x, y, z, material);
        addBox(width + 0.12, 0.05, 0.1, x, y + height / 2, z, frameMaterial, false);
        addBox(width + 0.12, 0.05, 0.1, x, y - height / 2, z, frameMaterial, false);
        addBox(0.05, height, 0.1, x - width / 2, y, z, frameMaterial, false);
        addBox(0.05, height, 0.1, x + width / 2, y, z, frameMaterial, false);
      };

      const rotateOffset = (
        localX: number,
        localZ: number,
        rotationY: number,
      ) => ({
        x: localX * Math.cos(rotationY) + localZ * Math.sin(rotationY),
        z: -localX * Math.sin(rotationY) + localZ * Math.cos(rotationY),
      });

      // 机は以前の指定寸法（65cm × 45cm × 55cm）で簡略化する。
      const addDesk = (
        x: number,
        z: number,
        baseY: number,
        rotationY: number,
      ) => {
        addBox(
          0.65,
          0.05,
          0.45,
          x,
          baseY + 0.525,
          z,
          deskTopMaterial,
          true,
          rotationY,
        );

        [-0.285, 0.285].forEach((localX) => {
          const offset = rotateOffset(localX, 0, rotationY);
          addBox(
            0.035,
            0.47,
            0.35,
            x + offset.x,
            baseY + 0.25,
            z + offset.z,
            deskFrameMaterial,
            false,
            rotationY,
          );
        });

        addBox(
          0.46,
          0.025,
          0.28,
          x,
          baseY + 0.36,
          z,
          deskFrameMaterial,
          false,
          rotationY,
        );
      };

      const addStackedDesk = (x: number, z: number, rotationY: number) => {
        addDesk(x, z, 0, rotationY);
        addDesk(x, z, 0.55, rotationY);
      };

      const addDeskWall = (
        axis: "x" | "z",
        start: number,
        end: number,
        fixed: number,
      ) => {
        const length = Math.abs(end - start);
        const count = Math.max(1, Math.round(length / 0.67));
        const step = length / count;
        const direction = Math.sign(end - start) || 1;

        for (let index = 0; index < count; index += 1) {
          const position = start + direction * step * (index + 0.5);
          if (axis === "x") {
            addStackedDesk(position, fixed, 0);
          } else {
            addStackedDesk(fixed, position, Math.PI / 2);
          }
        }
      };

      const addCurtain = (
        axis: "x" | "z",
        start: number,
        end: number,
        fixed: number,
        bottom: number,
        top: number,
      ) => {
        const length = Math.abs(end - start);
        const count = Math.max(2, Math.ceil(length / 0.22));
        const step = length / count;
        const direction = Math.sign(end - start) || 1;
        const height = top - bottom;

        for (let index = 0; index < count; index += 1) {
          const position = start + direction * step * (index + 0.5);
          const fold = index % 2 === 0 ? -0.025 : 0.025;
          if (axis === "x") {
            addBox(
              step * 1.08,
              height,
              0.045,
              position,
              bottom + height / 2,
              fixed + fold,
              curtainMaterial,
              false,
            );
          } else {
            addBox(
              0.045,
              height,
              step * 1.08,
              fixed + fold,
              bottom + height / 2,
              position,
              curtainMaterial,
              false,
            );
          }
        }

        const center = (start + end) / 2;
        if (axis === "x") {
          addCylinder(
            0.018,
            length,
            center,
            top + 0.035,
            fixed,
            [0, 0, Math.PI / 2],
            curtainRailMaterial,
          );
        } else {
          addCylinder(
            0.018,
            length,
            fixed,
            top + 0.035,
            center,
            [Math.PI / 2, 0, 0],
            curtainRailMaterial,
          );
        }
      };

      const addPartition = (
        axis: "x" | "z",
        fixed: number,
        deskSegments: Array<[number, number]>,
        curtainOpenings: Array<[number, number]>,
      ) => {
        deskSegments.forEach(([start, end]) => {
          addDeskWall(axis, start, end, fixed);
          addCurtain(axis, start, end, fixed, 1.08, 2.6);
        });
        curtainOpenings.forEach(([start, end]) => {
          addCurtain(axis, start, end, fixed, 0.04, 2.6);
        });
      };

      // 教室床と、廊下側の外床。
      addBox(ROOM_WIDTH, 0.14, ROOM_DEPTH, 0, -0.07, 0, floorMaterial);
      addBox(1.35, 0.12, 7.4, 4.68, -0.06, 0, corridorFloorMaterial);

      // 前方：黒板、黒板前の一段高い教壇、プロジェクター、時計。
      addBox(
        ROOM_WIDTH,
        ROOM_HEIGHT,
        0.14,
        0,
        ROOM_HEIGHT / 2,
        -ROOM_DEPTH / 2,
        wallMaterial,
      );
      addBox(7.1, 0.13, 0.9, -0.18, 0.065, -3.02, stageMaterial);
      addBox(7.1, 0.07, 0.055, -0.18, 0.115, -2.57, woodMaterial, false);
      addFramedPanel(4.85, 1.08, 0, 1.64, -3.39, boardMaterial);
      addBox(5.02, 0.055, 0.17, 0, 1.07, -3.29, frameMaterial, false);

      addBox(0.07, 0.32, 0.07, -1.42, 2.69, -3.31, frameMaterial, false);
      addBox(0.48, 0.2, 0.34, -1.42, 2.46, -3.12, projectorMaterial);
      addCylinder(
        0.055,
        0.035,
        -1.42,
        2.45,
        -2.93,
        [Math.PI / 2, 0, 0],
        darkMaterial,
      );

      addCylinder(
        0.19,
        0.065,
        2.87,
        2.43,
        -3.36,
        [Math.PI / 2, 0, 0],
        darkMaterial,
        32,
      );
      addCylinder(
        0.155,
        0.072,
        2.87,
        2.43,
        -3.32,
        [Math.PI / 2, 0, 0],
        paperMaterial,
        32,
      );
      addBox(0.012, 0.095, 0.012, 2.87, 2.47, -3.275, darkMaterial, false);
      addBox(0.075, 0.012, 0.012, 2.91, 2.43, -3.275, darkMaterial, false);

      [-2.72, 2.72].forEach((x) => {
        addBox(0.28, 0.24, 0.18, x, 2.42, -3.34, frameMaterial);
      });

      // 外窓側：5区画。下部すりガラス、大型窓、上欄間の三段構成。
      addBox(0.14, 0.4, ROOM_DEPTH, -4, 0.2, 0, wallMaterial);
      addBox(0.14, 0.3, ROOM_DEPTH, -4, 2.85, 0, wallMaterial);

      const exteriorWindowCenters = [-2.8, -1.4, 0, 1.4, 2.8];
      exteriorWindowCenters.forEach((z) => {
        addBox(0.035, 0.58, 1.27, -3.94, 0.72, z, frostedGlassMaterial, false);
        addBox(0.035, 1.03, 1.27, -3.94, 1.59, z, glassMaterial, false);
        addBox(0.035, 0.5, 1.27, -3.94, 2.4, z, glassMaterial, false);
      });
      [-3.5, -2.1, -0.7, 0.7, 2.1, 3.5].forEach((z) => {
        addBox(0.14, 2.29, 0.075, -3.91, 1.54, z, frameMaterial, false);
      });
      [0.4, 1.03, 2.13, 2.68].forEach((y) => {
        addBox(0.14, 0.075, ROOM_DEPTH, -3.91, y, 0, frameMaterial, false);
      });

      // 窓際に並ぶ2台の天吊り空調機。
      [-1.55, 1.3].forEach((z) => {
        addBox(1.22, 0.24, 0.48, -2.84, 2.73, z, projectorMaterial);
        addBox(0.035, 0.085, 0.38, -2.21, 2.68, z, darkMaterial, false);
        addBox(0.08, 0.17, 0.08, -3.28, 2.91, z, frameMaterial, false);
        addBox(0.08, 0.17, 0.08, -2.4, 2.91, z, frameMaterial, false);
      });

      // 廊下側：中央の3枚窓、前後の窓付き引き戸、全面の上欄間。
      addBox(0.14, 0.76, 4.16, 4, 0.38, 0, wallMaterial);
      addBox(0.14, 0.29, ROOM_DEPTH, 4, 2.855, 0, wallMaterial);
      addBox(0.14, ROOM_HEIGHT, 0.32, 4, 1.5, -3.34, wallMaterial);
      addBox(0.14, ROOM_HEIGHT, 0.32, 4, 1.5, 3.34, wallMaterial);

      [-1.386, 0, 1.386].forEach((z) => {
        addBox(0.035, 1.31, 1.28, 3.94, 1.445, z, glassMaterial, false);
      });
      [-2.08, -0.693, 0.693, 2.08].forEach((z) => {
        addBox(0.14, 1.4, 0.075, 3.91, 1.46, z, frameMaterial, false);
      });
      addBox(0.14, 0.075, 4.16, 3.91, 0.76, 0, frameMaterial, false);
      addBox(0.14, 0.075, ROOM_DEPTH, 3.91, 2.14, 0, frameMaterial, false);

      const addSlidingDoor = (z: number, handleSide: number) => {
        addBox(0.11, 2.14, 0.07, 3.95, 1.07, z - 0.5, frameMaterial, false);
        addBox(0.11, 2.14, 0.07, 3.95, 1.07, z + 0.5, frameMaterial, false);
        addBox(0.11, 0.91, 0.93, 3.95, 0.455, z, wallMaterial);
        addBox(0.11, 0.45, 0.93, 3.95, 1.915, z, wallMaterial);
        addBox(0.035, 0.67, 0.81, 3.89, 1.345, z, glassMaterial, false);
        addBox(0.13, 0.06, 1.02, 3.91, 0.92, z, frameMaterial, false);
        addBox(0.13, 0.06, 1.02, 3.91, 1.69, z, frameMaterial, false);
        addBox(0.045, 0.28, 0.035, 3.86, 1.04, z + handleSide * 0.37, darkMaterial, false);
      };
      addSlidingDoor(-2.61, 1);
      addSlidingDoor(2.61, -1);

      const transomCenters = [-2.916, -1.75, -0.583, 0.583, 1.75, 2.916];
      transomCenters.forEach((z) => {
        addBox(0.035, 0.48, 1.07, 3.94, 2.42, z, glassMaterial, false);
      });
      [-3.5, -2.333, -1.166, 0, 1.166, 2.333, 3.5].forEach((z) => {
        addBox(0.14, 0.56, 0.07, 3.91, 2.42, z, frameMaterial, false);
      });
      addBox(0.14, 0.075, ROOM_DEPTH, 3.91, 2.7, 0, frameMaterial, false);

      // 教室外側の木製二段手すりと壁面ブラケット。
      [0.57, 0.88].forEach((y) => {
        addCylinder(0.04, 4.08, 4.27, y, 0, [Math.PI / 2, 0, 0], woodMaterial);
        [-1.65, -0.55, 0.55, 1.65].forEach((z) => {
          addCylinder(0.023, 0.24, 4.15, y, z, [0, 0, Math.PI / 2], frameMaterial);
        });
      });

      // 後方：中央黒板、左右掲示板、窓側の2枚扉ロッカー。
      addBox(
        ROOM_WIDTH,
        ROOM_HEIGHT,
        0.14,
        0,
        ROOM_HEIGHT / 2,
        ROOM_DEPTH / 2,
        cutawayMaterial,
      );
      addFramedPanel(3.05, 0.95, 0, 1.57, 3.39, boardMaterial);
      addFramedPanel(1.45, 0.95, -2.45, 1.57, 3.39, noticeMaterial);
      addFramedPanel(1.45, 0.95, 2.45, 1.57, 3.39, noticeMaterial);

      [
        [-2.68, 1.72],
        [-2.25, 1.43],
        [2.2, 1.72],
        [2.63, 1.45],
      ].forEach(([x, y]) => {
        addBox(0.28, 0.34, 0.018, x, y, 3.345, paperMaterial, false);
      });

      addBox(0.74, 1.86, 0.46, -3.52, 0.93, 3.16, lockerMaterial);
      addBox(0.018, 1.7, 0.02, -3.52, 0.95, 2.92, frameMaterial, false);
      [-3.63, -3.41].forEach((x) => {
        addBox(0.025, 0.16, 0.025, x, 1.03, 2.9, darkMaterial, false);
      });

      // 窓の遮光カーテン。外窓は全面、廊下側は中央窓を覆う。
      addCurtain("z", -3.34, 3.34, -3.72, 0.38, 2.68);
      addCurtain("z", -2.02, 2.02, 3.72, 0.77, 2.68);
      addCurtain("z", -3.34, -2.12, 3.72, 2.14, 2.68);
      addCurtain("z", 2.12, 3.34, 3.72, 2.14, 2.68);

      // 9/11の俯瞰図を基準にした文化祭当日の迷路配置。
      // 座標は左上を (0,0)、右下を (8,7) とした平面仕様を3D座標へ変換する。
      const mapToRoom = (mapX: number, mapY: number) => ({
        x: mapX - ROOM_WIDTH / 2,
        z: mapY - ROOM_DEPTH / 2,
      });

      const addMappedDeskWall = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
      ) => {
        const a = mapToRoom(x1, y1);
        const b = mapToRoom(x2, y2);
        if (Math.abs(y2 - y1) < 0.01) {
          addDeskWall("x", a.x, b.x, a.z);
          addCurtain("x", a.x, b.x, a.z, 1.08, 2.6);
        } else {
          addDeskWall("z", a.z, b.z, a.x);
          addCurtain("z", a.z, b.z, a.x, 1.08, 2.6);
        }
      };

      [
        [1.2, 1.8, 1.2, 4.3],
        [1.2, 4.3, 2.0, 4.3],
        [2.6, 1.6, 5.0, 1.6],
        [5.2, 1.6, 5.2, 4.0],
        [3.3, 3.0, 3.3, 5.6],
        [4.5, 4.0, 4.5, 5.5],
        [4.2, 5.5, 6.0, 5.5],
        [6.5, 1.8, 6.5, 6.0],
        [7.6, 2.0, 7.6, 6.1],
      ].forEach(([x1, y1, x2, y2]) => addMappedDeskWall(x1, y1, x2, y2));

      // 確認済みのギミック3か所を青いマーカーで示す。
      const gimmickMaterial = new THREE.MeshStandardMaterial({
        color: 0x2357ff,
        emissive: 0x0b1b66,
        emissiveIntensity: 0.42,
        roughness: 0.58,
      });
      [
        [1.3, 2.3],
        [5.0, 2.2],
        [5.9, 5.5],
      ].forEach(([mapX, mapY]) => {
        const p = mapToRoom(mapX, mapY);
        addCylinder(0.18, 0.18, p.x, 0.18, p.z, [0, 0, 0], gimmickMaterial, 24);
      });

      // スタンプ台（緑）。俯瞰図どおり左下寄りに配置。
      const stampMaterial = new THREE.MeshStandardMaterial({
        color: 0x24c45a,
        emissive: 0x0c4b22,
        emissiveIntensity: 0.32,
        roughness: 0.65,
      });
      {
        const p = mapToRoom(0.8, 6.3);
        addDesk(p.x, p.z, 0, -0.35);
        addCylinder(0.11, 0.08, p.x, 0.64, p.z, [0, 0, 0], stampMaterial, 20);
      }

      // 受付と待機イスは教室外の来場者側に簡略表示。
      addDesk(0.9, 4.15, 0, 0);
      [-1.7, -1.1, -0.5, 0.1, 1.5].forEach((x) => {
        addBox(0.42, 0.45, 0.42, x, 0.225, 4.12, frameMaterial);
      });

      // スタッフ専用出入口は赤い床マーカーで位置を示す。
      const staffMarkerMaterial = new THREE.MeshStandardMaterial({
        color: 0xe23b3b,
        emissive: 0x5b1010,
        emissiveIntensity: 0.35,
        roughness: 0.68,
      });
      [
        [2.6, 0.18],
        [5.2, 0.18],
      ].forEach(([mapX, mapY]) => {
        const p = mapToRoom(mapX, mapY);
        addBox(0.52, 0.035, 0.28, p.x, 0.02, p.z, staffMarkerMaterial, false);
      });

      // 写真に見える配置を参考にした天井の蛍光灯。
      [-2.15, 0, 2.15].forEach((x) => {
        [-2.35, -0.78, 0.78, 2.35].forEach((z) => {
          addBox(0.13, 0.045, 0.92, x, 2.91, z, lightMaterial, false);
          addBox(0.24, 0.035, 1.02, x, 2.925, z, frameMaterial, false);
        });
      });

      const ambient = new THREE.HemisphereLight(0xffffff, 0x303030, 2.3);
      scene.add(ambient);

      const keyLight = new THREE.DirectionalLight(0xffffff, 3.6);
      keyLight.position.set(5, 10, 6);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 30;
      keyLight.shadow.camera.left = -8;
      keyLight.shadow.camera.right = 8;
      keyLight.shadow.camera.top = 8;
      keyLight.shadow.camera.bottom = -8;
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 1.15);
      fillLight.position.set(-6, 4, -4);
      scene.add(fillLight);

      const setPerspective = () => {
        camera.position.set(8.7, 7.5, 9.2);
        controls.target.set(0, 0.8, 0);
        controls.update();
        setViewMode("space");
      };

      const setPlan = () => {
        camera.position.set(0.01, 13.2, 0.01);
        controls.target.set(0, 0, 0);
        controls.update();
        setViewMode("plan");
      };

      actionsRef.current = {
        perspective: setPerspective,
        plan: setPlan,
      };

      const resize = () => {
        const width = Math.max(mount.clientWidth, 1);
        const height = Math.max(mount.clientHeight, 1);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer?.setSize(width, height, false);
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);
      resize();

      const preventContextMenu = (event: MouseEvent) => event.preventDefault();
      renderer.domElement.addEventListener("contextmenu", preventContextMenu);

      const animate = () => {
        controls.update();
        renderer?.render(scene, camera);
        frameId = window.requestAnimationFrame(animate);
      };
      animate();
      statusTimer = window.setTimeout(() => {
        if (active) setStatus("ready");
      }, 0);

      return () => {
        active = false;
        window.cancelAnimationFrame(frameId);
        window.clearTimeout(statusTimer);
        resizeObserver?.disconnect();
        controls.dispose();
        actionsRef.current = null;
        renderer?.domElement.removeEventListener("contextmenu", preventContextMenu);

        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) {
            return;
          }
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        });

        renderer?.dispose();
        renderer?.domElement.remove();
      };
    } catch (error) {
      console.error("3D viewer initialization failed", error);
      renderer?.dispose();
      renderer?.domElement.remove();
      window.setTimeout(() => {
        if (active) setStatus("fallback");
      }, 0);
    }
  }, []);

  const resetView = () => {
    if (mapScope === "school") {
      setSchoolResetKey((current) => current + 1);
    } else if (viewMode === "plan" || status === "fallback") {
      setPlanResetKey((current) => current + 1);
    } else {
      actionsRef.current?.perspective();
    }
  };

  return (
    <div className={`viewerShell ${minimal ? "viewerShellMinimal" : ""}`}>
      <div
        className={`viewerMount ${viewMode === "plan" || mapScope === "school" ? "viewerMountHidden" : ""}`}
        ref={mountRef}
        aria-hidden={viewMode === "plan" || mapScope === "school"}
      />

      <div className="viewerTopbar">
        <div>
          <p>3D CLASSROOM</p>
          <span>8m × 7m × 3m / FESTIVAL DAY LAYOUT</span>
        </div>
        <div className="viewerActions" aria-label="3D表示の操作">
          <button
            type="button"
            className="viewerScopeAction"
            onClick={() => setMapScope((current) => current === "nearby" ? "school" : "nearby")}
            disabled={status === "loading"}
          >
            <Building2 aria-hidden="true" />
            <span className="viewerActionLabel">{mapScope === "nearby" ? "校内" : "教室内・付近"}</span>
          </button>
          <button
            type="button"
            className="viewerResetAction"
            onClick={resetView}
            disabled={status === "loading"}
          >
            <RotateCcw aria-hidden="true" />
            <span className="viewerActionLabel">初期位置</span>
          </button>
          <button
            type="button"
            className={`viewerModeAction ${mapScope === "school" ? "viewerModeActionHidden" : ""}`}
            onClick={() =>
              viewMode === "space"
                ? actionsRef.current?.plan()
                : actionsRef.current?.perspective()
            }
            disabled={status !== "ready" || mapScope === "school"}
            aria-hidden={mapScope === "school"}
            tabIndex={mapScope === "school" ? -1 : 0}
          >
            <ScanLine aria-hidden="true" />
            <span className="viewerActionLabel">{viewMode === "space" ? "平面表示" : "空間表示"}</span>
          </button>
        </div>
      </div>

      {status === "loading" && mapScope === "nearby" && (
        <div className="viewerMessage" role="status">
          <span className="loadingMark" aria-hidden="true" />
          3Dマップを準備しています
        </div>
      )}

      {status === "fallback" && mapScope === "nearby" && (
        <div className="viewerFallback" role="img" aria-label="机の仕切りとカーテンを含む教室の平面図">
          <PlanDiagram />
          <p>この環境では3D表示を利用できないため、平面図を表示しています。</p>
        </div>
      )}

      {status === "ready" && mapScope === "nearby" && viewMode === "plan" && (
        <div className="viewerPlanMode" role="img" aria-label="教室の平面図">
          <InteractiveDiagram key={`plan-${planResetKey}`} label="教室の平面図。ホイールまたはピンチで拡大縮小できます">
            <PlanDiagram />
          </InteractiveDiagram>
        </div>
      )}

      {mapScope === "school" && (
        <div className="viewerSchoolMode" role="img" aria-label="校内4階の案内図">
          <InteractiveDiagram key={`school-${schoolResetKey}`} label="校内4階の案内図。ホイールまたはピンチで拡大縮小できます" wide>
            <SchoolDiagram />
          </InteractiveDiagram>
        </div>
      )}

    </div>
  );
}

type DiagramTransform = {
  scale: number;
  x: number;
  y: number;
};

function InteractiveDiagram({
  children,
  label,
  wide = false,
}: {
  children: ReactNode;
  label: string;
  wide?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<DiagramTransform>({ scale: 1, x: 0, y: 0 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistanceRef = useRef<number | null>(null);

  const zoom = (factor: number) => {
    setTransform((current) => ({
      ...current,
      scale: Math.min(3.2, Math.max(0.6, current.scale * factor)),
    }));
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setTransform((current) => ({
        ...current,
        scale: Math.min(3.2, Math.max(0.6, current.scale * Math.exp(-event.deltaY * 0.0015))),
      }));
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      const [first, second] = Array.from(pointersRef.current.values());
      pinchDistanceRef.current = Math.hypot(second.x - first.x, second.y - first.y);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 1) {
      setTransform((current) => ({
        ...current,
        x: current.x + event.clientX - previous.x,
        y: current.y + event.clientY - previous.y,
      }));
      return;
    }

    if (pointersRef.current.size === 2) {
      const [first, second] = Array.from(pointersRef.current.values());
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (pinchDistanceRef.current && pinchDistanceRef.current > 0) {
        zoom(distance / pinchDistanceRef.current);
      }
      pinchDistanceRef.current = distance;
    }
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchDistanceRef.current = null;
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(1.16);
    } else if (event.key === "-") {
      event.preventDefault();
      zoom(1 / 1.16);
    } else if (event.key === "0") {
      event.preventDefault();
      setTransform({ scale: 1, x: 0, y: 0 });
    }
  };

  return (
    <div
      className="interactiveDiagramViewport"
      aria-label={label}
      ref={viewportRef}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => setTransform({ scale: 1, x: 0, y: 0 })}
    >
      <div
        className={`interactiveDiagramCanvas ${wide ? "interactiveDiagramWide" : ""}`}
        style={{ transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})` }}
      >
        {children}
      </div>
    </div>
  );
}


const SCHOOL_MAP_IMAGE = "data:image/webp;base64,UklGRkgsAABXRUJQVlA4IDwsAABw8ACdASrgAWgBPtFeqE4oJSyjJzGckZAaCWduy666L3l/OH55ACCBjE/1Wd6CyB/0J/n/Sf5ifu/FP0jjD0EH6XnR/4/9D5M+tb1FPHv2t+rntata8w72A+z/+DxMNR3xR7Anlf/0vFk+vf9f2D/6j/kfSE0y6M5b2c7Q392DsDX36ZNGEIQhByv08WuJ4ZdDEAwufpqB81dBQyIQgW8v1yIaRqjoifa2J4PcIwZST6UVjGMWQTRAfV/Ehm4IMrFh+QtRHk/wWehvxVFL6h6kWt+11oFYtmzmkmf9GDL6088w6UOMGlpp+BBG/Pts/kR8kA24iHRnCwvcyuehyFkpv+JehEv+tnlh8AyFBk31pVniM8COSaM94ATmu1hEN+h4kf1TURW2EyhfPaH2PfDsOJyf1fNMGmThZGnDB9UtHv7xPdRaJI1MIKAz0QYS+JiVbCqKenzm6aq53ntlZu7LxCnN1+inWH0QPaAg+TlvzMDzEIIjotdas/5PeRY8LERmn5ojzTZ4K7PbBlI+xMGDkUqKBWmu1IpkiLULn0oMQe/lXcUTSeo1QXmZyBwc2QnpeuhIy8Sdf6ZAcp2Um8+CfFsOH144MqmNEgEnTOMeLQ0QUWHLzkZ+GbOc3wu5kZZIaRTZAoH2Bmb39mZkxcSEfQbzxYe36xctomX7GP7CfieIkeaORgqVyBIpv1XErammlGQBPbeq1u5ZiY0D8jEg0tW0KiIl9iozmYAuZZcSK0g3rz59bZbav/KzvJbLft0uPZ1jGp+cT3XKo3eMnBz0vOEp2zLqlVA/pIbPQD/szffwCuGgoN+/vtbtbCX5n8Zv7w2dmdmKqPm4ztxUms3Jk0zq27tRIwdeOZAefI29H4jTd2UG+VYI7mRpF4UIT3fFssb9HE1CMeqetI2BjQE1nHJpCB6a/xE6z+Sz2dnYhvH6hFaE6aAfCbnV9rGelydNYhQtDIFk/g7c3IU6gAzTOlmh84WbuHmoGtSK5lkrrN2fb9Z9Zqc++iNAjBGZw/mqpNzgLoe6Sv/kgfOJUEaoE3F6Jt/tu1cEEwB6BUch9pEetwilXKozAlf5HuUPOefhkU2sO8KI3+CCm2Y9f1tyyBEI3KuIEsQdOwFqiLhn/6pCDGOaNKtOwvobOedPp4wuqulscvkHxU5nBu/NZf8YUwi8yQ19ZGKsHqHhJ60lxFFHJt6OO6UOE9rYspbSHk+6QsQc9C3E2RVWZz+NZ0iHknB+rpqGr7eR+f9/iQAAhn4DYhG9T/3YrVOLGoFW0Axyp+Wap1RskjmlF8nqegIpDBsyZ/jhEEc4ES8cdfBUBHL1XCylQ9pNCPbeS41YWtcUuvAnYPij892CoA4IYaRX85lL9NHY1V7Sfccc+XGZeWHzmXUJPPL2FChFCDOBfYqaQkUoIc+kHvjdIq3ZRHd9TabZPAq97X/ZBJCMN3MXTNTMG1nbKIhSM6XMkWqMVkNVXxVzBX+3kQGtw3RjsOzc/On8wLwxCSA8iTNLr3Q5MP2QdFPgZAxaPaycndfbGNTSQxBZkuLJxdl5Du42UEf+WvtEmWnY3OFVwCcSt374DD7DoEiLYExKb2gg6cCRBI9Y3tufreS+++/0FWi7RkR/XlaSvN75iAkFqwe2t0COOp/SYwsA77FipcK8VjRlMMJso8BGyT+EmUYWAMooZEFp0WItPe2/nt9kOg1nZuawOAMXuvoFrFjIr2kwU5ZLJlVkCA3Vu5RYuUOikvfKDVppMXiRmVCcw29mvS6fJRkDzIFMfBRr3mbjjzRy0r0mW5bYxXQUbVHVosSfUZQl1sJ2MqAZGHm0WqyvlCXtbC1COsm0kAgMA9Z79EVFZAmnIL8qTVn99hM5xpEK1OoV/sGQI+rYAaleRPT3tkEnGVg4KLbLTJgaZVBrltmIoSa/XWNt02Mhwi+WDTb96z/nofjE+iqW4wQowtKH0jMLDN5xoKhfBEdQEoQKzSgdbQVa27rorAK0buLhWu90RqLLQrwETIZ6BvkwQJwrAIjbkbWQ6AtNsW+sVDDSGfpOWzMD/65rnDBMeoPafPZSbZHYXlCEnF2/80VbUnwp0moD4I4oAutAByVVVpLkGG4Qll4YlP7i6473hok9YHvxYGi97+t2IGvfPUMgzekhPXDTExhkpx6pU/DG+1/QjMZ8MddPWNQtBwMnxtuLbSTl+YXv/4xWrcT8l74I/NFsnbSCrhJN2Q0+dFL8hx2HHcdFZRn/43HamYb9H6HGkZh6nVWPSZKFzT9YKWgm8xc44zLKlHSluhVQnmq3/F6DG8DXbsdTiIp1rWtcmLxXQdg0w89CNmkiFi6GdEC4v+pQbYuox2vw6e+oAHM63PFSqQ9fUcFNR5r2MYxkAi1DsRJ1EkX2tzlGiXA922geJMlh9FEAc1rWLYnA09WezfOnPLjJhElPVTMurnrpIVrnNNFuueg9ydT4lTINMQgFbHbvjvPw6sjnV1217dJdaCEvasMn9BurhNBOBWJtxBVOrUzf0pFtuE1VjnN60GwgkHjUd1zEIQbBwzrgVtxt1EyglAxjGALxzM1rWthR6/sYxjGMRAAA/s4arD5tLr47Xllyfx/PbUGjRgAmubpqHe3LGslrMHhu6fJHipuCopARXvuZ0PxYE4Vx2YCl82P4goqNgTTwNvQxcr2z7kP5VF+3H6+kYn6vnBpnKavjcL9u3GxYonTD/2v9T7lN3Mr39vlPsJQkRnPTA81mEf7gKa+aSU/zYCVuJamaiNEgsfohZTlzRvRlA4NqsM5GfPq+fVo4DOUxxPT41vuQVoqB99LadW+gluxA/pPl43qB6K7BPrMxh79GinJCdcWH4p3c269x7ioPn5Rx4V9CQn1PzhIMKt2lPl+CHLyZRr81kkrwrOiMM+w//EVBsYkvCmyj+nOf7tNWp21F4Obup4MYbkNBkmMEQiOqdHakmSN4nleyLt4DOiOpDYW3QX1r1U7htXGyO9MH3c/O6LoJ1z/8AhJEY8MeADqPY9dNM0um7EdABAQdLbXk4TmHurDwWs39GpmMHiofRFEka2EKqrvfnSz3j3C0m1JQ6oYj+cetdgguj3b+FDzhhKTJmmltF6YyWgDexf0nJqmg63GcF11/wiGs0Fqw9PTt8lm7Zs9zcYMppNMzQH4Kzv92stuLjjNluSaB245H/TDpv/g3Qhxv0LyhXpL7QmCv7Hf7bnwxOLX2W9i4DmMl+WneTBC0CYoYQrCVOS2vjR01Yf10X6WXzG9HUfCHA+VXgYIk3hqEv3b9a0IyKp/fq/0Oe6bE3DFJxUqcx02MD3HFuop6dloGoNJMvdT54w0VhaOwmUFxcBtXTZSS9CIQl9T42Z0HidveBHqOWF5ae6QuNx/2ZFVLHymth+j6CT7xMNUiV9kK4Vly5TmGYr1lFiKTf4O7CtdLXLHw3wS2iHaBMiOHzqA/z6m3gm8USU3nmt3KWdAXKVCi2iyxyiQyPg/yFaCJSggV7WfC8PlxvZRfrqzXQvpHRh8NfGmsMDLchznYIKzO5qO7S4Fo8W1WNOWA6PmXM0QU6qBsS9H+9EN+oFoDCVNWdTwcPl4x+l3cQE1BlcoK36j8PisDhajl8T4X+3+RfpG+hIZkdQsBghXEf6y8JY9ugRQ8a4NtRxH6bbdxnMcocN4S/7KYzSh510SV2wps1FaS+ZimoH2r81y+CYa0jg1/Y91K0yDAUOG/8/lsFo5EuY8+B8NVwT9syxp2f4AmMhOJwM2/lA0C9CcCkH8j/TwwbhLzb3PQJLeQkAXIkChARBjd/FUM8wpFWVJid7N4tWwRmgLrJNqNsE4ttWR5dpX6DEw7MbSdmQ/YbgF8h4AlrbX9K9ChDJWWmWwz//mDmIWua5D9aU6YpwhSTRG8+JPQr1EC/sJRCRrW0VScl6c2V49FLKbiVbNceJ+Hs2yU1qbv8eGv6eowwdGbMkOuFDQ4S2qp0dBapzDbRopXy5gSymcAH4WjpFMGyp0X3dIahgDXwIhXetLlmZGgi4exO/rMCgIQMJHF5YNkNFcUF9p3aCO/0a2xs7sZYGv5YwcAmPzNnmk32u21eijgySMIEqr0BU6G1ggI7gULgp3vJW1VXWz1pMvUOZUAPmbKQ7RQ/1cdiJ5b1zqprr/ZKX1Grl7JI/UrUK67E8xA5pHl/qP1SZghlQxtpJvSgQ5QVX7E5MS7uR6usFceUEsSozEZyZ/+D/IfjcAt6V1EaRtZfMVpplvEx6sGYvw7uapvGfZGL814awcCt+7angsMX+HFaNMw0pJGFzR/tvpnpfQESOqPxPHWaayjWXsfxuN8bewiBXIhxQ20GbiZcF2fbSk2EgMJ+YA429SgZMKwRHJ7MSjFh0LWMl3ZamBL6o8/ICP0KMweUUYintMT4cl40Lv7jRDk6+Cc+3+Yi/+R5bJ0KNBH+Ql+uFOQuNfpUi728yehsaAcA9TOa53/p1fNpdYWuRb41hr77KIxoOM9TN1isqUAjBdCsAm/bBlXCWAZovXZqqYG4NpzKxn2m8HrFS0+d8A963cIiCHLapwtgZGfPDQOeHl0XGeybnhqDcM5KwVqio3w7OKB0y0gEp/3tIEYrDsAdH4vJRRmpsaRWjbjxjHga/f3OlLmfe5Y+PDxKNeURsTpeb1grzIwEXaDSKE6DpUXPr+QEuu8v96rEE6IS2xneDJJ5oBiKgWdatNAvuMKAzNpG99YGWRfxoEbm+9Ky1N9/vmg3E+gz6xIxd94gwPhHpw3v27bB11nw1xHHFu95/k7sDhuS8vHbzs4Un0xzmrVaH/FBPCjlTxebyeadIaay6/SrhA3jV4apTcBhqC9OyUjfoJSwaCuEp3ts08jfOsJZ2o6ZyfMLXeAOmnowoBIJvigztExVJkCe7+IdDQrRqF/6DL9M2gp5ZaY+rgi2tWWCGtS9Fquf5tbUcghRHhD1AohMV8y+ilC8MObvGrPzuRTcT40CuwskQhY+zi+PBdumMFqlkMTqWPxPjNZcKWeZolE2s31gOzJek2M1ZJUkB48u4cfKtZdKNGu3ms91xjwPaN5M596KKeeTgje9p/eqHI3zVsgUPEIphXen8NiP6PUgvZmiyeQnKmjlpcR8F99CCWu+kiyvN7GB7EGtKvZKkGdIWNDcNy671uzDL4qYmOCebtwARUw8WMvMXrP1wGrCWPtO8XH7nPNxMS6x/r9/etmo+LtSV5+TYvXTe3CXX0UGgFgi3pvL2P6HxXKjqWlkKYfnKtlQypmwhAk5FslZ5pidUfYI5lTWrgd3tU/jMWuY1xuO5Ucc6VFZc/00yXUb/pGmx6vUq54bbYyX5X6zrpLUgN7DhPjg8EdlR+y98Xy0jZi2U0+uQgIW4roMrnWgEzcVno8exg6tjdS/kkaJ3wR91ZRaHC0BO5UY5yPYDeqlAw2oOvVV95FEzGy3g1t43antzUwZ1w5RVRD7hHMvkoFRoMp1ZZE0qyILSmDT7wQ74/tQX7q8imkNumg4syNSW6ei/LH5dOYFarD3tdiZDG5ZGwMxAiZeRdnyjgy3GCytpqYZ/xfP0gyu2coDlIM/lTexV+m4pjnTmedncHM5S+LQLv0/yhmO33/tXNqgTaarDMsq0Rf+YDtECt/K4plZqXZWr1dYwmHIVKWZbnfbRModDarcZKQP2MHWOD2Jem0sydXvML7FeByNYHBkvumptUHJrbRsJ2QI03Ku4K69TcHxHGC432Cx6io7AC8bJpmwwA6a91Ekizix+JFgS5L5KvOIgadaoaKCCWvztfaerzIPsxL2rMVmv8u3fMbV9k2lFYR8Gb6RIGgnscYqfKtkI/fl6FWKvSlgymBakrG1OYxvhBbt50Vo0NDArcU1FiNsxxXhvuNDot8z5QDbI53/ItQjyTRzrhRyng87+o3FgjBdm3EySCUrBdu9TlWD7KXjlQYDJU2atFR4O52ABMNlEhvu7t7xZQRa9xAk3CzfRQ/VgWrtj0GbO1gZT9psHoIJhrTlg36gCKuR7p2WORFaFclE6e/uT2o6hiEw55Qx5ejNlM0+ovu5aXBYmhTK3SO0rj8A6sSB9IGYBV1GUgvCOrQGH7YScQc9bxaxtN9yPz+4agayogqwXNtUj6MKHdykMHy/McnYIaSZN67VoILgyLGtEf+WgIZRwkVdSX5gZyWIp73vJaDPgygfyBR4jIsd+KxcOqCRxTVYvPwHKmMRUah/DVUzl9w2fCJNRad6uJt3YYsowv9geppVB5tgl0qw41n8GP8Od8FnmD2fditsvPF049w76C+y4uI0MRkAvKI6pr0yzQpdBG+cYX/DpquAXvwDDmiM+Hpj/gDKumE6B30fitEOULra/uRlTYyX0eB4N3e21EMJdZ4rjZjZTmcFiXuIi6roDXh4IqYpG+MBgups7R3uF+mEMgWONhdtdEnefhbAOhQbjc+J+YPkAQRTfWtYrCh+SnqEfIkJQr6MbvsPk9mpT1j+JQDhtFJ/K/W/ynJjBpvUKJWyJAw8KJyucZEgYCdiKZ5h36hcXdCdFgocj7/fE9Wdj9e07GG12PGImPiTs7Af58KccfOgtyrZdWNveG6wpfTqeNK+d1KtJ7/+otTzXW/fYPwXjD6pwwxzbDCrg9H0WuvLVB/d54wKNIzC/m2EFm4+FzA7teOC5UOh8Fcx/F8ImFpeAKRpyWdcGDWiivCsqOCqRY+yi2MBrFJBqjnuK62ppm8zBQSSU6qhE+DMiuqp2lRTdU9crqbCJvQgjCkK3+a1hLc35jhP0iRi/VjxgHB/NAVMFynNPymoSKeMOpTVgW8IIzAoDLD6EyAN0WpeaTKGHGafG9N3dXmJE2Nzrzh2zkNJvEJXbPhPfdyxntKeb7nd3FNH5P60J/GROKYD+RC+sGo++5YUb67ulSLRje98cKnNeo8D3+ackqAdK3eU/DOwKDcwK6VX17ncXa+fgI6gg54D5xG9YyZDGTtOzV6++wFJOeZqCnzBXuEdXPYbxHPnX21HfiDrcO0C1t4ayv89r0QwS+5Vc8+MJQ1iufzZRniYjQSEtAAAw1VKZvqshMyOKcMfXSzy8FawkpG0jLjaNYxrGh2OEWqeUeD18Bl/4hXNJlVmEEuTL2nwZs+CLb+zMgdtkVpmYuHKl7oYRBZWDIR5KHr16FfD8nUfkq1Oa1Kjp9dj32nV5JAeKSXu5WmJSOTgDT/nz+/Ux8WPXwbSZ3pTSdQTNIWYO23AFCsRh8utJKYzlaktmDKNtmQw+htr892VOzN/IFlIQolKGaFC/yWaZJrHuQ32HmkaBYiOUlfmVZ19BXU6NF2LvwfTYwfMSL4OPmURWLTHRzDx/S1wOtNkhZIgaE6TefGrqu3XnvCmSuDNHHHVqQGd/GFOsYBjC9QzDqaD5V4UhL+Dq6MSfveCcah+5CPXfqgXmtYsXouyzDduUG+pHX4Wr6QTTluTsBQSlktfgjGwiBimWacfJp0uuTXAdLPl4UGmcb3YWRSAWaWbdm1LNzhbhXlMieq9RtZbMsYmIfWeWJ70CWpZq1BjzXE5+9AJCB4zfy274SMOihCNJxBXAKFG38paZGmNWN6oC75phe5DTAmzxYfEQSbmAEJR/K548Mg2ydw0ECOiG5dRSkfPXuaRMMAv2PCcwnh7uB4DRiVQrlVyTqUlMoLDT07roVCQcVNsVTZSG74FyJnOS/qR6z6hFuae9D9JiXCQQoZ45TI672xVdGx4oA/f5baOO9JQJJRNEj45QhmVJgMJSB4Nj3JEJG5T+7ESMDR1Yr+6gUnUru/SULqKTf8hfBFsWeo4DXy3Qu6shHFBZ1e0euTN02pmmO8GF/PJt43mVCTQel6NpzfdytpIcxQ8Ui8reW7LDPRdSEE/fwc+zOVfWmR3GQUyljcCr7cN5Id57Pjjwuf80+VsE51KN1vavlhIuQ7GXT0mbQU6X+rRwKP8f8LRPltBcMVdO1uR1UcFSytN57OuM2QeHmOKo7EhsTXYRtila5nw0sDQXrhuxQxIQ21WC1i0NvmK6I4zHXtxvBICWypH4wiDKWDEfyG268ZJpRix5nwSg/oXMFAC08yL0RLS01nN9K3O3mG40CV8hycbDRulU2R+UsHbowNmSiuCzWvRpQWx+NkU28c3tfqdcBHh1vEJLqQN73sCb2t/fktNX6WmcPyulpY9LXYUsFq7fcLXaq2loZd1Voh+eJ+JqW8BonvyOSFF9cQQHdyMXxpJjR2fIpohUST/O4EEiBoPG94ziku8Pn7kcN+H6ocmqQKuPAZvSW2MQIS3ILVQSV0ZTmlQIqx0UgE8Xk8wn8EgFNP4laK3gFkj3ciwLZchXdW8xR4lR56oZpbpiphBCWPBgRKgWWCmS3Zr0k+cbD5l78vfu0dBJ1l3fsdY9whfJ59O4QOAbvk2gHg8Cn+mcir/vN0gafXOpLeQhslRfR0BVLbb1VQG9ezZlKsdK6JnIV6D4Z0xuKYqNwfmSInrIb08pNa8/Lcody3C9XcNBTXyrqQVFDk4FrWK4SXw1joQ6UtymzhQd+4LGS1pmYcmUos/nj97yf2kTWLhwRTH5b8o7CimQ3iYy2O4aMbSvYDrH6benEuy95s3CFBT0m4wMZXhzuVjv78lO7Ql1FkFr5CuRDCP6aYK5sQLVIuG+NBmgOY5XmcjWOwMSEGIUpQh1zFBKbU3X26fIMBVzaPRTJAZz2YWRrCa3g0UhdxyKX59rIkybzkS6Z33+tXa9g5VMH1yRS+C9rurHFLyqkQAPQlpMi6v7inFAWrPBmgUhJTPPYw1OvJZilMSuw4w2FlFFIOuWDpVbxIsvIb9tOsPcz3EYGBM4GSh88KybF62Zq1W0bW69xjLHjEq2BVj/lPP/XVKkjJL71pPh+Gmqrq/aae8BNDkuybOtB3x8nIRhKV2wdKMPQoLvfkwTO1jOlaFSVU0hGvn0IItl9x7mop7bDh0GtFmnu/DBzU+uP2qwEiALZ//3RQYo77WSfDHpZ0x3ubo08b+UqMiBJ3aDIEv55utzsRkDVTdR/uBj3TrmnJkR7e78yEx5C/SDE7sQ2IvPpbBoBaCrK1eFWMJnSK0g4U9it85nY+9LgzNq2tH3+2a+pGApj+Sh1Iav5xFDaJhAfn6wgP0Ju3yXDiYAKHUli/yap773003uq+VsSkyxsY72+eQwxFRMliLznOspSsoJEA/6yEFJH8CFHR4k45hp41U7wvAuTYzFM4PO98bS+Pyo8LcDdcmBq0aTfqrw30Gbn48VnqHGTFszMDGshHe+dvSftyOUEvq3FvzKUd36cZJ4uzZKD+TfHx+U/5P7sJTnWJObHszpeTF3NvzcPvYFm8kxLEz0Vjs8epEGl+fxzzjXIhdxeW8ieEU9QtURoeukZdVAeF2E7xgPZqCp/8EiwkVfFwj8WfaVWPD86zluLAge8ha2ZgaY7WOTFzqG1j/vRl+xbswcBzReEG080LY+Tv1lMTt1eqDxAKJDfPP7xa2iQcqUYOC5ct7kWv1lI10pzDO0xP51oweJkm08PydGGXWjiqEtzCBOqNK4iETL0qJQy0hmC8pXMra1xF2t3ZzLHKijZXzWG3u4Vw3ypB7yZV31GI3fvaM9OqV82owFttkUwkCHYCkm5huh+/cJD3XjMX/fL5I3IgCCSRx7WUea87oYmZBroPNYXluHpwtS3el0F8vy+djHyO+3rfBTiJ7fn+oo7CEOPk6nAi+++C+UVYwb8I6wDuHTmQpH+sfAK80a7ZvHeaPLp4wY1m8z22fsvFw6h2h8p6lFvJe1dWKs9KA5Fqtmmp5tdvIuAl3XYe+6+4+iEAjyKUmtJdTGobdu1nEL8yCBpm1E9gz/RJeOcedAEUv2uW99E1AkbKimtn5u6PQEqT/ltaD2t6XVNg03F34H1LzDsHQnl0h3sja87Qd3dpY3nZ8u5E96VsD8eZbJv4hTD6nrj+Kh1rsV4C/LC+DI9yPRY0hA+8FRRAAMM3/uGzX03FaRwboG6qDZsyuVBY075XSbCwlxL34IBQrYV6D0BfHhQVYqbhfupmQtPYJBKWfXNY+IsW5d+c+POs3QRM5qnjEIsIAjg9H/mUhmmOnjQhwbN+PesmCOY49VfOuswv6pH/gJinR8OpZH/jbiblqxb5rxnwPCyO21JW7wd8ZwAdzR4bij6dCZB6/JgCzH8PcR2mmuLR/jDtk33RidHU/2gfpVfO98932kxbdykKYwggawRBu5zc87AlwpmM2TK5RgGnjSUXCsQVtC2dbMw47S5rC8eKeb781RlcXR2P/re52xxdYbpkGrPp032s9Q4f2+60JD9r4mqYkrcKrzIxcBCz6pbhrobLNjRE778Xz/SwB8iznFnid3SYmKcpCbpxwAEO1liGoDcfm4ebgpLfouW0OevHv06Zn8HZghm4Iwqhn0NX9N9aUsowQ+wKlLFd/JEyZTKEKQTHe6b4/DfM3SDFwRAKzNzw+2JKG1oKl9ijpkzc+8/4U3zlulXVa/F32MSZ3HvBFowlWjXlS0BmoKtRAdb4Ipg8ec7Xrd3vzUEIfoqWvsPUQpc1Ksnb9DGgeHOnbfq6XVOpffpdHcuULjnVimEc04FtIV3GS/IEpXljxNBMZIb0KQocH5pKzM2RL/8AIZleP251M6tgxDPJzO1u4Z8JLzriq0CFDV3Oupq/18OB3vJzCXe94FE0IfweISNfRWnTrE460eytSMAlwmrTKb0FP4nCxKUKi7n6yJp24HlmF7SkN5qL3d9yM1adjlqlobk7BnXwN2OZwk9tOO2bPUQbPgru/vBu23RgUtpeu0D1Xm5PYsNCGc4APqwaCe3imite0s0B7HRp3l/bCB19G0hH4j7h+HzOyhvSoci6Q5vB6uePp5CKmXJcmVybrO/F67YUNgZo9iZqACDmSE25XRL/exwZ6svBYN73yHc7H8nVUsulJS3hpWBp9JIjGfvvAtvU/uvE5J5h/yetTMD3Fq75oOlGIx4s7Pe0N8GXXXvvxLzWoBuJdPWMa3OSPNOv9Ub+Og4HATD9sYotwo1HF0aLT9APOIwK8OWg1PjXOnhFucBCbvaleQDj0EQxT9lLTPd8CmcMiNXGLdS0y/echYALdNPP8rgqdYqXifuGURU952wIIwgrAz4+0P9tena7kOFRRdx56eeb6ifITSX3/QCgaXDxm6NtOojzyxhNbCvgXWDHTHgKvd2925ISi7YsfWHa2kejmaB5peyv95K4hXVWAYIH8KC9l5/+RSggIBWZz13sHIXeng+O2JpRzyNJztwb1uM62mz3LmUHiRp9UN6ZrxQM9OGnZBQcmkYOpww+6yqqZvhK40wmBwETzPFeF2h+4UQHv6N10RUlDsMkFuVQwDifygl8stQyN913IHP94xo61EQddCz9zJETOFAEn3G0v25L1ylq+jCXtW9l8e7Se5/SE3Sq1tiyRq8sz8H+8DB5BZ/PEMHCnzXbKCEv1RsWSRUU7Bna685OmuXPKaSeY5GEzHv12SedJEt/ewzxx0WA6Nxl+ET2Ipfq4GYj8gD7OpTz2Vmn8hrBrYwmrvFbM0jhNuegOIqwK7+U8m5ANS23O9PkIqHRP/rpTLQO/2+SdfYuPaRO0dMz1BgS+SMQg572EkvN3JzOdmvF35hxUCj0A4r/6sSsL7aQf9M8I6pT/bdxoicnYWOrswgOlJvTPI0MqpRbjeeisDPv3nG8XEnfXr+Vv7twncTNzRv+KFHpzytVhVJQ7gh17RN7jBd1glBxP8ZnMeG01fCauqlN01Krm7FToclTe+HHoVTZYYmrR07vOnH1Sfj9ITNutFeDHgOAWmFcbE/N/6Sr1OcqLnaBWgL4gF4gWt8hG4tY+QqbUtouNK7a6CbyuCcyDyOIMbld1kfWrHDj3EIX8IxxYT+apiQ4QYABtefSgG4g+eIEngiuGUpEokMFmn8AWLsZco8TGxbIi9cAO1lDmRJGHh7Kn2gpt91aRhnz0hA+oOvK+F7VUr8Av58n3rgabQrU7KLz0V2r1h+p2n0tZjgZPCNnESIRm46Klgm2KeaY8OpH+svlCGEBciJDoh4+YMBNBqQp46u+9sDaWshT/svG1gYrOSesF3ezWbm08hv7KBg3kLdRsj6FmA3W2dR38hRUI+vje2WecGtwop19CmqpGptACYPPLcpNa1KUxKFTv2OsVqXTLUdxeJ5OzYVYEQXFfjVtai9F0ULV2wp1eJIEGiQuK+OcrWU5hMKMWS5V70BmJ3ZEYYboilWKqdyMGgxAHRPJJQxztRzBeYrZ3dnKGnZkNQjqNA9kIPC3VUH933rvsQubI3TCQ2dgZgfDr9KQv1fi3ZnayuiY2XSYvTnrst5aI1L4GkKKN6Gdua5yTUM0NWNxg0hyuB64KAWMY3nBWsHl59XNXG2Fg2qYznVmC42mlxe76S53CkjYNVZRIpytaXMLROhmIebAU9QmX4qFmepgeVCC8EZYddyhlaBVEic1U2G3lQNxovjG832P4C2fTMB5X/iJuK2D67Tn8K9yMOJ/M8yorGtZKjlcdazE8PHBIBVBCKNfegUISyhM0fmncWVRLKCF5tx0nK3cs3fd0AB8PkqqwfBnCfFA6Z5QOSTj/W34YnsdMoe5G7cHX4abajzT0+fE62k002t+lZ0ED1/2giUTXdVIdUHBMQMlkMMlBHxFZ6uG8jP6HNhS95hKPaudSgbcjtGM0xXhrOa5Muwlp2VjMnCS+uzch8RHEmOnde0kY+hJPnGDXbBXxVtp7QiOkfQcERMCNSDde40uNrjvasixyKa4Gj9fHEVTKX9F9h7HLZY+RMEJ9597AkKk1wcYrcrV04/wnSl7VpQ9RYd4m9N3t60iyGf4xncTMra2WJ/ofu/GW/hwyVkNx+C5OeCQAYwQBgfu2OlCcVMAPwEj43Qr+TzHciO12tquC/VqbGBWyaP29NRne2btvzjcivVtebljqQiJR/oYeLKS2uTCTADliTxEk6Wm4ndzq7MYWI97UG4Y/gQR2NgtctJxvJI6V58DxfMfAO/WCtpMToJJdVsFpI0bGsaYCkzmgE5geYrE2zaqVBcf3DS94tyQVOuASjUxOWQndm6zhzMjgaA0tauE4R4zbTzWhb0nE3q51egLuYxW78TeI6tzmWjEpR19lBdQEszSmv4rWxVu/YZKfQL65jtF2LTKa+UTNfqVTx3iJXzEdy0C3mVPt8hIHnMBnIJlwT+7VUQ0KgVCcbPHU7BGKo4Jxh+ZgOUlMs4aCewyMP7nTFdcFnlFxFm0IbejK5GStewzLzQ5MFJSN9FIlqOxwnBBd9fYM7ww1//jXG5pM3d/OLKcXo+Vbc8OpzAy7LTiE482ATQF1F3FDM8uWOMSD6g37WXylxXFf0QsMk1AvNUeFh9Z2vraeYcyHHNWrhyTHjlRBPjHj8IkaiNefX6myHqyGS2Zhp1S4byM3QEU70yWMP55kFSRqrHRfhANffMnoCFsJsUGgOM8iuAmOFU+iGV5QyYZ0iRmIi+zTq4IJRNfyXDSV/1zfUo8RpKG6Wd1dyK7AnVHYJ51RZtn4znI/sIS+P88bmHR6RIA3p8BKatLSEuOVUrelsyE5vE9UsLqVZZ08Sj7cMrwH0SuLnMh1q+NmcpYdZthtpNeLbbof1q4Omaa/SLBdXtdwqepDFnsFxFEXuigoYNVihh1wgmbptrqadWU+UToQATAI254HbkbxwPniUdPmCHS84yvdgFwM1oud3sxwlGz0mOzOGWCq3supAYKoU+8a20RGl8F7QaRBVE2sH8G8XO7cKx7vezOy75958HsDVTPwiWFUeh1cjsoQFwETB7GJ2lf7NzKCEzqsJRrCewgK3awHn7YKsV/xnJx+tKNk1XlRUC+g0U3TPTDs/fznwk+HowYa3VKcpeWUO5TBnw4L8+hbibJcr7ACjv4co0EfhVRocdtE9j6v1hnz6+e9SWdOTegUtr++3sIIJLZRx02ejUXMQEM4U1Tc50a9qaqOxGW07Ck2jIAAFc/oIBAC2P5RyW/I1MdLNwBndEMYN2WgbTL44jwic9bq9xie0exhpMc/Wtnndn2Dx0qIAQPH+apAY5iy1U33xOVMqpikS0C3JKrRxhZ7jo8grniw+04eXTEcfWdGHYIt2eE6ce3M6Hic2HpBbqercubFh27IKrLN00+dbI6RtqR3xrViGhFZ/7Un5rLdxC7gMcIruIuLj5X2N0Gso/L1U7RKr8TiTWmF85uD2OT6aQs0el6HffcqKW4IAGCDqe0fIEc3lF8c+IYN8ZIJEphrXyYzjJ56VIwzk306h/bo7ksh9cqheFk63DxOrFSknm6RNMT+lZjssG/GPfleOB/PKv1ER+J1JxEo8fy/isw6xbhHvwdm3ervnUL3tt9Bq6RMjzIQbAi2tXQlLg2PyEc88hjUAEs/Zv7WAqsugLaHRw230cy/VxJuzaP4lLyb+NAAFiazdkaFbt0VyZFFlNZdxknuQP9O2gXX4+Wm/lRVMOWUoBJO35VQcTHvEVipzCuReSLaZRjauNkLCElz4HPFMx1KD3Z14RjHblmCmrIvag1CVMy19XJqGcL69NS6AfFcpahVgXCxOs7R0Kj6vb7Mi+JsD8meqwjDK60M0mQbBtOANTyC1BasmSTH9QJoTQtXAM4bQOIhOVbBJ9OhyiMVt+rVuZmmOJ0iFGhPIuU0eXepuCj0NxHa/DR68olDbQPJLcTvYko6o8QAalBpVPjB/6367i5prVpVdrOLaq6CxOAgdHKOvP9LdCny6ILZR/vnmD+jcZYuNNtYBSdUxj5SYG0ybCM3NhyDgBbh2t0DVQXRrgNBZecMx5kRhmfJgLJJbBDRtjeeXgWlOCaGvpNd7SwDztAZ/HQHsQsmRPtpu8X0ZafhbYI+/6+//7g0ZCryNuY1XgbVdZmkrfrDJuT9YBaefeLXIKk8oQB1CCPulQQpsg+zOrStCuXni2FIhkRN2wL0x5LdGzajpea3hNfiCR/NiAAE8TNjMIFqRUBeJgGzKVOhYZOwUx8C/blnOWvsvLK6dV1jBnYhJzzroagU3P6Qr3lauv+vnDnaMf4MOwBhb7fa1wlZtDoWWy5pfPXNWt1siE/3ETAOTgJ2d6un5t53dfO+fVsyIjIAFULc8QAVxtgByoAAA==";

function SchoolDiagram() {
  return (
    <div className="schoolDiagram schoolDiagramImageOnly" aria-label="校内1階から6階までの案内図">
      <img
        className="schoolDiagramImage"
        src={SCHOOL_MAP_IMAGE}
        alt="校内1階から6階までの案内図"
        draggable={false}
      />
    </div>
  );
}

function PlanDiagram() {
  const deskWalls = [
    [1.2, 1.8, 1.2, 4.3],
    [1.2, 4.3, 2.0, 4.3],
    [2.6, 1.6, 5.0, 1.6],
    [5.2, 1.6, 5.2, 4.0],
    [3.3, 3.0, 3.3, 5.6],
    [4.5, 4.0, 4.5, 5.5],
    [4.2, 5.5, 6.0, 5.5],
    [6.5, 1.8, 6.5, 6.0],
    [7.6, 2.0, 7.6, 6.1],
  ] as const;

  const sx = (x: number) => 90 + x * 90;
  const sy = (y: number) => 70 + y * 90;

  return (
    <div className="festivalPlan">
      <svg viewBox="0 0 930 850" role="img" aria-label="もののけの鍵 教室内平面マップ">
        <defs>
          <pattern id="deskHatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="12" height="12" fill="#171717" />
            <line x1="0" y1="0" x2="0" y2="12" stroke="#737373" strokeWidth="3" />
          </pattern>
          <marker id="flowArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#f0f0f0" />
          </marker>
        </defs>

        <rect x="90" y="70" width="720" height="630" rx="8" fill="#080808" stroke="#ffffff" strokeWidth="4" />
        <text x="450" y="43" textAnchor="middle" fill="#d8d8d8" fontSize="28">ロッカー側</text>
        <text x="850" y="385" textAnchor="middle" fill="#d8d8d8" fontSize="28" transform="rotate(90 850 385)">黒板側</text>

        {deskWalls.map(([x1, y1, x2, y2], index) => (
          <line
            key={index}
            x1={sx(x1)}
            y1={sy(y1)}
            x2={sx(x2)}
            y2={sy(y2)}
            stroke="url(#deskHatch)"
            strokeWidth="34"
            strokeLinecap="square"
          />
        ))}

        <g aria-label="スタッフ専用出入口" fill="#e33a3a">
          <rect x={sx(2.6) - 28} y="62" width="56" height="28" rx="5" />
          <rect x={sx(5.2) - 28} y="62" width="56" height="28" rx="5" />
        </g>
        <text x={sx(2.6)} y="55" textAnchor="middle" fill="#ff8b8b" fontSize="17">スタッフのみ</text>
        <text x={sx(5.2)} y="55" textAnchor="middle" fill="#ff8b8b" fontSize="17">スタッフのみ</text>

        <g aria-label="ギミック" fill="#2458ff" stroke="#9db3ff" strokeWidth="4">
          <circle cx={sx(1.3)} cy={sy(2.3)} r="18" />
          <circle cx={sx(5.0)} cy={sy(2.2)} r="18" />
          <circle cx={sx(5.9)} cy={sy(5.5)} r="18" />
        </g>
        <text x={sx(1.3)+26} y={sy(2.3)+6} fill="#9db3ff" fontSize="18">ギミック</text>
        <text x={sx(5.0)+26} y={sy(2.2)+6} fill="#9db3ff" fontSize="18">ギミック</text>
        <text x={sx(5.9)+26} y={sy(5.5)+6} fill="#9db3ff" fontSize="18">ギミック</text>

        <g aria-label="スタンプ台">
          <rect x={sx(0.8)-28} y={sy(6.3)-20} width="56" height="40" rx="5" fill="#202020" stroke="#8e8e8e" strokeWidth="3" transform={`rotate(-20 ${sx(0.8)} ${sy(6.3)})`} />
          <circle cx={sx(0.8)} cy={sy(6.3)} r="10" fill="#28c85e" />
          <text x={sx(0.8)+36} y={sy(6.3)+6} fill="#67ec91" fontSize="18">スタンプ台</text>
        </g>

        <g aria-label="入口と出口">
          <path d={`M ${sx(7.1)} 700 v -28`} stroke="#ffffff" strokeWidth="5" markerEnd="url(#flowArrow)" />
          <text x={sx(7.1)} y="737" textAnchor="middle" fill="#ffffff" fontSize="25">入口</text>
          <path d={`M ${sx(1.0)} 672 v 28`} stroke="#ffffff" strokeWidth="5" markerEnd="url(#flowArrow)" />
          <text x={sx(1.0)} y="737" textAnchor="middle" fill="#ffffff" fontSize="25">出口</text>
        </g>

        <g aria-label="受付">
          <rect x="470" y="735" width="135" height="54" rx="8" fill="#171717" stroke="#ffffff" strokeWidth="3" />
          <text x="537" y="769" textAnchor="middle" fill="#ffffff" fontSize="25">受付</text>
        </g>

        <g aria-label="待機イス" fill="none" stroke="#cfcfcf" strokeWidth="4">
          {[300, 355, 410, 465, 650].map((x) => <circle key={x} cx={x} cy="760" r="19" />)}
        </g>
        <text x="380" y="814" textAnchor="middle" fill="#bdbdbd" fontSize="19">待機イス</text>

        <path
          d={`M ${sx(7.1)} 675 C ${sx(6.9)} 610, ${sx(6.2)} 590, ${sx(5.9)} ${sy(5.5)}
              C ${sx(5.1)} ${sy(4.8)}, ${sx(5.8)} ${sy(3.3)}, ${sx(5.0)} ${sy(2.2)}
              C ${sx(4.2)} ${sy(1.1)}, ${sx(2.1)} ${sy(1.0)}, ${sx(1.3)} ${sy(2.3)}
              C ${sx(0.8)} ${sy(3.5)}, ${sx(0.7)} ${sy(5.4)}, ${sx(0.8)} ${sy(6.3)}
              C ${sx(0.9)} 665, ${sx(1.0)} 676, ${sx(1.0)} 696`}
          fill="none"
          stroke="#f0f0f0"
          strokeOpacity="0.34"
          strokeWidth="5"
          strokeDasharray="10 12"
          markerEnd="url(#flowArrow)"
        />

        <g transform="translate(690 760)">
          <circle cx="0" cy="0" r="7" fill="#e33a3a" /><text x="14" y="6" fill="#d6d6d6" fontSize="17">スタッフ出入口</text>
          <circle cx="0" cy="28" r="7" fill="#2458ff" /><text x="14" y="34" fill="#d6d6d6" fontSize="17">ギミック</text>
          <circle cx="0" cy="56" r="7" fill="#28c85e" /><text x="14" y="62" fill="#d6d6d6" fontSize="17">スタンプ台</text>
        </g>
      </svg>
    </div>
  );
}
