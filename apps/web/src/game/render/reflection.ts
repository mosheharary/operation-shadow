import * as THREE from 'three';

/**
 * A planar mirror for a horizontal water surface (the method of three's Reflector): renders the
 * scene from the camera mirrored in the plane, with an oblique near plane so nothing below the
 * water shows, into a half-resolution HDR target that the water shader samples projectively.
 */
export class PlanarReflection {
  readonly target: THREE.WebGLRenderTarget;
  /** Maps world positions to the reflection texture (projective coordinates). */
  readonly textureMatrix = new THREE.Matrix4();
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly plane = new THREE.Plane();
  private readonly normal = new THREE.Vector3(0, 1, 0);
  private readonly point = new THREE.Vector3();
  private readonly cameraPos = new THREE.Vector3();
  private readonly rotation = new THREE.Matrix4();
  private readonly lookAt = new THREE.Vector3(0, 0, -1);
  private readonly view = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly clipPlane = new THREE.Vector4();
  private readonly q = new THREE.Vector4();

  constructor(
    height: number,
    private readonly scale = 0.5,
  ) {
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
    this.point.set(0, height, 0);
  }

  /** Renders the mirrored view. Returns false (leaving the texture as it was) when the camera is under the water. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): boolean {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(1, Math.round(size.x * this.scale));
    const h = Math.max(1, Math.round(size.y * this.scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);

    this.cameraPos.setFromMatrixPosition(camera.matrixWorld);
    this.view.subVectors(this.point, this.cameraPos);
    if (this.view.dot(this.normal) > 0) return false;
    this.view.reflect(this.normal).negate().add(this.point);

    this.rotation.extractRotation(camera.matrixWorld);
    this.lookAt.set(0, 0, -1).applyMatrix4(this.rotation).add(this.cameraPos);
    this.aim.subVectors(this.point, this.lookAt).reflect(this.normal).negate().add(this.point);

    const mirror = this.camera;
    mirror.position.copy(this.view);
    mirror.up.set(0, 1, 0).applyMatrix4(this.rotation).reflect(this.normal);
    mirror.lookAt(this.aim);
    mirror.far = camera.far;
    mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);

    // Oblique clipping: the near plane becomes the water plane, so the sea bed is cut away.
    this.plane.setFromNormalAndCoplanarPoint(this.normal, this.point).applyMatrix4(mirror.matrixWorldInverse);
    this.clipPlane.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const e = mirror.projectionMatrix.elements;
    this.q.set((Math.sign(this.clipPlane.x) + e[8]!) / e[0]!, (Math.sign(this.clipPlane.y) + e[9]!) / e[5]!, -1, (1 + e[10]!) / e[14]!);
    this.clipPlane.multiplyScalar(2 / this.clipPlane.dot(this.q));
    e[2] = this.clipPlane.x;
    e[6] = this.clipPlane.y;
    e[10] = this.clipPlane.z + 1 - 0.003;
    e[14] = this.clipPlane.w;
    mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();

    const previous = renderer.getRenderTarget();
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    // The shadow maps are already current for this frame: do not render them again.
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, mirror);
    renderer.setRenderTarget(previous);
    renderer.shadowMap.autoUpdate = shadowUpdate;
    return true;
  }

  dispose(): void {
    this.target.dispose();
  }
}
