import * as THREE from "three";
import { TilesRenderer } from "3d-tiles-renderer";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

const TILESET_URL = "https://pelican-public.s3.amazonaws.com/3dtiles/agi-hq/tileset.json";
const NEWS_HOME = { center: [42, 29], zoom: 2.6, pitch: 0, bearing: 0 };
const ALTITUDE_OFFSET = -300;

const map = window.newsMap;
const loadButton = document.getElementById("reality-demo");
const returnButton = document.getElementById("return-news");
const status = document.getElementById("reality-status");

let scene;
let camera;
let renderer;
let tiles;
let tilesCamera;
let localTransform;
let demoCenter;
let demoMarker;
let layerAdded = false;
let modelVisible = false;
let loading = false;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? "#f85149" : "#8b949e";
}

function ecefToLngLatAlt(x, y, z) {
  const a = 6378137;
  const e2 = 6.69437999014e-3;
  const b = a * Math.sqrt(1 - e2);
  const ep2 = (a * a - b * b) / (b * b);
  const p = Math.sqrt(x * x + y * y);
  const th = Math.atan2(a * z, b * p);
  const lon = Math.atan2(y, x);
  const lat = Math.atan2(
    z + ep2 * b * Math.sin(th) ** 3,
    p - e2 * a * Math.cos(th) ** 3
  );
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const alt = p / Math.cos(lat) - n;
  return { lng: lon * 180 / Math.PI, lat: lat * 180 / Math.PI, alt };
}

function getModelTransform([lng, lat, altitude], rotate = [Math.PI / 2, 0, 0]) {
  const origin = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  return {
    translateX: origin.x,
    translateY: origin.y,
    translateZ: origin.z,
    rotateX: rotate[0],
    rotateY: rotate[1],
    rotateZ: rotate[2],
    scale: origin.meterInMercatorCoordinateUnits(),
  };
}

function updateLocalTransform(origin = [0, 0, 0]) {
  const transform = getModelTransform(origin);
  const rotationX = new THREE.Matrix4().makeRotationAxis(
    new THREE.Vector3(1, 0, 0),
    transform.rotateX
  );
  const rotationY = new THREE.Matrix4().makeRotationAxis(
    new THREE.Vector3(0, 1, 0),
    transform.rotateY
  );
  const rotationZ = new THREE.Matrix4().makeRotationAxis(
    new THREE.Vector3(0, 0, 1),
    transform.rotateZ
  );

  localTransform = new THREE.Matrix4()
    .makeTranslation(transform.translateX, transform.translateY, transform.translateZ)
    .scale(new THREE.Vector3(transform.scale, -transform.scale, transform.scale))
    .multiply(rotationX)
    .multiply(rotationY)
    .multiply(rotationZ);
}

function showDemoMarker() {
  if (!demoCenter || demoMarker) return;
  demoMarker = new maplibregl.Marker({ color: "#f97316" })
    .setLngLat(demoCenter)
    .setPopup(new maplibregl.Popup({ offset: 24 }).setHTML(
      "<strong>\u5b9e\u666f\u4e09\u7ef4\u516c\u5f00\u8bd5\u9a8c\u533a</strong><br><span style='font-size:11px'>AGI \u56ed\u533a 3D Tiles \u6837\u4f8b\uff1b\u6a59\u8272\u6807\u8bc6\u7528\u4e8e\u9a8c\u8bc1\u6807\u8bc6\u4e0e\u4e09\u7ef4\u6a21\u578b\u53e0\u52a0\u3002</span>"
    ))
    .addTo(map);
}

function flyToDemo() {
  if (!demoCenter) return;
  modelVisible = true;
  showDemoMarker();
  map.flyTo({
    center: demoCenter,
    zoom: 18,
    pitch: 60,
    bearing: -22,
    duration: 2200,
    essential: true,
  });
  returnButton.hidden = false;
  loadButton.textContent = "\u91cd\u65b0\u5b9a\u4f4d\u8bd5\u9a8c\u533a";
  setStatus("\u516c\u5f00\u5b9e\u666f\u6a21\u578b\u5df2\u52a0\u8f7d\uff1b\u65b0\u95fb\u5217\u8868\u4e0e\u65b0\u95fb\u6807\u8bc6\u4ecd\u4fdd\u6301\u539f\u903b\u8f91");
  map.triggerRepaint();
}

