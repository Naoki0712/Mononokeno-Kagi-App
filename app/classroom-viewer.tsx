"use client";

import { RotateCcw } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

type PlanVariant = "gimmick" | "staff";

type DiagramTransform = {
  scale: number;
  x: number;
  y: number;
};

const CLASSROOM_PLAN_IMAGES: Record<PlanVariant, string> = {
  gimmick: "/maps/MAP-Gimmick.png",
  staff: "/maps/MAP-Staff-combined.jpg",
};

export function ClassroomViewer({ minimal = false }: { minimal?: boolean }) {
  const [planVariant, setPlanVariant] = useState<PlanVariant>("gimmick");
  const [resetKey, setResetKey] = useState(0);

  const resetView = () => setResetKey((current) => current + 1);
  const toggleVariant = () =>
    setPlanVariant((current) => (current === "gimmick" ? "staff" : "gimmick"));

  return (
    <div className={`viewerShell viewerShellPlanOnly ${minimal ? "viewerShellMinimal" : ""}`}>
      <div className="viewerPlanMode viewerPlanModeOnly" role="img" aria-label="教室の平面図">
        <InteractiveDiagram
          key={`plan-${planVariant}-${resetKey}`}
          label={`${planVariant === "gimmick" ? "ギミック" : "スタッフ"}配置の教室平面図。ホイールまたはピンチで拡大縮小できます`}
          variant={planVariant}
        >
          <PlanDiagram variant={planVariant} />
        </InteractiveDiagram>

        <div className="viewerBottomControls" aria-label="マップ操作">
          <button
            type="button"
            className="viewerBottomButton viewerResetButton"
            onClick={resetView}
          >
            <RotateCcw aria-hidden="true" />
            <span>初期位置</span>
          </button>

          <button
            type="button"
            className="viewerBottomButton viewerVariantButton"
            onClick={toggleVariant}
          >
            <span>{planVariant === "gimmick" ? "スタッフ配置" : "ギミック配置"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function InteractiveDiagram({
  children,
  label,
  variant,
}: {
  children: ReactNode;
  label: string;
  variant: PlanVariant;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<DiagramTransform>({
    scale: 1,
    x: 0,
    y: 0,
  });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistanceRef = useRef<number | null>(null);

  const zoom = (factor: number) => {
    setTransform((current) => ({
      ...current,
      scale: Math.min(4, Math.max(0.7, current.scale * factor)),
    }));
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setTransform((current) => ({
        ...current,
        scale: Math.min(
          4,
          Math.max(0.7, current.scale * Math.exp(-event.deltaY * 0.0015)),
        ),
      }));
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (pointersRef.current.size === 2) {
      const [first, second] = Array.from(pointersRef.current.values());
      pinchDistanceRef.current = Math.hypot(
        second.x - first.x,
        second.y - first.y,
      );
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

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
      const distance = Math.hypot(
        second.x - first.x,
        second.y - first.y,
      );

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
        className={`interactiveDiagramCanvas classroomDiagramCanvas ${variant === "staff" ? "classroomDiagramCanvasStaff" : "classroomDiagramCanvasGimmick"}`}
        style={{
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function PlanDiagram({ variant }: { variant: PlanVariant }) {
  const alt =
    variant === "gimmick"
      ? "教室内マップ（ギミック配置）"
      : "教室内マップ（スタッフ配置）";

  return (
    <div className="classroomPlanImageFrame" aria-label={alt}>
      <img
        className="classroomPlanImage"
        src={CLASSROOM_PLAN_IMAGES[variant]}
        alt={alt}
        draggable={false}
      />
    </div>
  );
}
