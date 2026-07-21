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
  const [viewMode, setViewMode] = useState<ViewMode>("space");
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
        "窓、固定設備、2段に重ねた机の仕切り、遮光カーテンを含む教室の3Dビューアー",
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

      // 設計図を90度回転して教室座標へ合わせた、大まかな3室構成。
      // 机のある部分は2段積み、机より上はカーテン、開口部は床までカーテン。
      addPartition(
        "z",
        0,
        [
          [-2.45, -1.9],
          [-1.25, -0.45],
          [0.05, 1.05],
          [1.6, 3.15],
        ],
        [
          [-1.9, -1.25],
          [-0.45, 0.05],
          [1.05, 1.6],
        ],
      );

      addPartition(
        "x",
        0.95,
        [
          [-3.55, -2.25],
          [-1.4, -0.2],
        ],
        [[-2.25, -1.4]],
      );

      addPartition(
        "x",
        -1.75,
        [
          [-3.55, -2.05],
          [-1.25, -0.2],
        ],
        [[-2.05, -1.25]],
      );

      addPartition(
        "x",
        -0.55,
        [
          [0.2, 1.2],
          [1.95, 2.65],
        ],
        [[1.2, 1.95]],
      );

      addPartition(
        "x",
        1.45,
        [
          [0.2, 1.3],
          [2, 2.65],
        ],
        [[1.3, 2]],
      );

      // 廊下側には入口から出口までの退避通路を残す。
      addPartition(
        "z",
        2.72,
        [
          [-1.65, -0.25],
          [0.4, 1.45],
        ],
        [[-0.25, 0.4]],
      );

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
          <span>8m × 7m × 3m / DESK WALLS &amp; CURTAINS</span>
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

function SchoolDiagram() {
  return (
    <div className="schoolDiagram">
      <strong className="schoolFloorLabel">4階</strong>
      <span className="schoolRoom schoolRoomA">教室</span>
      <span className="schoolRoom schoolRoomCurrent">2-2<br />もののけの鍵</span>
      <span className="schoolRoom schoolRoomB">教室</span>
      <span className="schoolRoom schoolRoomC">教室</span>
      <span className="schoolCorridor">廊下</span>
      <span className="schoolStairs schoolStairsLeft">階段</span>
      <span className="schoolStairs schoolStairsRight">階段</span>
    </div>
  );
}

function PlanDiagram() {
  return (
    <div className="fallbackPlan">
      <span className="fallbackBoard">前方黒板</span>
      <span className="fallbackStage">黒板前の段差</span>
      <span className="fallbackProjector">プロジェクター</span>
      <span className="fallbackWindows">5区画の窓</span>
      <span className="fallbackAircon fallbackAirconFront">空調</span>
      <span className="fallbackAircon fallbackAirconRear">空調</span>
      <span className="fallbackDoor fallbackEntrance">入口</span>
      <span className="fallbackDoor fallbackExit">出口</span>
      <span className="fallbackCorridorWindows">廊下側窓</span>
      <span className="fallbackHandrail">二段手すり</span>
      <span className="fallbackRearBoard">後方黒板</span>
      <span className="fallbackNotice fallbackNoticeLeft">掲示板</span>
      <span className="fallbackNotice fallbackNoticeRight">掲示板</span>
      <span className="fallbackLocker">ロッカー</span>
      <span className="fallbackWindowCurtain">遮光カーテン</span>
      <span className="fallbackDeskWall fallbackDeskWallMain" />
      <span className="fallbackDeskWall fallbackDeskWallRoom2" />
      <span className="fallbackDeskWall fallbackDeskWallRoom3" />
      <span className="fallbackDeskWall fallbackDeskWallRoom1A" />
      <span className="fallbackDeskWall fallbackDeskWallRoom1B" />
      <span className="fallbackDeskWall fallbackDeskWallPassage" />
      <span className="fallbackRoomLabel fallbackRoom1">No.1</span>
      <span className="fallbackRoomLabel fallbackRoom2">No.2</span>
      <span className="fallbackRoomLabel fallbackRoom3">No.3</span>
      <span className="fallbackRetirePassage">退避通路</span>
      <span className="fallbackSize">8m × 7m</span>
    </div>
  );
}
