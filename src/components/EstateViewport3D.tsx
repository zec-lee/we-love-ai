import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  buildEstateGeometry,
  ComparisonMode,
  MapLayerType,
  ProbeReading,
  ScenarioConfig,
  SimulationResult,
  SOLAR_TIME_CATALOG,
  WEATHER_CATALOG,
} from '../types/microclimate';
import {
  getLegendGradientCSS,
  LAYER_SCALE_SPECS,
  sampleLayerRGB,
} from '../utils/colorScales';
import {
  Compass,
  Eye,
  Flame,
  Layers,
  Move,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  Wind,
} from 'lucide-react';

interface EstateViewport3DProps {
  config: ScenarioConfig;
  baselineResult: SimulationResult | null;
  proposalResult: SimulationResult | null;
  isAssessmentPending: boolean;
  isSimulating: boolean;
  activeLayer: MapLayerType;
  comparisonMode: ComparisonMode;
  selectedProbeId: string;
  onSelectProbe: (probeId: string) => void;
  onChangeLayer: (layer: MapLayerType) => void;
  onChangeComparisonMode: (mode: ComparisonMode) => void;
  onRunAssessment: () => void;
  onUpdateCustomBlock: (
    blockId: string,
    offsetX: number,
    offsetZ: number,
    extraRotationDeg: number
  ) => void;
  onResetCustomBlock: () => void;
}

interface HoveredCellInspect {
  xMeters: number;
  zMeters: number;
  row: number;
  col: number;
  proposalVal: number;
  baselineVal: number;
  deltaVal: number;
  isVoidDeck: boolean;
}

