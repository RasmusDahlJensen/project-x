import * as THREE from "three";

type MaterialLike = THREE.Material | THREE.Material[] | undefined;

function disposeSingleMaterial(material: THREE.Material): void {
  if (typeof material.dispose === "function") {
    material.dispose();
  }
}

export function disposeMaterial(material: MaterialLike): void {
  if (!material) {
    return;
  }
  if (Array.isArray(material)) {
    material.forEach(disposeSingleMaterial);
    return;
  }
  disposeSingleMaterial(material);
}

export function disposeMeshResources(
  mesh: THREE.Object3D | null | undefined,
  { disposeGeometry = true }: { disposeGeometry?: boolean } = {}
): void {
  if (!mesh) {
    return;
  }

  const targets: THREE.Object3D[] = [];
  if ("traverse" in mesh) {
    mesh.traverse((object) => targets.push(object));
  } else {
    targets.push(mesh);
  }

  targets.forEach((object) => {
    if (disposeGeometry) {
      const geometry = (object as { geometry?: { dispose?: () => void } }).geometry;
      if (geometry && typeof geometry.dispose === "function") {
        geometry.dispose();
      }
    }

    const material = (object as { material?: MaterialLike }).material;
    if (material) {
      disposeMaterial(material);
    }
  });
}
