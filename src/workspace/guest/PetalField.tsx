import { useContext, useEffect, useRef } from 'react';
import { WatercolorContext } from './Blossom';

interface PetalFieldProps {
  /** Called when the 3D layer cannot or should not run (no WebGL, reduced motion); the page falls back to CSS petals. */
  onUnavailable?: () => void;
}

const COUNT = 34;

/**
 * Cherry-blossom petals drifting in real 3D behind the hero. The petals reuse the watercolor art that is already
 * painted for the page, so they read as part of the same paper rather than as an effect on top of it. The scene is
 * code-split (three.js loads on demand), pauses off-screen or in a hidden tab, and follows the pointer with a slow,
 * small camera parallax. Nothing here is interactive; the canvas never takes pointer events.
 */
export default function PetalField({ onUnavailable }: PetalFieldProps) {
  const art = useContext(WatercolorContext);
  const host = useRef<HTMLDivElement>(null);
  const unavailable = useRef(onUnavailable); unavailable.current = onUnavailable;

  useEffect(() => {
    const element = host.current; const petals = art?.petals;
    if (!element || !petals?.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { unavailable.current?.(); return; }
    let disposed = false; let cleanup: (() => void) | undefined;

    void import('three').then(THREE => {
      if (disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); }
      catch { unavailable.current?.(); return; }
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      element.appendChild(renderer.domElement);
      renderer.domElement.setAttribute('aria-hidden', 'true');

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
      camera.position.set(0, 0, 14);

      const loader = new THREE.TextureLoader();
      const textures = petals.map(src => { const texture = loader.load(src); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture; });
      // A petal is a gently cupped plane: bending the vertices makes it catch the light as it tumbles.
      const geometry = new THREE.PlaneGeometry(1, 1, 6, 6);
      const position = geometry.attributes.position;
      for (let index = 0; index < position.count; index++) { const x = position.getX(index); const y = position.getY(index); position.setZ(index, (x * x + y * y) * 0.22); }
      geometry.computeVertexNormals();

      const random = (min: number, max: number) => min + Math.random() * (max - min);
      const items = Array.from({ length: COUNT }, (_, index) => {
        const depth = random(-9, 5); // farther petals are smaller, fainter and slower
        const material = new THREE.MeshBasicMaterial({ map: textures[index % textures.length], transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: THREE.MathUtils.mapLinear(depth, -9, 5, 0.55, 1) });
        const mesh = new THREE.Mesh(geometry, material);
        const scale = THREE.MathUtils.mapLinear(depth, -9, 5, 1.2, 2.3);
        mesh.scale.setScalar(scale);
        mesh.position.set(random(-9, 9), random(-6, 6), depth);
        mesh.rotation.set(random(0, Math.PI), random(0, Math.PI), random(0, Math.PI));
        scene.add(mesh);
        return { mesh, fall: random(0.35, 0.7) * THREE.MathUtils.mapLinear(depth, -9, 5, 0.6, 1.1), sway: random(0.4, 1.1), phase: random(0, Math.PI * 2), spin: new THREE.Vector3(random(-0.5, 0.5), random(-0.5, 0.5), random(-0.4, 0.4)) };
      });

      let width = 0; let height = 0;
      const resize = () => {
        width = element.clientWidth || 1; height = element.clientHeight || 1;
        renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize); observer.observe(element);

      const pointer = { x: 0, y: 0 }; const eased = { x: 0, y: 0 };
      const onPointer = (event: PointerEvent) => { pointer.x = (event.clientX / window.innerWidth - 0.5) * 2; pointer.y = (event.clientY / window.innerHeight - 0.5) * 2; };
      window.addEventListener('pointermove', onPointer, { passive: true });

      let running = false; let visible = true; let frame = 0; let last = performance.now();
      const bounds = { x: 10, y: 7 };
      const tick = (now: number) => {
        frame = 0; if (!running) return;
        const delta = Math.min((now - last) / 1000, 0.05); last = now; const time = now / 1000;
        eased.x += (pointer.x - eased.x) * 0.04; eased.y += (pointer.y - eased.y) * 0.04;
        camera.position.x = eased.x * 0.9; camera.position.y = -eased.y * 0.6; camera.lookAt(0, 0, 0);
        for (const item of items) {
          const { mesh } = item;
          mesh.position.y -= item.fall * delta;
          mesh.position.x += Math.sin(time * item.sway + item.phase) * 0.35 * delta + 0.12 * delta; // a light breeze from the left
          mesh.rotation.x += item.spin.x * delta; mesh.rotation.y += item.spin.y * delta; mesh.rotation.z += item.spin.z * delta;
          if (mesh.position.y < -bounds.y) { mesh.position.y = bounds.y; mesh.position.x = random(-bounds.x, bounds.x); }
          if (mesh.position.x > bounds.x) mesh.position.x = -bounds.x;
        }
        renderer.render(scene, camera);
        frame = requestAnimationFrame(tick);
      };
      const sync = () => {
        const shouldRun = visible && !document.hidden;
        if (shouldRun && !running) { running = true; last = performance.now(); frame = requestAnimationFrame(tick); }
        else if (!shouldRun && running) { running = false; if (frame) cancelAnimationFrame(frame); frame = 0; }
      };
      const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }); intersection.observe(element);
      document.addEventListener('visibilitychange', sync); sync();

      cleanup = () => {
        running = false; if (frame) cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', onPointer); document.removeEventListener('visibilitychange', sync); observer.disconnect(); intersection.disconnect();
        items.forEach(item => (item.mesh.material as InstanceType<typeof THREE.Material>).dispose()); geometry.dispose(); textures.forEach(texture => texture.dispose());
        renderer.dispose(); renderer.domElement.remove();
      };
      if (disposed) cleanup();
    }).catch(() => unavailable.current?.());

    return () => { disposed = true; cleanup?.(); };
  }, [art]);

  return <div ref={host} className="mk-petal-field" aria-hidden="true" />;
}