export const EstateViewport3D: React.FC<EstateViewport3DProps> = ({
  config,
  baselineResult,
  proposalResult,
  isAssessmentPending,
  isSimulating,
  activeLayer,
  comparisonMode,
  selectedProbeId,
  onSelectProbe,
  onChangeLayer,
  onChangeComparisonMode,
  onRunAssessment,
  onUpdateCustomBlock,
  onResetCustomBlock,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [showWindVectors, setShowWindVectors] = useState<boolean>(true);
  const [heatmapElevation, setHeatmapElevation] = useState<'pedestrian' | 'ground'>('pedestrian');
  const [hoveredCell, setHoveredCell] = useState<HoveredCellInspect | null>(null);
  const [selectedBlockIdForEdit, setSelectedBlockIdForEdit] = useState<string>('BLK-B');
  const [customEditPanelOpen, setCustomEditPanelOpen] = useState<boolean>(false);

  // Refs for mutable scene objects and requestRender trigger
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    estateGroup: THREE.Group;
    heatmapMesh: THREE.Mesh;
    pendingWireframeMesh: THREE.LineSegments;
    windArrowsGroup: THREE.Group;
    sunLight: THREE.DirectionalLight;
    probeMarkersGroup: THREE.Group;
    requestRender: () => void;
  } | null>(null);

  const latestPropsRef = useRef({
    config,
    baselineResult,
    proposalResult,
    isAssessmentPending,
    activeLayer,
    comparisonMode,
    selectedProbeId,
    onSelectProbe,
  });

  useEffect(() => {
    latestPropsRef.current = {
      config,
      baselineResult,
      proposalResult,
      isAssessmentPending,
      activeLayer,
      comparisonMode,
      selectedProbeId,
      onSelectProbe,
    };
  }, [
    config,
    baselineResult,
    proposalResult,
    isAssessmentPending,
    activeLayer,
    comparisonMode,
    selectedProbeId,
    onSelectProbe,
  ]);

  // 1. Initialize WebGLRenderer & Scene once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 620;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17);
    scene.fog = new THREE.FogExp2(0x0b0f17, 0.0022);

    const camera = new THREE.PerspectiveCamera(42, width / height, 1.0, 600);
    camera.position.set(0, 92, 118);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Environment Reflection (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 28;
    controls.maxDistance = 240;
    controls.target.set(0, 4, 0);

    // Lighting Rig: Warm Sun Key Light + Cool Hemisphere Fill + Rim Light
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.72);
    hemiLight.position.set(0, 120, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    sunLight.position.set(-55, 85, -40);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    const d = 72;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 220;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    rimLight.position.set(60, 45, 70);
    scene.add(rimLight);

    // Base Surrounding Urban Context Plinth (extends beyond the 120m x 120m estate)
    const contextGroundGeo = new THREE.PlaneGeometry(360, 360);
    const contextGroundMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.92,
      metalness: 0.05,
    });
    const contextGround = new THREE.Mesh(contextGroundGeo, contextGroundMat);
    contextGround.rotation.x = -Math.PI / 2;
    contextGround.position.y = -0.15;
    contextGround.receiveShadow = true;
    scene.add(contextGround);

    // Estate Site Plinth (120m x 120m)
    const siteSlabGeo = new THREE.BoxGeometry(122, 0.25, 122);
    const siteSlabMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.08,
    });
    const siteSlab = new THREE.Mesh(siteSlabGeo, siteSlabMat);
    siteSlab.position.set(0, -0.125, 0);
    siteSlab.receiveShadow = true;
    scene.add(siteSlab);

    // Subtle Coordinate Grid Helper on Site Base
    const gridHelper = new THREE.GridHelper(120, 24, 0x334155, 0x1e293b);
    gridHelper.position.y = 0.02;
    scene.add(gridHelper);

    // Pedestrian-Level Comfort Heatmap Plane (120m x 120m)
    const heatmapGeo = new THREE.PlaneGeometry(120, 120);
    const initialData = new Uint8Array(48 * 48 * 4);
    const initialTex = new THREE.DataTexture(initialData, 48, 48, THREE.RGBAFormat);
    initialTex.colorSpace = THREE.SRGBColorSpace;
    initialTex.magFilter = THREE.LinearFilter;
    initialTex.minFilter = THREE.LinearFilter;
    initialTex.needsUpdate = true;

    const heatmapMat = new THREE.MeshBasicMaterial({
      map: initialTex,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const heatmapMesh = new THREE.Mesh(heatmapGeo, heatmapMat);
    heatmapMesh.rotation.x = -Math.PI / 2;
    heatmapMesh.position.y = 1.5;
    heatmapMesh.renderOrder = 2;
    scene.add(heatmapMesh);

    // Pending Assessment Wireframe Grid (shown when geometry is modified & uncalculated)
    const pendingGridGeo = new THREE.PlaneGeometry(120, 120, 24, 24);
    const pendingEdges = new THREE.EdgesGeometry(pendingGridGeo);
    const pendingMat = new THREE.LineBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.45,
    });
    const pendingWireframeMesh = new THREE.LineSegments(pendingEdges, pendingMat);
    pendingWireframeMesh.rotation.x = -Math.PI / 2;
    pendingWireframeMesh.position.y = 1.52;
    pendingWireframeMesh.visible = false;
    scene.add(pendingWireframeMesh);

    // Dynamic groups for buildings/trees/canopies, wind vectors, and probe markers
    const estateGroup = new THREE.Group();
    scene.add(estateGroup);

    const windArrowsGroup = new THREE.Group();
    scene.add(windArrowsGroup);

    const probeMarkersGroup = new THREE.Group();
    scene.add(probeMarkersGroup);

    // On-demand render pacing with software-WebGL guard
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (gl.flush) gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    controls.addEventListener('change', requestRender);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 900;
      const h = container.clientHeight || 620;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    // Raycasting for probe selection and cell hover inspection
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let lastHoverTime = 0;

    const onPointerMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastHoverTime < 45) return;
      lastHoverTime = now;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(heatmapMesh, false);
      if (hits.length > 0) {
        const pt = hits[0].point;
        const {
          proposalResult: propRes,
          baselineResult: baseRes,
          activeLayer: layer,
          isAssessmentPending: pending,
        } = latestPropsRef.current;

        if (!pending && propRes && baseRes) {
          const col = Math.min(
            47,
            Math.max(0, Math.floor(((pt.x + 60) / 120) * 48))
          );
          const row = Math.min(
            47,
            Math.max(0, Math.floor(((pt.z + 60) / 120) * 48))
          );
          const idx = row * 48 + col;
          if (propRes.buildingMask[idx] === 1) {
            setHoveredCell(null);
            return;
          }

          const getGrid = (r: SimulationResult) =>
            layer === 'utci'
              ? r.utciGrid
              : layer === 'pet'
                ? r.petGrid
                : layer === 'mrt'
                  ? r.mrtGrid
                  : layer === 'wind'
                    ? r.windGrid
                    : r.shadeGrid.map((v) => Math.max(0, v * 100));

          const pVal = getGrid(propRes)[idx] ?? 0;
          const bVal = getGrid(baseRes)[idx] ?? 0;
          setHoveredCell({
            xMeters: Number(pt.x.toFixed(1)),
            zMeters: Number(pt.z.toFixed(1)),
            row,
            col,
            proposalVal: Number(pVal.toFixed(2)),
            baselineVal: Number(bVal.toFixed(2)),
            deltaVal: Number((pVal - bVal).toFixed(2)),
            isVoidDeck: propRes.buildingMask[idx] === 2,
          });
        } else {
          setHoveredCell(null);
        }
      } else {
        setHoveredCell(null);
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const probeHits = raycaster.intersectObjects(probeMarkersGroup.children, true);
      if (probeHits.length > 0) {
        let obj: THREE.Object3D | null = probeHits[0].object;
        while (obj && !obj.userData?.probeId) {
          obj = obj.parent;
        }
        if (obj?.userData?.probeId) {
          latestPropsRef.current.onSelectProbe(obj.userData.probeId);
        }
      }
    };

    renderer.domElement.addEventListener('mousemove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      estateGroup,
      heatmapMesh,
      pendingWireframeMesh,
      windArrowsGroup,
      sunLight,
      probeMarkersGroup,
      requestRender,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousemove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.dispose();
    };
  }, []);

  // 2. Speed 1 (Immediate 0ms Preview): Rebuild 3D Estate Geometry & Sun Shadow Direction whenever `config` changes
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    const geometryModel = buildEstateGeometry(config);
    const solar = SOLAR_TIME_CATALOG[config.timeOfDay];

    // Update Directional Sun Light position to match solar altitude & azimuth
    const altRad = (solar.altitudeDeg * Math.PI) / 180;
    const azRad = (solar.azimuthDeg * Math.PI) / 180;
    const sunDist = 115;
    ctx.sunLight.position.set(
      Math.cos(altRad) * Math.sin(azRad) * sunDist,
      Math.sin(altRad) * sunDist,
      -Math.cos(altRad) * Math.cos(azRad) * sunDist
    );
    ctx.sunLight.target.position.set(0, 0, 0);
    ctx.sunLight.target.updateMatrixWorld();

    // Clear previous estate meshes cleanly
    while (ctx.estateGroup.children.length > 0) {
      const child = ctx.estateGroup.children[0];
      ctx.estateGroup.remove(child);
    }

    // Shared PBR Materials (varied roughness & metalness per Three.js studio guidelines)
    const facadeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.72,
      metalness: 0.08,
    });
    const finMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.45,
      metalness: 0.25,
    });
    const windowBandMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e3a5f,
      roughness: 0.18,
      metalness: 0.65,
      clearcoat: 0.6,
    });
    const pilotiMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.55,
      metalness: 0.15,
    });
    const solidPlinthMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.85,
      metalness: 0.05,
    });
    const roofParapetMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.6,
      metalness: 0.2,
    });

    // A. Build Designated Ground Zones (Walkway, Courtyard, Playground, Pavilion)
    // Spine Walkway
    const walkwayMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
      metalness: 0.05,
    });
    const walkwayMesh = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.12, 86), walkwayMat);
    walkwayMesh.position.set(-7, 0.06, 0);
    walkwayMesh.receiveShadow = true;
    ctx.estateGroup.add(walkwayMesh);

    // Central Courtyard Plaza
    const courtyardMat = new THREE.MeshStandardMaterial({
      color: 0x3b4252,
      roughness: 0.78,
      metalness: 0.08,
    });
    const courtyardMesh = new THREE.Mesh(new THREE.BoxGeometry(24, 0.14, 22), courtyardMat);
    courtyardMesh.position.set(8, 0.07, -2);
    courtyardMesh.receiveShadow = true;
    ctx.estateGroup.add(courtyardMesh);

    // Children's Playground (with multi-part play equipment)
    const playgroundGroup = new THREE.Group();
    playgroundGroup.position.set(-14, 0, 4);
    const playPad = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.16, 14),
      new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.65, metalness: 0.05 })
    );
    playPad.position.y = 0.08;
    playPad.receiveShadow = true;
    playgroundGroup.add(playPad);

    const playTower = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 3.2, 2.6),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.2 })
    );
    playTower.position.set(-2, 1.6, -1);
    playTower.castShadow = true;
    playgroundGroup.add(playTower);

    const playSlide = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.4, 3.6),
      new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.25, metalness: 0.3 })
    );
    playSlide.position.set(-2, 1.1, 1.6);
    playSlide.rotation.x = 0.45;
    playSlide.castShadow = true;
    playgroundGroup.add(playSlide);
    ctx.estateGroup.add(playgroundGroup);

    // Seating Pavilion Node
    const pavilionGroup = new THREE.Group();
    pavilionGroup.position.set(6, 0, 14);
    const pavPad = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.16, 10),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.75 })
    );
    pavPad.position.y = 0.08;
    pavPad.receiveShadow = true;
    pavilionGroup.add(pavPad);
    for (let b = -1; b <= 1; b += 2) {
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 0.55, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 })
      );
      bench.position.set(0, 0.35, b * 2.2);
      bench.castShadow = true;
      pavilionGroup.add(bench);
    }
    ctx.estateGroup.add(pavilionGroup);

    // B. Build 5 Composite Residential Blocks (with explicit Void Decks vs Solid Ground Plinth)
    geometryModel.blocks.forEach((blk) => {
      const blockGroup = new THREE.Group();
      blockGroup.position.set(blk.x, 0, blk.z);
      blockGroup.rotation.y = blk.rotationRad;

      const vdH = blk.hasVoidDeck ? blk.voidDeckHeight : 0;
      const upperHeight = blk.height - vdH;

      // 1. Ground Floor: Open Void Deck with Piloti Columns OR Solid Plinth
      if (blk.hasVoidDeck) {
        // Void deck paved floor slab
        const vdFloor = new THREE.Mesh(
          new THREE.BoxGeometry(blk.width, 0.18, blk.depth),
          new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
        );
        vdFloor.position.y = 0.09;
        vdFloor.receiveShadow = true;
        blockGroup.add(vdFloor);

        // 2x5 Structural Piloti Columns supporting the slab above
        const colGeo = new THREE.CylinderGeometry(0.42, 0.42, vdH, 12);
        for (let ix = -2; ix <= 2; ix++) {
          for (let iz = -1; iz <= 1; iz += 2) {
            const colMesh = new THREE.Mesh(colGeo, pilotiMat);
            colMesh.position.set(
              (ix / 2.2) * (blk.width * 0.82),
              vdH * 0.5,
              iz * (blk.depth * 0.36)
            );
            colMesh.castShadow = true;
            colMesh.receiveShadow = true;
            blockGroup.add(colMesh);
          }
        }

        // Compact recessed lift lobby core in center
        const liftCore = new THREE.Mesh(
          new THREE.BoxGeometry(blk.width * 0.22, vdH, blk.depth * 0.45),
          finMat
        );
        liftCore.position.set(0, vdH * 0.5, 0);
        liftCore.castShadow = true;
        blockGroup.add(liftCore);
      } else {
        // Solid ground floor plinth blocking pedestrian wind
        const plinth = new THREE.Mesh(
          new THREE.BoxGeometry(blk.width, 3.6, blk.depth),
          solidPlinthMat
        );
        plinth.position.y = 1.8;
        plinth.castShadow = true;
        plinth.receiveShadow = true;
        blockGroup.add(plinth);
      }

      // 2. Primary Residential Superstructure Body
      const mainBody = new THREE.Mesh(
        new THREE.BoxGeometry(blk.width, upperHeight, blk.depth),
        facadeMat
      );
      mainBody.position.y = vdH + upperHeight * 0.5;
      mainBody.castShadow = true;
      mainBody.receiveShadow = true;
      blockGroup.add(mainBody);

      // 3. Secondary Read: Horizontal Sun-Breaker Bands & Recessed Glazing Strips (every 3 storeys)
      const bandCount = Math.floor(blk.storeys / 3);
      for (let s = 1; s <= bandCount; s++) {
        const bandY = vdH + (s / (bandCount + 0.5)) * upperHeight;
        const glassBand = new THREE.Mesh(
          new THREE.BoxGeometry(blk.width * 0.96, 1.15, blk.depth + 0.18),
          windowBandMat
        );
        glassBand.position.y = bandY;
        blockGroup.add(glassBand);
      }

      // 4. Vertical Shear-Wall Structural Fins
      for (let f = -1.5; f <= 1.5; f += 1) {
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, upperHeight + 0.6, blk.depth + 0.5),
          finMat
        );
        fin.position.set((f / 2) * (blk.width * 0.78), vdH + upperHeight * 0.5, 0);
        fin.castShadow = true;
        blockGroup.add(fin);
      }

      // 5. Accent Detail: Rooftop Parapet & Elevator Penthouse
      const roofCrown = new THREE.Mesh(
        new THREE.BoxGeometry(blk.width * 0.92, 1.4, blk.depth * 0.86),
        roofParapetMat
      );
      roofCrown.position.y = blk.height + 0.7;
      roofCrown.castShadow = true;
      blockGroup.add(roofCrown);

      ctx.estateGroup.add(blockGroup);
    });

    // C. Build Overhead Shade Canopies (Walkway Arch, Playground Sails, Courtyard Pergola)
    const canopyMembraneMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.35,
      metalness: 0.1,
      clearcoat: 0.4,
      side: THREE.DoubleSide,
    });
    const pergolaWoodMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.65,
      metalness: 0.15,
    });
    const steelPostMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.35,
      metalness: 0.8,
    });

    geometryModel.canopies.forEach((can) => {
      const canGroup = new THREE.Group();
      canGroup.position.set(can.x, 0, can.z);
      canGroup.rotation.y = can.rotationRad;

      if (can.type === 'walkway-arch') {
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(can.width, 0.28, can.depth),
          canopyMembraneMat
        );
        roof.position.y = can.height;
        roof.castShadow = true;
        roof.receiveShadow = true;
        canGroup.add(roof);

        const postGeo = new THREE.CylinderGeometry(0.16, 0.16, can.height, 8);
        for (let iz = -can.depth * 0.42; iz <= can.depth * 0.42; iz += 6.5) {
          for (const ix of [-can.width * 0.42, can.width * 0.42]) {
            const post = new THREE.Mesh(postGeo, steelPostMat);
            post.position.set(ix, can.height * 0.5, iz);
            post.castShadow = true;
            canGroup.add(post);
          }
        }
      } else if (can.type === 'playground-sails') {
        // Overlapping architectural tensile shade sails
        const sail1 = new THREE.Mesh(
          new THREE.BoxGeometry(can.width * 0.65, 0.18, can.depth * 0.65),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 })
        );
        sail1.position.set(-2.5, can.height, -1.8);
        sail1.rotation.z = 0.08;
        sail1.castShadow = true;
        canGroup.add(sail1);

        const sail2 = new THREE.Mesh(
          new THREE.BoxGeometry(can.width * 0.65, 0.18, can.depth * 0.65),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4 })
        );
        sail2.position.set(2.5, can.height - 0.55, 1.8);
        sail2.rotation.z = -0.07;
        sail2.castShadow = true;
        canGroup.add(sail2);

        const postGeo = new THREE.CylinderGeometry(0.18, 0.22, can.height + 0.5, 8);
        for (const [px, pz] of [
          [-can.width * 0.45, -can.depth * 0.45],
          [can.width * 0.45, -can.depth * 0.45],
          [-can.width * 0.45, can.depth * 0.45],
          [can.width * 0.45, can.depth * 0.45],
        ]) {
          const post = new THREE.Mesh(postGeo, steelPostMat);
          post.position.set(px, can.height * 0.5, pz);
          post.castShadow = true;
          canGroup.add(post);
        }
      } else {
        // Courtyard Louvered Pergola
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(can.width, 0.35, can.depth),
          pergolaWoodMat
        );
        frame.position.y = can.height;
        frame.castShadow = true;
        canGroup.add(frame);

        const postGeo = new THREE.BoxGeometry(0.35, can.height, 0.35);
        for (const [px, pz] of [
          [-can.width * 0.46, -can.depth * 0.46],
          [can.width * 0.46, -can.depth * 0.46],
          [-can.width * 0.46, can.depth * 0.46],
          [can.width * 0.46, can.depth * 0.46],
        ]) {
          const post = new THREE.Mesh(postGeo, pergolaWoodMat);
          post.position.set(px, can.height * 0.5, pz);
          post.castShadow = true;
          canGroup.add(post);
        }
      }

      ctx.estateGroup.add(canGroup);
    });

    // D. Build Multi-Part Tropical Trees (Trunk + Branches + 4 Tiered Crown Clusters)
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.88,
      metalness: 0.02,
    });
    const foliageMatMain = new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.78,
      metalness: 0.04,
    });
    const foliageMatLight = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.62,
      metalness: 0.06,
    });

    geometryModel.trees.forEach((tr) => {
      const treeGroup = new THREE.Group();
      treeGroup.position.set(tr.x, 0, tr.z);

      // 1. Primary Trunk
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.52, tr.trunkHeight, 10),
        trunkMat
      );
      trunk.position.y = tr.trunkHeight * 0.5;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      // 2. Umbrella Crown Tiers (3-4 distinct ellipsoidal lobes)
      const crownCenterY = tr.trunkHeight + tr.crownRadius * 0.55;
      const mainCrown = new THREE.Mesh(
        new THREE.SphereGeometry(tr.crownRadius, 14, 12),
        foliageMatMain
      );
      mainCrown.scale.set(1.0, 0.52, 1.0);
      mainCrown.position.y = crownCenterY;
      mainCrown.castShadow = true;
      mainCrown.receiveShadow = true;
      treeGroup.add(mainCrown);

      const upperLobe = new THREE.Mesh(
        new THREE.SphereGeometry(tr.crownRadius * 0.72, 12, 10),
        foliageMatLight
      );
      upperLobe.scale.set(1.0, 0.48, 1.0);
      upperLobe.position.set(tr.crownRadius * 0.22, crownCenterY + tr.crownRadius * 0.28, -0.4);
      upperLobe.castShadow = true;
      treeGroup.add(upperLobe);

      const sideLobe = new THREE.Mesh(
        new THREE.SphereGeometry(tr.crownRadius * 0.68, 12, 10),
        foliageMatMain
      );
      sideLobe.scale.set(1.0, 0.45, 1.0);
      sideLobe.position.set(-tr.crownRadius * 0.28, crownCenterY + 0.1, tr.crownRadius * 0.2);
      sideLobe.castShadow = true;
      treeGroup.add(sideLobe);

      ctx.estateGroup.add(treeGroup);
    });

    // E. Build 5 Interactive Point Probe Markers
    while (ctx.probeMarkersGroup.children.length > 0) {
      ctx.probeMarkersGroup.remove(ctx.probeMarkersGroup.children[0]);
    }

    geometryModel.zones.forEach((zone) => {
      const isSelected = zone.id === selectedProbeId;
      const markerGroup = new THREE.Group();
      markerGroup.position.set(zone.probeX, 0, zone.probeZ);
      markerGroup.userData = { probeId: zone.id };

      const stemMat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0x06b6d4 : 0x94a3b8,
      });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.5, 8), stemMat);
      stem.position.y = 2.75;
      markerGroup.add(stem);

      const headMat = new THREE.MeshStandardMaterial({
        color: isSelected ? 0x06b6d4 : 0xf8fafc,
        emissive: isSelected ? 0x0891b2 : 0x000000,
        roughness: 0.2,
        metalness: 0.3,
      });
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(isSelected ? 1.25 : 0.95, 16, 16),
        headMat
      );
      head.position.y = 5.8;
      markerGroup.add(head);

      const ringGeo = new THREE.RingGeometry(1.4, 1.85, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0x06b6d4 : 0x64748b,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 1.56;
      markerGroup.add(ring);

      ctx.probeMarkersGroup.add(markerGroup);
    });

    ctx.requestRender();
  }, [config, selectedProbeId]);

  // 3. Speed 2 (Assessment Map Update vs Pending Invalidation):
  // Update Heatmap Texture & Wind Streamlines when results, layer, comparisonMode, or pending state change
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    ctx.heatmapMesh.position.y = heatmapElevation === 'pedestrian' ? 1.5 : 0.18;
    ctx.pendingWireframeMesh.position.y =
      heatmapElevation === 'pedestrian' ? 1.52 : 0.2;

    // CRITICAL REQUIREMENT: Never leave an old comfort map displayed as though it belongs to edited geometry!
    if (isAssessmentPending || !proposalResult || !baselineResult) {
      ctx.heatmapMesh.visible = false;
      ctx.pendingWireframeMesh.visible = true;
      ctx.windArrowsGroup.visible = false;
      ctx.requestRender();
      return;
    }

    ctx.heatmapMesh.visible = true;
    ctx.pendingWireframeMesh.visible = false;

    const gridSize = proposalResult.gridSize; // 48
    const rgba = new Uint8Array(gridSize * gridSize * 4);

    const extractLayerArray = (res: SimulationResult): number[] => {
      switch (activeLayer) {
        case 'utci':
          return res.utciGrid;
        case 'pet':
          return res.petGrid;
        case 'mrt':
          return res.mrtGrid;
        case 'wind':
          return res.windGrid;
        case 'shade':
          return res.shadeGrid.map((s) => Math.max(0, s * 100));
      }
    };

    const propArr = extractLayerArray(proposalResult);
    const baseArr = extractLayerArray(baselineResult);
    const activeMask =
      comparisonMode === 'baseline'
        ? baselineResult.buildingMask
        : proposalResult.buildingMask;

    // Fill texture (Note: DataTexture row 0 is bottom of UV, so flip Z row for North = -Z alignment)
    for (let row = 0; row < gridSize; row++) {
      const texRow = gridSize - 1 - row;
      for (let col = 0; col < gridSize; col++) {
        const srcIdx = row * gridSize + col;
        const dstIdx = (texRow * gridSize + col) * 4;

        if (activeMask[srcIdx] === 1) {
          // Solid building footprint -> transparent pixel so building plinth shows cleanly
          rgba[dstIdx] = 15;
          rgba[dstIdx + 1] = 23;
          rgba[dstIdx + 2] = 42;
          rgba[dstIdx + 3] = 40;
          continue;
        }

        const val =
          comparisonMode === 'baseline'
            ? baseArr[srcIdx]
            : comparisonMode === 'proposal'
              ? propArr[srcIdx]
              : propArr[srcIdx] - baseArr[srcIdx];

        const [r, g, b] = sampleLayerRGB(activeLayer, comparisonMode, val);
        rgba[dstIdx] = r;
        rgba[dstIdx + 1] = g;
        rgba[dstIdx + 2] = b;
        // Void deck cells get slightly crisp alpha so piloti columns & heatmap both read clearly
        rgba[dstIdx + 3] = activeMask[srcIdx] === 2 ? 235 : 215;
      }
    }

    const tex = new THREE.DataTexture(rgba, gridSize, gridSize, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;

    const mat = ctx.heatmapMesh.material as THREE.MeshBasicMaterial;
    if (mat.map) mat.map.dispose();
    mat.map = tex;
    mat.needsUpdate = true;

    // Rebuild 3D Wind Vector Arrows on a 12x12 sub-grid
    while (ctx.windArrowsGroup.children.length > 0) {
      ctx.windArrowsGroup.remove(ctx.windArrowsGroup.children[0]);
    }
    ctx.windArrowsGroup.visible = showWindVectors;

    if (showWindVectors) {
      const sourceRes =
        comparisonMode === 'baseline' ? baselineResult : proposalResult;
      const windRadFrom = (sourceRes.weatherMeta.windDirectionDeg * Math.PI) / 180;
      const flowDir = new THREE.Vector3(
        -Math.sin(windRadFrom),
        0,
        Math.cos(windRadFrom)
      ).normalize();

      for (let r = 2; r < gridSize; r += 4) {
        for (let c = 2; c < gridSize; c += 4) {
          const idx = r * gridSize + c;
          if (sourceRes.buildingMask[idx] === 1) continue;
          const speed = sourceRes.windGrid[idx];
          if (speed < 0.2) continue;

          const wx = -60 + (c + 0.5) * (120 / gridSize);
          const wz = -60 + (r + 0.5) * (120 / gridSize);
          const isVoidDeck = sourceRes.buildingMask[idx] === 2;
          const length = Math.min(4.8, 1.4 + speed * 0.9);
          const colorHex = isVoidDeck
            ? 0x22d3ee
            : speed > 2.2
              ? 0x34d399
              : 0x94a3b8;

          const arrow = new THREE.ArrowHelper(
            flowDir,
            new THREE.Vector3(wx - flowDir.x * (length * 0.5), 1.68, wz - flowDir.z * (length * 0.5)),
            length,
            colorHex,
            length * 0.32,
            length * 0.2
          );
          ctx.windArrowsGroup.add(arrow);
        }
      }
    }

    ctx.requestRender();
  }, [
    baselineResult,
    proposalResult,
    isAssessmentPending,
    activeLayer,
    comparisonMode,
    showWindVectors,
    heatmapElevation,
  ]);

  const activeLayerSpec = LAYER_SCALE_SPECS[activeLayer];
  const weatherInfo = WEATHER_CATALOG[config.weatherScenario];
  const solarInfo = SOLAR_TIME_CATALOG[config.timeOfDay];

  const selectedProbeProposal: ProbeReading | undefined =
    proposalResult?.probes.find((p) => p.id === selectedProbeId);
  const selectedProbeBaseline: ProbeReading | undefined =
    baselineResult?.probes.find((p) => p.id === selectedProbeId);

  const currentOverride = config.customBlockOverride;
  const activeOffsetX =
    currentOverride?.blockId === selectedBlockIdForEdit ? currentOverride.offsetX : 0;
  const activeOffsetZ =
    currentOverride?.blockId === selectedBlockIdForEdit ? currentOverride.offsetZ : 0;
  const activeExtraRot =
    currentOverride?.blockId === selectedBlockIdForEdit
      ? currentOverride.extraRotationDeg
      : 0;

  return (
    <div className="relative w-full h-full flex flex-col bg-[#0B0F17] select-none overflow-hidden">
      {/* Top Viewport Overlay Bar: Layer Switcher & Comparison Mode */}
      <div className="z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#111827]/95 border-b border-slate-800">
        {/* Layer Selector */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          {(
            [
              { id: 'utci', label: 'UTCI', icon: Flame },
              { id: 'pet', label: 'PET', icon: Sun },
              { id: 'mrt', label: 'MRT (SOLWEIG)', icon: Sparkles },
              { id: 'wind', label: 'Wind (URock)', icon: Wind },
              { id: 'shade', label: 'Shade %', icon: Layers },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeLayer === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChangeLayer(item.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Baseline vs Proposal vs Delta Comparison Mode */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            {(
              [
                { id: 'proposal', label: 'Proposal Map' },
                { id: 'baseline', label: 'Baseline Map' },
                { id: 'delta', label: 'Delta (Prop − Base)' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                onClick={() => onChangeComparisonMode(mode.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  comparisonMode === mode.id
                    ? mode.id === 'delta'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'bg-slate-100 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCustomEditPanelOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              customEditPanelOpen || config.customBlockOverride
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Move or rotate an individual building block to test immediate shadow preview vs on-demand assessment"
          >
            <Move className="w-3.5 h-3.5" />
            <span>Move / Rotate Block</span>
          </button>
        </div>
      </div>

      {/* Main 3D Canvas Stage */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        <div ref={canvasMountRef} className="w-full h-full cursor-crosshair" />

        {/* Explicit Two-Speed Banner when Uncalculated Arrangement is Active */}
        {isAssessmentPending && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-xl w-[92%] bg-slate-900/95 border border-amber-500/60 rounded-xl p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-amber-400">
                  Speed 1 Active · Instant Geometry & Solar Shadow Preview
                </div>
                <h4 className="text-sm font-semibold text-white mt-0.5">
                  Comfort Map Cleared — Modelled Assessment Pending
                </h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Building geometry or parameters were modified to an uncalculated arrangement.
                  Old PET/UTCI heatmaps are hidden so stale results are never shown on edited geometry.
                </p>
              </div>
              <button
                onClick={onRunAssessment}
                disabled={isSimulating}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isSimulating ? 'Running Solver...' : 'Run Modelled Assessment'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Interactive Custom Block Move / Rotate Drawer (Demonstrating Speed 1 vs Speed 2) */}
        {customEditPanelOpen && (
          <div className="absolute top-4 left-4 z-20 w-72 bg-slate-900/95 border border-slate-700 rounded-xl p-3.5 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-white">
                Direct Block Geometry Editor
              </span>
              {config.customBlockOverride && (
                <button
                  onClick={onResetCustomBlock}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Moving or rotating a block updates 3D geometry and shadows immediately (Speed 1) and invalidates the comfort map until recalculated (Speed 2).
            </p>

            <div className="mt-3 space-y-2.5">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Target Block</label>
                <div className="grid grid-cols-5 gap-1">
                  {['BLK-A', 'BLK-B', 'BLK-C', 'BLK-D', 'BLK-E'].map((id) => (
                    <button
                      key={id}
                      onClick={() => setSelectedBlockIdForEdit(id)}
                      className={`py-1 text-xs font-mono rounded border ${
                        selectedBlockIdForEdit === id
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-semibold'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {id.replace('BLK-', '')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">East-West Shift (ΔX)</span>
                  <span className="font-mono text-cyan-400">
                    {activeOffsetX >= 0 ? `+${activeOffsetX}` : activeOffsetX} m
                  </span>
                </div>
                <input
                  type="range"
                  min={-14}
                  max={14}
                  step={2}
                  value={activeOffsetX}
                  onChange={(e) =>
                    onUpdateCustomBlock(
                      selectedBlockIdForEdit,
                      Number(e.target.value),
                      activeOffsetZ,
                      activeExtraRot
                    )
                  }
                  className="w-full accent-cyan-400 mt-1"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">North-South Shift (ΔZ)</span>
                  <span className="font-mono text-cyan-400">
                    {activeOffsetZ >= 0 ? `+${activeOffsetZ}` : activeOffsetZ} m
                  </span>
                </div>
                <input
                  type="range"
                  min={-14}
                  max={14}
                  step={2}
                  value={activeOffsetZ}
                  onChange={(e) =>
                    onUpdateCustomBlock(
                      selectedBlockIdForEdit,
                      activeOffsetX,
                      Number(e.target.value),
                      activeExtraRot
                    )
                  }
                  className="w-full accent-cyan-400 mt-1"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Block Rotation (Δθ)</span>
                  <span className="font-mono text-cyan-400">
                    {activeExtraRot >= 0 ? `+${activeExtraRot}` : activeExtraRot}°
                  </span>
                </div>
                <input
                  type="range"
                  min={-30}
                  max={30}
                  step={5}
                  value={activeExtraRot}
                  onChange={(e) =>
                    onUpdateCustomBlock(
                      selectedBlockIdForEdit,
                      activeOffsetX,
                      activeOffsetZ,
                      Number(e.target.value)
                    )
                  }
                  className="w-full accent-cyan-400 mt-1"
                />
              </div>
            </div>
          </div>
        )}

        {/* Top-Right Compass, Solar & Wind Rose Readout + View Options */}
        <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>Wind:</span>
              <span className="font-mono text-white">{weatherInfo.windLabel}</span>
            </div>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <div className="flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>Sun Alt:</span>
              <span className="font-mono text-white">{solarInfo.altitudeDeg}°</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setShowWindVectors((v) => !v)}
              className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                showWindVectors
                  ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Wind Vectors
            </button>
            <button
              onClick={() =>
                setHeatmapElevation((e) => (e === 'pedestrian' ? 'ground' : 'pedestrian'))
              }
              className="px-2.5 py-1 text-xs rounded text-slate-300 hover:text-white bg-slate-800/70 whitespace-nowrap shrink-0"
            >
              <Eye className="w-3 h-3 inline mr-1" />
              {heatmapElevation === 'pedestrian' ? 'z = 1.5m Plane' : 'z = 0.2m Ground'}
            </button>
          </div>
        </div>

        {/* Live Grid Cursor Probe & Active Zone Callout (Bottom-Left of Viewport) */}
        <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-2 max-w-md">
          {hoveredCell && !isAssessmentPending && (
            <div className="bg-slate-900/95 border border-slate-700 rounded-lg px-3 py-2 text-xs">
              <div className="text-slate-400 font-mono">
                Grid Cell ({hoveredCell.col}, {hoveredCell.row}) · X={hoveredCell.xMeters}m, Z=
                {hoveredCell.zMeters}m
                {hoveredCell.isVoidDeck ? ' · [Under Void Deck]' : ''}
              </div>
              <div className="flex items-center gap-3 mt-1 font-mono">
                <span className="text-slate-300">
                  Base: <strong className="text-white">{hoveredCell.baselineVal}</strong>
                  {activeLayerSpec.unit}
                </span>
                <span className="text-slate-300">
                  Prop: <strong className="text-cyan-300">{hoveredCell.proposalVal}</strong>
                  {activeLayerSpec.unit}
                </span>
                <span
                  className={
                    hoveredCell.deltaVal < 0
                      ? 'text-emerald-400 font-semibold'
                      : hoveredCell.deltaVal > 0
                        ? 'text-amber-400 font-semibold'
                        : 'text-slate-400'
                  }
                >
                  Δ: {hoveredCell.deltaVal >= 0 ? `+${hoveredCell.deltaVal}` : hoveredCell.deltaVal}
                  {activeLayerSpec.unit}
                </span>
              </div>
            </div>
          )}

          {/* Quick 5-Zone Point Probe Selector Strip */}
          {selectedProbeProposal && selectedProbeBaseline && !isAssessmentPending && (
            <div className="bg-slate-900/95 border border-slate-800 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold text-white">
                  Active Probe: {selectedProbeProposal.label}
                </span>
                <span className="text-xs font-mono text-cyan-400">
                  UTCI {selectedProbeProposal.utci.toFixed(1)}°C (
                  {selectedProbeProposal.utci - selectedProbeBaseline.utci >= 0 ? '+' : ''}
                  {(selectedProbeProposal.utci - selectedProbeBaseline.utci).toFixed(1)}°C vs Base)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                {proposalResult?.probes.map((pr) => (
                  <button
                    key={pr.id}
                    onClick={() => onSelectProbe(pr.id)}
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                      pr.id === selectedProbeId
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    {pr.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Synchronized Color Scale Legend (Bottom-Right of Viewport) */}
        <div className="absolute bottom-3 right-3 z-10 w-72 bg-slate-900/95 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white">
              {activeLayerSpec.shortLabel}{' '}
              {comparisonMode === 'delta'
                ? 'Delta (Proposal − Baseline)'
                : 'Scale (Locked Base & Prop)'}
            </span>
            <span className="font-mono text-slate-400">{activeLayerSpec.unit}</span>
          </div>
          <div
            className="h-2.5 w-full rounded mt-2 border border-slate-700"
            style={{
              background: getLegendGradientCSS(activeLayer, comparisonMode),
            }}
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-1">
            {(comparisonMode === 'delta'
              ? activeLayerSpec.deltaStopsLabel
              : activeLayerSpec.stopsLabel
            ).map((lbl, idx) => (
              <span key={idx}>{lbl}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
