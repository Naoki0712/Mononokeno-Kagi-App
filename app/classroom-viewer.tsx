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


type SchoolRoomKind = "lab" | "general" | "hr" | "service" | "current";
type SchoolRoomShape = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  kind?: SchoolRoomKind;
  small?: boolean;
};
type SchoolFloorShape = {
  floor: string;
  corridor: string;
  rooms: SchoolRoomShape[];
  stairs?: Array<{ x: number; y: number }>;
  toilets?: Array<{ x: number; y: number }>;
  elevators?: Array<{ x: number; y: number }>;
  outlines?: string[];
};

const SCHOOL_FLOORS: SchoolFloorShape[] = [
  {
    floor: "1F",
    corridor: "M188 22 H222 V92 H372 V128 H342 V238 H236 V270 H190 Z M222 92 H248 V52 H372 V92",
    rooms: [
      {x:18,y:20,w:46,h:44,label:"手仕上げ",kind:"lab"},
      {x:18,y:64,w:46,h:48,label:"フライス",kind:"lab"},
      {x:18,y:112,w:46,h:48,label:"研削",kind:"lab"},
      {x:18,y:160,w:46,h:34,label:"管理室",kind:"general"},
      {x:18,y:196,w:58,h:34,label:"材料試験室",kind:"lab"},
      {x:76,y:196,w:58,h:34,label:"工業計測室",kind:"lab",small:true},
      {x:134,y:196,w:54,h:34,label:"工具室",kind:"lab",small:true},
      {x:28,y:232,w:94,h:40,label:"NC工作機械室",kind:"lab",small:true},
      {x:28,y:272,w:94,h:30,label:"ロボット制御室",kind:"lab",small:true},
      {x:124,y:232,w:64,h:28,label:"プログラミング室",kind:"lab",small:true},
      {x:188,y:34,w:48,h:64,label:"溶接",kind:"lab"},
      {x:66,y:62,w:122,h:98,label:"機械工場",kind:"lab"},
      {x:134,y:98,w:54,h:62,label:"旋盤",kind:"lab"},
      {x:190,y:128,w:48,h:78,label:"流体原動機室",kind:"lab",small:true},
      {x:190,y:206,w:48,h:27,label:"104\nゼミ室",kind:"general",small:true},
      {x:190,y:233,w:48,h:27,label:"103\nゼミ室",kind:"general",small:true},
      {x:190,y:260,w:48,h:27,label:"102\nゼミ室",kind:"general",small:true},
      {x:190,y:287,w:48,h:27,label:"101\nゼミ室",kind:"general",small:true},
      {x:248,y:24,w:130,h:64,label:"サイエンススクエア",kind:"general"},
      {x:378,y:24,w:42,h:32,label:"教育相談室",kind:"general",small:true},
      {x:378,y:56,w:42,h:32,label:"保健室",kind:"general"},
      {x:246,y:94,w:128,h:42,label:"展示資料室",kind:"general"},
      {x:420,y:20,w:54,h:56,label:"小会議室",kind:"hr"},
      {x:420,y:76,w:54,h:62,label:"校長室",kind:"hr"},
      {x:420,y:138,w:54,h:62,label:"経営企画室\n（受付）",kind:"hr",small:true},
      {x:420,y:200,w:54,h:62,label:"主事室",kind:"hr"},
      {x:398,y:264,w:76,h:52,label:"駐輪場",kind:"service"},
    ],
    stairs:[{x:205,y:18},{x:355,y:220}],
    toilets:[{x:392,y:54},{x:208,y:108}],
    elevators:[{x:362,y:112}],
    outlines:["M8 12 H188 V315 H112 V332 H28 V315 H8 Z","M396 12 H484 V330 H404 V314 H396 Z"],
  },
  {
    floor: "2F",
    corridor: "M178 20 H220 V86 H388 V126 H356 V238 H238 V282 H178 Z M220 86 H256 V48 H388 V86",
    rooms: [
      {x:18,y:18,w:110,h:54,label:"応用計測室",kind:"lab"},
      {x:18,y:72,w:110,h:34,label:"機器準備室",kind:"lab"},
      {x:18,y:106,w:110,h:50,label:"制御機器室",kind:"lab"},
      {x:18,y:156,w:110,h:46,label:"第2製図室",kind:"lab"},
      {x:18,y:202,w:110,h:30,label:"製図準備室",kind:"lab"},
      {x:18,y:232,w:110,h:52,label:"第1製図室",kind:"lab"},
      {x:18,y:284,w:110,h:42,label:"第2CAD室",kind:"lab"},
      {x:18,y:326,w:110,h:42,label:"第1CAD室",kind:"lab"},
      {x:178,y:102,w:48,h:58,label:"第2電気工作室",kind:"lab",small:true},
      {x:178,y:160,w:48,h:36,label:"工作準備室",kind:"lab",small:true},
      {x:178,y:196,w:48,h:58,label:"第1電気工作室",kind:"lab",small:true},
      {x:178,y:254,w:48,h:28,label:"204\nゼミ室",kind:"general",small:true},
      {x:178,y:282,w:48,h:28,label:"203\nゼミ室",kind:"general",small:true},
      {x:178,y:310,w:48,h:28,label:"202\nゼミ室",kind:"general",small:true},
      {x:178,y:338,w:48,h:28,label:"201\nゼミ室",kind:"general",small:true},
      {x:256,y:22,w:102,h:72,label:"視聴覚室",kind:"general"},
      {x:358,y:22,w:40,h:36,label:"司書室",kind:"general",small:true},
      {x:358,y:58,w:40,h:36,label:"書庫",kind:"general",small:true},
      {x:398,y:22,w:74,h:72,label:"図書室",kind:"general"},
      {x:414,y:102,w:58,h:32,label:"放送室",kind:"hr",small:true},
      {x:442,y:102,w:30,h:32,label:"スタジオ",kind:"hr",small:true},
      {x:414,y:134,w:58,h:32,label:"印刷室",kind:"hr"},
      {x:414,y:166,w:58,h:92,label:"職員室",kind:"hr"},
      {x:414,y:258,w:58,h:70,label:"大会議室",kind:"hr"},
    ],
    stairs:[{x:197,y:66},{x:364,y:230}],
    toilets:[{x:230,y:104},{x:400,y:60}],
    elevators:[{x:366,y:130}],
    outlines:["M6 10 H132 V374 H8 Z","M406 12 H482 V342 H410 Z"],
  },
  {
    floor: "3F",
    corridor: "M176 20 H220 V88 H392 V126 H358 V242 H236 V286 H176 Z M220 88 H258 V48 H392 V88",
    rooms: [
      {x:18,y:20,w:110,h:54,label:"機器分析室",kind:"lab"},
      {x:18,y:74,w:110,h:34,label:"分析準備室",kind:"lab"},
      {x:18,y:108,w:110,h:50,label:"環境分析室",kind:"lab"},
      {x:18,y:158,w:110,h:50,label:"材料化学室",kind:"lab"},
      {x:18,y:208,w:110,h:32,label:"物化準備室",kind:"lab"},
      {x:18,y:240,w:110,h:50,label:"物理化学室",kind:"lab"},
      {x:18,y:290,w:110,h:42,label:"化学分析室",kind:"lab"},
      {x:18,y:332,w:110,h:32,label:"製造準備室",kind:"lab"},
      {x:18,y:364,w:110,h:44,label:"化学製造室",kind:"lab"},
      {x:176,y:108,w:48,h:54,label:"305講義室",kind:"general",small:true},
      {x:176,y:162,w:48,h:74,label:"バイオ化学室",kind:"general",small:true},
      {x:176,y:236,w:48,h:28,label:"304\nゼミ室",kind:"general",small:true},
      {x:176,y:264,w:48,h:28,label:"303\nゼミ室",kind:"general",small:true},
      {x:176,y:292,w:48,h:28,label:"302\nゼミ室",kind:"general",small:true},
      {x:176,y:320,w:48,h:28,label:"301\nゼミ室",kind:"general",small:true},
      {x:258,y:22,w:80,h:68,label:"調理室",kind:"general"},
      {x:338,y:22,w:78,h:68,label:"被服室",kind:"general"},
      {x:300,y:90,w:78,h:36,label:"家庭科準備室",kind:"general",small:true},
      {x:258,y:138,w:78,h:38,label:"和室",kind:"general"},
      {x:336,y:138,w:42,h:38,label:"自販機\nコーナー",kind:"general",small:true},
      {x:378,y:138,w:38,h:38,label:"生徒会室",kind:"general",small:true},
      {x:418,y:26,w:58,h:58,label:"HR3-6",kind:"hr"},
      {x:418,y:84,w:58,h:58,label:"HR3-5",kind:"hr"},
      {x:418,y:142,w:58,h:58,label:"HR3-4",kind:"hr"},
      {x:418,y:200,w:58,h:58,label:"HR3-3",kind:"hr"},
      {x:418,y:258,w:58,h:58,label:"HR3-2",kind:"hr"},
      {x:418,y:316,w:58,h:58,label:"HR3-1",kind:"hr"},
    ],
    stairs:[{x:197,y:67},{x:368,y:242}],
    toilets:[{x:230,y:104},{x:398,y:64}],
    elevators:[{x:382,y:154}],
    outlines:["M6 12 H132 V416 H8 Z","M410 12 H484 V386 H412 Z"],
  },
  {
    floor: "4F",
    corridor: "M162 22 H210 V88 H398 V126 H366 V250 H226 V292 H162 Z M210 88 H252 V48 H398 V88",
    rooms: [
      {x:18,y:26,w:92,h:28,label:"暗室",kind:"lab",small:true},
      {x:18,y:54,w:92,h:48,label:"レイアウト室",kind:"lab"},
      {x:18,y:102,w:92,h:54,label:"第2情報デザイン室",kind:"lab",small:true},
      {x:18,y:156,w:92,h:40,label:"デザイン準備室",kind:"lab",small:true},
      {x:18,y:196,w:92,h:54,label:"第1情報デザイン室",kind:"lab",small:true},
      {x:18,y:250,w:92,h:38,label:"情報準備室",kind:"lab",small:true},
      {x:18,y:288,w:92,h:92,label:"情報技術室",kind:"lab"},
      {x:162,y:112,w:48,h:88,label:"405\n講義室",kind:"general",small:true},
      {x:162,y:200,w:48,h:30,label:"404\nゼミ室",kind:"general",small:true},
      {x:162,y:230,w:48,h:30,label:"403\nゼミ室",kind:"general",small:true},
      {x:162,y:260,w:48,h:30,label:"402\nゼミ室",kind:"general",small:true},
      {x:162,y:290,w:48,h:30,label:"401\nゼミ室",kind:"general",small:true},
      {x:252,y:22,w:82,h:68,label:"コンピュータ室",kind:"general",small:true},
      {x:334,y:22,w:70,h:68,label:"LL教室",kind:"general"},
      {x:334,y:90,w:70,h:36,label:"LL管理室",kind:"general",small:true},
      {x:252,y:138,w:76,h:40,label:"教材室（1）",kind:"general"},
      {x:328,y:138,w:76,h:40,label:"教材室（2）",kind:"general"},
      {x:420,y:26,w:58,h:58,label:"HR2-6",kind:"hr"},
      {x:420,y:84,w:58,h:58,label:"HR2-5",kind:"hr"},
      {x:420,y:142,w:58,h:58,label:"HR2-4",kind:"hr"},
      {x:420,y:200,w:58,h:58,label:"HR2-3",kind:"hr"},
      {x:420,y:258,w:58,h:58,label:"HR2-2",kind:"current"},
      {x:420,y:316,w:58,h:58,label:"HR2-1",kind:"hr"},
    ],
    stairs:[{x:184,y:69},{x:370,y:246}],
    toilets:[{x:226,y:104},{x:400,y:62}],
    elevators:[{x:382,y:154}],
    outlines:["M6 14 H116 V388 H10 Z","M412 14 H486 V388 H414 Z"],
  },
  {
    floor: "5F",
    corridor: "M206 70 H390 V108 H354 V240 H238 V276 H206 Z M206 70 H242 V48 H390 V70",
    rooms: [
      {x:246,y:22,w:92,h:70,label:"物理実験室",kind:"general"},
      {x:338,y:54,w:42,h:38,label:"物理\n準備室",kind:"general",small:true},
      {x:380,y:54,w:42,h:38,label:"化学\n準備室",kind:"general",small:true},
      {x:422,y:22,w:78,h:70,label:"化学実験室",kind:"general"},
      {x:254,y:128,w:82,h:42,label:"HR1-6",kind:"general"},
      {x:336,y:128,w:82,h:42,label:"HR1-5",kind:"general"},
      {x:420,y:94,w:58,h:62,label:"生物実験室",kind:"hr"},
      {x:420,y:156,w:58,h:42,label:"生物準備室",kind:"hr",small:true},
      {x:420,y:198,w:58,h:54,label:"HR1-4",kind:"hr"},
      {x:420,y:252,w:58,h:54,label:"HR1-3",kind:"hr"},
      {x:420,y:306,w:58,h:54,label:"HR1-2",kind:"hr"},
      {x:420,y:360,w:58,h:54,label:"HR1-1",kind:"hr"},
    ],
    stairs:[{x:236,y:118},{x:370,y:278}],
    toilets:[{x:400,y:66}],
    elevators:[{x:390,y:142}],
    outlines:["M94 60 H206 V414 H96 Z","M412 14 H486 V424 H414 Z"],
  },
  {
    floor: "6F",
    corridor: "M246 90 H456 V130 H418 V176 H246 Z",
    rooms: [
      {x:250,y:18,w:88,h:72,label:"美術室",kind:"general"},
      {x:338,y:50,w:46,h:40,label:"美術\n準備室",kind:"general",small:true},
      {x:384,y:50,w:46,h:40,label:"音楽\n準備室",kind:"general",small:true},
      {x:430,y:18,w:82,h:72,label:"音楽室",kind:"general"},
      {x:288,y:130,w:94,h:46,label:"601\n講義室",kind:"general"},
      {x:382,y:130,w:94,h:46,label:"602\n講義室",kind:"general"},
    ],
    stairs:[{x:256,y:126}],
    elevators:[{x:472,y:142}],
    outlines:["M238 8 H518 V186 H490 V338 H450 V186 H238 Z"],
  },
];