function initTiles(url) {
  const gltfLoader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("https://unpkg.com/three@0.183.0/examples/jsm/libs/draco/");
  gltfLoader.setDRACOLoader(dracoLoader);

  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath("https://unpkg.com/three@0.183.0/examples/jsm/libs/basis/");
  ktx2Loader.detectSupport(renderer);
  gltfLoader.setKTX2Loader(ktx2Loader);

  tiles = new TilesRenderer(url);
  tiles.group.name = "reality-demo-tiles";
  scene.add(tiles.group);
  tiles.setCamera(tilesCamera);
  tiles.setResolutionFromRenderer(tilesCamera, renderer);
  tiles.manager.addHandler(/\.(gltf|glb)$/i, gltfLoader);

  let rootHandled = false;
  const handleRoot = () => {
    if (rootHandled) return;
    rootHandled = true;

    const sphere = new THREE.Sphere();
    tiles.getBoundingSphere(sphere);
    const center = sphere.center.clone();
    const rootTransform = tiles.root?.transform || [
      1, 0, 0, 0, 0, 1, 0, 0,
      0, 0, 1, 0, 0, 0, 0, 1,
    ];
    const { lng, lat, alt } = ecefToLngLatAlt(center.x, center.y, center.z);
    demoCenter = [lng, lat];
    updateLocalTransform([lng, lat, alt + ALTITUDE_OFFSET]);

    const rotation = new THREE.Matrix3().set(
      rootTransform[0], rootTransform[1], rootTransform[2],
      rootTransform[8], rootTransform[9], rootTransform[10],
      -rootTransform[4], -rootTransform[5], -rootTransform[6]
    );
    const finalMatrix = new THREE.Matrix4()
      .multiply(new THREE.Matrix4().setFromMatrix3(rotation))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    tiles.group.matrix.copy(finalMatrix);
    tiles.group.matrixAutoUpdate = false;
    tiles.group.updateMatrixWorld(true);

    loading = false;
    loadButton.disabled = false;
    flyToDemo();
  };

  tiles.addEventListener("load-tileset", handleRoot);
  tiles.addEventListener("load-error", event => {
    loading = false;
    loadButton.disabled = false;
    setStatus("\u5b9e\u666f\u4e09\u7ef4\u6570\u636e\u52a0\u8f7d\u5931\u8d25\uff1a" + (event.error?.message || "\u8bf7\u68c0\u67e5\u7f51\u7edc"), true);
  });
  updateLocalTransform();
}

const realityLayer = {
  id: "reality-demo-3d-tiles",
  type: "custom",
  renderingMode: "3d",
  onAdd(mapInstance, gl) {
    camera = new THREE.PerspectiveCamera();
    tilesCamera = new THREE.PerspectiveCamera();
    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 3));
    const sunlight = new THREE.DirectionalLight(0xffffff, 2);
    sunlight.position.set(-40, -70, 100).normalize();
    scene.add(sunlight);

    renderer = new THREE.WebGLRenderer({
      canvas: mapInstance.getCanvas(),
      context: gl,
      antialias: true,
    });
    renderer.autoClear = false;
    initTiles(TILESET_URL);
  },
  render(_gl, args) {
    if (!modelVisible || !localTransform || !renderer || !tilesCamera) return;
    const mainMatrix = args.defaultProjectionData?.mainMatrix || args.projectionMatrix;
    camera.projectionMatrix.fromArray(mainMatrix).multiply(localTransform);

    const projection = new THREE.Matrix4().fromArray(args.projectionMatrix);
    const view = projection.clone().invert().multiply(camera.projectionMatrix);
    tilesCamera.projectionMatrix.copy(projection);
    tilesCamera.matrixWorldInverse.copy(view);
    tilesCamera.matrixWorld.copy(view).invert();

    renderer.resetState();
    renderer.render(scene, camera);
    tiles?.update();
    map.triggerRepaint();
  },
};

loadButton.disabled = false;
setStatus("\u53ef\u9009\u9a8c\u8bc1\uff1a\u516c\u5f00 AGI \u56ed\u533a\u5b9e\u666f\u4e09\u7ef4\u6a21\u578b\uff08\u6309\u9700\u52a0\u8f7d\uff09");

loadButton.addEventListener("click", async () => {
  if (demoCenter) {
    flyToDemo();
    return;
  }
  if (loading) return;

  loading = true;
  modelVisible = true;
  loadButton.disabled = true;
  setStatus("\u6b63\u5728\u52a0\u8f7d\u516c\u5f00 3D Tiles\uff0c\u8bf7\u7a0d\u5019\u2026");
  try {
    if (!map.isStyleLoaded()) {
      await new Promise(resolve => map.once("style.load", resolve));
    }
    if (!layerAdded) {
      map.addLayer(realityLayer);
      layerAdded = true;
    }
  } catch (error) {
    loading = false;
    loadButton.disabled = false;
    modelVisible = false;
    setStatus("\u5b9e\u666f\u4e09\u7ef4\u521d\u59cb\u5316\u5931\u8d25\uff1a" + error.message, true);
  }
});

returnButton.addEventListener("click", () => {
  modelVisible = false;
  demoMarker?.remove();
  demoMarker = null;
  returnButton.hidden = true;
  map.flyTo({ ...NEWS_HOME, duration: 1800, essential: true });
  setStatus("\u8bd5\u9a8c\u533a\u5df2\u9690\u85cf\uff1b\u53ef\u968f\u65f6\u91cd\u65b0\u8fdb\u5165");
  map.triggerRepaint();
});
