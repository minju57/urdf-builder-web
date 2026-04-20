// visualizer.js - Three.js based URDF visualizer (port of robot_renderer.py)

const Visualizer = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  rootGroup: null,
  jointMeshes: {},
  visualMeshes: [],
  collisionMeshes: [],
  jointAxes: {},
  robotData: null,
  animFrameId: null,
  container: null,

  setup(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    this.container = container;

    // Clean up previous
    if (this.renderer) {
      this.renderer.dispose();
      container.innerHTML = '';
    }

    this.jointMeshes = {};
    this.visualMeshes = [];
    this.collisionMeshes = [];
    this.jointAxes = {};

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    // Camera (Z-up)
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 10000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(2, 2, 2);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5, 10, 7);
    this.scene.add(dl);

    // Grid (XY plane, Z-up)
    const grid = new THREE.GridHelper(20, 20);
    grid.rotateX(Math.PI / 2);
    this.scene.add(grid);

    // Root group
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    // Animation loop
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    const animate = () => {
      this.animFrameId = requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
    };
    animate();

    // Resize handler
    const resizeObserver = new ResizeObserver(() => {
      const w2 = container.clientWidth;
      const h2 = container.clientHeight;
      if (w2 > 0 && h2 > 0) {
        this.camera.aspect = w2 / h2;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w2, h2);
      }
    });
    resizeObserver.observe(container);
  },

  createThickFrame(len = 0.15, thick = 0.005) {
    const group = new THREE.Group();
    const headLen = len * 0.2;
    const headWidth = thick * 3;

    const makeArrow = (color, rot) => {
      const arrow = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color });
      const shaftGeo = new THREE.CylinderGeometry(thick, thick, len - headLen, 12);
      const shaft = new THREE.Mesh(shaftGeo, mat);
      shaft.position.y = (len - headLen) / 2;
      arrow.add(shaft);
      const headGeo = new THREE.ConeGeometry(headWidth, headLen, 12);
      const head = new THREE.Mesh(headGeo, mat);
      head.position.y = len - headLen / 2;
      arrow.add(head);
      arrow.rotation.set(...rot);
      return arrow;
    };

    group.add(makeArrow(0xff0000, [0, 0, -Math.PI / 2])); // X: red
    group.add(makeArrow(0x00ff00, [0, 0, 0]));              // Y: green
    group.add(makeArrow(0x0000ff, [Math.PI / 2, 0, 0]));   // Z: blue
    return group;
  },

  createGeometry(info, isCollision = false) {
    if (!info || !info.type) return null;

    const color = info.color ? new THREE.Color(info.color[0], info.color[1], info.color[2]) : new THREE.Color(0.7, 0.7, 0.7);
    const mat = isCollision
      ? new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5 })
      : new THREE.MeshPhongMaterial({ color, shininess: 30, side: THREE.DoubleSide });

    let mesh = null;

    try {
      if (info.type === 'mesh' && info.mesh_data) {
        const loader = new THREE.STLLoader();
        const binaryString = window.atob(info.mesh_data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const geo = loader.parse(bytes.buffer);
        if (info.scale) geo.scale(info.scale[0], info.scale[1], info.scale[2]);
        mesh = new THREE.Mesh(geo, mat);
      } else if (info.type === 'obj' && info.mesh_data) {
        const loader = new THREE.OBJLoader();
        const objGroup = loader.parse(info.mesh_data);
        if (info.scale) objGroup.scale.set(info.scale[0], info.scale[1], info.scale[2]);
        objGroup.traverse(child => { if (child.isMesh) child.material = mat; });
        mesh = objGroup;
      } else if (info.type === 'cylinder') {
        const geo = new THREE.CylinderGeometry(info.dim[0], info.dim[0], info.dim[1], 32);
        geo.rotateX(Math.PI / 2);
        mesh = new THREE.Mesh(geo, mat);
      } else if (info.type === 'box') {
        const geo = new THREE.BoxGeometry(info.dim[0], info.dim[1], info.dim[2]);
        mesh = new THREE.Mesh(geo, mat);
      } else if (info.type === 'sphere') {
        const geo = new THREE.SphereGeometry(info.dim[0], 32, 32);
        mesh = new THREE.Mesh(geo, mat);
      } else if (info.type === 'error_box') {
        const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const errMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
        mesh = new THREE.Mesh(geo, errMat);
      }
    } catch (e) {
      console.warn('Geometry creation error:', e);
    }

    if (mesh && info.origin) {
      const [x, y, z, r, p, yaw] = info.origin;
      mesh.position.set(x, y, z);
      mesh.rotation.set(r, p, yaw, 'XYZ');
    }

    if (isCollision && mesh) {
      mesh.visible = false;
      this.collisionMeshes.push(mesh);
      if (mesh.isGroup) {
        mesh.traverse(c => {
          if (c.isMesh) { this.collisionMeshes.push(c); c.visible = false; }
        });
      }
    } else if (!isCollision && mesh) {
      this.visualMeshes.push(mesh);
    }

    return mesh;
  },

  buildRobot(name, parent) {
    const info = this.robotData.links[name];
    if (info) {
      if (info.visual) {
        const vMesh = this.createGeometry(info.visual, false);
        if (vMesh) parent.add(vMesh);
      }
      if (info.collisions) {
        for (const col of info.collisions) {
          const cMesh = this.createGeometry(col, true);
          if (cMesh) parent.add(cMesh);
        }
      }
    }
    const tree = this.robotData.tree;
    if (tree[name]) {
      for (const jName of tree[name]) {
        const jInfo = this.robotData.joints[jName];
        const fixedGroup = new THREE.Group();
        const [jx, jy, jz] = jInfo.xyz;
        const [jr, jp, jyaw] = jInfo.rpy;
        fixedGroup.position.set(jx, jy, jz);
        fixedGroup.rotation.set(jr, jp, jyaw, 'XYZ');
        parent.add(fixedGroup);

        const movingGroup = new THREE.Group();
        fixedGroup.add(movingGroup);

        const axes = this.createThickFrame(0.15, 0.005);
        axes.visible = false;
        movingGroup.add(axes);
        this.jointAxes[jName] = axes;

        this.jointMeshes[jName] = { group: movingGroup, axis: new THREE.Vector3(...jInfo.axis) };
        this.buildRobot(jInfo.child, movingGroup);
      }
    }
  },

  _dc(elem, tag) {
    // Direct child by tag name
    if (!elem) return null;
    for (const child of elem.children) {
      if (child.tagName && child.tagName.toLowerCase() === tag.toLowerCase()) return child;
    }
    return null;
  },

  _dca(elem, tag) {
    // All direct children by tag name
    if (!elem) return [];
    const result = [];
    for (const child of elem.children) {
      if (child.tagName && child.tagName.toLowerCase() === tag.toLowerCase()) result.push(child);
    }
    return result;
  },

  parseURDFForViewer(urdfString, meshMap = {}) {
    // meshMap: { 'lowercase_filename': { type: 'stl'|'obj', data: string } }
    const parser = new DOMParser();
    const doc = parser.parseFromString(urdfString, 'application/xml');
    const root = doc.documentElement;

    const links = {};
    const joints = {};
    const tree = {};
    let baseLink = null;

    let colorIdx = 0;
    for (const link of this._dca(root, 'link')) {
      const name = link.getAttribute('name');
      const colorVal = (colorIdx % 2 === 0) ? 0.8 : 0.4;
      const defaultColor = [colorVal, colorVal, colorVal];
      colorIdx++;

      const linkInfo = { name, visual: null, collisions: [], color: defaultColor };

      const visual = this._dc(link, 'visual');
      if (visual) {
        const visData = this._parseGeometryFromElem(visual, meshMap, false);
        if (visData) {
          const origin = this._dc(visual, 'origin');
          if (origin) {
            const xyz = (origin.getAttribute('xyz') || '0 0 0').trim().split(/\s+/).map(Number);
            const rpy = (origin.getAttribute('rpy') || '0 0 0').trim().split(/\s+/).map(Number);
            visData.origin = [...xyz, ...rpy];
          } else {
            visData.origin = [0, 0, 0, 0, 0, 0];
          }
          const material = this._dc(visual, 'material');
          if (material) {
            const color = this._dc(material, 'color');
            if (color) {
              const rgba = (color.getAttribute('rgba') || '0.5 0.5 0.5 1').trim().split(/\s+/).map(Number);
              linkInfo.color = rgba.slice(0, 3);
            }
          }
          visData.color = linkInfo.color;
          linkInfo.visual = visData;
        }
      }

      const collisionElems = this._dca(link, 'collision');
      const collisions = [];
      for (const collision of collisionElems) {
        const colData = this._parseGeometryFromElem(collision, meshMap, true);
        if (colData) {
          const origin = this._dc(collision, 'origin');
          if (origin) {
            const xyz = (origin.getAttribute('xyz') || '0 0 0').trim().split(/\s+/).map(Number);
            const rpy = (origin.getAttribute('rpy') || '0 0 0').trim().split(/\s+/).map(Number);
            colData.origin = [...xyz, ...rpy];
          } else {
            colData.origin = [0, 0, 0, 0, 0, 0];
          }
          collisions.push(colData);
        }
      }
      linkInfo.collisions = collisions;

      links[name] = linkInfo;
    }

    const orderedJoints = [];
    const allJointNames = [];

    for (const joint of this._dca(root, 'joint')) {
      const name = joint.getAttribute('name');
      const type = joint.getAttribute('type') || 'fixed';
      const parentEl = this._dc(joint, 'parent');
      const childEl = this._dc(joint, 'child');
      const parent = parentEl ? parentEl.getAttribute('link') : '';
      const child = childEl ? childEl.getAttribute('link') : '';

      const originEl = this._dc(joint, 'origin');
      const xyz = originEl ? (originEl.getAttribute('xyz') || '0 0 0').trim().split(/\s+/).map(Number) : [0, 0, 0];
      const rpy = originEl ? (originEl.getAttribute('rpy') || '0 0 0').trim().split(/\s+/).map(Number) : [0, 0, 0];

      const axisEl = this._dc(joint, 'axis');
      const axis = axisEl ? (axisEl.getAttribute('xyz') || '1 0 0').trim().split(/\s+/).map(Number) : [1, 0, 0];

      const limitEl = this._dc(joint, 'limit');
      let lower = -3.14, upper = 3.14;
      if (limitEl) {
        if (limitEl.getAttribute('lower')) lower = parseFloat(limitEl.getAttribute('lower'));
        if (limitEl.getAttribute('upper')) upper = parseFloat(limitEl.getAttribute('upper'));
      }

      joints[name] = {
        parent, child, xyz, rpy, axis,
        limits: [lower * 180 / Math.PI, upper * 180 / Math.PI],
        type
      };
      allJointNames.push(name);
      if (type !== 'fixed') orderedJoints.push(name);
      if (!tree[parent]) tree[parent] = [];
      tree[parent].push(name);
    }

    const children = new Set(Object.values(joints).map(j => j.child));
    const roots = Object.keys(links).filter(l => !children.has(l));
    if (roots.length > 0) baseLink = roots[0];
    else if (links['world']) baseLink = 'world';

    return { links, joints, tree, base: baseLink, joint_order: orderedJoints };
  },

  _parseGeometryFromElem(elem, meshMap, isCollision) {
    const geom = this._dc(elem, 'geometry');
    if (!geom) return null;

    const info = { type: null, dim: [0.1, 0.1, 0.1], scale: [1, 1, 1] };

    const mesh = this._dc(geom, 'mesh');
    if (mesh) {
      if (isCollision) return null;
      const filename = mesh.getAttribute('filename') || '';
      const targetFilename = filename.split('/').pop().toLowerCase();
      if (meshMap[targetFilename]) {
        const entry = meshMap[targetFilename];
        if (entry.type === 'obj') {
          info.type = 'obj';
          info.mesh_data = entry.data;
        } else {
          info.type = 'mesh';
          info.mesh_data = entry.data;
        }
        const scaleStr = mesh.getAttribute('scale') || '1 1 1';
        info.scale = scaleStr.trim().split(/\s+/).map(Number);
      } else {
        info.type = 'error_box';
      }
      return info;
    }

    const cylinder = this._dc(geom, 'cylinder');
    if (cylinder) {
      info.type = 'cylinder';
      info.dim = [parseFloat(cylinder.getAttribute('radius') || '0.05'), parseFloat(cylinder.getAttribute('length') || '0.1')];
      return info;
    }

    const box = this._dc(geom, 'box');
    if (box) {
      info.type = 'box';
      info.dim = (box.getAttribute('size') || '0.1 0.1 0.1').trim().split(/\s+/).map(Number);
      return info;
    }

    const sphere = this._dc(geom, 'sphere');
    if (sphere) {
      info.type = 'sphere';
      info.dim = [parseFloat(sphere.getAttribute('radius') || '0.05')];
      return info;
    }

    return null;
  },

  loadURDF(urdfString, meshMap = {}) {
    if (!this.rootGroup) return [];

    // Clear previous robot
    while (this.rootGroup.children.length > 0) {
      this.rootGroup.remove(this.rootGroup.children[0]);
    }
    this.jointMeshes = {};
    this.visualMeshes = [];
    this.collisionMeshes = [];
    this.jointAxes = {};

    this.robotData = this.parseURDFForViewer(urdfString, meshMap);
    if (this.robotData.base) {
      this.buildRobot(this.robotData.base, this.rootGroup);
    }

    setTimeout(() => this.fitCamera(), 500);
    setTimeout(() => this.fitCamera(), 1500);

    // Return movable joints list for sliders
    return this.robotData.joint_order.map(name => {
      const j = this.robotData.joints[name];
      return {
        name,
        type: j.type,
        min: j.limits[0],
        max: j.limits[1]
      };
    });
  },

  fitCamera() {
    if (!this.rootGroup || !this.camera || !this.controls) return;
    const box = new THREE.Box3().setFromObject(this.rootGroup);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (size.length() < 0.0001) return;
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 2.5;
    if (cameraZ < 0.1) cameraZ = 0.5;
    if (cameraZ > 1000) cameraZ = 1000;
    this.camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
    this.camera.lookAt(center);
    this.controls.target.copy(center);
    this.controls.update();
  },

  toggleVisual(isChecked) {
    this.visualMeshes.forEach(mesh => { mesh.visible = isChecked; });
  },

  toggleCollision(isChecked) {
    this.collisionMeshes.forEach(mesh => { mesh.visible = isChecked; });
  },

  updateJointPose(jointValues) {
    // jointValues: array of degrees in joint_order
    if (!this.robotData) return;
    this.robotData.joint_order.forEach((name, i) => {
      if (this.jointMeshes[name]) {
        const rad = (jointValues[i] || 0) * (Math.PI / 180);
        const q = new THREE.Quaternion().setFromAxisAngle(this.jointMeshes[name].axis, rad);
        this.jointMeshes[name].group.setRotationFromQuaternion(q);
      }
    });
  },

  setJointAxisVisible(jointName, visible) {
    if (this.jointAxes[jointName]) {
      this.jointAxes[jointName].visible = visible;
    }
  },

  getAllJointsInOrder() {
    if (!this.robotData) return [];
    const result = [];
    const traverse = (linkName) => {
      const children = this.robotData.tree[linkName];
      if (!children) return;
      for (const jName of children) {
        const j = this.robotData.joints[jName];
        result.push({ name: jName, type: j.type, min: j.limits[0], max: j.limits[1] });
        traverse(j.child);
      }
    };
    traverse(this.robotData.base);
    return result;
  }
};