function SchoolRoomRect({ room }: { room: SchoolRoomShape }) {
  const fill =
    room.kind === "current" ? "#e6002d" :
    room.kind === "hr" ? "#dff0e6" :
    room.kind === "general" ? "#f5e7e8" :
    room.kind === "service" ? "#eceadf" :
    "#eaf1f5";
  const lines = room.label.split("\n");
  return (
    <g>
      <rect x={room.x} y={room.y} width={room.w} height={room.h} fill={fill} stroke="#666" strokeWidth="1.2" />
      <text
        x={room.x + room.w / 2}
        y={room.y + room.h / 2 - (lines.length - 1) * 5}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={room.kind === "current" ? "#fff" : "#202020"}
        fontSize={room.small ? 7.2 : 8.8}
        fontFamily="'Noto Sans JP','Yu Gothic',sans-serif"
      >
        {lines.map((line, index) => (
          <tspan key={index} x={room.x + room.w / 2} dy={index === 0 ? 0 : 10}>{line}</tspan>
        ))}
      </text>
      {room.kind === "current" && (
        <text x={room.x + room.w / 2} y={room.y + room.h - 7} textAnchor="middle" fill="#fff" fontSize="6.5">
          もののけの鍵
        </text>
      )}
    </g>
  );
}

function SchoolFloorSvg({ floor }: { floor: SchoolFloorShape }) {
  return (
    <svg className="schoolFloorSvg" viewBox="0 0 520 430" role="img" aria-label={`${floor.floor}校内図`}>
      <path d={floor.corridor} fill="#d8d8d0" stroke="#6b6b6b" strokeWidth="1.3" />
      {floor.outlines?.map((d, i) => <path key={i} d={d} fill="none" stroke="#bdbdbd" strokeWidth="1.6" />)}
      {floor.rooms.map((room) => <SchoolRoomRect key={`${room.x}-${room.y}-${room.label}`} room={room} />)}
      {floor.stairs?.map((p, i) => (
        <g key={`s-${i}`} transform={`translate(${p.x} ${p.y})`} stroke="#3e3e3e" strokeWidth="1">
          {Array.from({ length: 7 }).map((_, n) => <line key={n} x1="0" y1={n * 3} x2="22" y2={n * 3} />)}
        </g>
      ))}
      {floor.toilets?.map((p, i) => (
        <g key={`t-${i}`} transform={`translate(${p.x} ${p.y})`}>
          <rect width="18" height="24" fill="#f3f0df" stroke="#696969" />
          <text x="9" y="10" textAnchor="middle" fontSize="7" fill="#e35b64">▲</text>
          <text x="9" y="20" textAnchor="middle" fontSize="7" fill="#496cc4">▼</text>
        </g>
      ))}
      {floor.elevators?.map((p, i) => (
        <g key={`e-${i}`} transform={`translate(${p.x} ${p.y})`}>
          <rect width="18" height="18" rx="2" fill="#eeeade" stroke="#696969" />
          <text x="9" y="13" textAnchor="middle" fontSize="11" fill="#555">↕</text>
        </g>
      ))}
    </svg>
  );
}

function SchoolDiagram() {
  return (
    <div className="schoolDiagram schoolDiagramAllFloors" aria-label="校内1階から6階までの案内図">
      <div className="schoolMapHeading">
        <strong>校内ご案内</strong>
        <span>SCHOOL INFORMATION</span>
      </div>
      <div className="schoolFloorGrid schoolFloorGridSvg">
        {SCHOOL_FLOORS.map((floor) => (
          <section className="schoolFloorPanel schoolFloorPanelSvg" key={floor.floor}>
            <h3>{floor.floor}</h3>
            <SchoolFloorSvg floor={floor} />
          </section>
        ))}
      </div>
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
